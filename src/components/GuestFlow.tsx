import { useCallback, useEffect, useRef, useState } from "react";
import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { Card, Suit } from "../game/engine";
import { DEFAULT_RULE } from "../game/engine";
import { hostPeerId, ROOM_PROTOCOL, type GuestToHostMsg, type HostToGuestMsg, type LobbySnapshot, type Snapshot } from "../game/net";
import type { TeamId } from "../game/lobby";
import GameTable from "./GameTable";
import TeamLobby from "./TeamLobby";
import { sfx, isMuted, setMuted } from "../game/sound";
import { useRoomVoice } from "../game/useRoomVoice";
import { isVoiceRoster } from "../game/voiceProtocol";
import { recordResult } from "../game/stats";
import VoiceChatControls from "./VoiceChatControls";
import {
  deferPeerSetup, guestPeerId, JOIN_STAGE_LABELS, JOIN_TIMEOUTS,
  joinFailureMessage, keepPeerRegistered, MAX_JOIN_ATTEMPTS,
  peerOptions, roomUnavailableMessage, type JoinStage,
} from "../game/connection";

interface Props {
  name: string;
  code: string;
  onQuit: () => void;
}

export default function GuestFlow({ name, code, onQuit }: Props) {
  const [status, setStatus] = useState<"connecting" | "lobby" | "playing" | "error" | "closed">("connecting");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(JOIN_STAGE_LABELS.signaling);
  const [attempt, setAttempt] = useState(0);
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [pendingTeam, setPendingTeam] = useState<TeamId | null>(null);
  const [teamError, setTeamError] = useState("");
  const [youId, setYouId] = useState(-1);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [muted, setM] = useState(isMuted());
  const voice = useRoomVoice(code);
  const { attachPeer: attachVoicePeer, setReady: setVoiceReady, updateRoster: updateVoiceRoster } = voice;

  const connRef = useRef<DataConnection | null>(null);
  const prevSnap = useRef<Snapshot | null>(null);
  const recordedHandRef = useRef(-1);
  const pendingTeamRef = useRef<TeamId | null>(null);
  const teamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const automaticRetries = useRef(0);

  const send = useCallback((msg: GuestToHostMsg): boolean => {
    if (!connRef.current?.open) return false;
    try {
      connRef.current.send(msg);
      return true;
    } catch { return false; }
  }, []);

  const finishTeamRequest = useCallback(() => {
    if (teamTimerRef.current !== null) clearTimeout(teamTimerRef.current);
    teamTimerRef.current = null;
    pendingTeamRef.current = null;
    setPendingTeam(null);
  }, []);

  const chooseTeam = (team: TeamId) => {
    if (pendingTeamRef.current !== null || (youId >= 0 && youId % 2 === team)) return;
    sfx.click();
    setTeamError("");
    pendingTeamRef.current = team;
    setPendingTeam(team);
    if (!send({ t: "choose-team", team })) {
      finishTeamRequest();
      setTeamError("Connection lost. Please go back and join the room again.");
      return;
    }
    teamTimerRef.current = setTimeout(() => {
      finishTeamRequest();
      setTeamError("The host did not confirm your choice. Check your connection and try again.");
    }, 8000);
  };

  useEffect(() => deferPeerSetup(() => {
    setStatus("connecting");
    setError("");
    setLobby(null);
    setSnap(null);
    setYouId(-1);
    setTeamError("");
    prevSnap.current = null;
    finishTeamRequest();
    sfx.unlock();
    let peer: Peer;
    try {
      // A locally generated ID avoids an extra request to allocate a guest ID.
      peer = new Peer(guestPeerId(), peerOptions());
    } catch {
      setError("This browser could not start an online connection. Open the HTTPS game link in Chrome or Safari and try again.");
      setStatus("error");
      return () => {};
    }
    let conn: DataConnection | null = null;
    let active = true;
    let ended = false;
    let received = false;
    let openedSignal = false;
    let stage: JoinStage = "signaling";
    let stageTimer: number | undefined;
    let retryTimer: number | undefined;
    let registration: ReturnType<typeof keepPeerRegistered> | undefined;
    const detachVoice = attachVoicePeer(peer, (voiceStatus) =>
      active && !ended && send({ t: "voice-status", status: voiceStatus }),
    );

    const closeNetwork = () => {
      window.clearTimeout(stageTimer);
      registration?.dispose();
      detachVoice();
      if (connRef.current === conn) connRef.current = null;
      conn?.close();
      peer.destroy();
    };

    const fail = (msg: string, retryable = true) => {
      if (!active || ended) return;
      ended = true;
      setVoiceReady(false);
      updateVoiceRoster([]);
      finishTeamRequest();
      closeNetwork();
      if (retryable && !received && navigator.onLine && automaticRetries.current < MAX_JOIN_ATTEMPTS - 1) {
        automaticRetries.current += 1;
        setProgress(`Connection interrupted. Retrying (${automaticRetries.current + 1}/${MAX_JOIN_ATTEMPTS})...`);
        retryTimer = window.setTimeout(() => {
          if (active) setAttempt((value) => value + 1);
        }, automaticRetries.current * 2000);
        return;
      }
      setError(msg);
      setStatus("error");
      sfx.error();
    };

    const beginStage = (next: JoinStage) => {
      stage = next;
      window.clearTimeout(stageTimer);
      setProgress(JOIN_STAGE_LABELS[next]);
      stageTimer = window.setTimeout(() => {
        if (!received) fail(joinFailureMessage(stage, code, !!conn?.peerConnection?.remoteDescription));
      }, JOIN_TIMEOUTS[next]);
    };

    const closed = () => {
      if (!active || ended) return;
      ended = true;
      setVoiceReady(false);
      updateVoiceRoster([]);
      finishTeamRequest();
      closeNetwork();
      setStatus("closed");
    };

    registration = keepPeerRegistered(peer, {
      recovering: () => {
        if (active && !ended && !received) beginStage("signaling");
      },
      restored: () => {},
      unavailable: (message) => {
        if (active && !ended && !conn?.open) fail(message);
      },
    });
    beginStage("signaling");

    peer.on("open", () => {
      if (!active || ended) return;
      openedSignal = true;
      if (received) return;
      if (conn) {
        beginStage(conn.open ? "handshake" : "peer");
        return;
      }
      beginStage("peer");
      try {
        conn = peer.connect(hostPeerId(code), {
          reliable: true,
          serialization: "json",
          label: `rang-room-v${ROOM_PROTOCOL}`,
        });
        if (!conn) throw new Error("Connection service is not ready");
      } catch {
        fail(joinFailureMessage("signaling", code));
        return;
      }
      connRef.current = conn;

      conn.on("open", () => {
        if (!active || ended) return;
        beginStage("handshake");
        if (!send({ t: "hello", name, protocol: ROOM_PROTOCOL })) {
          fail("Could not join the room. Please try again.");
        }
      });
      conn.on("data", (raw) => {
        if (!active || ended || !raw || typeof raw !== "object" || !("t" in raw)) return;
        const msg = raw as HostToGuestMsg;
        if (msg.t === "denied") {
          fail(msg.msg, false);
        } else if (msg.t === "closed") {
          closed();
        } else if (msg.t === "voice-roster") {
          if (received && msg.room === code && isVoiceRoster(msg.members)) updateVoiceRoster(msg.members);
        } else if (msg.t === "team-error") {
          finishTeamRequest();
          setTeamError(msg.msg);
        } else if (msg.t === "lobby" || msg.t === "state") {
          if (msg.protocol !== ROOM_PROTOCOL) {
            fail("The host is using a different game version. Both players should refresh the same site, then create a new room.", false);
            return;
          }
          const roomRule = msg.t === "lobby" ? msg.rule : msg.snap.rule;
          if (roomRule !== DEFAULT_RULE) {
            fail("This room uses an older ruleset. Ask the host to update the game and create a Sar room.", false);
            return;
          }
          received = true;
          window.clearTimeout(stageTimer);
          automaticRetries.current = 0;
          setVoiceReady(true);
          setYouId(msg.youId);
          if (msg.t === "lobby") {
            setLobby(msg);
            setStatus("lobby");
            if (msg.youId >= 0 && pendingTeamRef.current === msg.youId % 2) {
              finishTeamRequest();
              setTeamError("");
            }
          } else {
            if (!Number.isInteger(msg.youId) || msg.youId < 1 || msg.youId > 3) {
              fail("Invalid seat assignment. Please rejoin the room.", false);
              return;
            }
            finishTeamRequest();
            setStatus("playing");
            setSnap(msg.snap);
            handleSounds(prevSnap.current, msg.snap, msg.youId);
            prevSnap.current = msg.snap;
            const snap = msg.snap;
            if (snap.phase === "hand-over" && recordedHandRef.current !== snap.handNumber) {
              recordedHandRef.current = snap.handNumber;
              const winnerTeam = snap.tricksWon[0] > snap.tricksWon[1] ? 0 : 1;
              const viewerTeam = snap.players[msg.youId]?.team ?? 0;
              recordResult("rang", winnerTeam === viewerTeam);
            }
          }
        }
      });
      conn.on("close", () => {
        if (!received) fail(joinFailureMessage(stage, code, !!conn?.peerConnection?.remoteDescription));
        else closed();
      });
      conn.on("error", () => {
        fail(received ? "The connection to the host was lost. Keep the host's screen open, then try rejoining." : joinFailureMessage(stage, code));
      });
      conn.on("iceStateChanged", (state) => {
        if (state === "failed") fail(joinFailureMessage("peer", code, !!conn?.peerConnection?.remoteDescription));
      });
    });
    peer.on("error", (e: { type?: string }) => {
      if (!active || ended || conn?.open) return;
      if (e?.type === "peer-unavailable") fail(roomUnavailableMessage(code));
      else if (e?.type === "browser-incompatible") {
        fail("This browser does not support the game's online connection. Open the link in an up-to-date Chrome or Safari browser.", false);
      } else if (e?.type === "webrtc") {
        fail(joinFailureMessage("peer", code, !!conn?.peerConnection?.remoteDescription));
      } else if (!openedSignal) {
        fail(joinFailureMessage("signaling", code));
      }
    });

    const offline = () => {
      if (!received) fail("Your device is offline. Restore your internet connection, then tap Try again.", false);
    };
    window.addEventListener("offline", offline);

    return () => {
      active = false;
      ended = true;
      window.clearTimeout(stageTimer);
      window.clearTimeout(retryTimer);
      if (teamTimerRef.current !== null) clearTimeout(teamTimerRef.current);
      pendingTeamRef.current = null;
      window.removeEventListener("offline", offline);
      closeNetwork();
    };
  }), [code, name, attempt, finishTeamRequest, send, attachVoicePeer, setVoiceReady, updateVoiceRoster]);

  const retryJoin = () => {
    automaticRetries.current = 0;
    setSnap(null);
    setLobby(null);
    setProgress(JOIN_STAGE_LABELS.signaling);
    setStatus("connecting");
    setAttempt((value) => value + 1);
  };

  const quit = () => {
    voice.leave();
    try { connRef.current?.close(); } catch {}
    onQuit();
  };

  // ---------- connecting / lobby / error screens ----------
  if (!snap || status === "closed" || status === "error") {
    return (
      <div className="h-full flex flex-col text-white max-w-md mx-auto p-5 overflow-y-auto">
        <div className="w-full slide-up my-auto">
          <button onClick={quit} className="text-xs px-3 py-2 rounded-xl bg-emerald-900/60 border border-emerald-700 active:scale-95">
            {"<"} Back
          </button>
          <div className="text-center mt-4 mb-4">
            <h2 className="text-2xl font-black">Room {code}</h2>
            <p className="text-emerald-200 text-sm">Playing as <b>{name}</b></p>
          </div>

          {status === "connecting" && (
            <div className="bg-emerald-900/50 rounded-2xl p-8 text-center border border-emerald-700/60">
              <div className="text-4xl mb-3 animate-bounce">📡</div>
              <p className="font-bold" role="status">{progress}</p>
              <p className="text-xs text-emerald-200/70 mt-1">Keep both screens awake. Attempt {automaticRetries.current + 1} of {MAX_JOIN_ATTEMPTS}.</p>
            </div>
          )}

          {status === "lobby" && lobby && (
            <>
              <VoiceChatControls voice={voice} />
              <TeamLobby
                names={lobby.names}
                seatsTaken={lobby.seatsTaken}
                viewer={youId}
                started={lobby.started}
                pendingTeam={pendingTeam}
                onChooseTeam={chooseTeam}
              />
              {teamError && (
                <p role="alert" className="mt-3 rounded-xl border border-red-400/40 bg-red-950/50 p-3 text-sm text-red-100">
                  {teamError}
                </p>
              )}
              <div className="mt-4 text-center" role="status" aria-live="polite">
                <p className="text-sm font-semibold text-emerald-100">
                  {pendingTeam !== null ? "Confirming your place with the host..."
                    : youId < 0 ? "Pick a team above to take your place."
                    : `You joined Team ${youId % 2 === 0 ? "A" : "B"}. Waiting for ${lobby.hostName} to start.`}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-emerald-200/65">
                  {youId >= 0 && !lobby.started
                    ? "You can change teams before the game starts. Keep this screen open."
                    : "Empty places are filled by bots. Each team has two players."}
                </p>
              </div>
            </>
          )}

          {status === "error" && (
            <div className="bg-red-950/60 rounded-2xl p-6 text-center border border-red-700/60">
              <div className="text-4xl mb-2">⚠️</div>
              <p className="text-sm font-semibold">{error}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={retryJoin} className="min-h-11 px-6 py-2.5 rounded-xl bg-yellow-400 text-emerald-950 font-bold active:scale-95">Try again</button>
                <button onClick={quit} className="min-h-11 px-6 py-2.5 rounded-xl bg-red-700 font-bold active:scale-95">Go Back</button>
              </div>
            </div>
          )}

          {status === "closed" && (
            <div className="bg-emerald-900/50 rounded-2xl p-6 text-center border border-emerald-700/60">
              <div className="text-4xl mb-2">👋</div>
              <p className="font-bold">Connection to host closed</p>
              <p className="mt-2 text-sm text-emerald-200">The host may have left or lost their connection.</p>
              <button onClick={retryJoin} className="mt-4 min-h-11 px-6 py-2.5 rounded-xl border border-emerald-600 font-bold">Try rejoining</button>
              <button onClick={quit} className="mt-4 px-6 py-2.5 rounded-xl bg-yellow-400 text-emerald-950 font-black active:scale-95">Back to Menu</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const myHand = snap.players[youId]?.hand ?? [];
  const onlineCount = snap.players.filter((pl) => !pl.isBot && pl.connected).length;

  return (
    <GameTable
      players={snap.players.map((pl) => ({
        id: pl.id,
        name: pl.name,
        isBot: pl.isBot,
        team: pl.team,
        handCount: pl.handCount,
        connected: pl.connected,
      }))}
      myHand={myHand}
      pile={snap.pile}
      pileLeader={snap.pileLeader}
      phase={snap.phase}
      dealer={snap.dealer}
      chooser={snap.chooser}
      trump={snap.trump}
      turn={snap.turn}
      trick={snap.trick}
      tricksWon={snap.tricksWon}
      scores={snap.scores}
      handNumber={snap.handNumber}
      redealCount={snap.redealCount}
      lastWinner={snap.lastWinner}
      message={snap.message}
      viewer={youId}
      legalIds={snap.legalIds}
      canChooseTrump={snap.canChooseTrump}
      chooserHand={snap.chooserHand}
      onPlay={(card: Card) => send({ t: "play", cardId: card.id })}
      onChooseTrump={(s: Suit) => send({ t: "choose-trump", suit: s })}
      onNextHand={() => send({ t: "next-hand" })}
      onQuit={quit}
      muted={muted}
      onToggleMute={() => {
        const m = !muted;
        setMuted(m);
        setM(m);
        if (!m) sfx.click();
      }}
      roomCode={code}
      isOnline
      statusNote={`${onlineCount}/4 online`}
      voiceControls={<VoiceChatControls voice={voice} compact />}
    />
  );
}

function handleSounds(prev: Snapshot | null, next: Snapshot, youId: number) {
  if (!prev) {
    sfx.deal();
    return;
  }
  const myTeam = next.players[youId]?.team;
  // new hand dealt
  if (prev.phase === "hand-over" && next.phase === "choose-trump") {
    sfx.deal();
    return;
  }
  // trump chosen
  if (prev.phase === "choose-trump" && next.phase !== "choose-trump") sfx.trump();
  // trick picked
  if (prev.tricksWon[0] !== next.tricksWon[0] || prev.tricksWon[1] !== next.tricksWon[1]) {
    if (next.lastWinner !== null) {
      const wt = next.players[next.lastWinner]?.team;
      if (wt === myTeam) sfx.trickWin();
      else sfx.trickLose();
    } else {
      sfx.playCard();
    }
  } else if (next.trick.length > prev.trick.length) {
    const last = next.trick[next.trick.length - 1];
    if (last && last.player !== youId) sfx.playCard();
  }
  // your turn
  if (next.phase === "playing" && next.turn === youId && prev.turn !== youId) {
    sfx.yourTurn();
  }
  if (next.phase === "choose-trump" && next.chooser === youId && prev.chooser !== youId) {
    sfx.yourTurn();
  }
  // hand over
  if (next.phase === "hand-over" && prev.phase !== "hand-over") {
    const wt = next.tricksWon[0] > next.tricksWon[1] ? 0 : 1;
    if (next.tricksWon[wt] === 13) sfx.kot();
    else if (wt === myTeam) sfx.handWin();
    else sfx.handLose();
  }
}
