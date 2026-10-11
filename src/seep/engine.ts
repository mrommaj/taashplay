import { makeDeck, shuffle, sortHand, teamOf, type Card } from "../game/engine.ts";
import { getBotDifficulty } from "../game/bot.ts";
import { collectSums, findSum, partitionCards, seepPoints, seepValue, totalPoints } from "./cards.ts";

export { seepValue, seepPoints, totalPoints };
export type Team = 0 | 1;
export type SeepPhase = "bid" | "opening" | "playing" | "deal-over" | "match-over";
export interface SeepPlayer { id: number; name: string; isBot: boolean; hand: Card[] }
export interface FloorItem {
  id: string;
  kind: "loose" | "house";
  value: number;
  groups: Card[][];
  owners: number[];
}
export type SeepMove =
  | { kind: "capture"; cardId: string; floorIds: string[] }
  | { kind: "build"; cardId: string; floorIds: string[]; value: number }
  | { kind: "drop"; cardId: string; floorIds: string[] };
export type SeepAction = { kind: "bid"; value: number } | SeepMove;
export interface SeepResult {
  cardPoints: [number, number];
  bonuses: [number, number];
  points: [number, number];
  difference: number;
  leadAfter: number;
  winner: Team | null;
  baaziWinner: Team | null;
  reason: string;
}
export interface SeepState {
  players: SeepPlayer[];
  phase: SeepPhase;
  dealer: number;
  bidder: number;
  turn: number;
  bid: number | null;
  floor: FloorItem[];
  stock: Card[];
  captured: [Card[], Card[]];
  bonuses: [number, number];
  sweeps: [number, number];
  lastCapture: Team | null;
  movesPlayed: number;
  handNumber: number;
  revision: number;
  lead: number;
  baazis: [number, number];
  seriesTarget: number | null; // first team to win this many baazis wins the series
  result: SeepResult | null;
  message: string;
  lastMove: { player: number; card: Card; kind: SeepMove["kind"]; sweep: number } | null;
}
export interface SeepPosition {
  phase: SeepPhase;
  hand: Card[];
  floor: FloorItem[];
  turn: number;
  viewer: number;
  bid: number | null;
  revision: number;
}
export interface SeepView extends Omit<SeepState, "players" | "stock" | "captured" | "floor">, SeepPosition {
  players: { id: number; name: string; isBot: boolean; handCount: number; connected: boolean }[];
  capturedCounts: [number, number];
  points: [number, number];
  bids: number[];
  seriesDone: boolean;
}
export type MovePreview = { ok: true; floor: FloorItem[]; taken: Card[]; message: string }
  | { ok: false; error: string };

export const nextSeepPlayer = (seat: number) => (seat + 3) % 4;
export const itemCards = (item: FloorItem) => item.groups.flat();
const looseItem = (card: Card): FloorItem => ({ id: `loose-${card.id}`, kind: "loose", value: seepValue(card), groups: [[card]], owners: [] });
const looseCards = (floor: FloorItem[]) => floor.filter((item) => item.kind === "loose").flatMap(itemCards);
export const bidValues = (hand: Card[]) => [...new Set(hand.map(seepValue).filter((value) => value >= 9))].sort((a, b) => a - b);

function validateDeck(deck: Card[]) {
  const expected = new Set(makeDeck().map((card) => card.id));
  if (deck.length !== 52 || new Set(deck.map((card) => card.id)).size !== 52
    || deck.some((card) => !expected.has(card.id) || card.id !== `${card.suit}${card.rank}`)) throw new Error("A unique 52-card deck is required.");
}

