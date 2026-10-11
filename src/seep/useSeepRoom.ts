import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import {
  deferPeerSetup, guestPeerId, JOIN_STAGE_LABELS, JOIN_TIMEOUTS, joinFailureMessage,
  keepPeerRegistered, MAX_JOIN_ATTEMPTS, peerOptions, roomUnavailableMessage, type JoinStage,
} from "../game/connection";
import { useRoomVoice } from "../game/useRoomVoice";
import { isVoiceRoster, VOICE_OFF, type VoiceMember, type VoiceStatus } from "../game/voiceProtocol";
import { addGuest, canStartRoom, chooseGuestTeam, createLobby, getLobbySeats, removeGuest } from "../game/lobby";
import { sfx } from "../game/sound";
import { applySeepAction, createSeep, isSeepSeriesDone, nextSeepDeal, replaceSeepPlayerWithBot, seepBotAction, seepSnapshot, startNewSeepSeriesFrom, type SeepAction, type SeepState, type SeepView } from "./engine";
import { SEEP_PROTOCOL, seepHostId, isSeepGuestMessage, makeSeepRoomCode, type SeepGuestMessage, type SeepHostMessage, type SeepLobbyView } from "./protocol";

type Status = "connecting" | "ready" | "reconnecting" | "error" | "closed";
const BOT_NAMES = ["Host", "Arjun", "Meera", "Vikram"];
function deliver(conn: DataConnection | null | undefined, message: SeepHostMessage | SeepGuestMessage): boolean {
  if (!conn?.open) return false;
  try { void Promise.resolve(conn.send(message)).catch(() => conn.close()); return true; }
  catch { conn.close(); return false; }
}

