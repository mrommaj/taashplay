import type Peer from "peerjs";
import type { PeerOptions } from "peerjs";

export type JoinStage = "signaling" | "peer" | "handshake";
export const MAX_JOIN_ATTEMPTS = 3;
export const JOIN_TIMEOUTS: Record<JoinStage, number> = {
  signaling: 25000,
  peer: 35000,
  handshake: 12000,
};
export const JOIN_STAGE_LABELS: Record<JoinStage, string> = {
  signaling: "Connecting to the room service...",
  peer: "Connecting to the host's device...",
  handshake: "Waiting for the host to confirm your place...",
};

export function joinFailureMessage(stage: JoinStage, code: string, hostAnswered = false): string {
  if (stage === "signaling") {
    return "Could not reach the room connection service. Check your internet, open the game in Chrome or Safari, and try again.";
  }
  if (stage === "handshake") {
    return "The connection opened, but the host did not confirm the room. Keep the host's screen awake. Both players should refresh the same site, then create a new room.";
  }
  return hostAnswered
    ? "The host responded, but a connection between your devices could not be established. Try a different Wi-Fi or mobile-data connection and disable any VPN. A restricted network may need a TURN relay."
    : `Could not establish a connection to room ${code}. Keep the host's room open and screen awake. Check the code, or try another Wi-Fi or mobile-data connection.`;
}

export function roomUnavailableMessage(code: string): string {
  return `Room ${code} is not registered with the connection service. Ask the host to return to the open room and wait until it says ready. If they refreshed or closed it, use a new room code.`;
}

export function peerOptions(): PeerOptions {
  // TURN-only credentials reach the browser by design. Restrict their usage in Metered.
  const turnCredentials = {
    username: "5c54daa7d0097f8d395f67cc",
    credential: "mPu3FNGUkWQ/RzfK",
  };
  const config: RTCConfiguration = {
    iceTransportPolicy: "all",
    iceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:standard.relay.metered.ca:80", ...turnCredentials },
      { urls: "turn:standard.relay.metered.ca:80?transport=tcp", ...turnCredentials },
      { urls: "turn:standard.relay.metered.ca:443", ...turnCredentials },
      { urls: "turns:standard.relay.metered.ca:443?transport=tcp", ...turnCredentials },
    ],
  };
  return { debug: 1, secure: true, pingInterval: 5000, config };
}

export function guestPeerId(): string {
  const random = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");
  return `rang-guest-${random}`;
}

// React StrictMode replays effects. Do not register a throwaway room ID during that replay.
export function deferPeerSetup(setup: () => () => void): () => void {
  let cleanup: (() => void) | undefined;
  const timer = window.setTimeout(() => { cleanup = setup(); }, 0);
  return () => {
    window.clearTimeout(timer);
    cleanup?.();
  };
}

interface RegistrationCallbacks {
  recovering: () => void;
  restored: () => void;
  unavailable: (message: string) => void;
}

export function keepPeerRegistered(peer: Peer, callbacks: RegistrationCallbacks) {
  let disposed = false;
  let registered = peer.open;
  let paused = false;
  let retryAllowed = true;
  let attempts = 0;
  let retryTimer: number | undefined;
  let waitTimer: number | undefined;

  const clearTimers = () => {
    window.clearTimeout(retryTimer);
    window.clearTimeout(waitTimer);
    retryTimer = undefined;
    waitTimer = undefined;
  };

  const unavailable = (message: string) => {
    if (disposed) return;
    paused = true;
    clearTimers();
    callbacks.unavailable(message);
  };

  const restored = () => {
    if (disposed) return;
    registered = true;
    paused = false;
    attempts = 0;
    clearTimers();
    callbacks.restored();
  };

  const schedule = () => {
    if (disposed || paused || !registered || retryTimer !== undefined || waitTimer !== undefined || peer.open) return;
    if (peer.destroyed) {
      unavailable("The room connection has closed. Create a new room and share its new code.");
      return;
    }
    callbacks.recovering();
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      if (disposed || paused || peer.open) return;
      if (!navigator.onLine) { schedule(); return; }
      if (peer.destroyed || attempts >= 4) {
        unavailable("Could not restore the room connection service. Check your internet and try reconnecting. Existing players can continue if their connection is still active.");
        return;
      }
      attempts += 1;
      try {
        if (peer.disconnected) peer.reconnect();
      } catch {
        schedule();
        return;
      }
      waitTimer = window.setTimeout(() => {
        waitTimer = undefined;
        if (disposed || paused || peer.open) return;
        if (!peer.destroyed && !peer.disconnected) peer.disconnect();
        schedule();
      }, 10000);
    }, Math.min(1000 * 2 ** attempts, 8000));
  };

  const onDisconnected = () => {
    if (disposed || !registered || paused) return;
    window.clearTimeout(waitTimer);
    waitTimer = undefined;
    schedule();
  };

  const onError = (error: { type?: string }) => {
    if (!registered || disposed) return;
    if (error.type === "unavailable-id") {
      retryAllowed = false;
      unavailable("The old room code is no longer available. Create a new room and share the new code.");
    }
  };

  const retry = () => {
    if (disposed || !registered || peer.destroyed || !retryAllowed) return false;
    paused = false;
    attempts = 0;
    clearTimers();
    if (peer.open) restored();
    else schedule();
    return true;
  };
  const onReturn = () => {
    if (!document.hidden && navigator.onLine && peer.disconnected) retry();
  };
  const onOffline = () => {
    if (!disposed && registered && !peer.destroyed && !peer.disconnected) peer.disconnect();
  };
  const onClosed = () => {
    if (registered) unavailable("The room connection has closed. Create a new room and share its new code.");
  };

  peer.on("open", restored);
  peer.on("disconnected", onDisconnected);
  peer.on("error", onError);
  peer.on("close", onClosed);
  window.addEventListener("online", onReturn);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onReturn);

  return {
    retry,
    dispose: () => {
      disposed = true;
      clearTimers();
      peer.off("open", restored);
      peer.off("disconnected", onDisconnected);
      peer.off("error", onError);
      peer.off("close", onClosed);
      window.removeEventListener("online", onReturn);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onReturn);
    },
  };
}