import assert from "node:assert/strict";
import test from "node:test";
import { makeDeck, type Card, type Suit } from "../src/game/engine.ts";
import { collectSums, findSum, partitionCards } from "../src/seep/cards.ts";
import {
  applySeepAction, availableSeepMoves, bidValues, captureSuggestion, createSeep, isSeepSeriesDone, itemCards,
  nextSeepDeal, previewSeepMove, seepBotAction, seepPoints, seepSnapshot, seepValue, startNewSeepSeriesFrom, totalPoints,
  type FloorItem, type SeepPosition, type SeepState,
} from "../src/seep/engine.ts";

const c = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank });
const loose = (card: Card): FloorItem => ({ id: `loose-${card.id}`, kind: "loose", value: seepValue(card), groups: [[card]], owners: [] });
const house = (value: number, owner: number, groups: Card[][]): FloorItem => ({ id: `house-${value}`, kind: "house", value, owners: [owner], groups });
const pos = (hand: Card[], floor: FloorItem[], more: Partial<SeepPosition> = {}): SeepPosition => ({ hand, floor, viewer: 0, turn: 0, phase: "playing", bid: 9, revision: 1, ...more });
const deckWith = (first: Card[]) => [...first, ...makeDeck().filter((card) => !first.some((held) => held.id === card.id))];
const startingDeck = () => deckWith([c("S", 9), c("H", 10), c("C", 4), c("D", 3), c("H", 5), c("S", 4), c("H", 9), c("D", 10)]);
const fresh = () => createSeep(["One", "Two", "Three", "Four"], [true, false, false, false], 1, startingDeck());
const allCards = (game: SeepState) => [...game.players.flatMap((player) => player.hand), ...game.floor.flatMap(itemCards), ...game.stock, ...game.captured.flat()];

test("capture values and card scores total exactly 100", () => {
  assert.equal(seepValue(c("H", 14)), 1);
  assert.equal(seepValue(c("C", 11)), 11);
  assert.equal(seepPoints(c("S", 13)), 13);
  assert.equal(seepPoints(c("D", 10)), 6);
  assert.equal(seepPoints(c("H", 14)), 1);
  assert.equal(seepPoints(c("H", 10)), 0);
  assert.equal(totalPoints(makeDeck()), 100);
});

test("bid is based on four cards while the floor and other hands stay private", () => {
  const game = fresh();
  assert.equal(game.bidder, 0);
  assert.deepEqual(game.players.map((player) => player.hand.length), [4, 0, 0, 0]);
  assert.deepEqual(bidValues(game.players[0].hand), [9, 10]);
  assert.deepEqual(seepSnapshot(game, 0).floor, []);
  assert.deepEqual(seepSnapshot(game, 1).hand, []);
  assert.equal("stock" in seepSnapshot(game, 0), false);
  assert.equal("captured" in seepSnapshot(game, 0), false);
  assert.ok(seepSnapshot(game, 0).players.every((player) => !("hand" in player)));
  assert.equal(applySeepAction(game, 0, { kind: "bid", value: 13 }), game);
  assert.equal(applySeepAction(game, 1, { kind: "bid", value: 9 }), game);
});

test("opening uses the bid and the remaining deal creates 11/12/12/12 cards", () => {
  let game = applySeepAction(fresh(), 0, { kind: "bid", value: 9 });
  assert.equal(game.phase, "opening");
  assert.equal(seepSnapshot(game, 1).floor.length, 4);
  assert.equal(applySeepAction(game, 0, { kind: "drop", cardId: "H10", floorIds: [] }), game);
  const action = captureSuggestion(seepSnapshot(game, 0), "S9")!;
  game = applySeepAction(game, 0, action);
  assert.equal(game.phase, "playing");
  assert.equal(game.turn, 3);
  assert.deepEqual(game.players.map((player) => player.hand.length), [11, 12, 12, 12]);
  assert.equal(game.stock.length, 0);
  assert.equal(allCards(game).length, 52);
  assert.equal(new Set(allCards(game).map((card) => card.id)).size, 52);
});

test("loose captures can use several separate sums", () => {
  const cards = [c("C", 14), c("H", 7), c("C", 3), c("S", 5), c("D", 8)];
  assert.ok(partitionCards(cards, 8));
  const position = pos([c("H", 8)], cards.map(loose));
  const result = previewSeepMove(position, { kind: "capture", cardId: "H8", floorIds: position.floor.map((item) => item.id) });
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.taken.length, 6); assert.equal(result.floor.length, 0); }
});

test("overlapping capture sets cannot reuse a floor card", () => {
  const position = pos([c("C", 11)], [c("S", 2), c("D", 3), c("H", 5), c("H", 6)].map(loose));
  assert.equal(previewSeepMove(position, { kind: "capture", cardId: "C11", floorIds: position.floor.map((item) => item.id) }).ok, false);
  assert.equal(previewSeepMove(position, { kind: "capture", cardId: "C11", floorIds: ["loose-S2", "loose-D3", "loose-H6"] }).ok, true);
  assert.equal(previewSeepMove(position, { kind: "capture", cardId: "C11", floorIds: ["loose-H5", "loose-H6"] }).ok, true);
});

