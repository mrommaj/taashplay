import { makeDeck, shuffle, sortHand, type Card, type Suit } from "../game/engine.ts";
import { getBotDifficulty, randomOf } from "../game/bot.ts";

export type { Card, Suit };
export type BhabhiPhase = "playing" | "trick-end" | "game-over";

export interface BhabhiPlayer {
  id: number;
  name: string;
  isBot: boolean;
  hand: Card[];
  out: boolean;
  pickups: number;
}

export interface BhabhiPlay { player: number; card: Card }
export interface TrickResult { kind: "discard" | "pickup"; player: number; count: number }
export interface LastBhabhiTrick extends TrickResult { suit: Suit; highestCardId: string }
export interface BhabhiKnowledge {
  voids: Suit[][];
  held: Card[][];
  discarded: Card[];
}

export interface BhabhiSeries {
  target: number;
  losses: number[];
}

export interface BhabhiState {
  players: BhabhiPlayer[];
  phase: BhabhiPhase;
  series: BhabhiSeries | null;
  round: number;
  revision: number;
  trickNumber: number;
  turn: number;
  trickSeats: number[];
  trick: BhabhiPlay[];
  discard: Card[];
  result: TrickResult | null;
  lastTrick: LastBhabhiTrick | null;
  knowledge: BhabhiKnowledge;
  forcedLeadId: string | null;
  finished: number[];
  loser: number | null;
  message: string;
}

export interface BhabhiPublicPlayer extends Omit<BhabhiPlayer, "hand"> {
  handCount: number;
  connected: boolean;
}

export interface BhabhiView extends Omit<BhabhiState, "players" | "discard" | "knowledge"> {
  players: BhabhiPublicPlayer[];
  viewer: number;
  hand: Card[];
  legalIds: string[];
  discardCount: number;
  seriesDone: boolean;
}

function turnOrder(players: BhabhiPlayer[], leader: number): number[] {
  return Array.from({ length: players.length }, (_, i) => (leader + i) % players.length)
    .filter((seat) => !players[seat].out);
}

export function createBhabhi(names: string[], humans: boolean[], round = 1, deck = shuffle(makeDeck()), seriesTarget: number | null = null, previousLosses: number[] | null = null): BhabhiState {
  const count = names.length;
  if (count < 3 || count > 6 || humans.length !== count) {
    throw new Error("Bhabhi uses three to six seats, including bots.");
  }
  const expected = new Set(makeDeck().map((card) => card.id));
  if (deck.length !== 52 || new Set(deck.map((card) => card.id)).size !== 52
    || deck.some((card) => !expected.has(card.id) || card.id !== `${card.suit}${card.rank}`)) {
    throw new Error("A full, unique 52-card deck is required.");
  }
  // Deal as evenly as possible; early seats may hold an extra card.
  const players = names.map((name, id): BhabhiPlayer => ({
    id,
    name: name.trim().slice(0, 12) || `Player ${id + 1}`,
    isBot: !humans[id],
    hand: sortHand(deck.filter((_, i) => i % count === id), null),
    out: false,
    pickups: 0,
  }));
  const leader = players.findIndex((player) => player.hand.some((card) => card.id === "S14"));
  return {
    players,
    phase: "playing",
    series: seriesTarget ? {
      target: seriesTarget,
      losses: previousLosses && previousLosses.length === count ? [...previousLosses] : players.map(() => 0),
    } : null,
    round, revision: 0, trickNumber: 1,
    turn: leader, trickSeats: turnOrder(players, leader), trick: [], discard: [], result: null,
    lastTrick: null,
    knowledge: {
      voids: players.map(() => []),
      held: players.map(() => []),
      discarded: [],
    },
    forcedLeadId: "S14", finished: [], loser: null,
    message: `${players[leader].name} starts with the Ace of Spades.`,
  };
}

export function bhabhiLegalCards(state: BhabhiState, seat = state.turn): Card[] {
  if (state.phase !== "playing" || seat !== state.turn || state.players[seat]?.out) return [];
  const hand = state.players[seat]?.hand ?? [];
  if (!state.trick.length) return state.forcedLeadId ? hand.filter((card) => card.id === state.forcedLeadId) : hand;
  const follow = hand.filter((card) => card.suit === state.trick[0].card.suit);
  return follow.length ? follow : hand;
}

export function highestLedCard(trick: BhabhiPlay[]): BhabhiPlay | null {
  if (!trick.length) return null;
  return trick.reduce((best, play) =>
    play.card.suit === trick[0].card.suit && play.card.rank > best.card.rank ? play : best,
  trick[0]);
}

