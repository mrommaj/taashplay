import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import {
  deferPeerSetup, guestPeerId, JOIN_STAGE_LABELS, JOIN_TIMEOUTS, joinFailureMessage,
  keepPeerRegistered, MAX_JOIN_ATTEMPTS, peerOptions, roomUnavailableMessage, type JoinStage,
} from "../game/connection";
import { useRoomVoice } from "../game/useRoomVoice";
import { isVoiceRoster, VOICE_OFF, type VoiceMember, type VoiceStatus } from "../game/voiceProtocol";
import { sfx } from "../game/sound";
import { recordResult } from "../game/stats";
import {
  botDiscard, botDraw, createRummy, discardCard, drawCard, isRummySeriesDone, rummySnapshot,
  type RummyState, type RummyView,
} from "./engine";
import {
  RUMMY_PROTOCOL, rummyHostId, isRummyGuestMessage, makeRummyRoomCode,
  type RummyGuestMessage, type RummyHostMessage, type RummyLobbyView,
} from "./protocol";

interface Member { conn: DataConnection; name: string; voice: VoiceStatus }
type Status = "connecting" | "ready" | "reconnecting" | "error" | "closed";

function deliver(conn: DataConnection | null, message: RummyHostMessage | RummyGuestMessage): boolean {
  if (!conn?.open) return false;
  try {
    void Promise.resolve(conn.send(message)).catch(() => conn.close());
    return true;
  } catch { conn.close(); return false; }
}

