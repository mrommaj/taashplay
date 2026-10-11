import assert from "node:assert/strict";
import test from "node:test";
import { makeDeck, type Card, type Suit } from "../src/game/engine.ts";
import {
  bhabhiLegalCards, bhabhiSnapshot, chooseBhabhiBotCard, createBhabhi,
  playBhabhi, resolveBhabhi, setBhabhiBot, type BhabhiState,
} from "../src/bhabhi/engine.ts";

const card = (suit: Suit, rank: number): Card => ({ id: `${suit}${rank}`, suit, rank });
const fresh = () => createBhabhi(["One", "Two", "Three", "Four"], [true, false, false, false], 1, makeDeck());

function fixture(hands: Card[][], discard: Card[] = []): BhabhiState {
  const base = fresh();
  const players = base.players.map((player, id) => ({ ...player, hand: hands[id], out: hands[id].length === 0 }));
  const active = players.filter((player) => !player.out).map((player) => player.id);
  return { ...base, players, turn: active[0], trickNumber: 2, forcedLeadId: null, trickSeats: active, finished: players.filter((player) => player.out).map((player) => player.id), discard };
}

test("Bhabhi deals 52 unique cards equally and the Ace of Spades opens", () => {
  const game = fresh();
  assert.deepEqual(game.players.map((player) => player.hand.length), [13, 13, 13, 13]);
  assert.equal(new Set(game.players.flatMap((player) => player.hand.map((held) => held.id))).size, 52);
  assert.deepEqual(bhabhiLegalCards(game).map((held) => held.id), ["S14"]);
  assert.equal("trump" in game, false);
  assert.equal("team" in game.players[0], false);
});

test("the opening Ace is forced and out-of-turn or unknown cards are rejected", () => {
  const game = fresh();
  assert.equal(playBhabhi(game, game.turn, "S2"), game);
  assert.equal(playBhabhi(game, (game.turn + 1) % 4, "S14"), game);
  assert.equal(playBhabhi(game, game.turn, "fake"), game);
});

test("a player must follow suit when possible", () => {
  let game = fixture([[card("H", 3)], [card("H", 4), card("S", 2)], [card("H", 14)], [card("H", 5)]]);
  game = playBhabhi(game, 0, "H3");
  assert.deepEqual(bhabhiLegalCards(game).map((held) => held.id), ["H4"]);
  assert.equal(playBhabhi(game, 1, "S2"), game);
});

test("the first trick always discards and never stops early for thulla", () => {
  let game: BhabhiState = { ...fixture([[card("S", 14), card("H", 2)], [card("H", 9)], [card("S", 4)], [card("S", 5)]]), trickNumber: 1, forcedLeadId: "S14" };
  game = playBhabhi(game, 0, "S14");
  game = playBhabhi(game, 1, "H9");
  assert.equal(game.phase, "playing");
  assert.equal(game.turn, 2);
  game = playBhabhi(playBhabhi(game, 2, "S4"), 3, "S5");
  assert.equal(game.result?.kind, "discard");
  const result = resolveBhabhi(game);
  assert.equal(result.discard.length, 4);
  assert.equal(result.players[0].pickups, 0);
});

test("thulla immediately stops play and the highest led card picks up, not the off-suit ace", () => {
  let game = fixture([[card("H", 4), card("C", 2)], [card("H", 9), card("C", 3)], [card("S", 14), card("D", 3)], [card("H", 10)]]);
  game = playBhabhi(game, 0, "H4");
  game = playBhabhi(game, 1, "H9");
  game = playBhabhi(game, 2, "S14");
  assert.equal(game.phase, "trick-end");
  assert.deepEqual(game.result, { kind: "pickup", player: 1, count: 3 });
  assert.equal(playBhabhi(game, 3, "H10"), game);
  const resolved = resolveBhabhi(game);
  assert.equal(resolved.players[1].hand.length, 4);
  assert.equal(resolved.players[1].pickups, 1);
  assert.equal(resolved.turn, 1);
  assert.equal(resolved.players[3].hand.length, 1);
  assert.equal(resolved.discard.length, 0);
});

test("playing the last high card does not escape a pending pickup", () => {
  let game = fixture([[card("H", 14)], [card("S", 2), card("C", 3)], [card("H", 3)], [card("H", 5)]]);
  game = playBhabhi(playBhabhi(game, 0, "H14"), 1, "S2");
  const resolved = resolveBhabhi(game);
  assert.equal(resolved.players[0].out, false);
  assert.deepEqual(new Set(resolved.players[0].hand.map((held) => held.id)), new Set(["H14", "S2"]));
});