export function playBhabhi(state: BhabhiState, seat: number, cardId: string): BhabhiState {
  const card = bhabhiLegalCards(state, seat).find((candidate) => candidate.id === cardId);
  if (!card) return state;
  const players = state.players.map((player) => player.id === seat
    ? { ...player, hand: player.hand.filter((held) => held.id !== cardId) } : player);
  const trick = [...state.trick, { player: seat, card }];
  const highest = highestLedCard(trick)!;
  const knowledge: BhabhiKnowledge = {
    voids: state.knowledge.voids.map((suits) => [...suits]),
    held: state.knowledge.held.map((cards, id) => id === seat ? cards.filter((held) => held.id !== card.id) : [...cards]),
    discarded: [...state.knowledge.discarded],
  };
  knowledge.voids[seat] = knowledge.voids[seat].filter((suit) => suit !== card.suit);
  const lead = trick[0].card.suit;
  if (card.suit !== lead && !knowledge.voids[seat].includes(lead)) knowledge.voids[seat].push(lead);
  // The opening Ace-of-Spades trick is always discarded, even if a player has no spades.
  const thulla = state.trickNumber > 1 && card.suit !== lead;
  const complete = thulla || trick.length === state.trickSeats.length;
  return {
    ...state, players, trick, knowledge, revision: state.revision + 1, forcedLeadId: null,
    phase: complete ? "trick-end" : "playing",
    turn: complete ? highest.player : state.trickSeats[trick.length],
    result: complete ? { kind: thulla ? "pickup" : "discard", player: highest.player, count: trick.length } : null,
    message: complete
      ? thulla ? `Thulla! ${players[highest.player].name} picks up ${trick.length} cards.` : "Everyone played. These cards leave the game."
      : `${players[state.trickSeats[trick.length]].name}'s turn.`,
  };
}

export function resolveBhabhi(state: BhabhiState, random = Math.random): BhabhiState {
  if (state.phase !== "trick-end" || !state.result) return state;
  const players = state.players.map((player) => ({ ...player, hand: [...player.hand] }));
  const discard = [...state.discard];
  const leader = state.result.player;
  const cards = state.trick.map((play) => play.card);
  const knowledge: BhabhiKnowledge = {
    voids: state.knowledge.voids.map((suits) => [...suits]),
    held: state.knowledge.held.map((known) => [...known]),
    discarded: [...state.knowledge.discarded],
  };
  const lastTrick: LastBhabhiTrick = {
    ...state.result, suit: state.trick[0].card.suit, highestCardId: highestLedCard(state.trick)!.card.id,
  };
  let forcedLeadId: string | null = null;
  let message = state.message;

  if (state.result.kind === "pickup") {
    players[leader].hand = sortHand([...players[leader].hand, ...cards], null);
    players[leader].pickups += 1;
    const known = new Map(knowledge.held[leader].map((held) => [held.id, held]));
    cards.forEach((card) => known.set(card.id, card));
    knowledge.held[leader] = [...known.values()];
    const acquiredSuits = new Set(cards.map((card) => card.suit));
    knowledge.voids[leader] = knowledge.voids[leader].filter((suit) => !acquiredSuits.has(suit));
    message = `${players[leader].name} picked up ${cards.length} cards and leads again.`;
  } else {
    // The high-card player still has the lead. If empty, draw from the OLD waste before adding this trick.
    if (players[leader].hand.length === 0) {
      const index = Math.min(discard.length - 1, Math.max(0, Math.floor(random() * discard.length)));
      const drawn = discard.length ? discard.splice(index, 1)[0] : cards.splice(cards.findIndex((card) => card.id === highestLedCard(state.trick)!.card.id), 1)[0];
      players[leader].hand = [drawn];
      forcedLeadId = drawn.id;
      // The draw is face down. Its suit must not be leaked to another bot.
      knowledge.voids[leader] = [];
      knowledge.held[leader] = [];
      knowledge.discarded = [];
      message = `${players[leader].name} must lead again, so draws one card from the discard pile.`;
    } else {
      message = `${players[leader].name} leads the next trick.`;
    }
    discard.push(...cards);
    knowledge.discarded.push(...cards);
  }

  const finished = [...state.finished];
  for (const play of state.trick) {
    const player = players[play.player];
    if (!player.out && player.hand.length === 0) {
      player.out = true;
      finished.push(player.id);
    }
  }
  const remaining = players.filter((player) => !player.out);
  const loser = remaining.length === 1 ? remaining[0].id : null;
  const series = state.series && loser !== null
    ? { target: state.series.target, losses: state.series.losses.map((count, id) => (id === loser ? count + 1 : count)) }
    : state.series;
  return {
    ...state, players, discard, finished, loser, forcedLeadId, knowledge, lastTrick, series,
    revision: state.revision + 1,
    phase: loser !== null ? "game-over" : "playing",
    turn: leader, trick: [], result: null, trickNumber: state.trickNumber + 1,
    trickSeats: turnOrder(players, leader),
    message: loser !== null
      ? `${players[loser].name} is the last player holding cards${series ? ` (${series.losses[loser]} Bhabhi${series.losses[loser] === 1 ? "" : "s"})` : ""}.`
      : message,
  };
}