test("a capture must include every remaining disjoint match", () => {
  const position = pos([c("C", 11)], [c("D", 11), c("S", 2), c("H", 9)].map(loose));
  assert.equal(previewSeepMove(position, { kind: "capture", cardId: "C11", floorIds: ["loose-D11"] }).ok, false);
  assert.equal(previewSeepMove(position, { kind: "drop", cardId: "C11", floorIds: [] }).ok, false);
  assert.equal(previewSeepMove(position, captureSuggestion(position, "C11")!).ok, true);
});

test("houses require exact-value captures and cannot contribute to a larger sum", () => {
  const nine = house(9, 1, [[c("H", 5), c("C", 4)]]);
  const position = pos([c("D", 12), c("D", 9)], [nine, loose(c("H", 3))]);
  assert.equal(previewSeepMove(position, { kind: "capture", cardId: "D12", floorIds: [nine.id, "loose-H3"] }).ok, false);
  assert.equal(previewSeepMove(position, { kind: "capture", cardId: "D9", floorIds: [nine.id] }).ok, true);
});

test("a house needs a retained matching card and auto-cements equal sets", () => {
  const floor = [c("H", 5), c("D", 9), c("C", 3), c("S", 6)].map(loose);
  const action = { kind: "build" as const, cardId: "C4", floorIds: ["loose-H5"], value: 9 };
  assert.equal(previewSeepMove(pos([c("C", 4)], floor), action).ok, false);
  const result = previewSeepMove(pos([c("C", 4), c("H", 9)], floor), action);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.floor.length, 1);
    assert.equal(result.floor[0].groups.length, 3);
    assert.deepEqual(result.floor[0].owners, [0]);
    assert.ok(result.floor[0].groups.every((group) => group.reduce((sum, card) => sum + seepValue(card), 0) === 9));
  }
});

test("an ordinary house can be raised only with the hand card, and not by its owner", () => {
  const nine = house(9, 1, [[c("H", 5), c("C", 4)]]);
  const position = pos([c("D", 2), c("C", 11)], [nine]);
  const action = { kind: "build" as const, cardId: "D2", floorIds: [nine.id], value: 11 };
  const result = previewSeepMove(position, action);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.floor[0].owners, [0]);
  assert.equal(previewSeepMove(pos(position.hand, [{ ...nine, owners: [0] }]), action).ok, false);
  const illegal = pos([c("D", 14), c("C", 12)], [nine, loose(c("H", 2))]);
  assert.equal(previewSeepMove(illegal, { kind: "build", cardId: "D14", floorIds: [nine.id, "loose-H2"], value: 12 }).ok, false);
});

test("cemented houses cannot be raised", () => {
  const nine = house(9, 1, [[c("H", 5), c("C", 4)], [c("H", 9)]]);
  assert.equal(previewSeepMove(pos([c("D", 2), c("C", 11)], [nine]), { kind: "build", cardId: "D2", floorIds: [nine.id], value: 11 }).ok, false);
});

test("cementing a partner's house needs no retained card; an opponent's does", () => {
  const ten = house(10, 2, [[c("H", 6), c("S", 4)]]);
  const action = { kind: "build" as const, cardId: "D10", floorIds: [ten.id], value: 10 };
  const result = previewSeepMove(pos([c("D", 10)], [ten]), action);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.floor[0].owners, [2]);
  assert.equal(previewSeepMove(pos([c("D", 10)], [{ ...ten, owners: [1] }]), action).ok, false);
  const opponent = previewSeepMove(pos([c("D", 10), c("C", 10)], [{ ...ten, owners: [1] }]), action);
  if (opponent.ok) assert.deepEqual(opponent.floor[0].owners, [1, 0]);
  else assert.fail(opponent.error);
});

test("owners cannot spend their last reserved card on another house", () => {
  const eleven = house(11, 0, [[c("S", 6), c("H", 5)]]);
  const position = pos([c("C", 11), c("C", 13)], [eleven, loose(c("D", 2))]);
  assert.equal(previewSeepMove(position, { kind: "build", cardId: "C11", floorIds: ["loose-D2"], value: 13 }).ok, false);
});

test("opening sweep awards 25 rather than 50", () => {
  const deck = deckWith([c("S", 9), c("H", 2), c("D", 3), c("C", 4), c("C", 9), c("D", 4), c("S", 5), c("H", 9)]);
  let game = createSeep(["A", "B", "C", "D"], [true, false, false, false], 1, deck);
  game = applySeepAction(game, 0, { kind: "bid", value: 9 });
  game = applySeepAction(game, 0, captureSuggestion(seepSnapshot(game, 0), "S9")!);
  assert.equal(game.bonuses[0], 25);
  assert.equal(game.sweeps[0], 1);
  assert.equal(game.floor.length, 0);
});