test("an empty high-card leader draws from OLD discards and must lead the drawn card", () => {
  let game = fixture([[card("H", 14)], [card("H", 3), card("S", 7)], [card("H", 5), card("C", 4)], []], [card("C", 2)]);
  game = playBhabhi(playBhabhi(playBhabhi(game, 0, "H14"), 1, "H3"), 2, "H5");
  const resolved = resolveBhabhi(game, () => 0);
  assert.equal(resolved.players[0].out, false);
  assert.equal(resolved.forcedLeadId, "C2");
  assert.deepEqual(bhabhiLegalCards(resolved).map((held) => held.id), ["C2"]);
  assert.deepEqual(resolved.discard.map((held) => held.id), ["H14", "H3", "H5"]);
});

test("a final lower card gets away and the other player loses", () => {
  let game = fixture([[card("H", 14), card("C", 8)], [card("H", 3)], [], []]);
  game = playBhabhi(playBhabhi(game, 0, "H14"), 1, "H3");
  const resolved = resolveBhabhi(game);
  assert.equal(resolved.phase, "game-over");
  assert.equal(resolved.loser, 0);
  assert.equal(resolved.players[1].out, true);
  assert.deepEqual(bhabhiLegalCards(resolved), []);
});

test("if both remaining players play their final same-suit card, the higher player loses", () => {
  let game = fixture([[card("H", 4)], [card("H", 14)], [], []], [card("C", 2)]);
  game = playBhabhi(playBhabhi(game, 0, "H4"), 1, "H14");
  const resolved = resolveBhabhi(game, () => 0);
  assert.equal(resolved.loser, 1);
  assert.equal(resolved.players[0].out, true);
  assert.equal(resolved.players[1].hand[0].id, "C2");
  assert.equal(resolveBhabhi(resolved), resolved);
});

test("snapshots contain only the viewing player's hand", () => {
  const game = fresh();
  const view = bhabhiSnapshot(game, 2);
  assert.deepEqual(view.hand, game.players[2].hand);
  assert.equal(view.players.every((player) => !("hand" in player)), true);
  assert.equal("discard" in view, false);
  assert.equal("knowledge" in view, false);
  assert.equal(view.forcedLeadId, game.turn === 2 ? "S14" : null);
  assert.deepEqual(view.legalIds, []);
});

test("a disconnected human becomes a bot without changing cards or turn", () => {
  const game = fresh();
  const result = setBhabhiBot(game, 0);
  assert.equal(result.players[0].isBot, true);
  assert.deepEqual(result.players[0].hand, game.players[0].hand);
  assert.equal(result.turn, game.turn);
  assert.equal(result.revision, game.revision + 1);
});

test("same-suit cards never cause a thulla", () => {
  let game = fixture([[card("H", 2), card("C", 3)], [card("H", 4), card("C", 5)], [card("H", 6), card("C", 7)], [card("H", 8), card("C", 9)]]);
  for (const [seat, id] of [[0, "H2"], [1, "H4"], [2, "H6"], [3, "H8"]] as const) game = playBhabhi(game, seat, id);
  assert.equal(game.result?.kind, "discard");
  const next = resolveBhabhi(game);
  assert.equal(next.discard.length, 4);
  assert.ok(next.players.every((player) => player.pickups === 0));
});

test("bots remember a thulla and avoid leading the trapped suit when alternatives exist", () => {
  let game = fixture([[card("H", 2), card("C", 3), card("C", 8)], [card("S", 14), card("C", 6)], [card("H", 6), card("C", 9)], [card("H", 8), card("C", 10)]]);
  const before = game;
  game = playBhabhi(game, 0, "H2");
  game = playBhabhi(game, 1, "S14");
  assert.deepEqual(game.knowledge.voids[1], ["H"]);
  assert.deepEqual(before.knowledge.voids[1], []);
  game = resolveBhabhi(game);
  assert.equal(game.turn, 0);
  assert.equal(game.lastTrick?.highestCardId, "H2");
  const next = chooseBhabhiBotCard(game)!;
  assert.notEqual(next.suit, "H");
  assert.notEqual(next.id, "H2");
  assert.ok(bhabhiLegalCards(game).some((held) => held.id === next.id));
});

test("pickup clears a previously known void when the player gains that suit", () => {
  let game = fixture([[card("H", 14), card("C", 3)], [card("S", 2), card("C", 4)], [card("H", 4)], [card("H", 5)]]);
  game = { ...game, knowledge: { ...game.knowledge, voids: [["S"], [], [], []] } };
  game = playBhabhi(playBhabhi(game, 0, "H14"), 1, "S2");
  game = resolveBhabhi(game);
  assert.equal(game.knowledge.voids[0].includes("S"), false);
  assert.deepEqual(new Set(game.knowledge.held[0].map((held) => held.id)), new Set(["H14", "S2"]));
  game = playBhabhi(game, 0, "S2");
  assert.equal(game.knowledge.held[0].some((held) => held.id === "S2"), false);
});