export function createSeep(names: string[], humans: boolean[], dealer = 1, suppliedDeck?: Card[], seriesTarget: number | null = null): SeepState {
  if (names.length !== 4 || humans.length !== 4 || !Number.isInteger(dealer) || dealer < 0 || dealer > 3) throw new Error("Seep uses four seats.");
  let deck = suppliedDeck ? [...suppliedDeck] : shuffle(makeDeck());
  validateDeck(deck);
  if (suppliedDeck && !bidValues(deck.slice(0, 4)).length) throw new Error("The bidder needs a card from 9 to King; redeal.");
  let attempts = 0;
  while (!bidValues(deck.slice(0, 4)).length) {
    deck = shuffle(deck);
    if (++attempts >= 100) {
      const high = deck.findIndex((card) => seepValue(card) >= 9);
      [deck[0], deck[high]] = [deck[high], deck[0]];
    }
  }
  const bidder = nextSeepPlayer(dealer);
  return {
    players: names.map((name, id) => ({ id, name: name.trim().slice(0, 12) || `Player ${id + 1}`, isBot: !humans[id], hand: id === bidder ? sortHand(deck.slice(0, 4), null) : [] })),
    phase: "bid", dealer, bidder, turn: bidder, bid: null,
    floor: deck.slice(4, 8).map(looseItem), stock: deck.slice(8), captured: [[], []],
    bonuses: [0, 0], sweeps: [0, 0], lastCapture: null, movesPlayed: 0, handNumber: 1, revision: 0,
    lead: 0, baazis: [0, 0], seriesTarget, result: null, lastMove: null,
    message: `${names[bidder]} bids from their first four cards.`,
  };
}

export function hasCapture(floor: FloorItem[], value: number): boolean {
  return floor.some((item) => item.kind === "house" && item.value === value) || !!findSum(looseCards(floor), value)?.length;
}

export function captureSuggestion(position: SeepPosition, cardId: string): SeepMove | null {
  const card = position.hand.find((held) => held.id === cardId);
  if (!card) return null;
  const value = seepValue(card);
  const ids = new Set(collectSums(looseCards(position.floor), value).flat().map((held) => held.id));
  const floorIds = position.floor.filter((item) => item.kind === "house" ? item.value === value : ids.has(item.groups[0][0].id)).map((item) => item.id);
  return floorIds.length ? { kind: "capture", cardId, floorIds } : null;
}

function reservationError(floor: FloorItem[], hand: Card[], seat: number): string | null {
  const missing = floor.find((item) => item.kind === "house" && item.owners.includes(seat) && !hand.some((card) => seepValue(card) === item.value));
  return missing ? `Keep a ${missing.value}-value card for your house, or capture that house now.` : null;
}