test("the final capture awards no sweep and the score accounts for all 100 card points", () => {
  const base = fresh();
  const rest = makeDeck().filter((card) => !["H2", "C2"].includes(card.id));
  const game: SeepState = {
    ...base, phase: "playing", bid: 9, stock: [], movesPlayed: 47, turn: 1, floor: [loose(c("C", 2))],
    players: base.players.map((player) => ({ ...player, hand: player.id === 1 ? [c("H", 2)] : [] })),
    captured: [rest.filter((_, i) => i % 2 === 0), rest.filter((_, i) => i % 2 === 1)],
    lastCapture: 0,
  };
  const result = applySeepAction(game, 1, { kind: "capture", cardId: "H2", floorIds: ["loose-C2"] });
  assert.ok(result.result);
  assert.equal(result.bonuses[1], 0);
  assert.equal(result.result.cardPoints[0] + result.result.cardPoints[1], 100);
  assert.equal(result.captured.flat().length, 52);
  assert.equal(applySeepAction(result, 1, { kind: "drop", cardId: "H2", floorIds: [] }), result);
});

test("normal sweeps award 50 and final leftovers go to the last capturing team", () => {
  const base = fresh();
  const normal: SeepState = { ...base, phase: "playing", movesPlayed: 12, stock: [], turn: 0,
    players: base.players.map((player) => ({ ...player, hand: player.id === 0 ? [c("H", 2)] : [] })), floor: [loose(c("C", 2))] };
  const swept = applySeepAction(normal, 0, { kind: "capture", cardId: "H2", floorIds: ["loose-C2"] });
  assert.equal(swept.bonuses[0], 50);
  const end: SeepState = { ...normal, movesPlayed: 47, floor: [loose(c("D", 3))], lastCapture: 1 };
  const finished = applySeepAction(end, 0, { kind: "drop", cardId: "H2", floorIds: [] });
  assert.deepEqual(new Set(finished.captured[1].map((card) => card.id)), new Set(["D3", "H2"]));
});

test("Seep series: baazis accumulate until the target resets for a new series", () => {
  const seriesGame = createSeep(["A", "B", "C", "D"], [true, false, false, false], 1, undefined, 2);
  assert.equal(seriesGame.seriesTarget, 2);
  const oneBaazi = { ...seriesGame, baazis: [1, 0] as [number, number] };
  assert.equal(isSeepSeriesDone(oneBaazi), false);
  const twoBaazis = { ...seriesGame, baazis: [2, 0] as [number, number] };
  assert.equal(isSeepSeriesDone(twoBaazis), true);
  const seepView = seepSnapshot(twoBaazis, 3);
  assert.equal(seepView.seriesDone, true);
  const renewed = startNewSeepSeriesFrom(twoBaazis);
  assert.deepEqual(renewed.baazis, [0, 0]);
  assert.equal(renewed.seriesTarget, 2);
  assert.equal(renewed.phase, "bid");
  assert.deepEqual(renewed.players.map((p) => p.name), ["A", "B", "C", "D"]);
  const next = nextSeepDeal({ ...seriesGame, phase: "deal-over", handNumber: 2 });
  assert.equal(next.seriesTarget, 2);
  assert.deepEqual(next.baazis, [0, 0]);
});

test("sum helpers do not duplicate cards", () => {
  const cards = [c("H", 2), c("D", 2), c("S", 3), c("C", 4)];
  assert.equal(findSum(cards, 13), null);
  const groups = collectSums(cards, 4);
  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.flat().map((card) => card.id)).size, groups.flat().length);
});

test("seeded complete bot deals preserve cards, enforce house reserves, and always finish", () => {
  for (let seed = 1; seed <= 6; seed++) {
    let randomState = seed;
    const random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
    const deck = makeDeck();
    for (let i = 51; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    if (!bidValues(deck.slice(0, 4)).length) {
      const high = deck.findIndex((card) => seepValue(card) >= 9); [deck[0], deck[high]] = [deck[high], deck[0]];
    }
    let game = createSeep(["A", "B", "C", "D"], [false, false, false, false], 1, deck);
    let steps = 0;
    while ((game.phase === "bid" || game.phase === "opening" || game.phase === "playing") && steps++ < 60) {
      const move = seepBotAction(game);
      assert.ok(move);
      const next = applySeepAction(game, game.turn, move);
      assert.notEqual(next, game);
      game = next;
      assert.equal(allCards(game).length, 52);
      assert.equal(new Set(allCards(game).map((card) => card.id)).size, 52);
      const houses = game.floor.filter((item) => item.kind === "house");
      assert.equal(new Set(houses.map((item) => item.value)).size, houses.length);
      for (const item of houses) {
        assert.ok(item.groups.every((group) => group.reduce((sum, card) => sum + seepValue(card), 0) === item.value));
        assert.ok(item.owners.every((owner) => game.players[owner].hand.some((card) => seepValue(card) === item.value)));
      }
    }
    assert.equal(game.movesPlayed, 48);
    assert.ok(game.result);
    assert.equal(game.result.cardPoints[0] + game.result.cardPoints[1], 100);
    const next = nextSeepDeal(game);
    assert.equal(next.handNumber, 2);
    assert.equal(next.phase, "bid");
    assert.equal(next.lead, game.lead);
    assert.ok(availableSeepMoves(seepSnapshot(next, next.turn)).length === 0);
  }
});