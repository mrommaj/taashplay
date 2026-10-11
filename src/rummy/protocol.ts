import type { RummyView } from "./engine";
import type { VoiceMember, VoiceStatus } from "../game/voiceProtocol";

export const RUMMY_PROTOCOL = 1;
export const rummyHostId = (code: string) => `rummy-card-v1-${code.trim().toUpperCase()}`;

export function makeRummyRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => chars[value % chars.length]).join("");
}

export interface RummyLobbyView { names: string[]; occupied: boolean[]; viewer: number }

export type RummyGuestMessage =
  | { t: "hello"; game: "rummy"; protocol: number; name: string }
  | { t: "draw"; source: "stock" | "discard"; round: number; revision: number }
  | { t: "discard"; cardId: string; round: number; revision: number }
  | { t: "next" }
  | { t: "new-series" }
  | { t: "voice-status"; status: VoiceStatus };

export type RummyHostMessage =
  | { t: "lobby"; game: "rummy"; protocol: number; lobby: RummyLobbyView }
  | { t: "state"; game: "rummy"; protocol: number; view: RummyView }
  | { t: "voice-roster"; room: string; members: VoiceMember[] }
  | { t: "denied"; message: string }
  | { t: "closed" };

export function isRummyGuestMessage(raw: unknown): raw is RummyGuestMessage {
  if (!raw || typeof raw !== "object") return false;
  const msg = raw as Record<string, unknown>;
  if (msg.t === "hello") return msg.game === "rummy" && typeof msg.protocol === "number" && typeof msg.name === "string";
  if (msg.t === "draw") return (msg.source === "stock" || msg.source === "discard") && Number.isInteger(msg.round) && Number.isInteger(msg.revision);
  if (msg.t === "discard") return typeof msg.cardId === "string" && Number.isInteger(msg.round) && Number.isInteger(msg.revision);
  if (msg.t === "next" || msg.t === "new-series") return true;
  return msg.t === "voice-status";
}
