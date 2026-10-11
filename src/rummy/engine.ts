import { makeDeck, shuffle, sortHand, type Card, type Suit } from "../game/engine.ts";
import { getBotDifficulty } from "../game/bot.ts";

export type { Card, Suit };
export type RummyPhase = "playing" | "round-over";
export type DrawSource = "stock" | "discard" | null;

export interface RummyPlayer {
  id: number;
  name: string;
  isBot: boolean;
  hand: Card[];
}

export interface RummyState {
  players: RummyPlayer[];
  stock: Card[];
  discard: Card[];
  turn: number;
  drawn: DrawSource;
  score: [number, number];
  seriesTarget: number | null;
  round: number;
  revision: number;
  phase: RummyPhase;
  winner: number | null;
  message: string;
}

export interface RummyView extends Omit<RummyState, "players" | "stock" | "discard"> {
  viewer: number;
  hand: Card[];
  stockCount: number;
  opponentHandCount: number;
  discardTop: Card | null;
  legalDraw: boolean;
  seriesDone: boolean;
}

export function createRummy(names: string[], humans: boolean[], round = 1, deck = shuffle(makeDeck()), score: [number, number] = [0, 0], seriesTarget: number | null = null): RummyState {
  if (names.length !== 2) throw new Error("Rummy is played with two players for now.");
  const players = names.map((name, id): RummyPlayer => ({
    id,
    name: name.trim().slice(0, 12) || (id === 0 ? "You" : "Bot"),
    isBot: !humans[id],
    hand: sortHand(deck.slice(id * 10, id * 10 + 10), null),
  }));
  const stock = deck.slice(20);
  const discard = stock.splice(0, 1);
  return {
    players, stock, discard, turn: 0, drawn: null, score, seriesTarget,
    round, revision: 0, phase: "playing", winner: null,
    message: `${players[0].name} starts. Draw a card.`,
  };
}

// ---------- Meld detection ----------
export function meldGroups(cards: Card[]): Card[][] | null {
  // Partition ALL cards into sets (3-4 same rank) or runs (3+ consecutive same suit), or null.
  if (!cards.length) return [];

  const candidates: Card[][] = [];
  const byRank = new Map<number, Card[]>();
  for (const card of cards) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  for (const group of byRank.values()) {
    if (group.length >= 3) candidates.push(group);
  }
  const bySuit = new Map<Suit, Card[]>();
  for (const card of cards) {
    const group = bySuit.get(card.suit) ?? [];
    group.push(card);
    bySuit.set(card.suit, group);
  }
  for (const group of bySuit.values()) {
    const sorted = [...group].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 2; j < sorted.length; j++) {
        const run = sorted.slice(i, j + 1);
        if (run.every((card, k) => card.rank === run[0].rank + k)) {
          candidates.push(run);
        }
      }
    }
  }

  const failed = new Set<string>();
  function solve(remaining: Card[], groups: Card[][]): Card[][] | null {
    if (!remaining.length) return groups;
    const key = remaining.map((card) => card.id).join(",");
    if (failed.has(key)) return null;
    const first = remaining[0];
    for (const candidate of candidates) {
      if (!candidate.some((card) => card.id === first.id)) continue;
      if (!candidate.every((card) => remaining.some((r) => r.id === card.id))) continue;
      const used = new Set(candidate.map((card) => card.id));
      const next = remaining.filter((card) => !used.has(card.id));
      const answer = solve(next, [...groups, candidate]);
      if (answer) return answer;
    }
    failed.add(key);
    return null;
  }

  return solve([...cards].sort((a, b) => b.rank - a.rank), []);
}

export function isGin(hand: Card[]): boolean {
  return hand.length > 0 && meldGroups(hand) !== null;
}

export function meldResult(hand: Card[]): Card[][] | null {
  return meldGroups(hand);
}

