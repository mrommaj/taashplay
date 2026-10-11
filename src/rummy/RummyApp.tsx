import { useEffect, useRef, useState } from "react";
import { isMuted, setMuted, sfx } from "../game/sound";
import { recordResult } from "../game/stats";
import { useT } from "../game/i18n";
import VoiceChatControls from "../components/VoiceChatControls";
import GameMenu from "../components/GameMenu";
import { botDiscard, botDraw, createRummy, discardCard, drawCard, rummySnapshot, type RummyState } from "./engine";
import { useRummyRoom } from "./useRummyRoom";
import RummyBoard from "./Board";

type Mode = "menu" | "friends" | "bots" | "host" | "guest";

export default function RummyApp({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState(() => {
    try { return (localStorage.getItem("rang-player-name") ?? "").trim().slice(0, 12); }
    catch { return ""; }
  });
  const [seriesTarget, setSeriesTarget] = useState<number | null>(null);
  const [code, setCode] = useState("");

  if (mode === "bots") {
    return <RummyLocal name={name.trim() || "You"} seriesTarget={seriesTarget} onBack={() => setMode("menu")} />;
  }
  if (mode === "host") {
    return <RummyOnline kind="host" name={name.trim() || "Host"} seriesTarget={seriesTarget} onBack={() => setMode("menu")} />;
  }
  if (mode === "guest") {
    return <RummyOnline kind="guest" name={name.trim() || "Guest"} code={code} seriesTarget={seriesTarget} onBack={() => setMode("menu")} />;
  }
  if (mode === "friends") {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center px-6 py-8 text-white">
        <div className="my-auto w-full max-w-sm py-4">
          <button type="button" onClick={() => setMode("menu")} className="mb-6 min-h-11 text-sm text-emerald-200 hover:text-white">{"< Back"}</button>
          <h1 className="text-center text-4xl font-black tracking-tight">RUMMY — Friends</h1>
          <p className="mt-1 text-center text-sm text-emerald-200">Play with one friend, each on your own phone</p>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => { sfx.click(); setMode("host"); }} className="min-h-14 w-full rounded-xl bg-yellow-400 px-4 py-3 text-base font-bold text-emerald-950 hover:bg-yellow-300">
              Create a room
            </button>
            <p className="my-2 text-center text-xs uppercase tracking-widest text-emerald-200/60">or join</p>
            <label htmlFor="rummy-join-code" className="text-sm text-emerald-100">Join a friend's room</label>
            <input
              id="rummy-join-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="ABC123"
              className="mt-1 min-h-12 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-center font-mono text-base tracking-[0.3em] focus:border-yellow-300 focus:outline-none"
            />
            <button
              type="button" disabled={code.length !== 6}
              onClick={() => { if (code.length === 6) { sfx.click(); setMode("guest"); } }}
              className="min-h-14 w-full rounded-xl border border-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-900 disabled:opacity-40"
            >
              Join room
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <GameMenu
      title="RUMMY"
      subtitle="Draw, meld, gin"
      seriesOptions={[
        { label: "Quick round", value: null },
        { label: "First to 2", value: 2 },
        { label: "First to 3", value: 3 },
      ]}
      onBack={onBack}
      onAction={(action) => {
        setName(action.name);
        setSeriesTarget(action.seriesTarget);
        setCode(action.code ?? "");
        if (action.kind === "bots") { sfx.deal(); setMode("bots"); }
        else if (action.kind === "host") { sfx.click(); setMode("host"); }
        else if (action.kind === "join" && action.code) { sfx.click(); setMode("guest"); }
      }}
      muted={isMuted()}
      onToggleMute={() => { setMuted(!isMuted()); sfx.click(); }}
      howToPlay={
        <details className="mt-2 text-sm text-emerald-100/85">
          <summary className="cursor-pointer py-2 hover:text-white">How to play</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
            <li>{t("rm_r1")}</li>
            <li>{t("rm_r2")}</li>
            <li>{t("rm_r3")}</li>
          </ul>
        </details>
      }
    />
  );
}

// ---------- Local bot game ----------

