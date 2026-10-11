import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import {
  deferPeerSetup, guestPeerId, JOIN_STAGE_LABELS, JOIN_TIMEOUTS, joinFailureMessage,
  keepPeerRegistered, MAX_JOIN_ATTEMPTS, peerOptions, roomUnavailableMessage, type JoinStage,
} from "../game/connection";
import { useRoomVoice } from "../game/useRoomVoice";
import { isVoiceRoster, VOICE_OFF, type VoiceMember, type VoiceStatus } from "../game/voiceProtocol";
import { sfx } from "../game/sound";
import {
  bhabhiSnapshot, chooseBhabhiBotCard, createBhabhi, isSeriesDone, playBhabhi, resolveBhabhi, setBhabhiBot,
  type BhabhiState, type BhabhiView,
} from "./engine";
import {
  BHABHI_PROTOCOL, bhabhiHostId, isBhabhiGuestMessage, makeBhabhiRoomCode,
  type BhabhiGuestMessage, type BhabhiHostMessage, type BhabhiLobby, type BhabhiRoomSeat,
} from "./protocol";

interface Member { conn: DataConnection; seat: number; name: string; voice: VoiceStatus }
type Status = "connecting" | "ready" | "reconnecting" | "error" | "closed";
const BOT_NAMES = ["Host", "Arjun", "Meera", "Vikram"];

function deliver(conn: DataConnection | null, message: BhabhiHostMessage | BhabhiGuestMessage): boolean {
  if (!conn?.open) return false;
  try {
    void Promise.resolve(conn.send(message)).catch(() => conn.close());
    return true;
  } catch { conn.close(); return false; }
}

