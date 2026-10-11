import { useState } from "react";
import Menu, { type MenuAction } from "./components/Menu";
import LocalGame from "./components/LocalGame";
import HostFlow from "./components/HostFlow";
import GuestFlow from "./components/GuestFlow";
import { isMuted, setMuted } from "./game/sound";
import GameChoice, { type GameChoiceId } from "./components/GameChoice";
import BhabhiApp from "./bhabhi/BhabhiApp";
import SeepApp from "./seep/SeepApp";
import RummyApp from "./rummy/RummyApp";

type Screen =
  | { kind: "menu" }
  | { kind: "local"; name: string; seriesTarget: number | null }
  | { kind: "host"; hostName: string; seriesTarget: number | null }
  | { kind: "guest"; playerName: string; code: string };

export default function App() {
  const [selectedGame, setSelectedGame] = useState<GameChoiceId | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "menu" });
  const [muted, setM] = useState(isMuted());

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    setM(m);
  };

  const handleMenu = (a: MenuAction) => {
    if (a.kind === "bots") {
      setScreen({ kind: "local", name: a.name, seriesTarget: a.seriesTarget });
    } else if (a.kind === "host") {
      setScreen({ kind: "host", hostName: a.name, seriesTarget: a.seriesTarget });
    } else {
      setScreen({ kind: "guest", playerName: a.name, code: a.code });
    }
  };

  const quit = () => {
    setM(isMuted());
    setScreen({ kind: "menu" });
  };

  const chooseGame = () => {
    quit();
    setSelectedGame(null);
  };

  if (!selectedGame) return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-[#0c3520] to-emerald-950">
      <GameChoice onChoose={setSelectedGame} />
    </div>
  );

  if (selectedGame === "bhabhi") return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-[#0c3520] to-emerald-950">
      <BhabhiApp onBack={chooseGame} />
    </div>
  );

  if (selectedGame === "seep") return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-[#0c3520] to-emerald-950">
      <SeepApp onBack={chooseGame} />
    </div>
  );

  if (selectedGame === "rummy") return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-[#0c3520] to-emerald-950">
      <RummyApp onBack={chooseGame} />
    </div>
  );

  return (
    <div className="h-full bg-gradient-to-b from-emerald-950 via-[#0c3520] to-emerald-950">
      {screen.kind === "menu" && (
        <div className="[&>main]:min-h-[calc(100dvh-3.5rem)]">
          <nav className="mx-auto flex h-14 max-w-sm items-center px-6">
            <button type="button" onClick={chooseGame} className="min-h-11 text-sm text-emerald-200 hover:text-white">{"< Choose game"}</button>
          </nav>
          <Menu onAction={handleMenu} muted={muted} onToggleMute={toggleMute} />
        </div>
      )}
      {screen.kind === "local" && (
        <LocalGame name={screen.name} seriesTarget={screen.seriesTarget} onQuit={quit} />
      )}
      {screen.kind === "host" && <HostFlow hostName={screen.hostName} seriesTarget={screen.seriesTarget} onQuit={quit} />}
      {screen.kind === "guest" && <GuestFlow name={screen.playerName} code={screen.code} onQuit={quit} />}
    </div>
  );
}