// ---------- Turn actions ----------
export function drawCard(state: RummyState, source: "stock" | "discard"): RummyState {
  if (state.phase !== "playing" || state.drawn) return state;
  if (source === "stock" && state.stock.length === 0) {
    return { ...state, phase: "round-over", winner: null, message: "The deck ran out — the round is tied." };
  }
  const stock = source === "stock" ? state.stock.slice(1) : [...state.stock];
  const discard = source === "discard" ? state.discard.slice(0, -1) : [...state.discard];
  if (source === "discard" && state.discard.length === 0) return state;
  const taken = source === "stock" ? state.stock[0] : state.discard[state.discard.length - 1];
  const players = state.players.map((player) =>
    player.id === state.turn ? { ...player, hand: sortHand([...player.hand, taken], null) } : player
  );
  return {
    ...state, players, stock, discard, drawn: source,
    message: source === "stock" ? `${players[state.turn].name} drew from the deck. Now discard.` : `${players[state.turn].name} took ${taken.id} from the pile. Now discard.`,
    revision: state.revision + 1,
  };
}

export function discardCard(state: RummyState, cardId: string): RummyState {
  if (state.phase !== "playing" || !state.drawn) return state;
  const player = state.players[state.turn];
  const card = player.hand.find((held) => held.id === cardId);
  if (!card) return state;
  const players = state.players.map((p) =>
    p.id === state.turn ? { ...p, hand: p.hand.filter((held) => held.id !== cardId) } : p
  );
  const discard = [...state.discard, card];
  const gin = isGin(players[state.turn].hand);
  if (gin) {
    const scores: [number, number] = [...state.score];
    scores[state.turn] += 1;
    return {
      ...state, players, discard, drawn: null, phase: "round-over",
      winner: state.turn, score: scores,
      message: `GIN! ${players[state.turn].name} arranged all cards and wins the round!`,
      revision: state.revision + 1,
    };
  }
  return {
    ...state, players, discard, drawn: null,
    turn: 1 - state.turn,
    message: `${players[state.turn].name} discarded. ${Players_DELIMITER(state)} turn.`,
    revision: state.revision + 1,
  };
}

function Players_DELIMITER(state: RummyState): string {
  return state.players[1 - state.turn].name + "'s";
}

// ---------- Bot ----------
export function botDraw(state: RummyState): "stock" | "discard" {
  if (getBotDifficulty() === "normal") return Math.random() < 0.3 && state.discard.length ? "discard" : "stock";
  const top = state.discard[state.discard.length - 1];
  if (top) {
    const withTop = [...state.players[state.turn].hand, top];
    // Take the top card if it can instantly reach gin, or joins an existing meld.
    for (const discard of withTop) {
      const remaining = withTop.filter((card) => card.id !== discard.id);
      if (isGin(remaining)) return "discard";
    }
    const groups = meldGroups(withTop);
    if (groups?.some((group) => group.some((card) => card.id === top.id))) return "discard";
  }
  return "stock";
}

export function botDiscard(state: RummyState): Card | null {
  const player = state.players[state.turn];
  if (!player?.hand.length) return null;
  if (getBotDifficulty() === "normal") return player.hand[Math.floor(Math.random() * player.hand.length)];
  // Discard outside melds; fall back to lowest-ranked card.
  const groups = meldGroups(player.hand);
  const meldedIds = new Set((groups ?? []).flat().map((card) => card.id));
  const bulk = player.hand.filter((card) => !meldedIds.has(card.id));
  if (bulk.length) return bulk.reduce((a, b) => (b.rank < a.rank ? b : a));
  return player.hand.reduce((a, b) => (b.rank < a.rank ? b : a));
}

export function isRummySeriesDone(state: RummyState): boolean {
  return state.seriesTarget != null && (state.score[0] >= state.seriesTarget || state.score[1] >= state.seriesTarget);
}

export function rummySnapshot(state: RummyState, viewer: number): RummyView {
  const { players, stock, discard, ...publicState } = state;
  return {
    ...publicState,
    viewer,
    hand: [...players[viewer].hand],
    opponentHandCount: players[1 - viewer].hand.length,
    stockCount: stock.length,
    discardTop: discard[discard.length - 1] ?? null,
    legalDraw: state.phase === "playing" && state.turn === viewer && !state.drawn,
    seriesDone: isRummySeriesDone(state),
  };
}