export function previewSeepMove(position: SeepPosition, move: SeepMove): MovePreview {
  const bad = (error: string): MovePreview => ({ ok: false, error });
  if (!(position.phase === "opening" || position.phase === "playing") || position.turn !== position.viewer) return bad("Wait for your turn.");
  const card = position.hand.find((held) => held.id === move.cardId);
  if (!card) return bad("Select a card from your hand.");
  if (!Array.isArray(move.floorIds) || new Set(move.floorIds).size !== move.floorIds.length) return bad("Select each floor item only once.");
  const selected = position.floor.filter((item) => move.floorIds.includes(item.id));
  if (selected.length !== move.floorIds.length) return bad("The floor changed. Select your move again.");
  const value = seepValue(card);
  const hand = position.hand.filter((held) => held.id !== card.id);
  let remaining = position.floor.filter((item) => !move.floorIds.includes(item.id));
  if (position.phase === "opening") {
    if (move.kind === "build" ? move.value !== position.bid : value !== position.bid) return bad(`Your first move must use the bid value ${position.bid}: capture, drop, or build that house.`);
  }

  if (move.kind === "drop") {
    if (selected.length) return bad("Deselect floor cards before dropping.");
    if (hasCapture(position.floor, value)) return bad("This card can capture. Capture all matching sets or use it in a house.");
    remaining = [...position.floor, looseItem(card)];
    const error = reservationError(remaining, hand, position.viewer);
    return error ? bad(error) : { ok: true, floor: remaining, taken: [], message: `Dropped a ${value}.` };
  }

  if (move.kind === "capture") {
    if (!selected.length) return bad("Select the floor cards or house to capture.");
    if (selected.some((item) => item.kind === "house" && item.value !== value)) return bad("A house needs an exact-value card. It cannot be added to other cards for a capture.");
    if (!partitionCards(looseCards(selected), value)) return bad(`Selected loose cards must split into separate sets of ${value}.`);
    if (hasCapture(remaining, value)) return bad("You must also capture the remaining matching cards, sets, or house.");
    const error = reservationError(remaining, hand, position.viewer);
    return error ? bad(error) : { ok: true, floor: remaining, taken: [card, ...selected.flatMap(itemCards)], message: `Captured ${selected.flatMap(itemCards).length + 1} cards.` };
  }

  const target = move.value;
  if (!Number.isInteger(target) || target < 9 || target > 13) return bad("Houses must have a value from 9 to 13.");
  const existing = position.floor.find((item) => item.kind === "house" && item.value === target);
  const broken = selected.filter((item) => item.kind === "house" && item.value !== target);
  if (broken.length > 1) return bad("Only one lower house can be raised in a move.");
  let groups: Card[][];
  if (broken.length) {
    const lower = broken[0];
    if (lower.groups.length > 1) return bad("A cemented house cannot be raised.");
    if (lower.owners.includes(position.viewer)) return bad("You cannot raise your own house.");
    if (lower.value + value !== target) return bad("Raise a house using only the card from your hand, not extra floor cards.");
    const extra = partitionCards(looseCards(selected), target);
    if (!extra) return bad(`Extra floor cards must form separate sets of ${target}.`);
    groups = [[...itemCards(lower), card], ...extra];
  } else {
    const combined = partitionCards([card, ...looseCards(selected)], target);
    if (!combined || (!existing && combined.flat().length < 2)) return bad(`Your card plus selected loose cards must make ${target}.`);
    groups = combined;
  }
  const partnerOwns = existing?.owners.some((owner) => owner !== position.viewer && teamOf(owner) === teamOf(position.viewer)) ?? false;
  if (!partnerOwns && !hand.some((held) => seepValue(held) === target)) return bad(`Keep another ${target}-value card in your hand to own this house.`);
  const owners = existing ? [...existing.owners] : [];
  if (!partnerOwns && !owners.includes(position.viewer)) owners.push(position.viewer);
  if (existing) {
    remaining = remaining.filter((item) => item.id !== existing.id);
    groups = [...existing.groups, ...groups];
  }
  // Matching loose cards and additional disjoint sets cement the house automatically.
  const automatic = collectSums(looseCards(remaining), target);
  const autoIds = new Set(automatic.flat().map((held) => held.id));
  remaining = remaining.filter((item) => item.kind !== "loose" || !autoIds.has(item.groups[0][0].id));
  groups = [...groups, ...automatic];
  const house: FloorItem = { id: `house-${position.revision + 1}-${target}`, kind: "house", value: target, groups, owners };
  const floor = [...remaining, house];
  const error = reservationError(floor, hand, position.viewer);
  return error ? bad(error) : { ok: true, floor, taken: [], message: `${groups.length > 1 ? "Cemented" : "Built"} a ${target}-house.` };
}

export function availableSeepMoves(position: SeepPosition): SeepMove[] {
  if (position.turn !== position.viewer || !(position.phase === "playing" || position.phase === "opening")) return [];
  const moves: SeepMove[] = [];
  const add = (move: SeepMove) => { if (previewSeepMove(position, move).ok) moves.push(move); };
  const loose = looseCards(position.floor);
  for (const card of position.hand) {
    const capture = captureSuggestion(position, card.id);
    add(capture ?? { kind: "drop", cardId: card.id, floorIds: [] });
    for (let target = 9; target <= 13; target++) {
      if (position.phase === "opening" && target !== position.bid) continue;
      const value = seepValue(card);
      const existing = position.floor.find((item) => item.kind === "house" && item.value === target);
      if (value === target && existing) add({ kind: "build", value: target, cardId: card.id, floorIds: [existing.id] });
      const group = findSum(loose, value === target ? target : target - value);
      if (group?.length) {
        const ids = new Set(group.map((held) => held.id));
        add({ kind: "build", value: target, cardId: card.id, floorIds: position.floor.filter((item) => item.kind === "loose" && ids.has(item.groups[0][0].id)).map((item) => item.id) });
      }
      for (const lower of position.floor.filter((item) => item.kind === "house" && item.value + value === target)) {
        add({ kind: "build", value: target, cardId: card.id, floorIds: [lower.id] });
      }
    }
  }
  return moves;
}

