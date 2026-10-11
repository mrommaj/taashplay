import { useRef, useState, type ReactNode } from "react";
import { sfx } from "../game/sound";
import { useT } from "../game/i18n";
import { SUITS, SUIT_SYMBOL, isRed } from "../game/engine";
import type { BotDifficulty } from "../game/bot";
import { getBotDifficulty, setBotDifficulty } from "../game/bot";

export interface GameMenuSeriesOption {
  label: string;
  value: number | null;
}

export interface GameMenuAction {
  kind: "bots" | "host" | "join";
  name: string;
  seriesTarget: number | null;
  code?: string;
}

interface ShellProps {
  title: string;
  subtitle: string;
  seriesOptions: GameMenuSeriesOption[];
  onAction: (action: GameMenuAction) => void;
  muted: boolean;
  onToggleMute: () => void;
  onBack: () => void;
  howToPlay?: ReactNode;
  buttons?: {
    hostLabel?: string;
    friendsLabel?: string;
  };
}

const primary = "min-h-14 w-full rounded-xl bg-yellow-400 px-4 py-3 text-base font-bold text-emerald-950 hover:bg-yellow-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-200 transition-all shadow-lg";
const secondary = "min-h-14 w-full rounded-xl border border-emerald-600 px-4 py-3 text-base font-bold text-white hover:bg-emerald-900 transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-200";

