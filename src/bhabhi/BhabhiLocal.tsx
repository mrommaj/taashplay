import { useEffect, useRef, useState } from "react";
import { isMuted, setMuted } from "../game/sound";
import { bhabhiSnapshot, chooseBhabhiBotCard, createBhabhi, isSeriesDone, playBhabhi, resolveBhabhi } from "./engine";
import BhabhiTable from "./BhabhiTable";
import { recordResult } from "../game/stats";

const BOT_NAMES = ["Arjun", "Meera", "Vikram", "Rohit", "Sana"];

export default function BhabhiLocal({ name, players, seriesTarget, onQuit }: {
  name: string;
  players: number;
  seriesTarget: number | null;
  onQuit: () => void;
}) {
  const buildLocal = (round: number, losses: number[] | null) => {
    const names = [name, ...BOT_NAMES].slice(0, players);
    return createBhabhi(names, names.map((_, id) => id === 0), round, undefined, seriesTarget, losses);
  };
  const [game, setGame] = useState(() => buildLocal(1, null));
  const [muted, setMute] = useState(isMuted);
  const recordedRound = useRef(1);

  useEffect(() => {
    if (game.phase === "game-over" && recordedRound.current !== game.round) {
      recordedRound.current = game.round;
      recordResult("bhabhi", game.loser !== 0);
    }
  }, [game.phase, game.round, game.loser]);

  useEffect(() => {
    if (game.phase === "game-over") return;
    if (game.phase === "playing" && !game.players[game.turn].isBot) return;
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (current !== game) return current;
        if (current.phase === "trick-end") return resolveBhabhi(current);
        const card = chooseBhabhiBotCard(current);
        return card ? playBhabhi(current, current.turn, card.id) : current;
      });
    }, game.phase === "trick-end" ? 1500 : 800);
    return () => window.clearTimeout(timer);
  }, [game]);

  return <BhabhiTable view={bhabhiSnapshot(game, 0)} onPlay={(id) => setGame((current) => playBhabhi(current, 0, id))}
    onQuit={onQuit} muted={muted} onToggleMute={() => { setMuted(!muted); setMute(!muted); }}
    onRematch={() => setGame((current) => {
      if (current.phase !== "game-over") return current;
      const keepSeries = current.series && !isSeriesDone(current);
      return buildLocal(keepSeries ? current.round + 1 : 1, keepSeries ? current.series!.losses : null);
    })} />;
}