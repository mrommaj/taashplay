export type Suit = "S" | "H" | "D" | "C";
export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_NAME: Record<Suit, string> = {
  S: "Spades",
  H: "Hearts",
  D: "Diamonds",
  C: "Clubs",
};
export const isRed = (s: Suit) => s === "H" || s === "D";

export interface Card {
  id: string;
  suit: Suit;
  rank: number; // 2..14 (14 = Ace)
}

export const rankLabel = (r: number) =>
  r === 14 ? "A" : r === 13 ? "K" : r === 12 ? "Q" : r === 11 ? "J" : String(r);

export interface Player {
  id: number;
  name: string;
  isBot: boolean;
  hand: Card[];
  team: 0 | 1;
}

export interface PlayedCard {
  player: number;
  card: Card;
}

export type Phase = "setup" | "choose-trump" | "playing" | "trick-done" | "hand-over";

export const DEFAULT_RULE = "sar" as const;
export type Rule = typeof DEFAULT_RULE;

export interface GameState {
  rule: Rule;
  seriesTarget: number | null; // first team to reach this many points wins the series
  pile: number; // sar: tricks waiting on table
  pileLeader: number | null; // sar: who won the previous (uncollected) trick
  phase: Phase;
  players: Player[];
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
  pendingDeck: Card[];
  message: string;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: `${suit}${rank}`, suit, rank });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUIT_ORDER: Record<Suit, number> = { S: 0, H: 1, C: 2, D: 3 };
export function sortHand(hand: Card[], trump: Suit | null): Card[] {
  return [...hand].sort((a, b) => {
    const at = a.suit === trump ? -1 : SUIT_ORDER[a.suit];
    const bt = b.suit === trump ? -1 : SUIT_ORDER[b.suit];
    if (at !== bt) return at - bt;
    return b.rank - a.rank;
  });
}

export const teamOf = (p: number): 0 | 1 => (p % 2 === 0 ? 0 : 1);
export const nextPlayer = (p: number) => (p + 1) % 4;
export const partnerOf = (p: number) => (p + 2) % 4;

export function createGame(names: string[], humans: boolean[], seriesTarget: number | null = null): GameState {
  const players: Player[] = names.map((name, i) => ({
    id: i,
    name,
    isBot: !humans[i],
    hand: [],
    team: teamOf(i),
  }));
  const dealer = 3;
  const state: GameState = {
    seriesTarget,
    rule: DEFAULT_RULE,
    pile: 0,
    pileLeader: null,
    phase: "setup",
    players,
    dealer,
    chooser: nextPlayer(dealer),
    trump: null,
    turn: nextPlayer(dealer),
    trick: [],
    tricksWon: [0, 0],
    scores: [0, 0],
    handNumber: 0,
    redealCount: 0,
    lastWinner: null,
    pendingDeck: [],
    message: "",
  };
  return dealNewHand(state);
}

export function qualifiesToChooseTrump(hand: Card[]): boolean {
  return hand.length === 5 && hand.some((card) => card.rank > 10);
}

export function isSeriesComplete(state: GameState): boolean {
  return state.seriesTarget != null && state.scores.some((score) => score >= state.seriesTarget!);
}

/** Reset points but keep players and start a fresh series. */
export function startNewSeriesFrom(state: GameState): GameState {
  return createGame(
    state.players.map((p) => p.name),
    state.players.map((p) => !p.isBot),
    state.seriesTarget,
  );
}

export function dealNewHand(state: GameState, nextDeck = () => shuffle(makeDeck())): GameState {
  const chooser = nextPlayer(state.dealer);
  let deck: Card[];
  let players: Player[];
  let redealCount = 0;
  // Reject the entire deal, rather than replacing one card or changing the chooser.
  do {
    deck = nextDeck();
    players = state.players.map((p) => ({ ...p, hand: [] as Card[] }));
    for (let round = 0; round < 5; round++) {
      for (let k = 0; k < 4; k++) {
        players[(chooser + k) % 4].hand.push(deck[round * 4 + k]);
      }
    }
    if (qualifiesToChooseTrump(players[chooser].hand)) break;
    redealCount += 1;
  } while (true);
  const pending = deck.slice(20);
  return {
    ...state,
    phase: "choose-trump",
    players,
    chooser,
    turn: chooser,
    trump: null,
    trick: [],
    tricksWon: [0, 0],
    pile: 0,
    pileLeader: null,
    handNumber: state.handNumber + 1,
    redealCount,
    lastWinner: null,
    pendingDeck: pending,
    message: `${redealCount ? "Low opening hand automatically redealt. " : ""}${players[chooser].name} is choosing the trump suit`,
  };
}