function positionFor(state: SeepState, seat: number): SeepPosition {
  return { phase: state.phase, hand: state.players[seat]?.hand ?? [], floor: state.floor, turn: state.turn, viewer: seat, bid: state.bid, revision: state.revision };
}

export function applySeepAction(state: SeepState, seat: number, action: SeepAction): SeepState {
  if (seat !== state.turn || !state.players[seat]) return state;
  if (action.kind === "bid") {
    if (state.phase !== "bid" || !bidValues(state.players[seat].hand).includes(action.value)) return state;
    return { ...state, bid: action.value, phase: "opening", revision: state.revision + 1, message: `${state.players[seat].name} bids ${action.value}. Make the opening move.` };
  }
  const preview = previewSeepMove(positionFor(state, seat), action);
  if (!preview.ok) return state;
  const card = state.players[seat].hand.find((held) => held.id === action.cardId)!;
  const players = state.players.map((player) => ({ ...player, hand: player.hand.filter((held) => player.id !== seat || held.id !== card.id) }));
  const captured: [Card[], Card[]] = [[...state.captured[0]], [...state.captured[1]]];
  const bonuses: [number, number] = [...state.bonuses];
  const sweeps: [number, number] = [...state.sweeps];
  const team = teamOf(seat);
  const movesPlayed = state.movesPlayed + 1;
  const capturedThisTurn = preview.taken.length > 0;
  const lastCapture = capturedThisTurn ? team : state.lastCapture;
  let sweep = 0;
  if (capturedThisTurn) {
    captured[team].push(...preview.taken);
    if (preview.floor.length === 0 && movesPlayed !== 48) {
      sweep = movesPlayed === 1 ? 25 : 50;
      bonuses[team] += sweep;
      sweeps[team] += 1;
    }
  }

  if (state.phase === "opening") {
    let index = 0;
    for (let packet = 0; packet < 3; packet++) {
      for (let offset = 0; offset < 4; offset++) {
        if (packet === 2 && offset === 0) continue;
        const player = (state.bidder - offset + 4) % 4;
        players[player].hand.push(...state.stock.slice(index, index + 4));
        index += 4;
      }
    }
    players.forEach((player) => { player.hand = sortHand(player.hand, null); });
  }

  let next: SeepState = {
    ...state, players, captured, bonuses, sweeps, lastCapture, movesPlayed, floor: preview.floor,
    stock: [], turn: nextSeepPlayer(seat), revision: state.revision + 1, phase: "playing",
    lastMove: { player: seat, card, kind: action.kind, sweep },
    message: `${state.players[seat].name}: ${sweep ? `Seep! +${sweep} points. ` : ""}${preview.message}`,
  };
  if (movesPlayed === 48) {
    const remaining = preview.floor.flatMap(itemCards);
    if (remaining.length) captured[lastCapture ?? team].push(...remaining);
    const cardPoints: [number, number] = [totalPoints(captured[0]), totalPoints(captured[1])];
    const points: [number, number] = [cardPoints[0] + bonuses[0], cardPoints[1] + bonuses[1]];
    const difference = points[0] - points[1];
    const leadAfter = state.lead + difference;
    const winner = difference === 0 ? null : difference > 0 ? 0 : 1;
    const baaziWinner: Team | null = points[0] < 9 ? 1 : points[1] < 9 ? 0 : Math.abs(leadAfter) >= 100 ? leadAfter > 0 ? 0 : 1 : null;
    const baazis: [number, number] = [...state.baazis];
    if (baaziWinner !== null) baazis[baaziWinner] += 1;
    const effectiveLead = baaziWinner !== null && (points[0] < 9 || points[1] < 9) ? (baaziWinner === 0 ? 100 : -100) : leadAfter;
    let dealer = (teamOf(state.dealer) === 0 ? effectiveLead > 0 : effectiveLead < 0) ? nextSeepPlayer(state.dealer) : state.dealer;
    if (baaziWinner !== null) dealer = (dealer + 2) % 4;
    next = {
      ...next, floor: [], dealer, baazis, lead: baaziWinner === null ? leadAfter : 0,
      phase: baaziWinner === null ? "deal-over" : "match-over",
      result: { cardPoints, bonuses, points, difference, leadAfter, winner, baaziWinner,
        reason: points[0] < 9 || points[1] < 9 ? "A team scored fewer than 9 points." : baaziWinner !== null ? "A team reached a 100-point lead." : "Points carry forward to the next deal." },
      message: baaziWinner === null ? "Deal complete." : `Team ${baaziWinner === 0 ? "A" : "B"} wins the baazi!`,
    };
  }
  return next;
}

