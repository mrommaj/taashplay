import { useCallback, useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { Card, GameState, Suit } from "../game/engine";
import {
  DEFAULT_RULE,
  botChooseTrump,
  botPickCard,
  chooseTrump,
  createGame,
  dealNewHand,
  isSeriesComplete,
  legalCards,
  playCard,
  resolveTrick,
  startNewSeriesFrom,
  teamOf,
} from "../game/engine";
import { buildSnapshot, hostPeerId, isGuestMessage, makeRoomCode, ROOM_PROTOCOL, type HostToGuestMsg } from "../game/net";
import { addGuest, canStartRoom, chooseGuestTeam, createLobby, getLobbySeats, removeGuest, type RoomLobby } from "../game/lobby";
import GameTable from "./GameTable";
import TeamLobby from "./TeamLobby";
import { sfx, isMuted, setMuted } from "../game/sound";
import { useRoomVoice } from "../game/useRoomVoice";
import { VOICE_OFF, type VoiceMember, type VoiceStatus } from "../game/voiceProtocol";
import VoiceChatControls from "./VoiceChatControls";
import { deferPeerSetup, JOIN_TIMEOUTS, keepPeerRegistered, peerOptions } from "../game/connection";
import { recordResult } from "../game/stats";

interface Props {
  hostName: string;
  seriesTarget?: number | null;
  onQuit: () => void;
}

const BOT_NAMES = ["Bot Kiaan", "Bot Diya", "Bot Arjun"];

function sendToGuest(conn: DataConnection | undefined, msg: HostToGuestMsg) {
  if (!conn?.open) return;
  try { conn.send(msg); } catch { conn.close(); }
}

export default function HostFlow({ hostName, seriesTarget = null, onQuit }: Props) {
  const [code, setCode] = useState(() => makeRoomCode());
  const [status, setStatus] = useState<"creating" | "waiting" | "reconnecting" | "error">("creating");
  const [error, setError] = useState("");
  const [lobby, setLobbyState] = useState(() => createLobby(hostName));
  const [game, setGameState] = useState<GameState | null>(null);
  const [muted, setM] = useState(isMuted());
  const voice = useRoomVoice(code);
  const { attachPeer: attachVoicePeer, setReady: setVoiceReady, updateRoster: updateVoiceRoster } = voice;

  const connsRef = useRef(new Map<string, DataConnection>());
  const guestVoiceRef = useRef(new Map<string, VoiceStatus>());
  const hostVoiceRef = useRef<VoiceStatus>({ ...VOICE_OFF });
  const lobbyRef = useRef(lobby);
  const gameRef = useRef<GameState | null>(null);
  const timer = useRef<number | null>(null);
  const prevTricks = useRef<[number, number]>([0, 0]);
  const prevPhase = useRef<string>("");
  const prevTrickLen = useRef(0);
  const roomReadyRef = useRef(false);
  const retryRegistrationRef = useRef<(() => boolean) | null>(null);

  // Commit refs immediately so simultaneous join requests cannot claim the same seat.
  const setLobby = useCallback((next: RoomLobby) => {
    lobbyRef.current = next;
    setLobbyState(next);
  }, []);

  const setGame = useCallback((update: GameState | null | ((current: GameState | null) => GameState | null)) => {
    const next = typeof update === "function" ? update(gameRef.current) : update;
    gameRef.current = next;
    setGameState(next);
  }, []);

  const broadcastVoice = useCallback(() => {
    const members: VoiceMember[] = [{ ...hostVoiceRef.current, peerId: hostPeerId(code), name: hostName }];
    for (const guest of lobbyRef.current.guests) {
      const conn = connsRef.current.get(guest.id);
      if (!conn?.open || members.some((member) => member.peerId === conn.peer)) continue;
      members.push({ ...(guestVoiceRef.current.get(guest.id) ?? VOICE_OFF), peerId: conn.peer, name: guest.name });
    }
    updateVoiceRoster(members);
    for (const guest of lobbyRef.current.guests) {
      sendToGuest(connsRef.current.get(guest.id), { t: "voice-roster", room: code, members });
    }
  }, [code, hostName, updateVoiceRoster]);

  const broadcastState = useCallback((g: GameState) => {
    const { connected } = getLobbySeats(lobbyRef.current);
    for (const guest of lobbyRef.current.guests) {
      if (guest.seat !== null) {
        sendToGuest(connsRef.current.get(guest.id), {
          t: "state", protocol: ROOM_PROTOCOL, youId: guest.seat,
          snap: buildSnapshot(g, guest.seat, connected),
        });
      }
    }
  }, []);

  const broadcastLobby = useCallback(() => {
    const room = lobbyRef.current;
    for (const guest of room.guests) {
      if (gameRef.current && guest.seat !== null) continue;
      sendToGuest(connsRef.current.get(guest.id), {
        t: "lobby", protocol: ROOM_PROTOCOL, rule: DEFAULT_RULE, code, hostName,
        ...getLobbySeats(room),
        youId: guest.seat ?? -1,
        started: gameRef.current !== null,
      });
    }
  }, [code, hostName]);

  // ---------- peer setup ----------
  useEffect(() => deferPeerSetup(() => {
    sfx.unlock();
    let active = true;
    let registered = false;
    roomReadyRef.current = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (active) fn();
      }, ms);
      timers.add(id);
      return id;
    };
    let peer: Peer;
    try {
      peer = new Peer(hostPeerId(code), peerOptions());
    } catch {
      setError("Could not create an online room in this browser. Open the HTTPS game link in Chrome or Safari and try again.");
      setStatus("error");
      return () => {};
    }
    const detachVoice = attachVoicePeer(peer, (voiceStatus) => {
      if (!active || peer.destroyed) return false;
      hostVoiceRef.current = { ...voiceStatus };
      broadcastVoice();
      return true;
    });
    const connections = connsRef.current;
    const openingTimeout = later(() => {
      if (registered) return;
      setVoiceReady(false);
      setError("Could not register the room with the connection service. Check your internet, or try another Wi-Fi or mobile-data connection.");
      setStatus("error");
    }, JOIN_TIMEOUTS.signaling);

    const registration = keepPeerRegistered(peer, {
      recovering: () => {
        if (!active) return;
        roomReadyRef.current = false;
        setStatus("reconnecting");
      },
      restored: () => {
        if (!active) return;
        registered = true;
        roomReadyRef.current = true;
        clearTimeout(openingTimeout);
        setError("");
        setStatus("waiting");
        setVoiceReady(true);
        broadcastVoice();
      },
      unavailable: (message) => {
        if (!active) return;
        roomReadyRef.current = false;
        setError(message);
        setStatus("error");
        if (!gameRef.current || peer.destroyed) setVoiceReady(false);
      },
    });
    retryRegistrationRef.current = registration.retry;

    peer.on("error", (e: { type?: string }) => {
      if (!active || registered) return;
      if (e?.type === "unavailable-id") {
        setVoiceReady(false);
        setError("This room code is already in use. Tap Try again to create a new room code.");
        setStatus("error");
      } else if (e?.type === "browser-incompatible") {
        setError("This browser cannot host the game. Open the link in an up-to-date Chrome or Safari browser.");
        setStatus("error");
      } else if (["network", "server-error", "socket-error", "socket-closed"].includes(e?.type ?? "")) {
        setVoiceReady(false);
        setError("The room connection service could not be reached. Check your internet and try again.");
        setStatus("error");
      }
    });

    peer.on("connection", (conn) => {
      if (!active) { conn.close(); return; }
      const id = conn.connectionId;
      connections.set(id, conn);
      later(() => {
        if (!conn.open && !lobbyRef.current.guests.some((guest) => guest.id === id)) conn.close();
      }, JOIN_TIMEOUTS.peer + JOIN_TIMEOUTS.handshake);
      conn.on("open", () => {
        if (!active) return;
        later(() => {
          if (!lobbyRef.current.guests.some((guest) => guest.id === id) && conn.open) {
            sendToGuest(conn, { t: "denied", msg: "Connection timed out. Please join again." });
            later(() => conn.close(), 300);
          }
        }, JOIN_TIMEOUTS.handshake);
      });
      conn.on("data", (raw) => {
        if (!active || connections.get(id) !== conn || !isGuestMessage(raw)) return;
        const msg = raw;
        if (msg.t === "hello") {
          if (msg.protocol !== ROOM_PROTOCOL) {
            sendToGuest(conn, { t: "denied", msg: "Please refresh the game on your device, then rejoin for team selection and voice chat." });
            later(() => conn.close(), 300);
            return;
          }
          const result = addGuest(lobbyRef.current, id, msg.name);
          if (result.error) {
            sendToGuest(conn, { t: "denied", msg: result.error });
            later(() => conn.close(), 300);
            return;
          }
          if (result.lobby !== lobbyRef.current) sfx.join();
          setLobby(result.lobby);
          broadcastLobby();
          broadcastVoice();
          return;
        }

        const guest = lobbyRef.current.guests.find((member) => member.id === id);
        if (!guest) return;

        if (msg.t === "voice-status") {
          guestVoiceRef.current.set(id, msg.status.sessionId === null
            ? { ...VOICE_OFF }
            : { sessionId: msg.status.sessionId, muted: msg.status.muted });
          broadcastVoice();
          return;
        }

        if (msg.t === "choose-team") {
          const result = chooseGuestTeam(lobbyRef.current, id, msg.team, gameRef.current !== null);
          if (result.error) {
            sendToGuest(conn, { t: "team-error", msg: result.error });
            broadcastLobby();
            return;
          }
          setLobby(result.lobby);
          const selected = result.lobby.guests.find((member) => member.id === id)!;
          if (gameRef.current && guest.seat === null && selected.seat !== null) {
            setGame((current) => current ? {
              ...current,
              players: current.players.map((player) => player.id === selected.seat
                ? { ...player, name: selected.name, isBot: false } : player),
            } : current);
          }
          broadcastLobby();
          if (gameRef.current) broadcastState(gameRef.current);
          return;
        }

        const seat = guest.seat;
        if (seat === null) return;
        if (msg.t === "choose-trump") {
          const g = gameRef.current;
          if (g && g.phase === "choose-trump" && g.chooser === seat) {
            setGame(chooseTrump(g, msg.suit));
          }
        } else if (msg.t === "play") {
          const g = gameRef.current;
          if (g && g.phase === "playing" && g.turn === seat) {
            const card = g.players[seat].hand.find((c) => c.id === msg.cardId);
            if (card) setGame(playCard(g, seat, card));
          }
        } else if (msg.t === "next-hand") {
          const g = gameRef.current;
          if (g && g.phase === "hand-over") {
            setGame(dealNewHand(g));
          }
        }
      });
      const handleClose = () => {
        if (!active || connections.get(id) !== conn) return;
        connections.delete(id);
        guestVoiceRef.current.delete(id);
        const guest = lobbyRef.current.guests.find((member) => member.id === id);
        if (!guest) return;
        setLobby(removeGuest(lobbyRef.current, id));
        if (guest.seat !== null && gameRef.current) {
          setGame((current) => current ? {
            ...current,
            players: current.players.map((player) => player.id === guest.seat ? { ...player, isBot: true } : player),
            message: `${guest.name} disconnected. A bot is playing their cards.`,
          } : current);
        }
        broadcastLobby();
        broadcastVoice();
      };
      conn.on("close", handleClose);
      conn.on("error", () => {
        handleClose();
        conn.close();
      });
    });

    return () => {
      active = false;
      timers.forEach(clearTimeout);
      registration.dispose();
      if (retryRegistrationRef.current === registration.retry) retryRegistrationRef.current = null;
      roomReadyRef.current = false;
      detachVoice();
      hostVoiceRef.current = { ...VOICE_OFF };
      guestVoiceRef.current.clear();
      for (const conn of connections.values()) {
        sendToGuest(conn, { t: "closed" });
        conn.close();
      }
      connections.clear();
      peer.destroy();
    };
  }), [code, broadcastLobby, broadcastState, broadcastVoice, setGame, setLobby, attachVoicePeer, setVoiceReady]);

  useEffect(() => {
    broadcastLobby();
    if (game) broadcastState(game);
  }, [lobby, game, broadcastLobby, broadcastState]);

  // Play transition sounds from the host's perspective.
  useEffect(() => {
    if (game) {
      // sounds from host perspective (viewer 0)
      if (prevPhase.current === "choose-trump" && game.phase === "playing") sfx.trump();
      if (
        (prevTricks.current[0] !== game.tricksWon[0] || prevTricks.current[1] !== game.tricksWon[1]) &&
        game.lastWinner !== null
      ) {
        if (teamOf(game.lastWinner) === teamOf(0)) sfx.trickWin();
        else sfx.trickLose();
      }
      if (game.phase === "hand-over" && prevPhase.current !== "hand-over") {
        const wt = game.tricksWon[0] > game.tricksWon[1] ? 0 : 1;
        if (game.tricksWon[wt] === 13) sfx.kot();
        else if (wt === teamOf(0)) sfx.handWin();
        else sfx.handLose();
      }
      // card snap when someone else plays (host snaps on tap)
      if (game.trick.length > prevTrickLen.current) {
        const last = game.trick[game.trick.length - 1];
        if (last && last.player !== 0) sfx.playCard();
      }
      prevTrickLen.current = game.trick.length;
      prevTricks.current = [...game.tricksWon] as [number, number];
      prevPhase.current = game.phase;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // your-turn ding for host + record wins
  const prevTurn = useRef(-1);
  useEffect(() => {
    if (game?.phase === "playing" && game.turn === 0 && prevTurn.current !== 0) sfx.yourTurn();
    if (game) prevTurn.current = game.turn;
  }, [game?.turn, game?.phase]);

  const recordedHand = useRef(-1);
  useEffect(() => {
    if (game?.phase === "hand-over" && recordedHand.current !== game.handNumber) {
      recordedHand.current = game.handNumber;
      const winnerTeam = game.tricksWon[0] > game.tricksWon[1] ? 0 : 1;
      recordResult("rang", winnerTeam === game.players[0].team);
    }
  }, [game?.phase, game?.handNumber, game?.tricksWon, game?.players]);

  // bot automation (bot seats only)
  useEffect(() => {
    if (!game) return;
    if (timer.current) window.clearTimeout(timer.current);
    const schedule = (ms: number, fn: (s: GameState) => GameState) => {
      timer.current = window.setTimeout(() => setGame((s) => (s ? fn(s) : s)), ms);
    };
    if (game.phase === "choose-trump" && game.players[game.chooser].isBot) {
      const c = game.chooser;
      schedule(1100, (s) =>
        s.phase === "choose-trump" && s.chooser === c && s.players[c].isBot
          ? chooseTrump(s, botChooseTrump(s.players[c].hand))
          : s
      );
    } else if (game.phase === "playing" && game.players[game.turn].isBot) {
      const t = game.turn;
      schedule(game.trick.length === 0 ? 1000 : 700, (s) =>
        s.phase === "playing" && s.turn === t && s.players[t].isBot ? playCard(s, t, botPickCard(s, t)) : s
      );
    } else if (game.phase === "trick-done") {
      schedule(1500, (s) => (s.phase === "trick-done" ? resolveTrick(s) : s));
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [game, setGame]);

  const { names, seatsTaken, connected, pendingNames } = getLobbySeats(lobby);
  const guestCount = lobby.guests.filter((guest) => guest.seat !== null).length;

  const startGame = () => {
    if (gameRef.current || !canStartRoom(lobbyRef.current) || !roomReadyRef.current) return;
    const current = getLobbySeats(lobbyRef.current);
    const finalNames = current.names.map((n, i) => {
      if (i === 0) return hostName;
      if (current.seatsTaken[i]) return n;
      return BOT_NAMES[i - 1] || `Bot ${i + 1}`;
    });
    const g = createGame(finalNames, current.seatsTaken, seriesTarget);
    sfx.deal();
    prevTricks.current = [0, 0];
    prevPhase.current = "choose-trump";
    setGame(g);
  };

  const retryRoom = () => {
    if (retryRegistrationRef.current?.()) return;
    if (gameRef.current) return;
    setLobby(createLobby(hostName));
    setError("");
    setStatus("creating");
    setCode((previous) => {
      let next = makeRoomCode();
      while (next === previous) next = makeRoomCode();
      return next;
    });
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      sfx.click();
    } catch {}
  };

  const shareInvite = async () => {
    const text = `Join my RANG card game! Room code: ${code}. Open the game, tap Play with friends > Join a friend's room, and choose to play with me or against me.`;
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    try {
      if (navigator.share) await navigator.share({ title: "Rang Card Game", text, url: url.href });
      else await navigator.clipboard.writeText(`${url.href}\n${text}`);
      sfx.click();
    } catch {}
  };

  const quitAll = () => {
    voice.leave();
    for (const conn of connsRef.current.values()) sendToGuest(conn, { t: "closed" });
    onQuit();
  };

  // ================= LOBBY =================
  if (!game) {
    return (
      <div className="h-full flex flex-col text-white max-w-md mx-auto p-5 overflow-y-auto">
        <div className="w-full slide-up my-auto">
          <button onClick={quitAll} className="text-xs px-3 py-2 rounded-xl bg-emerald-900/60 border border-emerald-700 active:scale-95">
            {"<"} Back
          </button>
          <div className="text-center mt-4 mb-4">
            <h2 className="text-2xl font-black">
              {status === "waiting" ? "Your Room is Ready" : status === "creating" ? "Creating Your Room" : status === "reconnecting" ? "Reconnecting Room" : "Room Connection Issue"}
            </h2>
            <p className="text-emerald-200 text-sm">
              {status === "waiting" ? "Share the code, then keep this screen open." : "Wait for the room connection before inviting friends."}
            </p>
          </div>

          {status === "creating" && (
            <div className="bg-emerald-900/50 rounded-2xl p-6 text-center border border-emerald-700/60">
              <div className="text-3xl mb-2 animate-pulse">📡</div>
              <p className="text-sm text-emerald-200">Creating room…</p>
            </div>
          )}
          {status === "error" && (
            <div className="bg-red-950/60 rounded-2xl p-6 text-center border border-red-700/60">
              <div className="text-3xl mb-2">⚠️</div>
              <p className="text-sm">{error}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button onClick={retryRoom} className="min-h-11 px-5 py-2.5 rounded-xl bg-yellow-400 text-emerald-950 font-bold active:scale-95">Try again</button>
                <button onClick={quitAll} className="min-h-11 px-5 py-2.5 rounded-xl bg-red-700 font-bold active:scale-95">Go Back</button>
              </div>
            </div>
          )}
          {(status === "waiting" || status === "reconnecting") && (
            <>
              <button onClick={copyCode} className="w-full bg-amber-400 text-emerald-950 rounded-2xl p-4 text-center shadow-lg active:scale-[0.98]">
                <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">Room code — tap to copy</div>
                <div className="text-4xl font-black tracking-[0.25em] font-mono">{code}</div>
              </button>
              <button onClick={shareInvite} className="mt-2 w-full bg-emerald-700 border border-emerald-600 rounded-2xl py-3 font-bold active:scale-[0.98]">
                📤 Share Invite
              </button>

              <VoiceChatControls voice={voice} />
              <TeamLobby names={names} seatsTaken={seatsTaken} viewer={0} />
              <p className="mt-3 text-xs text-emerald-100/75" role="status">
                {status === "reconnecting" ? "Restoring the room connection. Keep this tab open and your screen awake."
                  : pendingNames.length > 0
                  ? `Choosing a team: ${pendingNames.join(", ")}`
                  : "Empty places will be filled by bots when you start."}
              </p>

              <button
                onClick={startGame}
                disabled={status !== "waiting" || !canStartRoom(lobby)}
                className="mt-4 w-full bg-yellow-400 disabled:opacity-40 text-emerald-950 font-black text-lg rounded-2xl py-3.5 shadow-lg active:scale-[0.98]"
              >
                {status === "reconnecting" ? "Reconnecting..." : pendingNames.length > 0 ? "Waiting for team choices"
                  : guestCount < 1 ? "Waiting for a friend"
                  : `Start Game (${guestCount + 1} players + ${3 - guestCount} bot${3 - guestCount === 1 ? "" : "s"})`}
              </button>
              <p className="text-[11px] text-emerald-200/60 text-center mt-2">Everyone needs internet. Keep this screen open.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ================= GAME =================
  const viewer = 0;
  const me = game.players[viewer];
  const myTurn = game.phase === "playing" && game.turn === viewer;
  const legal = myTurn ? legalCards(me.hand, game.trick) : [];
  const canChoose = game.phase === "choose-trump" && game.chooser === viewer;
  const onlineCount = connected.filter(Boolean).length;

  return (
    <GameTable
      players={game.players.map((pl) => ({
        id: pl.id,
        name: pl.name,
        isBot: pl.isBot,
        team: pl.team,
        handCount: pl.hand.length,
        connected: pl.isBot ? true : connected[pl.id],
      }))}
      myHand={me.hand}
      pile={game.pile}
      pileLeader={game.pileLeader}
      phase={game.phase}
      dealer={game.dealer}
      chooser={game.chooser}
      trump={game.trump}
      turn={game.turn}
      trick={game.trick}
      tricksWon={game.tricksWon}
      seriesTarget={game.seriesTarget}
      scores={game.scores}
      handNumber={game.handNumber}
      redealCount={game.redealCount}
      lastWinner={game.lastWinner}
      message={game.message}
      viewer={viewer}
      legalIds={legal.map((c) => c.id)}
      canChooseTrump={canChoose}
      chooserHand={canChoose ? [...me.hand] : null}
      onPlay={(card: Card) => setGame((s) => (s ? playCard(s, s.turn, card) : s))}
      onChooseTrump={(s: Suit) => setGame((g) => (g ? chooseTrump(g, s) : g))}
      onNextHand={() => setGame((g) => {
        if (!g) return g;
        return isSeriesComplete(g) ? startNewSeriesFrom(g) : dealNewHand(g);
      })}
      onQuit={quitAll}
      muted={muted}
      onToggleMute={() => {
        const m = !muted;
        setMuted(m);
        setM(m);
        if (!m) sfx.click();
      }}
      roomCode={code}
      isOnline
      isHost
      statusNote={status === "waiting" ? `${onlineCount}/4 online` : "Room service reconnecting"}
      voiceControls={<VoiceChatControls voice={voice} compact />}
    />
  );
}