export function useSeepRoom(role: "host" | "guest", name: string, suppliedCode = "", seriesTarget: number | null = null) {
  const [code, setCode] = useState(() => role === "host" ? makeSeepRoomCode() : suppliedCode.trim().toUpperCase());
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>("connecting");
  const [progress, setProgress] = useState(JOIN_STAGE_LABELS.signaling);
  const [error, setError] = useState("");
  const [teamError, setTeamError] = useState("");
  const [pendingTeam, setPendingTeam] = useState<0 | 1 | null>(null);
  const [lobby, setLobby] = useState<SeepLobbyView | null>(null);
  const [view, setView] = useState<SeepView | null>(null);
  const voiceKey = `seep:${code}`;
  const voice = useRoomVoice(voiceKey);
  const { attachPeer, setReady, updateRoster } = voice;
  const room = useRef(createLobby(name));
  const connections = useRef(new Map<string, DataConnection>());
  const voiceMembers = useRef(new Map<string, VoiceStatus>());
  const guestConnection = useRef<DataConnection | null>(null);
  const hostVoice = useRef<VoiceStatus>({ ...VOICE_OFF });
  const actualGame = useRef<SeepState | null>(null);
  const serviceReady = useRef(false);
  const retries = useRef(0);
  const teamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTeamRef = useRef<0 | 1 | null>(null);
  const finishTeamRequest = useCallback(() => {
    if (teamTimer.current !== null) clearTimeout(teamTimer.current);
    teamTimer.current = null; pendingTeamRef.current = null; setPendingTeam(null);
  }, []);

  const broadcastGame = useCallback(() => {
    const current = actualGame.current;
    if (!current) return;
    const connected = getLobbySeats(room.current).connected;
    setView(seepSnapshot(current, 0, connected));
    for (const member of room.current.guests) if (member.seat !== null) {
      deliver(connections.current.get(member.id), { t: "state", game: "seep", protocol: SEEP_PROTOCOL, view: seepSnapshot(current, member.seat, connected) });
    }
  }, []);
  const commit = useCallback((next: SeepState) => {
    if (actualGame.current === next) return;
    actualGame.current = next; broadcastGame();
  }, [broadcastGame]);
  const broadcastLobby = useCallback(() => {
    if (actualGame.current) return;
    const { names, seatsTaken, pendingNames } = getLobbySeats(room.current);
    setLobby({ names, seatsTaken, pendingNames, viewer: 0 });
    for (const member of room.current.guests) {
      deliver(connections.current.get(member.id), { t: "lobby", game: "seep", protocol: SEEP_PROTOCOL, lobby: { names, seatsTaken, pendingNames, viewer: member.seat ?? -1 } });
    }
  }, []);
  const broadcastVoice = useCallback(() => {
    const roster: VoiceMember[] = [{ ...hostVoice.current, peerId: seepHostId(code), name }];
    for (const member of room.current.guests) {
      const conn = connections.current.get(member.id);
      if (!conn?.open || roster.some((entry) => entry.peerId === conn.peer)) continue;
      roster.push({ ...(voiceMembers.current.get(member.id) ?? VOICE_OFF), peerId: conn.peer, name: member.name });
    }
    updateRoster(roster);
    for (const member of room.current.guests) deliver(connections.current.get(member.id), { t: "voice-roster", room: voiceKey, members: roster });
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
    const timers = new Set<ReturnType<typeof setTimeout>>();
    serviceReady.current = false;
    setStatus("connecting"); setError(""); setView(null); setLobby(null); setTeamError(""); finishTeamRequest();
    actualGame.current = null; room.current = createLobby(name);
    connections.current.clear(); voiceMembers.current.clear(); hostVoice.current = { ...VOICE_OFF };
    setProgress(JOIN_STAGE_LABELS.signaling);
    let peer: Peer;
    try { peer = new Peer(role === "host" ? seepHostId(code) : guestPeerId(), peerOptions()); }
    catch {
      setStatus("error"); setError("Open the HTTPS game link in Chrome or Safari to play online.");
      return () => {};
    }
    const later = (fn: () => void, ms: number) => {
      const timer = setTimeout(() => { timers.delete(timer); if (active && !ended) fn(); }, ms);
      timers.add(timer);
    };
    const cleanupNetwork = () => {
      clearTimeout(stageTimer); registration?.dispose(); detachVoice?.();
      for (const conn of connections.current.values()) conn.close();
      connections.current.clear(); guestConnection.current?.close(); guestConnection.current = null; peer.destroy();
    };
    const fail = (message: string, retryable = true) => {
      if (!active || ended) return;
      ended = true; serviceReady.current = false; setReady(false); updateRoster([]); finishTeamRequest(); cleanupNetwork();
      if (role === "guest" && !admitted && retryable && navigator.onLine && retries.current < MAX_JOIN_ATTEMPTS - 1) {
        retries.current += 1; setProgress(`Retrying Seep room (${retries.current + 1}/${MAX_JOIN_ATTEMPTS})...`);
        retryTimer = setTimeout(() => { if (active) setAttempt((value) => value + 1); }, 2000 * retries.current);
      } else { setError(message); setStatus("error"); setView(null); }
    };
    const beginStage = (next: JoinStage) => {
      stage = next; clearTimeout(stageTimer); setProgress(JOIN_STAGE_LABELS[next]);
      stageTimer = setTimeout(() => fail(joinFailureMessage(stage, code, !!guestConnection.current?.peerConnection?.remoteDescription)), JOIN_TIMEOUTS[next]);
    };
    const closed = () => {
      if (!active || ended) return;
      ended = true; setReady(false); updateRoster([]); finishTeamRequest(); cleanupNetwork(); setStatus("closed"); setView(null);
    };
    detachVoice = attachPeer(peer, (next) => {
      if (!active || ended) return false;
      if (role === "host") { hostVoice.current = next; broadcastVoice(); return true; }
      return deliver(guestConnection.current, { t: "voice-status", status: next });
    });
    registration = keepPeerRegistered(peer, {
      recovering: () => {
        if (!active || ended) return;
        serviceReady.current = false; setProgress("Restoring the room connection...");
        if (role === "host") setStatus("reconnecting");
      },
      restored: () => {
        if (!active || ended) return;
        registered = true; serviceReady.current = true;
        if (role === "host") {
          clearTimeout(stageTimer); setStatus("ready"); setError(""); setReady(true); broadcastLobby(); broadcastVoice();
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
        connections.current.set(conn.connectionId, conn);
        later(() => { if (!room.current.guests.some((guest) => guest.id === conn.connectionId)) conn.close(); }, JOIN_TIMEOUTS.peer + JOIN_TIMEOUTS.handshake);
        conn.on("data", (raw) => {
          if (!active || ended || connections.current.get(conn.connectionId) !== conn || !isSeepGuestMessage(raw)) return;
          const msg = raw;
          const deny = (message: string) => { deliver(conn, { t: "denied", message }); later(() => conn.close(), 400); };
          if (msg.t === "hello") {
            if (msg.protocol !== SEEP_PROTOCOL) { deny("Refresh Seep on both devices and create a new room."); return; }
            if (room.current.guests.some((guest) => guest.id === conn.connectionId)) { broadcastLobby(); broadcastGame(); return; }
            if (actualGame.current) { deny("This Seep game has started. Join a new Seep room before the deal."); return; }
            if (!msg.name.trim()) { deny("Enter your name before joining."); return; }
            const result = addGuest(room.current, conn.connectionId, msg.name);
            if (result.error) { deny(result.error); return; }
            room.current = result.lobby; sfx.join(); broadcastLobby(); broadcastVoice(); return;
          }
          const member = room.current.guests.find((guest) => guest.id === conn.connectionId);
          if (!member) return;
          if (msg.t === "voice-status") {
            voiceMembers.current.set(member.id, { sessionId: msg.status.sessionId, muted: msg.status.muted }); broadcastVoice(); return;
          }
          if (msg.t === "choose-team") {
            const result = chooseGuestTeam(room.current, member.id, msg.team, !!actualGame.current);
            if (result.error) deliver(conn, { t: "team-error", message: result.error });
            else room.current = result.lobby;
            broadcastLobby(); return;
          }
          const current = actualGame.current;
          if (msg.t === "action" && current && member.seat !== null && current.handNumber === msg.handNumber && current.revision === msg.revision) {
            commit(applySeepAction(current, member.seat, msg.action));
          }
        });
        const drop = () => {
          if (!active || ended || !connections.current.delete(conn.connectionId)) return;
          const member = room.current.guests.find((guest) => guest.id === conn.connectionId);
          if (!member) return;
          room.current = removeGuest(room.current, member.id); voiceMembers.current.delete(member.id);
          if (actualGame.current && member.seat !== null) commit(replaceSeepPlayerWithBot(actualGame.current, member.seat));
          else broadcastLobby();
          broadcastVoice();
        };
        conn.on("close", drop); conn.on("error", () => { drop(); conn.close(); });
      });
    } else {
      peer.on("open", () => {
        if (!active || ended || admitted) return;
        if (guestConnection.current) { beginStage(guestConnection.current.open ? "handshake" : "peer"); return; }
        beginStage("peer");
        let conn: DataConnection;
        try {
          conn = peer.connect(seepHostId(code), { reliable: true, serialization: "json", label: "seep-room-v1" });
          if (!conn) throw new Error("Service not ready");
        } catch { fail(joinFailureMessage("signaling", code)); return; }
        guestConnection.current = conn;
        conn.on("open", () => {
          if (!active || ended) return;
          beginStage("handshake"); deliver(conn, { t: "hello", game: "seep", protocol: SEEP_PROTOCOL, name });
        });
        conn.on("data", (raw) => {
          if (!active || ended || !raw || typeof raw !== "object" || !("t" in raw)) return;
          const msg = raw as SeepHostMessage;
          if (msg.t === "denied") { fail(msg.message, false); return; }
          if (msg.t === "closed") { closed(); return; }
          if (msg.t === "voice-roster") { if (admitted && msg.room === voiceKey && isVoiceRoster(msg.members)) updateRoster(msg.members); return; }
          if (msg.t === "team-error") { finishTeamRequest(); setTeamError(msg.message); return; }
          if (msg.t !== "lobby" && msg.t !== "state") return;
          if (msg.game !== "seep" || msg.protocol !== SEEP_PROTOCOL) { fail("Refresh both devices and create a new Seep room.", false); return; }
          const viewer = msg.t === "lobby" ? msg.lobby?.viewer : msg.view?.viewer;
          if (!Number.isInteger(viewer) || viewer > 3 || (msg.t === "state" ? viewer < 1 : viewer < -1 || viewer === 0)) { fail("Invalid Seep seat. Please rejoin.", false); return; }
          admitted = true; retries.current = 0; clearTimeout(stageTimer); setReady(true); setStatus("ready"); setError("");
          if (msg.t === "lobby") {
            setLobby(msg.lobby);
            if (viewer >= 0 && pendingTeamRef.current === viewer % 2) { finishTeamRequest(); setTeamError(""); }
          } else { finishTeamRequest(); setView(msg.view); }
        });
        conn.on("close", () => { if (!admitted) fail(joinFailureMessage(stage, code, !!conn.peerConnection?.remoteDescription)); else closed(); });
        conn.on("error", () => fail("The room connection was lost. Keep both screens open and try again."));
        conn.on("iceStateChanged", (state) => { if (state === "failed") fail(joinFailureMessage("peer", code, !!conn.peerConnection?.remoteDescription)); });
      });
    }
    peer.on("error", (event) => {
      if (!active || ended || (role === "guest" && guestConnection.current?.open)) return;
      if (role === "guest" && event.type === "peer-unavailable") fail(`${roomUnavailableMessage(code)} Make sure it is a Seep room.`);
      else if (event.type === "browser-incompatible") fail("Use an up-to-date Chrome or Safari for online play.", false);
      else if (!registered) fail(role === "host" ? "Could not create the Seep room. Check your internet and try again." : joinFailureMessage("signaling", code));
    });
    return () => {
      active = false; ended = true; serviceReady.current = false;
      clearTimeout(stageTimer); clearTimeout(retryTimer); timers.forEach(clearTimeout);
      if (teamTimer.current !== null) clearTimeout(teamTimer.current);
      if (role === "host") for (const member of room.current.guests) deliver(connections.current.get(member.id), { t: "closed" });
      cleanupNetwork(); room.current = createLobby(name); voiceMembers.current.clear();
    };
  }), [role, name, code, attempt, voiceKey, attachPeer, setReady, updateRoster, finishTeamRequest, broadcastLobby, broadcastGame, broadcastVoice, commit]);

  useEffect(() => {
    if (role !== "host" || !view) return;
    const current = actualGame.current;
    if (!current || current.phase === "deal-over" || current.phase === "match-over" || !current.players[current.turn].isBot) return;
    const timer = window.setTimeout(() => {
      if (actualGame.current !== current) return;
      const action = seepBotAction(current);
      if (action) commit(applySeepAction(current, current.turn, action));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [role, view, commit]);

  const start = () => {
    if (role !== "host" || !serviceReady.current || !canStartRoom(room.current) || actualGame.current) return;
    const seats = getLobbySeats(room.current);
    commit(createSeep(seats.names.map((value, id) => value || BOT_NAMES[id]), seats.seatsTaken, 1, undefined, seriesTarget));
  };
  const next = () => {
    if (role !== "host" || !actualGame.current) return;
    const current = actualGame.current;
    commit(current.seriesTarget && isSeepSeriesDone(current) ? startNewSeepSeriesFrom(current) : nextSeepDeal(current));
  };
  const action = (move: SeepAction) => {
    if (role === "host" && actualGame.current) commit(applySeepAction(actualGame.current, 0, move));
    else if (view) deliver(guestConnection.current, { t: "action", action: move, revision: view.revision, handNumber: view.handNumber });
  };
  const chooseTeam = (team: 0 | 1) => {
    if (role !== "guest" || pendingTeamRef.current !== null) return;
    pendingTeamRef.current = team; setPendingTeam(team); setTeamError("");
    if (!deliver(guestConnection.current, { t: "choose-team", team })) { finishTeamRequest(); setTeamError("Connection lost. Please rejoin."); return; }
    teamTimer.current = setTimeout(() => { finishTeamRequest(); setTeamError("The host did not confirm. Try choosing again."); }, 8000);
  };
  const retry = () => {
    retries.current = 0; setStatus("connecting"); setError(""); setView(null);
    if (role === "host") setCode((old) => { let fresh = makeSeepRoomCode(); while (fresh === old) fresh = makeSeepRoomCode(); return fresh; });
    else setAttempt((value) => value + 1);
  };
  return { code, status, progress, error, lobby, view, voice, start, next, action, retry, chooseTeam, pendingTeam, teamError };
}