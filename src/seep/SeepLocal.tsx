import { useEffect, useRef, useState } from "react";
import { isMuted, setMuted } from "../game/sound";
import { applySeepAction, createSeep, isSeepSeriesDone, nextSeepDeal, seepBotAction, seepSnapshot, startNewSeepSeriesFrom } from "./engine";
import SeepTable from "./SeepTable";

export default function SeepLocal({ name, seriesTarget, onQuit }: { name: string; seriesTarget: number | null; onQuit: () => void }) {
  const [game, setGame] = useState(() => createSeep([name, "Arjun", "Meera", "Vikram"], [true, false, false, false], 1, undefined, seriesTarget));
  const [muted, setMute] = useState(isMuted);
  useEffect(() => {
    if (game.phase === "deal-over" || game.phase === "match-over" || !game.players[game.turn].isBot) return;
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (current !== game) return current;
        const move = seepBotAction(current);
        return move ? applySeepAction(current, current.turn, move) : current;
      });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [game]);
  return <SeepTable view={seepSnapshot(game, 0)} onAction={(action) => setGame((current) => applySeepAction(current, 0, action))}
    onQuit={onQuit}
    onNext={() => setGame((current) => {
      if (current.seriesTarget && isSeepSeriesDone(current)) return startNewSeepSeriesFrom(current);
      return nextSeepDeal(current);
    })}
    muted={muted} onToggleMute={() => { setMuted(!muted); setMute(!muted); }} />;
}