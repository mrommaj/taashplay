import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseTrump, createGame, dealNewHand, isSeriesComplete, makeDeck, qualifiesToChooseTrump,
  startNewSeriesFrom,
  type Card, type Suit,
} from "../src/game/engine.ts";

const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank });
const lowFive = [card("H", 2), card("D", 4), card("C", 6), card("S", 8), card("H", 10)];
const highFive = [card("H", 11), ...lowFive.slice(1)];

function deckForChooser(hand: Card[]): Card[] {
  const rest = makeDeck().filter((held) => !hand.some((chosen) => chosen.id === held.id));
  let index = 0;
  return Array.from({ length: 52 }, (_, position) => position < 20 && position % 4 === 0
    ? hand[position / 4] : rest[index++]);
}

const game = () => createGame(["You", "Arjun", "Meera", "Vikram"], [true, false, false, false]);

test("Rang series: reaching the target completes the series and a new series resets", () => {
  const seriesGame = createGame(["You", "Arjun", "Meera", "Vikram"], [true, false, false, false], 5);
  assert.equal(seriesGame.seriesTarget, 5);
  assert.equal(isSeriesComplete({ ...seriesGame, scores: [2, 4] }), false);
  assert.equal(isSeriesComplete({ ...seriesGame, scores: [3, 5] }), true);
  assert.equal(isSeriesComplete({ ...seriesGame, scores: [5, 0] }), true);
  const quick = game();
  assert.equal(isSeriesComplete({ ...quick, scores: [99, 0] }), false);

  const renewed = startNewSeriesFrom({ ...seriesGame, scores: [3, 5], handNumber: 9 });
  assert.deepEqual(renewed.scores, [0, 0]);
  assert.deepEqual(renewed.tricksWon, [0, 0]);
  assert.equal(renewed.seriesTarget, 5);
  assert.equal(renewed.handNumber, 1);
  assert.equal(renewed.phase, "choose-trump");
  assert.deepEqual(renewed.players.map((p) => p.name), ["You", "Arjun", "Meera", "Vikram"]);
});

test("a 10 is not enough; J, Q, K, and Ace each qualify", () => {
  assert.equal(qualifiesToChooseTrump(lowFive), false);
  assert.equal(qualifiesToChooseTrump([card("H", 10), card("D", 10), card("C", 10), card("S", 10), card("H", 9)]), false);
  for (const rank of [11, 12, 13, 14]) {
    assert.equal(qualifiesToChooseTrump([card("S", rank), ...lowFive.slice(1)]), true);
  }
});

test("low opening deals are discarded completely without advancing the score or hand", () => {
  const before = { ...game(), dealer: 2, handNumber: 4, scores: [2, 1] as [number, number] };
  const low = deckForChooser(lowFive);
  const high = deckForChooser(highFive);
  let deals = 0;
  const next = dealNewHand(before, () => ++deals <= 2 ? low : high);
  assert.equal(deals, 3);
  assert.equal(next.redealCount, 2);
  assert.equal(next.handNumber, 5);
  assert.equal(next.dealer, before.dealer);
  assert.equal(next.chooser, 3);
  assert.deepEqual(next.scores, [2, 1]);
  assert.deepEqual(next.players[3].hand, highFive);
  assert.deepEqual(next.pendingDeck, high.slice(20));
  assert.ok(next.players.every((player) => player.hand.length === 5));
  const cards = [...next.players.flatMap((player) => player.hand), ...next.pendingDeck];
  assert.equal(cards.length, 52);
  assert.equal(new Set(cards.map((held) => held.id)).size, 52);
  assert.equal(before.handNumber, 4);
});

test("the actual chooser qualifies at every dealer position, human or bot", () => {
  for (let dealer = 0; dealer < 4; dealer++) {
    let calls = 0;
    const next = dealNewHand({ ...game(), dealer }, () => ++calls === 1 ? deckForChooser(lowFive) : deckForChooser(highFive));
    assert.equal(next.chooser, (dealer + 1) % 4);
    assert.equal(qualifiesToChooseTrump(next.players[next.chooser].hand), true);
    assert.equal(next.redealCount, 1);
  }
});

test("an already qualified hand is accepted without a redeal", () => {
  let deals = 0;
  const next = dealNewHand(game(), () => { deals += 1; return deckForChooser(highFive); });
  assert.equal(deals, 1);
  assert.equal(next.redealCount, 0);
});

test("after choosing trump all 52 cards remain unique and everyone has 13", () => {
  const opening = dealNewHand(game(), () => deckForChooser(highFive));
  const full = chooseTrump(opening, "H");
  assert.equal(full.phase, "playing");
  assert.deepEqual(full.players.map((player) => player.hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(full.players.flatMap((player) => player.hand.map((held) => held.id))).size, 52);
  assert.equal(full.pendingDeck.length, 0);
  assert.equal(chooseTrump(full, "S"), full);
});

test("an invalid opening or suit cannot bypass trump validation", () => {
  const opening = dealNewHand(game(), () => deckForChooser(highFive));
  const invalid = { ...opening, players: opening.players.map((player) => player.id === opening.chooser ? { ...player, hand: lowFive } : player) };
  assert.equal(chooseTrump(invalid, "H"), invalid);
  assert.equal(chooseTrump(opening, "invalid" as Suit), opening);
});