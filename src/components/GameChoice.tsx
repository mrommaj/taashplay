import { useState } from "react";
import { SUITS, SUIT_SYMBOL, isRed } from "../game/engine";
import { LANG_NAMES, useT, useLang, type Lang } from "../game/i18n";
import { resetStats, useStats } from "../game/stats";
import { sfx } from "../game/sound";
import { BACK_GRADIENTS, FELT_COLORS, getTheme, setTheme, type BackTheme, type FeltTheme } from "../game/theme";

export type GameChoiceId = "rang" | "bhabhi" | "seep" | "rummy";

export default function GameChoice({ onChoose }: { onChoose: (game: GameChoiceId) => void }) {
  const t = useT();
  const stats = useStats();
  const [lang, setLangChoice] = useLang();
  const [theme, saveTheme] = useState(getTheme);
  const pick = (felt: FeltTheme, back: BackTheme) => {
    const next = { felt, back };
    saveTheme(next);
    setTheme(next);
  };
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10 text-white">
      <div className="mb-5 flex justify-center gap-2">
        {(["en", "pa", "hi"] as Lang[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={lang === option}
            onClick={() => { sfx.click(); setLangChoice(option); }}
            className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-bold transition ${lang === option ? "bg-yellow-400 text-emerald-950" : "border border-emerald-600 text-emerald-100 hover:bg-emerald-900"}`}
          >
            {LANG_NAMES[option]}
          </button>
        ))}
      </div>
      <div className="slide-up w-full max-w-sm">
        <div aria-hidden="true" className="mb-6 flex justify-center gap-4 font-serif text-4xl">
          {SUITS.map((suit) => <span key={suit} className={isRed(suit) ? "text-red-400" : "text-white"}>{SUIT_SYMBOL[suit]}</span>)}
        </div>
        <h1 className="mb-7 text-center text-xl font-semibold text-emerald-100">{t("choose_game")}</h1>
        <div className="grid gap-4">
          {([
            { id: "rang" as const, title: "RANG", sub: "Sar (2 in a row)", accent: "border-sky-400/40" },
            { id: "bhabhi" as const, title: "BHABHI", sub: "Get away / Thulla", accent: "border-rose-400/40" },
            { id: "seep" as const, title: "SEEP", sub: "Houses, captures and sweeps", accent: "border-violet-400/40" },
            { id: "rummy" as const, title: "RUMMY", sub: "Draw, meld, gin", accent: "border-amber-400/40" },
          ]).map((g) => (
            <button key={g.id} type="button" onClick={() => { sfx.click(); onChoose(g.id); }}
              className={`min-h-24 rounded-2xl border px-6 py-5 text-left transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-200 border-emerald-500 ${g.accent}`}>
              <span className="block text-3xl font-black tracking-tight">{g.title}</span>
              <span className="mt-1 block text-sm text-emerald-200">{g.sub}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="Your wins per game and current streak">
          {([
            ["rang", "Rang"],
            ["bhabhi", "Bhabhi"],
            ["seep", "Seep"],
            ["rummy", "Rummy"],
          ] as const).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1 rounded-full border border-emerald-700/60 bg-emerald-950/50 px-2.5 py-1 text-[11px] font-bold text-emerald-100">
              {label} <b className="text-yellow-200 tabular-nums">{stats.wins[key]}</b>
              {stats.streak > 0 && stats.streakGame === key ? <span className="text-yellow-300" aria-label={`${stats.streak} streak`}>🔥{stats.streak}</span> : null}
            </span>
          ))}
          <button type="button" onClick={() => { if (window.confirm("Reset all wins and streak?")) resetStats(); }} className="text-[10px] text-emerald-200/40 underline underline-offset-2">reset</button>
        </div>
        <div className="mt-8 text-center">
          <p className="mb-3 text-xs uppercase tracking-widest text-emerald-200/70">{t("table_theme")}</p>
          <div className="flex justify-center gap-4">
            {(Object.keys(FELT_COLORS) as FeltTheme[]).map((felt) => (
              <button
                key={felt}
                type="button"
                aria-label={`${felt} felt theme`}
                aria-pressed={theme.felt === felt}
                onClick={() => { sfx.click(); pick(felt, theme.back); }}
                className={`h-10 w-10 rounded-full border-2 transition-transform ${theme.felt === felt ? "scale-110 border-yellow-300" : "border-white/25"}`}
                style={{ background: `radial-gradient(circle at 35% 35%, ${FELT_COLORS[felt][0]}, ${FELT_COLORS[felt][1]} 70%, ${FELT_COLORS[felt][2]})` }}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-4">
            {(Object.keys(BACK_GRADIENTS) as BackTheme[]).map((back) => (
              <button
                key={back}
                type="button"
                aria-label={`${back} card backs`}
                aria-pressed={theme.back === back}
                onClick={() => { sfx.click(); pick(theme.felt, back); }}
                className={`h-11 w-8 rounded-md border-2 transition-transform ${theme.back === back ? "scale-110 border-yellow-300" : "border-white/25"}`}
                style={{ background: BACK_GRADIENTS[back] }}
              />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-emerald-200/50">Felt & card backs, saved automatically</p>
        </div>
      </div>
    </main>
  );
}