export function useBhabhiRoom(role: "host" | "guest", name: string, suppliedCode = "", seriesTarget: number | null = null) {
  const [code, setCode] = useState(() => role === "host" ? makeBhabhiRoomCode() : suppliedCode.trim().toUpperCase());
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("connecting");
  const [progress, setProgress] = useState(JOIN_STAGE_LABELS.signaling);
  const [error, setError] = useState("");
  const [lobby, setLobby] = useState<BhabhiLobby | null>(null);
  const [view, setView] = useState<BhabhiView | null>(null);
  const voiceKey = `bhabhi:${code}`;
  const voice = useRoomVoice(voiceKey);
  const { attachPeer, setReady, updateRoster } = voice;
  const members = useRef(new Map<string, Member>());
  const connections = useRef(new Set<DataConnection>());
  const guestConnection = useRef<DataConnection | null>(null);
  const hostVoice = useRef<VoiceStatus>({ ...VOICE_OFF });
  const actualGame = useRef<BhabhiState | null>(null);
  const serviceReady = useRef(false);
  const retries = useRef(0);

  const roomSeats = useCallback((): BhabhiRoomSeat[] => Array.from({ length: 4 }, (_, id) => {
    const member = [...members.current.values()].find((item) => item.seat === id);
    return { id, name: id === 0 ? name : member?.name ?? BOT_NAMES[id], occupied: id === 0 || !!member };
  }), [name]);

  const broadcastGame = useCallback(() => {
    const current = actualGame.current;
    if (!current) return;
    const connected = roomSeats().map((seat) => seat.occupied);
    setView(bhabhiSnapshot(current, 0, connected));
    for (const member of members.current.values()) {
      deliver(member.conn, { t: "state", game: "bhabhi", protocol: BHABHI_PROTOCOL, view: bhabhiSnapshot(current, member.seat, connected) });
    }
  }, [roomSeats]);

  const commit = useCallback((next: BhabhiState) => {
    if (actualGame.current === next) return;
    actualGame.current = next;
    broadcastGame();
  }, [broadcastGame]);

  const broadcastLobby = useCallback(() => {
    if (actualGame.current) return;
    const seats = roomSeats();
    setLobby({ seats, viewer: 0, started: false });
    for (const member of members.current.values()) {
      deliver(member.conn, { t: "lobby", game: "bhabhi", protocol: BHABHI_PROTOCOL, lobby: { seats, viewer: member.seat, started: false } });
    }
  }, [roomSeats]);

  const broadcastVoice = useCallback(() => {
    const roster: VoiceMember[] = [{ ...hostVoice.current, peerId: bhabhiHostId(code), name }];
    for (const member of members.current.values()) {
      if (!member.conn.open || roster.some((entry) => entry.peerId === member.conn.peer)) continue;
      roster.push({ ...member.voice, peerId: member.conn.peer, name: member.name });
    }
    updateRoster(roster);
    for (const member of members.current.values()) deliver(member.conn, { t: "voice-roster", room: voiceKey, members: roster });
  }, [code, name, updateRoster, voiceKey]);

  useEffect(() => deferPeerSetup(() => {
    let active = true;
    let ended = false;
    let admitted = false;
    let registered = false;
    let stage: JoinStage = "signaling";
    let stageTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let registration: ReturnType<typeof keepPeerRegistered> | undefined;
    let detachVoice: (() => void) | undefined;
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();
    serviceReady.current = false;
    setStatus("connecting"); setError(""); setView(null); setLobby(null);
    actualGame.current = null;
    members.current.clear(); connections.current.clear();
    hostVoice.current = { ...VOICE_OFF };
    setProgress(JOIN_STAGE_LABELS.signaling);
    let peer: Peer;
    try { peer = new Peer(role === "host" ? bhabhiHostId(code) : guestPeerId(), peerOptions()); }
    catch {
      setStatus("error"); setError("Open the HTTPS game link in Chrome or Safari to play online.");
      return () => {};
    }

    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { pendingTimers.delete(timer); if (active && !ended) fn(); }, ms);
      pendingTimers.add(timer);
    };
    const cleanupNetwork = () => {
      clearTimeout(stageTimer);
      registration?.dispose(); detachVoice?.();
      for (const conn of connections.current) conn.close();
      connections.current.clear();
      guestConnection.current?.close(); guestConnection.current = null;
      peer.destroy();
    };
    const fail = (message: string, retryable = true) => {
      if (!active || ended) return;
      ended = true; serviceReady.current = false;
      setReady(false); updateRoster([]);
      cleanupNetwork();
      if (role === "guest" && !admitted && retryable && navigator.onLine && retries.current < MAX_JOIN_ATTEMPTS - 1) {
        retries.current += 1;
        setProgress(`Retrying Bhabhi room (${retries.current + 1}/${MAX_JOIN_ATTEMPTS})...`);
        retryTimer = setTimeout(() => { if (active) setAttempt((value) => value + 1); }, 2000 * retries.current);
      } else {
        setError(message); setStatus("error"); setView(null);
      }
    };
    const beginStage = (next: JoinStage) => {
      stage = next; clearTimeout(stageTimer); setProgress(JOIN_STAGE_LABELS[next]);
      stageTimer = setTimeout(() => fail(joinFailureMessage(stage, code, !!guestConnection.current?.peerConnection?.remoteDescription)), JOIN_TIMEOUTS[next]);
    };

    detachVoice = attachPeer(peer, (next) => {
      if (!active || ended) return false;
      if (role === "host") { hostVoice.current = next; broadcastVoice(); return true; }
      return deliver(guestConnection.current, { t: "voice-status", status: next });
    });

    registration = keepPeerRegistered(peer, {
      recovering: () => {
        if (!active || ended) return;
        serviceReady.current = false;
        setProgress("Restoring the room connection...");
        if (role === "host") setStatus("reconnecting");
      },
      restored: () => {
        if (!active || ended) return;
        registered = true; serviceReady.current = true;
        if (role === "host") {
          clearTimeout(stageTimer); setStatus("ready"); setError("");
          setReady(true); broadcastLobby(); broadcastVoice();
        }
      },
      unavailable: (message) => {
        if (!active || ended) return;
        if (role === "host" && actualGame.current) { setError(message); setStatus("error"); }
        else if (!guestConnection.current?.open) fail(message);
      },
    });

    beginStage("signaling");
    if (role === "host") {
      peer.on("connection", (conn) => {
        if (!active || ended) { conn.close(); return; }
        connections.current.add(conn);
        later(() => { if (!members.current.has(conn.connectionId)) conn.close(); }, JOIN_TIMEOUTS.peer + JOIN_TIMEOUTS.handshake);
        conn.on("data", (raw) => {
          if (!active || ended || !connections.current.has(conn) || !isBhabhiGuestMessage(raw)) return;
          const msg = raw;
          if (msg.t === "hello") {
            const deny = (message: string) => { deliver(conn, { t: "denied", message }); later(() => conn.close(), 400); };
            if (msg.protocol !== BHABHI_PROTOCOL) { deny("Refresh the Bhabhi game on both devices and create a new room."); return; }
            if (members.current.has(conn.connectionId)) { broadcastLobby(); broadcastGame(); return; }
            if (actualGame.current) { deny("This Bhabhi game has already started. Ask the host to create a new room for you."); return; }
            const cleanName = msg.name.trim().slice(0, 12);
            if (!cleanName) { deny("Enter your name before joining."); return; }
            const seat = [1, 2, 3].find((id) => ![...members.current.values()].some((member) => member.seat === id));
            if (seat === undefined) { deny("The Bhabhi room is full (four players)."); return; }
            members.current.set(conn.connectionId, { conn, seat, name: cleanName, voice: { ...VOICE_OFF } });
            sfx.join(); broadcastLobby(); broadcastVoice(); return;
          }
          const member = members.current.get(conn.connectionId);
          if (!member) return;
          if (msg.t === "voice-status") {
            member.voice = { sessionId: msg.status.sessionId, muted: msg.status.muted };
            broadcastVoice(); return;
          }
          const current = actualGame.current;
          if (msg.t === "play" && current && current.round === msg.round && current.revision === msg.revision) {
            commit(playBhabhi(current, member.seat, msg.cardId));
          }
        });
        const drop = () => {
          if (!active || ended || !connections.current.delete(conn)) return;
          const member = members.current.get(conn.connectionId);
          if (!member) return;
          members.current.delete(conn.connectionId);
          if (actualGame.current) commit(setBhabhiBot(actualGame.current, member.seat));
          else broadcastLobby();
          broadcastVoice();
        };
        conn.on("close", drop);
        conn.on("error", () => { drop(); conn.close(); });
      });
    } else {
      peer.on("open", () => {
        if (!active || ended || admitted || guestConnection.current) return;
        beginStage("peer");
        let conn: DataConnection;
        try {
          conn = peer.connect(bhabhiHostId(code), { reliable: true, serialization: "json", label: "bhabhi-room-v1" });
          if (!conn) throw new Error("Room service not ready");
        } catch { fail(joinFailureMessage("signaling", code)); return; }
        guestConnection.current = conn;
        conn.on("open", () => {
          if (!active || ended) return;
          beginStage("handshake");
          deliver(conn, { t: "hello", game: "bhabhi", protocol: BHABHI_PROTOCOL, name });
        });
        conn.on("data", (raw) => {
          if (!active || ended || !raw || typeof raw !== "object" || !("t" in raw)) return;
          const msg = raw as BhabhiHostMessage;
          if (msg.t === "denied") { fail(msg.message, false); return; }
          if (msg.t === "closed") {
            ended = true; setReady(false); updateRoster([]); cleanupNetwork(); setStatus("closed"); setView(null); return;
          }
          if (msg.t === "voice-roster") {
            if (admitted && msg.room === voiceKey && isVoiceRoster(msg.members)) updateRoster(msg.members);
            return;
          }
          if (msg.t !== "lobby" && msg.t !== "state") return;
          if (msg.game !== "bhabhi" || msg.protocol !== BHABHI_PROTOCOL) { fail("This is a different game version. Refresh both devices and create a new Bhabhi room.", false); return; }
          const viewer = msg.t === "lobby" ? msg.lobby?.viewer : msg.view?.viewer;
          if (!Number.isInteger(viewer) || viewer < 1 || viewer > 3) { fail("Invalid Bhabhi seat. Please rejoin.", false); return; }
          admitted = true; retries.current = 0; clearTimeout(stageTimer); setReady(true); setStatus("ready"); setError("");
          if (msg.t === "lobby") setLobby(msg.lobby);
          else setView(msg.view);
        });
        conn.on("close", () => {
          if (!active || ended) return;
          if (!admitted) fail(joinFailureMessage(stage, code, !!conn.peerConnection?.remoteDescription));
          else { ended = true; setReady(false); updateRoster([]); cleanupNetwork(); setStatus("closed"); setView(null); }
        });
        conn.on("error", () => fail("The room connection was lost. Keep both screens open and try joining again."));
      });
    }

    peer.on("error", (event) => {
      if (!active || ended || (role === "guest" && guestConnection.current?.open)) return;
      if (role === "guest" && event.type === "peer-unavailable") fail(`${roomUnavailableMessage(code)} Make sure it is a Bhabhi room.`);
      else if (event.type === "browser-incompatible") fail("Use an up-to-date Chrome or Safari browser for online play.", false);
      else if (!registered) fail(role === "host" ? "Could not create this Bhabhi room. Check your internet and try again." : joinFailureMessage("signaling", code));
    });

    return () => {
      active = false; ended = true; serviceReady.current = false;
      clearTimeout(stageTimer); clearTimeout(retryTimer); pendingTimers.forEach(clearTimeout);
      if (role === "host") for (const member of members.current.values()) deliver(member.conn, { t: "closed" });
      cleanupNetwork(); members.current.clear();
    };
  }), [role, name, code, attempt, voiceKey, attachPeer, setReady, updateRoster, broadcastLobby, broadcastGame, broadcastVoice, commit]);

  useEffect(() => {
    if (role !== "host" || !view) return;
    const current = actualGame.current;
    if (!current || current.phase === "game-over" || (current.phase === "playing" && !current.players[current.turn].isBot)) return;
    const timer = window.setTimeout(() => {
      if (actualGame.current !== current) return;
      if (current.phase === "trick-end") commit(resolveBhabhi(current));
      else {
        const card = chooseBhabhiBotCard(current);
        if (card) commit(playBhabhi(current, current.turn, card.id));
      }
    }, current.phase === "trick-end" ? 1500 : 800);
    return () => window.clearTimeout(timer);
  }, [role, view, commit]);

  const start = () => {
    if (role !== "host" || !serviceReady.current || members.current.size < 1 || actualGame.current) return;
    const seats = roomSeats();
    commit(createBhabhi(seats.map((seat) => seat.name), seats.map((seat) => seat.occupied), 1, undefined, seriesTarget));
  };
  const rematch = () => {
    if (role !== "host" || actualGame.current?.phase !== "game-over") return;
    const current = actualGame.current;
    const seats = roomSeats();
    const keepSeries = current.series && !isSeriesDone(current);
    commit(createBhabhi(
      seats.map((seat) => seat.name),
      seats.map((seat) => seat.occupied),
      keepSeries ? current.round + 1 : 1,
      undefined,
      keepSeries ? current.series!.target : seriesTarget,
      keepSeries ? current.series!.losses : null,
    ));
  };
  const play = (cardId: string) => {
    if (role === "host" && actualGame.current) commit(playBhabhi(actualGame.current, 0, cardId));
    else if (view) deliver(guestConnection.current, { t: "play", cardId, revision: view.revision, round: view.round });
  };
  const retry = () => {
    retries.current = 0;
    setStatus("connecting"); setError(""); setView(null);
    if (role === "host") setCode(makeBhabhiRoomCode());
    else setAttempt((value) => value + 1);
  };
  return { code, status, progress, error, lobby, view, voice, start, rematch, play, retry };
}