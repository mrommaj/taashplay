import type { ReactNode } from "react";
import { useT } from "../game/i18n";
import { rankLabel, SUIT_SYMBOL, type Card } from "../game/engine";
import PlayingCard from "../components/PlayingCard";
import { isGin, meldResult, type RummyView } from "./engine";

interface Props {
  snap: RummyView;
  hand: Card[];
  onBack: () => void;
  onDraw: (source: "stock" | "discard") => void;
  onDiscard: (cardId: string) => void;
  onNext: () => void;
  onNewSeries: () => void;
  roomNote?: string;
  className?: string;
  voiceControls?: ReactNode;
  statusNote?: string;
}

export default function RummyBoard({
  snap, hand, onBack, onDraw, onDiscard, onNext, onNewSeries,
  roomNote, voiceControls, statusNote,
}: Props) {
  const t = useT();
  const me = hand;
  const myTurn = snap.phase === "playing" && snap.turn === snap.viewer;
  const gin = isGin(me);
  const melds = meldResult(me);
  const opponent = snap.viewer === 0 ? 1 : 0;

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col text-white">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-800 bg-emerald-950 px-3 py-2">
        <button type="button" onClick={onBack} className="min-h-11 text-sm text-emerald-200">{"<"} {t("quit")}</button>
        <div className="text-center">
          <h1 className="text-xl font-black tracking-wide">RUMMY</h1>
          <span className="text-[10px] text-emerald-200/75">
            {t("Round")} {snap.round} · {snap.viewer === 0 ? snap.score[0] : snap.score[1]}–{snap.viewer === 0 ? snap.score[1] : snap.score[0]}
            {snap.seriesTarget ? ` · ${t("first_to_points", { n: snap.seriesTarget })}` : ""}
          </span>
        </div>
        <div className="w-10" />
      </header>
      {voiceControls && <div className="relative z-20">{voiceControls}</div>}
      {(roomNote || statusNote) && <p role="status" className="px-3 py-2 text-center text-xs text-amber-200">{statusNote || roomNote}</p>}

      <main className="flex-1 overflow-y-auto p-3">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-emerald-900/50 p-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-emerald-300">{opponent === 1 ? "Bot" : ""}</p>
              <p className="font-bold">Opponent</p>
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: snap.opponentHandCount }).map((_, i) => (
                <span key={i} className="-ml-2 inline-block h-9 w-6 rounded bg-gradient-to-br from-blue-900 to-blue-600 border border-blue-950 shadow" />
              ))}
              <span className="ml-2 text-xs text-emerald-200">{snap.opponentHandCount} cards</span>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap justify-center gap-4">
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-emerald-300">{t("deck")}</p>
              <button
                type="button"
                disabled={!myTurn || snap.drawn !== null || snap.stockCount === 0}
                onClick={() => onDraw("stock")}
                className="relative h-20 w-14 rounded-xl border-2 border-blue-900 bg-gradient-to-br from-blue-950 to-blue-700 shadow transition disabled:opacity-50"
                aria-label="Draw from deck"
              >
                <span className="absolute inset-1 rounded-lg border border-blue-500/40" />
                <span className="absolute bottom-1 right-1 text-[10px] font-black text-white">{snap.stockCount}</span>
              </button>
            </div>
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-emerald-300">{t("pile")}</p>
              <button
                type="button"
                disabled={!myTurn || snap.drawn !== null || !snap.discardTop}
                onClick={() => onDraw("discard")}
                className="rounded-xl border-2 border-emerald-600 p-1 transition disabled:opacity-60"
                aria-label="Take from pile"
              >
                {snap.discardTop && <PlayingCard card={snap.discardTop as Card} size="lg" />}
              </button>
            </div>
            <div className="text-center">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-emerald-300">{t("bots_label")}</p>
              <div className="flex h-20 flex-col justify-center gap-2 text-xs">
                <p className={myTurn ? "text-yellow-300 font-bold" : "text-emerald-200/60"}>
                  {myTurn ? (snap.drawn ? t("discard_card") : t("draw_card_first")) : t("waiting_for", { name: "Opponent" })}
                </p>
                {gin && <p className="font-black text-yellow-200">{t("gin_available")}</p>}
              </div>
            </div>
          </div>

          <p className="mb-2 text-center text-xs text-emerald-100/80" aria-live="polite">{snap.drawn ? t("discard_card") : snap.message}</p>
          {melds && (
            <div className="mb-2 rounded-xl bg-emerald-900/40 px-3 py-2 text-[11px] text-emerald-100/80">
              {t("your_melds")}: {melds.map((group) => group.map((card) => rankLabel(card.rank) + " · " + SUIT_SYMBOL[card.suit]).join(" ")).join("  •  ")}
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-emerald-800 bg-emerald-950 px-3 pt-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mb-2 flex items-center justify-between text-[11px] text-emerald-200">
          <span>{t("your_hand")}: <b className="text-white">{me.length}</b></span>
          {snap.drawn && <span className="text-yellow-200">{t("discard_one")}</span>}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 pb-2">
          {me.map((card) => (
            <PlayingCard
              key={card.id}
              card={card}
              size="lg"
              onClick={myTurn && snap.drawn ? () => onDiscard(card.id) : undefined}
            />
          ))}
        </div>
      </footer>

      {snap.phase === "round-over" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-emerald-950/95 px-6 py-10 text-center">
          <p className="text-xs uppercase tracking-widest text-yellow-200">{snap.seriesDone ? t("series_complete") : t("round_complete")}</p>
          <h2 className="mt-3 text-3xl font-black">
            {snap.winner === null
              ? t("tied_deck")
              : snap.winner === snap.viewer
                ? (snap.seriesDone ? t("series_won") : t("gin_you_win"))
                : t("bot_gin")}
          </h2>
          <p className="mt-3 text-sm text-emerald-200">
            You {snap.viewer === 0 ? snap.score[0] : snap.score[1]} — {snap.viewer === 0 ? snap.score[1] : snap.score[0]}
            {snap.seriesTarget ? ` · ${t("first_to_points", { n: snap.seriesTarget })}` : ""}
          </p>
          <div className="mt-6 flex w-full max-w-sm gap-3">
            <button type="button" onClick={onBack} className="min-h-12 flex-1 rounded-xl border border-emerald-600 text-sm font-bold">
              {t("back_menu")}
            </button>
            {snap.seriesDone ? (
              <button type="button" onClick={onNewSeries} className="min-h-12 flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950">
                {t("new_series")}
              </button>
            ) : (
              <button type="button" onClick={onNext} className="min-h-12 flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950">
                {t("next_round")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