export function isSeriesDone(state: BhabhiState): boolean {
  return state.series != null && state.series.losses.some((count) => count >= state.series!.target);
}

export function chooseBhabhiBotCard(state: BhabhiState): Card | null {
  const legal = bhabhiLegalCards(state);
  if (!legal.length) return null;
  if (legal.length === 1) return legal[0];

  if (getBotDifficulty() === "normal") {
    return easyBhabhiCard(state, legal);
  }
  const high = (cards: Card[]) => cards.reduce((best, card) => card.rank > best.rank ? card : best);
  const low = (cards: Card[]) => cards.reduce((best, card) => card.rank < best.rank ? card : best);
  if (state.trickNumber === 1) return high(legal);
  if (!state.trick.length) {
    const me = state.turn;
    const opponents = turnOrder(state.players, me).slice(1);
    const counts = new Map<Suit, number>();
    legal.forEach((card) => counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1));
    const unavailable = new Set([...state.players[me].hand, ...state.knowledge.discarded].map((card) => card.id));
    const elsewhere = makeDeck().filter((card) => !unavailable.has(card.id));
    const scoreLead = (card: Card) => {
      const firstVoid = opponents.findIndex((id) => state.knowledge.voids[id].includes(card.suit));
      const knownFollow = opponents.every((id) => state.knowledge.held[id].some((held) => held.suit === card.suit));
      const higher = elsewhere.filter((held) => held.suit === card.suit && held.rank > card.rank).length;
      const suitCount = counts.get(card.suit)!;
      let score = (suitCount === 1 ? 14 : 4 / suitCount) + Math.min(higher, 4) * 3;
      score += knownFollow ? card.rank * 2 : -card.rank * 1.5;
      // A known-void next player guarantees a pickup. Later voids are also risky.
      if (firstVoid === 0) score -= 1200;
      else if (firstVoid > 0) score -= 400 + (higher === 0 ? 200 : 0);
      if (state.lastTrick?.kind === "pickup" && state.lastTrick.player === me
        && state.lastTrick.highestCardId === card.id && !knownFollow) score -= 25;
      return score;
    };
    return legal.reduce((best, card) => scoreLead(card) > scoreLead(best) ? card : best);
  }
  if (legal[0].suit !== state.trick[0].card.suit) {
    const discardScore = (card: Card) => card.rank * 2
      + (legal.filter((held) => held.suit === card.suit).length === 1 ? 10 : 0);
    return legal.reduce((best, card) => discardScore(card) > discardScore(best) ? card : best);
  }
  const below = legal.filter((card) => card.rank < highestLedCard(state.trick)!.card.rank);
  if (below.length) return high(below);
  const laterPlayers = state.trickSeats.slice(state.trick.length + 1);
  const safeToWin = laterPlayers.every((id) => state.knowledge.held[id].some((card) => card.suit === state.trick[0].card.suit));
  return safeToWin ? high(legal) : low(legal);
}

function easyBhabhiCard(state: BhabhiState, legal: Card[]): Card {
  // Easy bot: low card of led suit; random low-ish when leading or thulla-ing; no knowledge tracking.
  if (state.trick.length > 0) {
    const follow = legal.filter((card) => card.suit === state.trick[0].card.suit);
    if (follow.length) return follow.reduce((a, c) => (c.rank < a.rank ? c : a));
    // thulla — dump randomly among lowest three
    const sorted = [...legal].sort((a, b) => a.rank - b.rank);
    return randomOf(sorted.slice(0, Math.min(3, sorted.length))) ?? sorted[0];
  }
  const sorted = [...legal].sort((a, b) => a.rank - b.rank);
  return randomOf(sorted.slice(0, Math.min(2, sorted.length))) ?? sorted[0];
}

export function bhabhiSnapshot(state: BhabhiState, viewer: number, connected = [true, true, true, true]): BhabhiView {
  const { players, discard, knowledge: _knowledge, ...publicState } = state;
  return {
    ...publicState,
    forcedLeadId: state.turn === viewer ? state.forcedLeadId : null,
    players: players.map(({ hand, ...player }) => ({
      ...player, handCount: hand.length, connected: player.isBot || connected[player.id],
    })),
    viewer, hand: [...players[viewer].hand], discardCount: discard.length,
    seriesDone: isSeriesDone(state),
    legalIds: bhabhiLegalCards(state, viewer).map((card) => card.id),
  };
}

export function setBhabhiBot(state: BhabhiState, seat: number): BhabhiState {
  if (!state.players[seat] || state.players[seat].isBot) return state;
  return {
    ...state, revision: state.revision + 1,
    players: state.players.map((player) => player.id === seat ? { ...player, isBot: true } : player),
    message: `${state.players[seat].name} left. A bot will continue their hand.`,
  };
}