function RummyLocal({ name, seriesTarget, onBack }: { name: string; seriesTarget: number | null; onBack: () => void }) {
  const [game, setGame] = useState<RummyState>(() =>
    createRummy([name, "Friend Bot"], [true, false], 1, undefined, [0, 0], seriesTarget),
  );
  const recorded = useRef(0);

  useEffect(() => {
    if (game.phase === "round-over" && game.winner !== null && recorded.current !== game.round) {
      recorded.current = game.round;
      recordResult("rummy", game.winner === 0);
    }
  }, [game]);

  useEffect(() => {
    if (game.turn !== 1 || game.drawn || game.phase !== "playing") return;
    const timer = setTimeout(() => {
      setGame((current) => (current.turn === 1 && !current.drawn && current.phase === "playing" ? drawCard(current, botDraw(current)) : current));
    }, 850);
    return () => clearTimeout(timer);
  }, [game.turn, game.drawn, game.phase]);

  useEffect(() => {
    if (game.turn !== 1 || !game.drawn || game.phase !== "playing") return;
    const timer = setTimeout(() => {
      setGame((current) => (current.turn === 1 && current.drawn && current.phase === "playing" ? discardCard(current, botDiscard(current)!.id) : current));
    }, 900);
    return () => clearTimeout(timer);
  }, [game.turn, game.drawn, game.phase]);

  return <RummyBoard
    snap={rummySnapshot(game, 0)}
    hand={game.players[0].hand}
    onBack={onBack}
    onDraw={(source) => setGame((current) => current.phase === "playing" && current.turn === 0 ? drawCard(current, source) : current)}
    onDiscard={(cardId) => setGame((current) => current.phase === "playing" && current.turn === 0 ? discardCard(current, cardId) : current)}
    onNext={() => setGame((current) => current.phase === "round-over" ? createRummy(
      [current.players[0].name, current.players[1].name],
      [true, false],
      current.round + 1,
      undefined,
      current.score,
      current.seriesTarget,
    ) : current)}
    onNewSeries={() => setGame((current) => current.phase === "round-over" ? createRummy(
      [current.players[0].name, current.players[1].name],
      [true, false],
      1,
      undefined,
      [0, 0],
      current.seriesTarget,
    ) : current)}
  />;
}

function RummyOnline({ kind, name, code, seriesTarget, onBack }: { kind: "host" | "guest"; name: string; code?: string; seriesTarget?: number | null; onBack: () => void }) {
  const t = useT();
  const room = useRummyRoom(kind, name, code ?? "", seriesTarget);
  const quit = () => { room.voice.leave(); onBack(); };
  const shareInvite = async () => {
    const text = `Play rummy with me. Room code: ${room.code}`;
    const url = new URL(window.location.href); url.search = ""; url.hash = "";
    try {
      if (navigator.share) await navigator.share({ title: "Rummy card game", text, url: url.href });
      else await navigator.clipboard.writeText(`${url.href}\n${text}`);
    } catch { /* cancel ok */ }
  };

  if (!room.view) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8 text-white">
        <div className="my-auto w-full">
          <button type="button" onClick={quit} className="mb-4 min-h-11 text-sm text-emerald-200">{"< Back"}</button>
          <h1 className="text-center text-3xl font-black">RUMMY — {kind === "host" ? "Room" : "Join"}</h1>
          <p className="mt-2 text-center text-sm text-emerald-200">{room.progress}</p>
          {room.error && <p role="alert" className="mt-3 text-center text-sm text-amber-200">{room.error}</p>}
          {room.lobby && (
            <div className="mt-4 rounded-2xl border border-emerald-800 bg-emerald-950/50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-300">Players</p>
              <ul className="mt-2 divide-y divide-emerald-800 text-sm">
                {room.lobby.names.map((playerName, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span>{playerName || `Friend ${i + 1}`}</span>
                    <span className="text-[10px] text-emerald-200/65">{i === 0 ? "Host (You)" : (room.lobby?.occupied?.[i] ?? false) ? "Joined" : "Waiting…"}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-center">
                <p className="select-text font-mono text-3xl font-black tracking-[0.25em] text-yellow-200">{room.code}</p>
                <div className="mt-2 flex justify-center gap-3">
                  <button type="button" onClick={shareInvite} className="min-h-10 text-xs underline underline-offset-2">Share invite</button>
                </div>
              </div>
            </div>
          )}
          <VoiceChatControls voice={room.voice} />
          {kind === "host" && !!(room.lobby?.occupied?.[1]) && (
            <button onClick={room.start} className="mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950">Start game</button>
          )}
          {kind === "host" && !(room.lobby?.occupied?.[1] ?? false) && (
            <p className="mt-2 text-center text-sm text-emerald-200/75">Waiting for one friend to join…</p>
          )}
          {kind === "guest" && room.lobby && <p className="mt-2 text-center text-sm text-yellow-200">{t("waiting_host")}</p>}
          {room.progress && !room.lobby && <p className="mt-2 text-center text-sm text-emerald-200/75">{room.progress}</p>}
          {room.status === "error" && (
            <button type="button" onClick={room.retry} className="mt-3 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950">Try again</button>
          )}
        </div>
      </main>
    );
  }

  return (
    <RummyBoard
      snap={room.view}
      hand={room.view.hand}
      onBack={quit}
      onDraw={(source) => room.drawCardNow(source)}
      onDiscard={(cardId) => room.discardCardNow(cardId)}
      onNext={room.next}
      onNewSeries={room.newSeries}
      roomNote={room.error || undefined}
      voiceControls={<VoiceChatControls voice={room.voice} compact />}
    />
  );
}
