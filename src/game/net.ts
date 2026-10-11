import type Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { Card, GameState, Phase, PlayedCard, Rule, Suit } from "./engine";
import { legalCards, SUITS } from "./engine";
import type { TeamId } from "./lobby";
import { isVoiceStatus, type VoiceMember, type VoiceStatus } from "./voiceProtocol";

export const PEER_PREFIX = "rang-card-v1-";
export const ROOM_PROTOCOL = 3;

export function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function hostPeerId(code: string) {
  return `${PEER_PREFIX}${code.toUpperCase().trim()}`;
}

// ---------- Snapshot sent to guests ----------
export interface SnapshotPlayer {
  id: number;
  name: string;
  isBot: boolean;
  connected: boolean;
  team: 0 | 1;
  handCount: number;
  hand: Card[] | null; // only filled for the viewing guest
}

export interface Snapshot {
  rule: Rule;
  seriesTarget: number | null;
  pile: number;
  pileLeader: number | null;
  phase: Phase;
  players: SnapshotPlayer[];
  dealer: number;
  chooser: number;
  trump: Suit | null;
  turn: number;
  trick: PlayedCard[];
  tricksWon: [number, number];
  scores: [number, number];
  handNumber: number;
  redealCount: number;
  lastWinner: number | null;
  message: string;
  legalIds: string[];
  canChooseTrump: boolean;
  chooserHand: Card[] | null; // first-5 preview for trump chooser (== hand, kept for clarity)
}

export function buildSnapshot(state: GameState, viewerId: number, connected: boolean[]): Snapshot {
  const players: SnapshotPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    connected: p.isBot ? true : connected[p.id] ?? false,
    team: p.team,
    handCount: p.hand.length,
    hand: p.id === viewerId ? [...p.hand] : null,
  }));
  let legalIds: string[] = [];
  if (state.phase === "playing" && state.turn === viewerId) {
    const me = state.players[viewerId];
    legalIds = legalCards(me.hand, state.trick).map((c) => c.id);
  }
  const canChooseTrump = state.phase === "choose-trump" && state.chooser === viewerId;
  return {
    rule: state.rule,
    seriesTarget: state.seriesTarget,
    pile: state.pile,
    pileLeader: state.pileLeader,
    phase: state.phase,
    players,
    dealer: state.dealer,
    chooser: state.chooser,
    trump: state.trump,
    turn: state.turn,
    trick: state.trick.map((t) => ({ ...t })),
    tricksWon: [...state.tricksWon] as [number, number],
    scores: [...state.scores] as [number, number],
    handNumber: state.handNumber,
    redealCount: state.redealCount,
    lastWinner: state.lastWinner,
    message: state.message,
    legalIds,
    canChooseTrump,
    chooserHand: canChooseTrump ? [...state.players[viewerId].hand] : null,
  };
}

// ---------- Wire protocol ----------
export interface LobbySnapshot {
  protocol: typeof ROOM_PROTOCOL;
  rule: Rule;
  code: string;
  youId: number; // -1 until this guest has chosen a team
  names: string[];
  connected: boolean[];
  seatsTaken: boolean[];
  pendingNames: string[];
  started: boolean;
  hostName: string;
}

export type GuestToHostMsg =
  | { t: "hello"; name: string; protocol?: number }
  | { t: "voice-status"; status: VoiceStatus }
  | { t: "choose-team"; team: TeamId }
  | { t: "choose-trump"; suit: Suit }
  | { t: "play"; cardId: string }
  | { t: "next-hand" }
  | { t: "ping" };

export type HostToGuestMsg =
  | ({ t: "lobby" } & LobbySnapshot)
  | { t: "voice-roster"; room: string; members: VoiceMember[] }
  | { t: "state"; protocol: typeof ROOM_PROTOCOL; youId: number; snap: Snapshot }
  | { t: "team-error"; msg: string }
  | { t: "denied"; msg: string }
  | { t: "closed" };

export function isGuestMessage(value: unknown): value is GuestToHostMsg {
  if (!value || typeof value !== "object" || !("t" in value)) return false;
  const msg = value as Record<string, unknown>;
  switch (msg.t) {
    case "hello": return typeof msg.name === "string";
    case "voice-status": return isVoiceStatus(msg.status);
    case "choose-team": return msg.team === 0 || msg.team === 1;
    case "choose-trump": return SUITS.includes(msg.suit as Suit);
    case "play": return typeof msg.cardId === "string";
    case "next-hand":
    case "ping": return true;
    default: return false;
  }
}

export type { Peer, DataConnection };