export function chooseTrump(state: GameState, trump: Suit): GameState {
  if (state.phase !== "choose-trump" || !SUITS.includes(trump)
    || !qualifiesToChooseTrump(state.players[state.chooser].hand)) return state;
  const players = state.players.map((p) => ({ ...p, hand: [...p.hand] }));
  const deck = [...state.pendingDeck];
  let idx = 0;
  // Deal remaining 8 cards each (4 + 4)
  for (let round = 0; round < 8; round++) {
    for (let k = 0; k < 4; k++) {
      const p = (state.chooser + k) % 4;
      players[p].hand.push(deck[idx++]);
    }
  }
  for (const p of players) p.hand = sortHand(p.hand, trump);
  return {
    ...state,
    phase: "playing",
    players,
    trump,
    pendingDeck: [],
    turn: state.chooser,
    trick: [],
    message: `Trump is ${SUIT_SYMBOL[trump]} — ${players[state.chooser].name} leads`,
  };
}

export function legalCards(hand: Card[], trick: PlayedCard[]): Card[] {
  if (trick.length === 0) return hand;
  const lead = trick[0].card.suit;
  const following = hand.filter((c) => c.suit === lead);
  return following.length > 0 ? following : hand;
}

export function trickWinner(trick: PlayedCard[], trump: Suit): PlayedCard {
  const lead = trick[0].card.suit;
  let best = trick[0];
  for (const pc of trick.slice(1)) {
    const c = pc.card;
    const b = best.card;
    if (c.suit === trump && b.suit !== trump) best = pc;
    else if (c.suit === b.suit && c.rank > b.rank) best = pc;
    else if (c.suit === lead && b.suit !== trump && b.suit !== lead) best = pc;
  }
  return best;
}

export function playCard(state: GameState, playerId: number, card: Card): GameState {
  if (state.phase !== "playing" || state.turn !== playerId) return state;
  const player = state.players[playerId];
  if (!legalCards(player.hand, state.trick).some((c) => c.id === card.id)) return state;

  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, hand: p.hand.filter((c) => c.id !== card.id) } : p
  );
  const trick = [...state.trick, { player: playerId, card }];
  if (trick.length === 4) {
    return { ...state, players, trick, phase: "trick-done" };
  }
  return { ...state, players, trick, turn: nextPlayer(playerId) };
}

export function resolveTrick(state: GameState): GameState {
  if (state.phase !== "trick-done" || !state.trump) return state;
  const winner = trickWinner(state.trick, state.trump);
  const tricksWon: [number, number] = [...state.tricksWon] as [number, number];
  const handsEmpty = state.players.every((p) => p.hand.length === 0);
  let pile = state.pile + 1;
  let pileLeader = state.pileLeader;
  let note: string;
  if (pileLeader === winner.player || handsEmpty) {
    tricksWon[teamOf(winner.player)] += pile;
    note = `${state.players[winner.player].name} picked up ${pile} trick${pile > 1 ? "s" : ""}!`;
    pile = 0;
    pileLeader = null;
  } else {
    pileLeader = winner.player;
    note = `${state.players[winner.player].name} won; needs 1 more in a row to pick up ${pile}`;
  }

  if (handsEmpty) {
    const scores: [number, number] = [...state.scores] as [number, number];
    const winningTeam = tricksWon[0] > tricksWon[1] ? 0 : 1;
    const kot = tricksWon[winningTeam] === 13;
    scores[winningTeam] += kot ? 2 : 1;
    // Dealer rotates if the trump-choosing team lost; otherwise stays
    const chooserTeam = teamOf(state.chooser);
    const dealer = chooserTeam === winningTeam ? state.dealer : nextPlayer(state.dealer);
    return {
      ...state,
      phase: "hand-over",
      trick: [],
      tricksWon,
      scores,
      dealer,
      lastWinner: winner.player,
      pile: 0,
      pileLeader: null,
      message: kot ? "Clean sweep!" : "Hand over",
    };
  }
  return {
    ...state,
    phase: "playing",
    trick: [],
    tricksWon,
    pile,
    pileLeader,
    turn: winner.player,
    lastWinner: winner.player,
    message: note,
  };
}