test("bot decisions do not inspect opponents' hidden cards", () => {
  const game = fixture([[card("H", 2), card("C", 3), card("S", 14)], [card("C", 8), card("D", 6)], [card("H", 9), card("D", 8)], [card("C", 9), card("H", 7)]]);
  const altered: BhabhiState = {
    ...game,
    players: game.players.map((player) => player.id === 0 ? player : { ...player, hand: player.hand.map((held) => ({ ...held, rank: 14, id: `${held.suit}14` })) }),
  };
  assert.equal(chooseBhabhiBotCard(game)?.id, chooseBhabhiBotCard(altered)?.id);
});

test("bots must follow suit even when a thulla would be preferable", () => {
  let game = fixture([[card("H", 2)], [card("H", 9), card("S", 14)], [card("C", 4)], [card("H", 8)]]);
  game = playBhabhi(game, 0, "H2");
  assert.equal(chooseBhabhiBotCard(game)?.id, "H9");
});

test("bots still play when every legal option risks another pickup", () => {
  const game = fixture([[card("H", 2), card("H", 6)], [card("S", 3)], [card("C", 4)], [card("D", 5)]]);
  game.knowledge.voids = [[], ["H"], ["H"], ["H"]];
  game.lastTrick = { kind: "pickup", player: 0, count: 2, suit: "H", highestCardId: "H2" };
  const next = chooseBhabhiBotCard(game);
  assert.ok(next);
  assert.ok(bhabhiLegalCards(game).some((held) => held.id === next.id));
});

test("a hidden waste-pile draw clears inferences rather than exposing the drawn suit", () => {
  let game = fixture([[card("H", 14)], [card("H", 3), card("D", 7)], [card("H", 5), card("C", 4)], []], [card("S", 2), card("D", 2)]);
  game.knowledge.voids[0] = ["S", "D"];
  game.knowledge.discarded = [card("S", 2), card("D", 2)];
  game = playBhabhi(playBhabhi(playBhabhi(game, 0, "H14"), 1, "H3"), 2, "H5");
  game = resolveBhabhi(game, () => 0);
  assert.deepEqual(game.knowledge.voids[0], []);
  assert.deepEqual(game.knowledge.held[0], []);
  assert.equal(game.knowledge.discarded.some((held) => held.suit === "S" || held.suit === "D"), false);
  assert.equal(bhabhiSnapshot(game, 1).forcedLeadId, null);
});

test("Bhabhi deals evenly to 3–6 players and keeps every constraint", () => {
  const expected: [number, number[]][] = [
    [3, [18, 17, 17]],
    [4, [13, 13, 13, 13]],
    [5, [11, 11, 10, 10, 10]],
    [6, [9, 9, 9, 9, 8, 8]],
  ];
  for (const [count, sizes] of expected) {
    const names = Array.from({ length: count }, (_, i) => `P${i + 1}`);
    const game = createBhabhi(names, names.map(() => false), 1, makeDeck());
    assert.deepEqual(game.players.map((player) => player.hand.length), sizes);
    assert.equal(game.knowledge.voids.length, count);
    assert.equal(game.knowledge.held.length, count);
    assert.equal(new Set(game.players.flatMap((player) => player.hand.map((held) => held.id))).size, 52);
    assert.equal(game.trickSeats.length, count);
    assert.ok(game.turn >= 0 && game.turn < count);
  }
  assert.throws(() => createBhabhi(["A", "B"], [true, false]));
  assert.throws(() => createBhabhi(Array.from({ length: 7 }, (_, i) => `P${i}`), Array(7).fill(false)));
});

test("Pagat endgame: your last card as a thulla makes the other player the loser immediately", () => {
  // Leader (A) has 2 cards; the other player (B) has 1 card that cannot follow.
  let game = fixture([[card("H", 14), card("C", 2)], [card("S", 2)], [], []]);
  game = playBhabhi(game, 0, "H14");
  game = playBhabhi(game, 1, "S2"); // B's last card, off-suit => thulla
  const resolved = resolveBhabhi(game);
  assert.equal(resolved.phase, "game-over");
  assert.equal(resolved.loser, 0); // A still holds cards and loses immediately
  assert.equal(resolved.players[1].out, true); // B got away
  assert.equal(resolved.players[0].hand.length, 3); // C2, H14 (back), S2 taken
});