export default function GameMenu({
  title, subtitle, seriesOptions, onAction, muted, onToggleMute, onBack, howToPlay, buttons: buttonsProp,
}: ShellProps) {
  const t = useT();
  const [view, setView] = useState<"home" | "friends" | "join">("home");
  const [name, setName] = useState(() => {
    try { return (localStorage.getItem("rang-player-name") ?? "").trim().slice(0, 12); }
    catch { return ""; }
  });
  const [roomCode, setRoomCode] = useState("");
  const [difficulty, setDifficultyState] = useState<BotDifficulty>(getBotDifficulty);
  const [seriesTarget, setSeriesTarget] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const buttons = buttonsProp ?? {};

  const saveName = (): boolean => {
    const playerName = name.trim();
    if (!playerName) {
      nameRef.current?.setCustomValidity("Please enter your name.");
      nameRef.current?.reportValidity();
      return false;
    }
    setName(playerName);
    try {
      localStorage.setItem("rang-player-name", playerName);
    } catch { /* keep session */ }
    return true;
  };

  const navigate = (next: "home" | "friends" | "join") => {
    if (next !== "home" && !saveName()) return;
    sfx.click();
    setView(next);
  };
  const startBots = () => {
    if (!saveName()) return;
    sfx.deal();
    onAction({ kind: "bots", name: name.trim(), seriesTarget });
  };
  const startHost = () => {
    if (!saveName()) return;
    sfx.click();
    onAction({ kind: "host", name: name.trim(), seriesTarget });
  };
  const joinRoom = () => {
    if (roomCode.length !== 6 || !saveName()) return;
    sfx.click();
    onAction({ kind: "join", name: name.trim(), seriesTarget, code: roomCode });
  };

  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center px-6 text-white overflow-y-auto"
      style={{ paddingTop: "max(2rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="my-auto w-full max-w-sm py-3">
        {view === "home" && (
          <button type="button" onClick={onBack} className="mb-4 min-h-11 text-sm text-emerald-200 hover:text-white">
            {"< "}{t("choose_game_back")}
          </button>
        )}
        {view !== "home" && (
          <button type="button" onClick={() => setView("home")} className="mb-4 min-h-11 text-sm text-emerald-200 hover:text-white">
            {"< "}{t("back")}
          </button>
        )}

        <header className="mb-6 text-center">
          <div aria-hidden="true" className="mb-3 flex justify-center gap-3 font-serif text-3xl leading-none">
            {SUITS.map((suit) => (
              <span key={suit} className={isRed(suit) ? "text-red-400" : "text-white"}>
                {SUIT_SYMBOL[suit]}
              </span>
            ))}
          </div>
          <h1 className="text-5xl font-black tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm font-medium text-yellow-200">{subtitle}</p>
        </header>

        <div key={view}>
          {view === "home" && (
            <>
              <label htmlFor={`${title}-player-name`} className="text-sm text-emerald-100">{t("your_name")}</label>
              <input
                id={`${title}-player-name`}
                ref={nameRef}
                value={name}
                maxLength={12}
                required
                autoComplete="nickname"
                onChange={(event) => {
                  event.currentTarget.setCustomValidity("");
                  setName(event.target.value);
                }}
                className="mt-2 min-h-12 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-base outline-none placeholder:text-emerald-200/40 focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                placeholder={t("type_name")}
              />

              <p className="mt-4 text-sm text-emerald-100">{t("series")}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("series")}>
                {seriesOptions.map((option) => (
                  <button
                    key={`series-${option.value ?? "quick"}`}
                    type="button"
                    aria-pressed={seriesTarget === option.value}
                    onClick={() => { sfx.click(); setSeriesTarget(option.value); }}
                    className={`h-10 rounded-xl border-2 px-3 text-xs font-bold transition active:scale-95 ${
                      seriesTarget === option.value
                        ? "border-yellow-300 bg-yellow-400/15 text-white"
                        : "border-emerald-700 bg-emerald-950/50 text-emerald-100 hover:border-emerald-500"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-3">
                <button type="button" onClick={startBots} className={primary}>{t("play_bots")}</button>
                <button type="button" onClick={() => navigate("friends")} className={secondary}>{t("play_friends")}</button>
              </div>
            </>
          )}

          {view === "friends" && (
            <>
              <h2 className="text-2xl font-bold">{t("play_friends")}</h2>
              <p className="mt-1.5 text-sm text-emerald-200/80">{t("empty_seats_note")}</p>
              <p className="mt-3 text-sm text-emerald-100">{t("series_shared")}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t("series_shared")}>
                {seriesOptions.map((option) => (
                  <button
                    key={`series-friends-${option.value ?? "quick"}`}
                    type="button"
                    aria-pressed={seriesTarget === option.value}
                    onClick={() => { sfx.click(); setSeriesTarget(option.value); }}
                    className={`h-10 rounded-xl border-2 px-3 text-xs font-bold transition active:scale-95 ${
                      seriesTarget === option.value
                        ? "border-yellow-300 bg-yellow-400/15 text-white"
                        : "border-emerald-700 bg-emerald-950/50 text-emerald-100 hover:border-emerald-500"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-6 grid gap-3">
                <button type="button" onClick={startHost} className={primary}>
                  {buttons.hostLabel ?? t("create_room")}
                </button>
                <button type="button" onClick={() => navigate("join")} className={secondary}>
                  {buttons.friendsLabel ?? t("join_room")}
                </button>
              </div>
            </>
          )}

          {view === "join" && (
            <>
              <h2 className="text-2xl font-bold">{t("join_room")}</h2>
              <p className="mt-1.5 text-sm text-emerald-200/80">{t("keep_awake")}</p>
              <label htmlFor={`${title}-room-code`} className="mt-6 block text-sm text-emerald-100">{t("room_code")}</label>
              <input
                id={`${title}-room-code`}
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                minLength={6}
                maxLength={6}
                pattern="[A-Z0-9]{6}"
                className="mt-2 min-h-12 w-full rounded-xl border border-emerald-700 bg-emerald-950/60 px-4 py-3 text-center font-mono text-base tracking-[0.3em] uppercase outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                placeholder="ABC123"
              />
              <button type="button" onClick={joinRoom} disabled={roomCode.length !== 6} className={`${primary} mt-6 ${roomCode.length !== 6 ? "opacity-40" : ""}`}>
                {t("join_room_btn")}
              </button>
            </>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between gap-3 border-t border-emerald-800/60 pt-3">
          <button type="button" onClick={onToggleMute} aria-pressed={!muted} className="min-h-10 text-sm text-emerald-200 hover:text-white">
            {t("sound")} {muted ? t("off_short") : t("on_short")}
          </button>
          <button
            type="button"
            aria-label={difficulty === "hard" ? "Set bots to Normal" : "Set bots to Hard"}
            onClick={() => {
              const next: BotDifficulty = difficulty === "hard" ? "normal" : "hard";
              setDifficultyState(next);
              setBotDifficulty(next);
              sfx.click();
            }}
            className="min-h-10 text-sm text-emerald-200 hover:text-white"
          >
            {t("bots_label")}: <b className={difficulty === "hard" ? "text-yellow-300" : "text-white"}>{difficulty === "hard" ? t("bot_hard") : t("bot_normal")}</b>
          </button>
        </footer>

        {howToPlay && <div className="mt-4">{howToPlay}</div>}
      </div>
    </main>
  );
}
