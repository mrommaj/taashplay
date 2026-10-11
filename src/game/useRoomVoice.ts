import { useCallback, useRef, useState } from "react";
import type Peer from "peerjs";
import type { MediaConnection } from "peerjs";
import {
  canAnswerVoice, isVoiceCallInfo, isVoiceRoster, shouldInitiateVoice,
  VOICE_CALL_KIND, VOICE_OFF, type VoiceMember, type VoiceStatus,
} from "./voiceProtocol";

export interface VoiceChatState {
  ready: boolean;
  requesting: boolean;
  joined: boolean;
  muted: boolean;
  connections: number;
  others: number;
  playbackBlocked: boolean;
  error: string;
  unavailable: string;
}

function supportError(): string {
  if (typeof window === "undefined" || !window.isSecureContext) return "Open the HTTPS Netlify link to use microphone chat.";
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return "Microphone chat is not supported in this browser.";
  return "";
}

function initialState(): VoiceChatState {
  return {
    ready: false, requesting: false, joined: false, muted: true,
    connections: 0, others: 0, playbackBlocked: false, error: "", unavailable: supportError(),
  };
}

interface VoiceCall {
  call: MediaConnection;
  sessionId: string;
  audio: HTMLAudioElement | null;
  stream: MediaStream | null;
  blocked: boolean;
  deadline: number;
}

interface DialAttempt {
  sessionId: string;
  count: number;
  nextTry: number;
  since: number;
}

type PublishStatus = (status: VoiceStatus) => boolean;

function microphoneError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow it in your browser's site settings, then tap Join voice again.";
  }
  if (name === "NotFoundError") return "No microphone found. Connect one, then try again.";
  if (name === "NotReadableError") return "Your microphone is busy. Close other calling apps and try again.";
  return "Could not start your microphone. Please try again. You can keep playing without voice.";
}

class RoomVoiceSession {
  private ready = false;
  private disposed = false;
  private requesting = false;
  private requestId = 0;
  private stream: MediaStream | null = null;
  private status: VoiceStatus = { ...VOICE_OFF };
  private members: VoiceMember[] = [];
  private calls = new Map<string, VoiceCall>();
  private waiting = new Map<string, { call: MediaConnection; deadline: number }>();
  private attempts = new Map<string, DialAttempt>();
  private error = "";
  private previousUI = "";
  private interval: number;
  private localId: string;

  constructor(
    private peer: Peer,
    private room: string,
    private publish: PublishStatus,
    private render: (state: VoiceChatState) => void,
  ) {
    this.localId = peer.id ?? "";
    peer.on("open", this.peerOpened);
    peer.on("call", this.receiveCall);
    peer.on("close", this.peerClosed);
    window.addEventListener("pagehide", this.pageHidden);
    this.interval = window.setInterval(() => this.reconcile(), 2000);
    this.emit();
  }

  private linked(entry: VoiceCall): boolean {
    const state = entry.call.peerConnection?.iceConnectionState;
    return !!entry.stream && (state === "connected" || state === "completed");
  }

  private targets(): VoiceMember[] {
    return this.members.filter((member) => member.peerId !== this.localId && member.sessionId !== null);
  }

  private emit() {
    if (this.disposed) return;
    const state: VoiceChatState = {
      ready: this.ready,
      requesting: this.requesting,
      joined: this.status.sessionId !== null,
      muted: this.status.muted,
      connections: [...this.calls.values()].filter((entry) => this.linked(entry)).length,
      others: this.targets().length,
      playbackBlocked: [...this.calls.values()].some((entry) => entry.blocked),
      error: this.error,
      unavailable: supportError(),
    };
    const key = JSON.stringify(state);
    if (key !== this.previousUI) {
      this.previousUI = key;
      this.render(state);
    }
  }

  setReady(ready: boolean) {
    this.ready = ready;
    if (!ready) this.leave();
    this.emit();
  }

  updateRoster(members: VoiceMember[]) {
    if (this.disposed || !isVoiceRoster(members)) return;
    this.members = members.map((member) => ({ ...member }));
    this.reconcile();
    this.emit();
  }

