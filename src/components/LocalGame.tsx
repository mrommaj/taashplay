import { useEffect, useRef, useState } from "react";
import type { Card, GameState, Suit } from "../game/engine";
import {
  botChooseTrump,
  botPickCard,
  chooseTrump,
  createGame,
  dealNewHand,
  isSeriesComplete,
  legalCards,
  playCard,
  resolveTrick,
  startNewSeriesFrom,
  teamOf,
} from "../game/engine";
import GameTable from "./GameTable";
import { recordResult } from "../game/stats";
import { sfx, isMuted, setMuted } from "../game/sound";

interface Props {
  name: string;
  seriesTarget: number | null;
  onQuit: () => void;
}

export default function LocalGame({ name, seriesTarget, onQuit }: Props) {
  const [game, setGame] = useState<GameState>(() =>
    createGame([name, "Arjun", "Meera", "Vikram"], [true, false, false, false], seriesTarget),
  );
  const [muted, setM] = useState(isMuted());
  const timer = useRef<number | null>(null);
  const prevTricks = useRef<[number, number]>([0, 0]);
  const prevPhase = useRef(game.phase);
  const prevTurn = useRef(game.turn);
  const prevTrickLen = useRef(0);
  const recordedHand = useRef(-1);

  const viewer = 0;

  useEffect(() => {
    if (game.phase === "hand-over" && recordedHand.current !== game.handNumber) {
      recordedHand.current = game.handNumber;
      const winnerTeam = game.tricksWon[0] > game.tricksWon[1] ? 0 : 1;
      recordResult("rang", winnerTeam === game.players[viewer].team);
    }
  }, [game.phase, game.handNumber, game.tricksWon, game.players, viewer]);

  // ---- sounds on transitions ----
  useEffect(() => {
    // turn changed to a human -> ding
    if (
      game.phase === "playing" &&
      game.turn !== prevTurn.current &&
      !game.players[game.turn].isBot
    ) {
      if (prevPhase.current === "playing") sfx.yourTurn();
    }
    // trick resolved
    if (
      (prevTricks.current[0] !== game.tricksWon[0] || prevTricks.current[1] !== game.tricksWon[1]) &&
      game.lastWinner !== null
    ) {
      const myTeam = game.players[viewer].team;
      if (teamOf(game.lastWinner) === myTeam) sfx.trickWin();
      else sfx.trickLose();
    }
    // trump chosen
    if (prevPhase.current === "choose-trump" && game.phase === "playing") {
      sfx.trump();
    }
    // hand over
    if (game.phase === "hand-over" && prevPhase.current !== "hand-over") {
      const wt = game.tricksWon[0] > game.tricksWon[1] ? 0 : 1;
      if (game.tricksWon[wt] === 13) sfx.kot();
      else if (wt === game.players[viewer].team) sfx.handWin();
      else sfx.handLose();
    }
    // card snap when a bot plays (humans already snap on tap)
    if (game.trick.length > prevTrickLen.current) {
      const last = game.trick[game.trick.length - 1];
      if (last && game.players[last.player].isBot) sfx.playCard();
    }
    prevTrickLen.current = game.trick.length;
    prevTricks.current = [...game.tricksWon] as [number, number];
    prevPhase.current = game.phase;
    prevTurn.current = game.turn;
  }, [game, viewer]);

  // ---- bot automation ----
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const schedule = (ms: number, fn: (s: GameState) => GameState) => {
      timer.current = window.setTimeout(() => setGame((s) => fn(s)), ms);
    };
    if (game.phase === "choose-trump" && game.players[game.chooser].isBot) {
      const c = game.chooser;
      schedule(1100, (s) =>
        s.phase === "choose-trump" && s.chooser === c
          ? chooseTrump(s, botChooseTrump(s.players[c].hand))
          : s
      );
    } else if (game.phase === "playing" && game.players[game.turn].isBot) {
      const t = game.turn;
      schedule(game.trick.length === 0 ? 1000 : 700, (s) =>
        s.phase === "playing" && s.turn === t ? playCard(s, t, botPickCard(s, t)) : s
      );
    } else if (game.phase === "trick-done") {
      schedule(1500, (s) => (s.phase === "trick-done" ? resolveTrick(s) : s));
    }
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [game.phase, game.turn, game.trick.length, game.handNumber, game.chooser]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = game.players[viewer];
  const myTurn = game.phase === "playing" && game.turn === viewer && !me.isBot;
  const legal = myTurn ? legalCards(me.hand, game.trick) : [];
  const canChoose = game.phase === "choose-trump" && game.chooser === viewer && !me.isBot;

  return (
    <GameTable
      players={game.players.map((pl) => ({
        id: pl.id,
        name: pl.name,
        isBot: pl.isBot,
        team: pl.team,
        handCount: pl.hand.length,
      }))}
      myHand={me.hand}
      pile={game.pile}
      pileLeader={game.pileLeader}
      phase={game.phase}
      dealer={game.dealer}
      chooser={game.chooser}
      trump={game.trump}
      turn={game.turn}
      trick={game.trick}
      tricksWon={game.tricksWon}
      seriesTarget={game.seriesTarget}
      scores={game.scores}
      handNumber={game.handNumber}
      redealCount={game.redealCount}
      lastWinner={game.lastWinner}
      message={game.message}
      viewer={viewer}
      legalIds={legal.map((c) => c.id)}
      canChooseTrump={canChoose}
      chooserHand={canChoose ? [...game.players[viewer].hand] : null}
      onPlay={(card: Card) => setGame((s) => playCard(s, viewer, card))}
      onChooseTrump={(s: Suit) => setGame((g) => g.phase === "choose-trump" && g.chooser === viewer ? chooseTrump(g, s) : g)}
      onNextHand={() => setGame((g) => {
        if (g.phase !== "hand-over") return g;
        return isSeriesComplete(g) ? startNewSeriesFrom(g) : dealNewHand(g);
      })}
      onQuit={onQuit}
      muted={muted}
      onToggleMute={() => {
        const m = !muted;
        setMuted(m);
        setM(m);
        if (!m) sfx.click();
      }}
    />
  );
}
