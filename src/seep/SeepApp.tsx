import { useState } from "react";
import { isMuted, setMuted } from "../game/sound";
import SeepMenu, { type SeepMenuAction } from "./SeepMenu";
import SeepLocal from "./SeepLocal";
import SeepOnline from "./SeepOnline";

export default function SeepApp({ onBack }: { onBack: () => void }) {
  const [screen, setScreen] = useState<SeepMenuAction | null>(null);
  const [muted, setMute] = useState(isMuted);
  const quit = () => { setMute(isMuted()); setScreen(null); };
  if (!screen) return <SeepMenu onAction={setScreen} onBack={onBack} muted={muted} onToggleMute={() => { setMuted(!muted); setMute(!muted); }} />;
  if (screen.kind === "bots") return <SeepLocal name={screen.name} seriesTarget={screen.seriesTarget} onQuit={quit} />;
  return <SeepOnline role={screen.kind === "host" ? "host" : "guest"} name={screen.name}
    code={screen.kind === "join" ? screen.code : undefined}
    seriesTarget={screen.kind === "host" ? screen.seriesTarget : undefined} onQuit={quit} />;
}