  async join() {
    if (this.disposed || !this.ready || this.requesting || this.stream || supportError()) return;
    const request = ++this.requestId;
    this.requesting = true;
    this.error = "";
    this.emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      // Permission can resolve after the user cancels or leaves the room.
      if (this.disposed || !this.ready || request !== this.requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream.getAudioTracks().some((track) => track.readyState === "live")) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No live microphone");
      }
      this.stream = stream;
      this.requesting = false;
      const sessionId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) => value.toString(16).padStart(8, "0")).join("");
      this.status = { sessionId, muted: false };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (this.stream !== stream) return;
          this.leave();
          this.error = "Microphone disconnected. Tap Join voice to try again.";
          this.emit();
        };
      });
      if (!this.publish({ ...this.status })) {
        this.leave(false);
        this.error = "The room connection was lost. Rejoin the room to use voice.";
      }
      this.reconcile();
      this.emit();
    } catch (error) {
      if (this.disposed || request !== this.requestId) return;
      this.leave(false);
      this.error = microphoneError(error);
      this.emit();
    }
  }

  toggleMic() {
    if (!this.stream || !this.status.sessionId) return;
    this.status = { ...this.status, muted: !this.status.muted };
    this.stream.getAudioTracks().forEach((track) => { track.enabled = !this.status.muted; });
    if (!this.publish({ ...this.status })) {
      this.leave(false);
      this.error = "The room connection was lost. Rejoin the room to use voice.";
      this.emit();
      return;
    }
    this.resumeAudio();
    this.emit();
  }

  leave(notify = true) {
    ++this.requestId;
    this.requesting = false;
    const wasJoined = this.status.sessionId !== null;
    this.status = { ...VOICE_OFF };
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    for (const entry of [...this.calls.values()]) this.dropCall(entry);
    for (const entry of this.waiting.values()) entry.call.close();
    this.waiting.clear();
    this.attempts.clear();
    this.error = "";
    if (notify && wasJoined) this.publish({ ...VOICE_OFF });
    this.emit();
  }

  private dropCall(entry: VoiceCall) {
    if (this.calls.get(entry.call.peer) !== entry) return;
    this.calls.delete(entry.call.peer);
    if (entry.audio) {
      entry.audio.pause();
      entry.audio.srcObject = null;
      entry.audio.remove();
    }
    entry.stream?.getTracks().forEach((track) => track.stop());
    entry.call.close();
  }

  private playAudio(entry: VoiceCall) {
    if (!entry.audio) return;
    const audio = entry.audio;
    void audio.play().then(() => {
      if (this.disposed || this.calls.get(entry.call.peer) !== entry) return;
      entry.blocked = false;
      this.emit();
    }).catch((error: unknown) => {
      if (this.disposed || this.calls.get(entry.call.peer) !== entry) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      entry.blocked = true;
      this.emit();
    });
  }

  resumeAudio() {
    for (const entry of this.calls.values()) this.playAudio(entry);
  }

  private attachCall(call: MediaConnection, sessionId: string) {
    const entry: VoiceCall = { call, sessionId, audio: null, stream: null, blocked: false, deadline: Date.now() + 12000 };
    this.calls.set(call.peer, entry);
    call.on("stream", (stream) => {
      if (this.disposed || this.calls.get(call.peer) !== entry || !this.status.sessionId) return;
      if (!stream.getAudioTracks().length) { this.dropCall(entry); this.emit(); return; }
      if (entry.audio) { entry.audio.pause(); entry.audio.srcObject = null; entry.audio.remove(); }
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.hidden = true;
      audio.srcObject = stream;
      document.body.appendChild(audio);
      entry.audio = audio;
      entry.stream = stream;
      this.playAudio(entry);
      this.emit();
    });
    const close = () => { this.dropCall(entry); this.emit(); };
    call.on("close", close);
    call.on("error", close);
    call.on("iceStateChanged", (state) => {
      if (state === "failed" || state === "closed") this.dropCall(entry);
      this.emit();
    });
  }

  private receiveCall = (call: MediaConnection) => {
    if (this.disposed || !this.ready || !this.stream || !this.status.sessionId
      || !isVoiceCallInfo(call.metadata, this.room)
      || call.metadata.toSession !== this.status.sessionId
      || !shouldInitiateVoice(call.peer, this.localId)
      || this.calls.has(call.peer) || this.waiting.has(call.peer) || this.waiting.size >= 3) {
      call.close();
      return;
    }
    // A media offer may arrive before the host's roster update. Never answer until authorized.
    const pending = { call, deadline: Date.now() + 5000 };
    this.waiting.set(call.peer, pending);
    const forget = () => {
      if (this.waiting.get(call.peer) === pending) this.waiting.delete(call.peer);
    };
    call.on("close", forget);
    call.on("error", forget);
    this.reconcile();
  };

  private reconcile() {
    if (this.disposed) return;
    const now = Date.now();
    const allowed = this.ready && this.stream && this.status.sessionId
      && this.members.some((member) => member.peerId === this.localId && member.sessionId === this.status.sessionId);
    const targets = allowed ? this.targets() : [];

    for (const entry of [...this.calls.values()]) {
      if (!targets.some((member) => member.peerId === entry.call.peer && member.sessionId === entry.sessionId)) {
        this.dropCall(entry);
      } else if (this.linked(entry)) {
        entry.deadline = 0;
        const attempt = this.attempts.get(entry.call.peer);
        if (attempt) { attempt.count = 0; attempt.since = now; attempt.nextTry = now + 1000; }
      } else {
        if (!entry.deadline) entry.deadline = now + 12000;
        if (now >= entry.deadline) this.dropCall(entry);
      }
    }
    for (const [id, pending] of this.waiting) {
      if (allowed && canAnswerVoice(this.localId, this.status.sessionId, this.room, this.members, id, pending.call.metadata)) {
        this.waiting.delete(id);
        if (this.calls.has(id)) { pending.call.close(); continue; }
        const remote = targets.find((member) => member.peerId === id)!;
        this.attachCall(pending.call, remote.sessionId!);
        try { pending.call.answer(this.stream!); } catch {
          const entry = this.calls.get(id);
          if (entry) this.dropCall(entry);
        }
      } else if (now >= pending.deadline) {
        this.waiting.delete(id);
        pending.call.close();
      }
    }

    for (const member of targets) {
      let attempt = this.attempts.get(member.peerId);
      if (!attempt || attempt.sessionId !== member.sessionId) {
        attempt = { sessionId: member.sessionId!, count: 0, nextTry: 0, since: now };
        this.attempts.set(member.peerId, attempt);
      }
      if (this.calls.has(member.peerId)) continue;
      if (now - attempt.since > 45000 || attempt.count >= 3) {
        this.error = "Voice could not connect to every player. Leave and rejoin voice, or try another network.";
        continue;
      }
      if (!shouldInitiateVoice(this.localId, member.peerId) || now < attempt.nextTry || this.peer.disconnected) continue;
      attempt.count += 1;
      attempt.nextTry = now + 5000;
      try {
        const call = this.peer.call(member.peerId, this.stream!, {
          metadata: { kind: VOICE_CALL_KIND, room: this.room, fromSession: this.status.sessionId, toSession: member.sessionId },
        });
        this.attachCall(call, member.sessionId!);
      } catch {
        this.error = "Voice is reconnecting. The card game can continue.";
      }
    }
    for (const id of this.attempts.keys()) {
      if (!targets.some((member) => member.peerId === id)) this.attempts.delete(id);
    }
    if (allowed && targets.every((member) => {
      const entry = this.calls.get(member.peerId);
      return entry && this.linked(entry);
    })) this.error = "";
    this.emit();
  }

  private pageHidden = () => { this.leave(); };
  // PeerJS temporarily clears peer.id during signaling recovery; existing calls keep their identity.
  private peerOpened = (id: string) => { this.localId = id; };
  private peerClosed = () => { this.setReady(false); };

  dispose() {
    this.disposed = true;
    this.leave(false);
    window.clearInterval(this.interval);
    this.peer.off("open", this.peerOpened);
    this.peer.off("call", this.receiveCall);
    this.peer.off("close", this.peerClosed);
    window.removeEventListener("pagehide", this.pageHidden);
  }
}

export function useRoomVoice(room: string) {
  const [state, setState] = useState(initialState);
  const sessionRef = useRef<RoomVoiceSession | null>(null);

  const attachPeer = useCallback((peer: Peer, publish: PublishStatus) => {
    sessionRef.current?.dispose();
    const session = new RoomVoiceSession(peer, room, publish, setState);
    sessionRef.current = session;
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [room]);
  const setReady = useCallback((ready: boolean) => sessionRef.current?.setReady(ready), []);
  const updateRoster = useCallback((members: VoiceMember[]) => sessionRef.current?.updateRoster(members), []);
  const join = useCallback(() => { void sessionRef.current?.join(); }, []);
  const toggleMic = useCallback(() => sessionRef.current?.toggleMic(), []);
  const leave = useCallback(() => sessionRef.current?.leave(), []);
  const resumeAudio = useCallback(() => sessionRef.current?.resumeAudio(), []);

  return { state, attachPeer, setReady, updateRoster, join, toggleMic, leave, resumeAudio };
}

export type RoomVoiceChat = ReturnType<typeof useRoomVoice>;