export function useRummyRoom(role: "host" | "guest", name: string, suppliedCode = "", seriesTarget: number | null = null) {
  const [code] = useState(() => role === "host" ? makeRummyRoomCode() : suppliedCode.trim().toUpperCase());
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("connecting");
  const [progress, setProgress] = useState(JOIN_STAGE_LABELS.signaling);
  const [error, setError] = useState("");
  const [lobby, setLobby] = useState<RummyLobbyView | null>(null);
  const [view, setView] = useState<RummyView | null>(null);
  const voiceKey = `rummy:${code}`;
  const voice = useRoomVoice(voiceKey);
  const { attachPeer, setReady, updateRoster } = voice;
  const memberRef = useRef<Member | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const hostVoiceRef = useRef<VoiceStatus>({ ...VOICE_OFF });
  const gameRef = useRef<RummyState | null>(null);
  const readyRef = useRef(false);
  const retriesRef = useRef(0);
  const recordedRoundRef = useRef(0);
  const broadcastRef = useRef<() => void>(() => {});

  const broadcast = useCallback(() => {
    const current = gameRef.current;
    if (!current) return;
    if (role === "host") {
      setView(rummySnapshot(current, 0));
      if (current.phase === "round-over" && current.winner !== null && recordedRoundRef.current !== current.round) {
        recordedRoundRef.current = current.round;
        recordResult("rummy", current.winner === 0);
      }
      const member = memberRef.current;
      if (member?.conn.open) deliver(member.conn, { t: "state", game: "rummy", protocol: RUMMY_PROTOCOL, view: rummySnapshot(current, 1) });
    }
  }, [role]);

  broadcastRef.current = broadcast;

  const commit = useCallback((next: RummyState) => {
    if (gameRef.current === next) return;
    gameRef.current = next;
    broadcastRef.current();
  }, []);

  const broadcastLobbyNow = useCallback(() => {
    if (gameRef.current) return;
    const member = memberRef.current;
    const occupiedNext = [true, !!member] as [boolean, boolean];
    setLobby({ names: [name, member?.name ?? ""], occupied: occupiedNext, viewer: 0 });
    if (member?.conn.open) deliver(member.conn, { t: "lobby", game: "rummy", protocol: RUMMY_PROTOCOL, lobby: { names: [name, member.name], occupied: occupiedNext, viewer: 1 } });
  }, [name]);

  const broadcastVoiceNow = useCallback(() => {
    const roster: VoiceMember[] = [{ ...hostVoiceRef.current, peerId: rummyHostId(code), name }];
    const member = memberRef.current;
    if (member?.conn.open) roster.push({ ...member.voice, peerId: member.conn.peer, name: member.name });
    updateRoster(roster);
    if (member?.conn.open) {
      deliver(member.conn, { t: "voice-roster", room: voiceKey, members: roster });
    }
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
    readyRef.current = false;
    setStatus("connecting"); setError(""); setView(null); setLobby(null);
    gameRef.current = null;
    memberRef.current = null; connRef.current = null;
    hostVoiceRef.current = { ...VOICE_OFF };
    retriesRef.current = 0;
    setProgress(JOIN_STAGE_LABELS.signaling);

    let peer: Peer;
    try { peer = new Peer(role === "host" ? rummyHostId(code) : guestPeerId(), peerOptions()); }
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
      connRef.current?.close(); connRef.current = null;
      if (role === "host") for (const m of [memberRef.current]) if (m?.conn) m.conn.close();
      peer.destroy();
    };
    const fail = (message: string, retryable = true) => {
      if (!active || ended) return;
      ended = true; readyRef.current = false;
      setReady(false); updateRoster([]);
      cleanupNetwork();
      if (role === "guest" && !admitted && retryable && navigator.onLine && retriesRef.current < MAX_JOIN_ATTEMPTS - 1) {
        retriesRef.current += 1;
        setProgress(`Retrying rummy room (${retriesRef.current + 1}/${MAX_JOIN_ATTEMPTS})...`);
        retryTimer = setTimeout(() => { if (active) setAttempt((value) => value + 1); }, 2000 * retriesRef.current);
      } else {
        setError(message); setStatus("error"); setView(null);
      }
    };
    const beginStage = (next: JoinStage) => {
      stage = next; clearTimeout(stageTimer); setProgress(JOIN_STAGE_LABELS[next]);
      stageTimer = setTimeout(() => fail(joinFailureMessage(stage, code, !!connRef.current?.peerConnection?.remoteDescription)), JOIN_TIMEOUTS[next]);
    };
    const closed = () => {
      if (!active || ended) return;
      ended = true; setReady(false); updateRoster([]); cleanupNetwork(); setStatus("closed"); setView(null);
    };

    detachVoice = attachPeer(peer, (next) => {
      if (!active || ended) return false;
      if (role === "host") { hostVoiceRef.current = next; broadcastVoiceNow(); return true; }
      return deliver(connRef.current, { t: "voice-status", status: next });
    });

    registration = keepPeerRegistered(peer, {
      recovering: () => {
        if (!active || ended) return;
        readyRef.current = false;
        setProgress("Restoring the room connection...");
        if (role === "host") setStatus("reconnecting");
      },
      restored: () => {
        if (!active || ended) return;
        registered = true; readyRef.current = true;
        clearTimeout(stageTimer);
        if (role === "host") {
          setStatus("ready");
          setError("");
          setReady(true);
          broadcastLobbyNow();
          broadcastVoiceNow();
        }
      },
      unavailable: (message) => {
        if (!active || ended) return;
        if (role === "host" && gameRef.current) { setError(message); setStatus("error"); }
        else fail(message);
      },
    });

    beginStage("signaling");

    if (role === "host") {
      peer.on("connection", (conn) => {
        if (!active || ended) { conn.close(); return; }
        later(() => { if (!memberRef.current && conn.open) conn.close(); }, JOIN_TIMEOUTS.peer + JOIN_TIMEOUTS.handshake);
        const drop = () => {
          if (!active || ended) return;
          const hadMember = !!memberRef.current;
          memberRef.current = null;
          if (hadMember) {
            // Friend disconnected: continue with a robot partner if a round is active.
            const current = gameRef.current;
            if (current && current.phase === "playing") {
              current.players = current.players.map((player, id) => (id === 1 ? { ...player, isBot: true } : player));
              broadcastRef.current();
            }
          }
          broadcastLobbyNow();
          broadcastVoiceNow();
          broadcast();
          try { conn.close(); } catch { /* ignore */ }
        };
        conn.on("data", (raw) => {
          if (!active || ended || !isRummyGuestMessage(raw)) return;
          const msg = raw;
          const deny = (message: string) => { deliver(conn, { t: "denied", message }); later(() => conn.close(), 400); };
          if (msg.t === "hello") {
            if (msg.protocol !== RUMMY_PROTOCOL) { deny("Refresh Rummy on both devices and create a new room."); return; }
            if (memberRef.current) { deny("A friend already joined this room."); return; }
            if (gameRef.current) { deny("This rummy round has already started. Ask the host to make a new room."); return; }
            const clean = msg.name.trim().slice(0, 12);
            if (!clean) { deny("Enter your name before joining."); return; }
            memberRef.current = { conn, name: clean, voice: { ...VOICE_OFF } };
            clearTimeout(stageTimer); // guest arrived before the service-stage timeout
            setStatus("ready");
            sfx.join();
            broadcastLobbyNow();
            broadcastVoiceNow();
            return;
          }
          if (msg.t === "voice-status") {
            if (!memberRef.current) return;
            memberRef.current.voice = { sessionId: msg.status.sessionId, muted: msg.status.muted };
            broadcastVoiceNow(); return;
          }
          const current = gameRef.current;
          if (!current) return;
          if (msg.t === "draw" && current.round === msg.round && current.revision === msg.revision && current.turn === 1) {
            commit(drawCard(current, msg.source));
          } else if (msg.t === "discard" && current.round === msg.round && current.revision === msg.revision && current.turn === 1) {
            commit(discardCard(current, msg.cardId));
          } else if (msg.t === "next" && current.phase === "round-over" && !isRummySeriesDone(current)) {
            commit(createRummy(
              [current.players[0].name, current.players[1].name],
              [true, memberRef.current ? true : true],
              current.round + 1,
              undefined,
              current.score,
              current.seriesTarget,
            ));
          } else if (msg.t === "new-series" && current.phase === "round-over" && isRummySeriesDone(current)) {
            commit(createRummy(
              [current.players[0].name, current.players[1].name],
              [true, memberRef.current ? true : true],
              1,
              undefined,
              [0, 0],
              current.seriesTarget,
            ));
          }
        });
        conn.on("close", drop);
        conn.on("error", () => { drop(); });
      });
    } else {
      peer.on("open", () => {
        if (!active || ended || admitted || connRef.current) return;
        beginStage("peer");
        let conn: DataConnection;
        try {
          conn = peer.connect(rummyHostId(code), { reliable: true, serialization: "json", label: "rummy-room-v1" });
          if (!conn) throw new Error("Room service not ready");
        } catch { fail(joinFailureMessage("signaling", code)); return; }
        connRef.current = conn;
        conn.on("open", () => {
          if (!active || ended) return;
          beginStage("handshake");
          deliver(conn, { t: "hello", game: "rummy", protocol: RUMMY_PROTOCOL, name });
        });
        conn.on("data", (raw) => {
          if (!active || ended || !raw || typeof raw !== "object" || !("t" in raw)) return;
          const msg = raw as RummyHostMessage;
          if (msg.t === "denied") { fail(msg.message, false); return; }
          if (msg.t === "closed") { closed(); return; }
          if (msg.t === "voice-roster") {
            if (admitted && msg.room === voiceKey && isVoiceRoster(msg.members)) updateRoster(msg.members);
            return;
          }
          if (msg.t !== "lobby" && msg.t !== "state") return;
          if (msg.game !== "rummy" || msg.protocol !== RUMMY_PROTOCOL) { fail("Refresh Rummy on both devices, then join again.", false); return; }
          admitted = true; retriesRef.current = 0; clearTimeout(stageTimer); setReady(true); setStatus("ready"); setError("");
          if (msg.t === "lobby") setLobby(msg.lobby);
          else {
            setView(msg.view);
            if (msg.view.phase === "round-over" && msg.view.winner !== null && recordedRoundRef.current !== msg.view.round) {
              recordedRoundRef.current = msg.view.round;
              recordResult("rummy", msg.view.winner === 1);
            }
          }
        });
        conn.on("close", () => {
          if (!active || ended) return;
          if (!admitted) fail(joinFailureMessage(stage, code, !!conn.peerConnection?.remoteDescription));
          else closed();
        });
        conn.on("error", () => fail("The room connection was lost. Keep both screens open and try again."));
      });
    }

    peer.on("error", (event) => {
      if (!active || ended || (role === "guest" && connRef.current?.open)) return;
      if (role === "guest" && event.type === "peer-unavailable") fail(`${roomUnavailableMessage(code)} Make sure it is a Rummy room.`);
      else if (event.type === "browser-incompatible") fail("Use an up-to-date Chrome or Safari browser for online play.", false);
      else if (!registered) fail(role === "host" ? "Could not create the Rummy room. Check your internet and try again." : joinFailureMessage("signaling", code));
    });

    return () => {
      active = false; ended = true; readyRef.current = false;
      clearTimeout(stageTimer); clearTimeout(retryTimer); pendingTimers.forEach(clearTimeout);
      cleanupNetwork(); memberRef.current = null;
    };
  }), [role, name, code, attempt, voiceKey, attachPeer, setReady, updateRoster, broadcastLobbyNow, broadcastVoiceNow, commit]);

  // Bot turns when applicable.
  useEffect(() => {
    if (role !== "host") return;
    const current = gameRef.current;
    if (!current || current.phase !== "playing") return;
    if (!current.players[current.turn].isBot) return;
    if (current.turn === 1 && !current.drawn) {
      const id = setTimeout(() => {
        const currentInner = gameRef.current;
        if (!currentInner || currentInner.turn !== 1 || currentInner.drawn || currentInner.phase !== "playing") return;
        commit(drawCard(currentInner, botDraw(currentInner)));
      }, 850);
      return () => clearTimeout(id);
    }
    if (current.turn === 1 && current.drawn) {
      const id = setTimeout(() => {
        const currentInner = gameRef.current;
        if (!currentInner || currentInner.turn !== 1 || !currentInner.drawn || currentInner.phase !== "playing") return;
        const card = botDiscard(currentInner);
        if (card) commit(discardCard(currentInner, card.id));
      }, 850);
      return () => clearTimeout(id);
    }
  }, [role, view, commit]);

  const start = () => {
    if (role !== "host" || !readyRef.current || gameRef.current) return;
    const memberName = memberRef.current?.name ?? "Friend";
    commit(createRummy([name, memberName], [true, !!memberRef.current], 1, undefined, [0, 0], seriesTarget));
  };

  const next = () => {
    if (role === "host" && gameRef.current?.phase === "round-over" && !isRummySeriesDone(gameRef.current)) {
      const current = gameRef.current;
      commit(createRummy([current.players[0].name, current.players[1].name], [!!memberRef.current, !!memberRef.current], current.round + 1, undefined, current.score, current.seriesTarget));
    } else if (role === "guest" && view?.phase === "round-over" && !view.seriesDone) {
      deliver(connRef.current, { t: "next" });
    }
  };
  const newSeries = () => {
    if (role === "host" && gameRef.current?.phase === "round-over" && isRummySeriesDone(gameRef.current)) {
      const current = gameRef.current;
      commit(createRummy([current.players[0].name, current.players[1].name], [!!memberRef.current, !!memberRef.current], 1, undefined, [0, 0], current.seriesTarget));
    } else if (role === "guest" && view?.seriesDone) {
      deliver(connRef.current, { t: "new-series" });
    }
  };

  const retry = () => {
    retriesRef.current = 0;
    setStatus("connecting"); setError(""); setView(null);
    if (role === "guest") setAttempt((value) => value + 1);
  };

  const drawCardNow = useCallback((source: "stock" | "discard") => {
    if (role === "host" && gameRef.current?.phase === "playing" && gameRef.current.turn === 0 && !gameRef.current.drawn) {
      commit(drawCard(gameRef.current, source));
    } else if (role === "guest" && view?.legalDraw && view?.turn === 1) {
      deliver(connRef.current, { t: "draw", source, round: view.round, revision: view.revision });
    }
  }, [role, view, commit]);

  const discardCardNow = useCallback((cardId: string) => {
    if (role === "host" && gameRef.current?.phase === "playing" && gameRef.current.turn === 0 && gameRef.current.drawn) {
      commit(discardCard(gameRef.current, cardId));
    } else if (role === "guest" && view?.phase === "playing" && view?.turn === 1 && view?.drawn) {
      deliver(connRef.current, { t: "discard", cardId, round: view.round, revision: view.revision });
    }
  }, [role, view, commit]);

  return { code, status, progress, error, lobby, view, voice, start, next, newSeries, retry, drawCardNow, discardCardNow };
}