// ---------- Bot AI ----------

import { getBotDifficulty } from "./bot.ts";

export function botChooseTrump(hand: Card[]): Suit {
  let best: Suit = "S";
  let bestScore = -1;
  for (const s of SUITS) {
    const cards = hand.filter((c) => c.suit === s);
    const score = cards.length * 10 + cards.reduce((a, c) => a + c.rank, 0) / 10;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

const lowest = (cards: Card[]) => cards.reduce((a, c) => (c.rank < a.rank ? c : a));
const highest = (cards: Card[]) => cards.reduce((a, c) => (c.rank > a.rank ? c : a));

export function botPickCard(state: GameState, playerId: number): Card {
  const hand = state.players[playerId].hand;
  const trump = state.trump!;
  const legal = legalCards(hand, state.trick);
  if (legal.length === 1) return legal[0];

  if (getBotDifficulty() === "normal") {
    return easyRangCard(state, playerId, legal);
  }

  // Leading
  if (state.trick.length === 0) {
    const nonTrump = hand.filter((c) => c.suit !== trump);
    const aces = nonTrump.filter((c) => c.rank === 14);
    if (aces.length) return aces[0];
    const trumps = hand.filter((c) => c.suit === trump);
    if (trumps.length >= 5 && trumps.some((c) => c.rank >= 13)) return highest(trumps);
    const pool = nonTrump.length ? nonTrump : hand;
    // lead lowest from the longest suit
    const bySuit: Record<string, Card[]> = {};
    for (const c of pool) (bySuit[c.suit] ||= []).push(c);
    const longest = Object.values(bySuit).sort((a, b) => b.length - a.length)[0];
    return lowest(longest);
  }

  const currentBest = trickWinner(state.trick, trump);
  const partnerWinning = currentBest.player === partnerOf(playerId);
  const lead = state.trick[0].card.suit;
  const canFollow = legal[0].suit === lead;
  const lastToPlay = state.trick.length === 3;

  const beats = (c: Card) => {
    const b = currentBest.card;
    if (c.suit === trump && b.suit !== trump) return true;
    if (c.suit === b.suit && c.rank > b.rank) return true;
    return false;
  };

  if (canFollow) {
    if (partnerWinning && (lastToPlay || currentBest.card.rank >= 13)) return lowest(legal);
    const winners = legal.filter(beats);
    if (winners.length) {
      // Last to play: use lowest winning; otherwise play highest to be safe
      return lastToPlay ? lowest(winners) : highest(winners);
    }
    return lowest(legal);
  }

  // Void in lead suit
  const trumps = legal.filter((c) => c.suit === trump);
  const nonTrump = legal.filter((c) => c.suit !== trump);
  if (partnerWinning) {
    return nonTrump.length ? lowest(nonTrump) : lowest(trumps);
  }
  const winningTrumps = trumps.filter(beats);
  if (winningTrumps.length) return lowest(winningTrumps);
  return nonTrump.length ? lowest(nonTrump) : lowest(trumps);
}

function easyRangCard(state: GameState, playerId: number, legal: Card[]): Card {
  const hand = state.players[playerId].hand;
  const trump = state.trump!;
  // Easy bot: play the lowest legal card, preferring to dump non-trump when out of suit.
  legal.sort((a, b) => (a.suit === trump ? 1 : 0) - (b.suit === trump ? 1 : 0) || a.rank - b.rank);
  void hand;
  return legal[0];
}