test("Pagat endgame: if both play their last same-suit card, the lower player got away", () => {
  let game = fixture([[card("H", 3)], [card("H", 9)], [], []]);
  game = playBhabhi(playBhabhi(game, 0, "H3"), 1, "H9");
  const resolved = resolveBhabhi(game);
  assert.equal(resolved.loser, 1); // B played the higher card and now has to lead with nothing
  assert.equal(resolved.players[0].out, true);
});

test("Bhabhi series: losses accumulate until the target ends the series", () => {
  let seriesGame = fixture([[card("H", 3), card("C", 5)], [card("S", 4), card("C", 6)], [], []]);
  seriesGame = { ...seriesGame, series: { target: 2, losses: [0, 0, 0, 0] } };
  seriesGame = playBhabhi(playBhabhi(seriesGame, 0, "H3"), 1, "S4");
  let resolved = resolveBhabhi(seriesGame);
  assert.equal(resolved.players[1].out, true);
  assert.equal(resolved.loser, 0); // A still holds C5 and is the Bhabhi of this round
  assert.equal(resolved.series?.losses[0], 1);
  assert.equal(isSeriesDone(resolved), false);

  // Second round loss: the same player is safe again -> opponent collects another Bhabhi... finish series.
  seriesGame = { ...resolved, series: { target: 2, losses: [1, 0, 0, 0] } };
  assert.equal(isSeriesDone(seriesGame), false);
  seriesGame = { ...seriesGame, series: { target: 2, losses: [2, 0, 0, 0] } };
  assert.equal(isSeriesDone(seriesGame), true);
  assert.equal(bhabhiSnapshot(seriesGame, 1).seriesDone, true);
  assert.equal(bhabhiSnapshot(resolved, 1).seriesDone, false);
});

test("a rematch keeps previous losses only for continuing series", () => {
  const names = ["A", "B", "C", "D"];
  const created = createBhabhi(names, names.map(() => false), 3, makeDeck(), 3, [1, 0, 2, 0]);
  assert.deepEqual(created.series?.losses, [1, 0, 2, 0]);
  assert.equal(created.round, 3);
  assert.equal(created.series?.target, 3);
  const roundOnly = createBhabhi(names, names.map(() => false), 2, makeDeck(), null, [1, 0, 0, 0]);
  assert.equal(roundOnly.series, null);
});

test("six-player bot game preserves all 52 cards and finishes", () => {
  let seed = 11;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let game = createBhabhi(["A", "B", "C", "D", "E", "F"], Array(6).fill(false), 1, deck);
  let steps = 0;
  while (game.phase !== "game-over" && steps++ < 10000) {
    if (game.phase === "trick-end") game = resolveBhabhi(game, random);
    else {
      const chosen = chooseBhabhiBotCard(game);
      assert.ok(chosen);
      game = playBhabhi(game, game.turn, chosen.id);
    }
    const ids = [...game.players.flatMap((player) => player.hand), ...game.discard, ...game.trick.map((play) => play.card)].map((held) => held.id);
    assert.equal(ids.length, 52);
    assert.equal(new Set(ids).size, 52);
  }
  assert.equal(game.phase, "game-over");
  assert.equal(game.players.filter((player) => !player.out).length, 1);
});

test("bot games preserve every card and end with exactly one loser", () => {
  for (let round = 1; round <= 8; round++) {
    let seed = round;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const deck = makeDeck();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    let game = createBhabhi(["A", "B", "C", "D"], [false, false, false, false], round, deck);
    let steps = 0;
    while (game.phase !== "game-over" && steps++ < 10000) {
      if (game.phase === "trick-end") game = resolveBhabhi(game, random);
      else {
        const chosen = chooseBhabhiBotCard(game);
        assert.ok(chosen);
        assert.ok(bhabhiLegalCards(game).some((held) => held.id === chosen.id));
        game = playBhabhi(game, game.turn, chosen.id);
      }
      const ids = [...game.players.flatMap((player) => player.hand), ...game.discard, ...game.trick.map((play) => play.card)].map((held) => held.id);
      assert.equal(ids.length, 52);
      assert.equal(new Set(ids).size, 52);
      assert.ok(game.players.every((player) => !player.out || player.hand.length === 0));
      for (const player of game.players) {
        assert.ok(game.knowledge.held[player.id].every((known) => player.hand.some((held) => held.id === known.id)));
        assert.ok(game.knowledge.voids[player.id].every((suit) => player.hand.every((held) => held.suit !== suit)));
      }
      assert.ok(game.knowledge.discarded.every((known) => game.discard.some((held) => held.id === known.id)));
    }
    assert.equal(game.phase, "game-over");
    assert.equal(game.players.filter((player) => !player.out).length, 1);
    assert.notEqual(game.loser, null);
  }
});