export function nextSeepDeal(state: SeepState): SeepState {
  if (!(state.phase === "deal-over" || state.phase === "match-over")) return state;
  const next = createSeep(state.players.map((player) => player.name), state.players.map((player) => !player.isBot), state.dealer, undefined, state.seriesTarget);
  return { ...next, handNumber: state.handNumber + 1, revision: state.revision + 1, lead: state.lead, baazis: [...state.baazis], seriesTarget: state.seriesTarget };
}

export function isSeepSeriesDone(state: SeepState): boolean {
  return state.seriesTarget != null && state.baazis.some((baazi) => baazi >= state.seriesTarget!);
}

export function startNewSeepSeriesFrom(state: SeepState): SeepState {
  const next = createSeep(
    state.players.map((player) => player.name),
    state.players.map((player) => !player.isBot),
    state.dealer,
    undefined,
    state.seriesTarget,
  );
  return { ...next, revision: state.revision + 1 };
}

export function seepSnapshot(state: SeepState, viewer: number, connected = [true, true, true, true]): SeepView {
  const { players, stock: _stock, captured, floor, ...publicState } = state;
  return {
    ...publicState, viewer, floor: state.phase === "bid" ? [] : floor,
    players: players.map(({ hand, ...player }) => ({ ...player, handCount: hand.length, connected: player.isBot || connected[player.id] })),
    hand: [...players[viewer].hand],
    capturedCounts: [captured[0].length, captured[1].length],
    points: [totalPoints(captured[0]) + state.bonuses[0], totalPoints(captured[1]) + state.bonuses[1]],
    bids: state.phase === "bid" && viewer === state.bidder ? bidValues(players[viewer].hand) : [],
    seriesDone: isSeepSeriesDone(state),
  };
}

export function seepBotAction(state: SeepState): SeepAction | null {
  const hand = state.players[state.turn].hand;
  if (state.phase === "bid") {
    return { kind: "bid", value: bidValues(hand).sort((a, b) => hand.filter((card) => seepValue(card) === b).length - hand.filter((card) => seepValue(card) === a).length || b - a)[0] };
  }
  const position = positionFor(state, state.turn);
  const moves = availableSeepMoves(position);

  if (getBotDifficulty() === "normal") {
    const captures = moves.filter((move) => move.kind === "capture");
    const chosen = captures.length
      ? [...captures].sort((a, b) => b.floorIds.length - a.floorIds.length)[0]
      : moves[0];
    return chosen ?? null;
  }

  let best: SeepMove | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const result = previewSeepMove(position, move);
    if (!result.ok) continue;
    let score = totalPoints(result.taken) * 5 + result.taken.length;
    if (!result.floor.length && result.taken.length && state.movesPlayed !== 47) score += 200;
    if (move.kind === "build") {
      const house = result.floor.find((item) => item.kind === "house" && item.value === move.value)!;
      score += totalPoints(itemCards(house)) * 2 + (house.groups.length > 1 ? 7 : 3);
    }
    if (move.kind === "drop") score -= seepPoints(hand.find((card) => card.id === move.cardId)!) * 3;
    if (result.floor.length === 1) score -= 4;
    if (score > bestScore) { bestScore = score; best = move; }
  }
  return best;
}

export function replaceSeepPlayerWithBot(state: SeepState, seat: number): SeepState {
  if (!state.players[seat] || state.players[seat].isBot) return state;
  return { ...state, revision: state.revision + 1, players: state.players.map((player) => player.id === seat ? { ...player, isBot: true } : player), message: `${state.players[seat].name} disconnected. A bot is playing their hand.` };
}