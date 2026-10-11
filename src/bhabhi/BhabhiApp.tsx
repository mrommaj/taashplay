import { useState } from "react";
import { isMuted, setMuted } from "../game/sound";
import BhabhiMenu, { type BhabhiMenuAction } from "./BhabhiMenu";
import BhabhiLocal from "./BhabhiLocal";
import BhabhiOnline from "./BhabhiOnline";

export default function BhabhiApp({ onBack }: { onBack: () => void }) {
  const [screen, setScreen] = useState<BhabhiMenuAction | null>(null);
  const [muted, setMute] = useState(isMuted);
  const quit = () => { setMute(isMuted()); setScreen(null); };
  if (!screen) return <BhabhiMenu onAction={setScreen} onBack={onBack} muted={muted}
    onToggleMute={() => { setMuted(!muted); setMute(!muted); }} />;
  if (screen.kind === "bots") return <BhabhiLocal name={screen.name} players={screen.players ?? 4} seriesTarget={screen.seriesTarget} onQuit={quit} />;
  return <BhabhiOnline role={screen.kind === "host" ? "host" : "guest"} name={screen.name}
    code={screen.kind === "join" ? screen.code : undefined}
    seriesTarget={screen.kind === "host" ? screen.seriesTarget : undefined} onQuit={quit} />;
}