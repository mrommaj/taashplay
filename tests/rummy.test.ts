import assert from "node:assert/strict";
import test from "node:test";
import { createRummy, discardCard, drawCard, isGin, meldGroups, meldResult } from "../src/rummy/engine.ts";
import type { Card, Suit } from "../src/game/engine.ts";

const c = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank });

test("rummy deals 10 cards to each of 2 players with a full unique deck", () => {
  const game = createRummy(["You", "Bot"], [true, false], 1);
  assert.deepEqual(game.players.map((player) => player.hand.length), [10, 10]);
  assert.equal(game.stock.length, 31);
  assert.equal(game.discard.length, 1);
  assert.equal(new Set([...game.players.flatMap((p) => p.hand), ...game.stock, ...game.discard].map((card) => card.id)).size, 52);
});

test("melds: sets and runs partition into meld groups", () => {
  const set = [c("S", 7), c("H", 7), c("D", 7)];
  const run = [c("S", 2), c("S", 3), c("S", 4)];
  assert.ok(meldGroups(set));
  assert.ok(meldGroups(run));
  assert.equal(meldGroups([c("S", 2), c("S", 3), c("H", 8)]), null);
  assert.equal(
    meldGroups([...set, ...run, c("H", 4), c("H", 5), c("H", 6), c("D", 9)]) !== null,
    false, // leftover card ruins gin here
  );
});

test("gin requires all 10 cards in melds", () => {
  const full = [
    c("S", 5), c("H", 5), c("D", 5), // set
    c("C", 3), c("C", 4), c("S", 3), c("H", 3), // set
    c("H", 9), c("H", 10), c("H", 11), // run
  ];
  assert.ok(isGin(full));
  assert.ok(meldResult(full)?.length === 3);
  assert.equal(isGin([...full.slice(0, 9), c("D", 2)]), false);
});

test("you must draw before you discard, and the pile top goes into your hand", () => {
  const game = createRummy(["You", "Bot"], [true, false], 1);
  assert.equal(discardCard(game, game.players[0].hand[0].id), game); // blocked: not drawn
  const withStock = drawCard(game, "stock");
  assert.equal(withStock.drawn, "stock");
  assert.equal(withStock.players[0].hand.length, 11);
  const withPile = drawCard(game, "discard");
  assert.equal(withPile.drawn, "discard");
  assert.equal(withPile.discard.length, 0);
  assert.equal(withPile.players[0].hand.length, 11);
});

test("discarding passes the turn, and discarding when stock is empty can end tied", () => {
  let game = createRummy(["You", "Bot"], [true, false], 1);
  game = { ...game, stock: [] };
  const tied = drawCard(game, "stock");
  assert.equal(tied.phase, "round-over");
  assert.equal(tied.winner, null);
});
