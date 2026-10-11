import type { BhabhiView } from "./engine";
import { isVoiceStatus, type VoiceMember, type VoiceStatus } from "../game/voiceProtocol";

export const BHABHI_PROTOCOL = 1;
export const bhabhiHostId = (code: string) => `bhabhi-card-v1-${code.trim().toUpperCase()}`;

export function makeBhabhiRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => chars[value % chars.length]).join("");
}

export interface BhabhiRoomSeat { id: number; name: string; occupied: boolean }
export interface BhabhiLobby { seats: BhabhiRoomSeat[]; viewer: number; started: boolean }

export type BhabhiGuestMessage =
  | { t: "hello"; game: "bhabhi"; protocol: number; name: string }
  | { t: "play"; round: number; revision: number; cardId: string }
  | { t: "voice-status"; status: VoiceStatus };

export type BhabhiHostMessage =
  | { t: "lobby"; game: "bhabhi"; protocol: number; lobby: BhabhiLobby }
  | { t: "state"; game: "bhabhi"; protocol: number; view: BhabhiView }
  | { t: "voice-roster"; room: string; members: VoiceMember[] }
  | { t: "denied"; message: string }
  | { t: "closed" };

export function isBhabhiGuestMessage(raw: unknown): raw is BhabhiGuestMessage {
  if (!raw || typeof raw !== "object") return false;
  const msg = raw as Record<string, unknown>;
  if (msg.t === "hello") return msg.game === "bhabhi" && typeof msg.protocol === "number" && typeof msg.name === "string";
  if (msg.t === "play") return typeof msg.cardId === "string" && Number.isInteger(msg.revision) && Number.isInteger(msg.round);
  if (msg.t === "voice-status") return isVoiceStatus(msg.status);
  return false;
}