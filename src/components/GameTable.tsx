import type { ReactNode } from "react";
import type { Card, Phase, PlayedCard, Suit } from "../game/engine";
import { SUITS, SUIT_SYMBOL, SUIT_NAME, isRed, sortHand, trickWinner } from "../game/engine";
import { feltGradient, getTheme } from "../game/theme";
import { useT } from "../game/i18n";
import PlayingCard, { CardBack } from "./PlayingCard";
import { cn } from "../utils/cn";
import { sfx } from "../game/sound";

export interface TablePlayer {
  id: number;
  name: string;
  isBot: boolean;
  team: 0 | 1;
  handCount: number;
  connected?: boolean;
}

interface Props {
  players: TablePlayer[];
  myHand: Card[];
  seriesTarget?: number | null;
  pile: number;
  pileLeader: number | null;
  phase: Phase;
  dealer: number;
  chooser: number;
  trump: Suit | null;
  turn: number;
  trick: PlayedCard[];
  tricksWon: [number, number];
  scores: [number, number];
  handNumber: number;
  redealCount?: number;
  lastWinner: number | null;
  message: string;
  viewer: number;
  legalIds: string[];
  canChooseTrump: boolean;
  chooserHand: Card[] | null;
  // actions
  onPlay: (card: Card) => void;
  onChooseTrump: (s: Suit) => void;
  onNextHand: () => void;
  onQuit: () => void;
  // chrome
  muted: boolean;
  onToggleMute: () => void;
  roomCode?: string;
  isOnline?: boolean;
  isHost?: boolean;
  statusNote?: string;
  voiceControls?: ReactNode;
}

const TEAM_BG = ["bg-sky-500", "bg-rose-500"];
const TEAM_TEXT = ["text-sky-300", "text-rose-300"];

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "??";
}

export default function GameTable(p: Props) {
  const t = useT();
  const me = p.players[p.viewer];
  const myTeam = me.team;
  const oppTeam = (myTeam === 0 ? 1 : 0) as 0 | 1;
  const seriesTarget = p.seriesTarget ?? null;
  const seriesDone = seriesTarget != null && (p.scores[0] >= seriesTarget || p.scores[1] >= seriesTarget);
  const rel = (pid: number) => (pid - p.viewer + 4) % 4;
  const seatByRel = [0, 1, 2, 3].map((r) => (p.viewer + r) % 4);
  const myTurn = p.phase === "playing" && p.turn === p.viewer;
  const winnerCard =
    p.phase === "trick-done" && p.trump ? trickWinner(p.trick, p.trump) : null;

  const n = p.myHand.length;
  const avail = Math.min(typeof window !== "undefined" ? window.innerWidth : 400, 448) - 32;
  const cardW = 56;
  const overlap = n > 1 ? Math.max(-31, Math.floor((avail - n * cardW) / (n - 1))) : 0;

  const needToWin = 7;
  const myPicked = p.tricksWon[myTeam];
  const oppPicked = p.tricksWon[oppTeam];

  const posClass = [
    "bottom-1 left-1/2 -translate-x-1/2",
    "right-1 top-1/2 -translate-y-1/2",
    "top-1 left-1/2 -translate-x-1/2",
    "left-1 top-1/2 -translate-y-1/2",
  ];

  return (
    <div className="h-[100dvh] flex flex-col text-white max-w-md mx-auto relative overflow-hidden">
      {/* ===== Header ===== */}
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 bg-emerald-950/90 border-b border-emerald-800">
        <button
          onClick={() => { sfx.click(); p.onQuit(); }}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-800/70 border border-emerald-700 active:scale-95"
        >
          {"<"} {t("quit")}
        </button>
        {p.roomCode ? (
          <button
            onClick={() => {
              try { navigator.clipboard.writeText(p.roomCode!); } catch {}
              sfx.click();
            }}
            className="text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg bg-amber-400/15 border border-amber-300/40 text-amber-200 active:scale-95"
            title="Tap to copy room code"
          >
            Room {p.roomCode} ⧉
          </button>
        ) : (
          <div className="text-xs text-emerald-300/80 font-semibold">Hand {p.handNumber}</div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { sfx.click(); p.onToggleMute(); }}
            className="w-9 h-9 rounded-lg bg-emerald-800/70 border border-emerald-700 flex items-center justify-center text-lg active:scale-95"
            title={p.muted ? "Unmute game sounds" : "Mute game sounds (voice chat stays on)"}
          >
            {p.muted ? "🔇" : "🔊"}
          </button>
          <div
            className={cn(
              "w-10 h-10 rounded-xl bg-white flex flex-col items-center justify-center shadow font-bold leading-none",
              p.trump && isRed(p.trump) ? "text-red-600" : "text-gray-900"
            )}
            title="Trump suit"
          >
            <span className="text-xl leading-none">{p.trump ? SUIT_SYMBOL[p.trump] : "?"}</span>
            <span className="text-[8px] text-gray-500 font-semibold tracking-wide">TRUMP</span>
          </div>
        </div>
      </header>
      {p.voiceControls && <div className="relative z-40 shrink-0">{p.voiceControls}</div>}

      <section aria-label="Picked tricks and match scores" className="shrink-0 border-b border-emerald-800/60 bg-emerald-950/60 px-3 py-2">
        <div className="grid grid-cols-2 divide-x divide-emerald-800">
          <div className="flex items-center justify-between gap-2 pr-3">
            <div>
              <p className={cn("text-[10px] font-bold uppercase tracking-wide", TEAM_TEXT[myTeam])}>{t("you_picked")}</p>
              <p className="text-[10px] text-white/60">{t("match_pts", { n: p.scores[myTeam] })}</p>
            </div>
            <p className="text-2xl font-black leading-none tabular-nums">{myPicked}<span className="ml-0.5 text-[10px] font-normal text-white/50">/13</span></p>
          </div>
          <div className="flex items-center justify-between gap-2 pl-3">
            <div>
              <p className={cn("text-[10px] font-bold uppercase tracking-wide", TEAM_TEXT[oppTeam])}>{t("they_picked")}</p>
              <p className="text-[10px] text-white/60">{t("match_pts", { n: p.scores[oppTeam] })}</p>
            </div>
            <p className="text-2xl font-black leading-none tabular-nums">{oppPicked}<span className="ml-0.5 text-[10px] font-normal text-white/50">/13</span></p>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 text-[9px] text-emerald-200/65">
          <span>{t("dealer")}: {p.players[p.dealer]?.name}</span>
          <span>{t("sar_label")} / {needToWin} {t("sar_target")}</span>
          {seriesTarget !== null && <span className="font-bold text-yellow-200/90">{t("series")} {p.scores[myTeam]}–{p.scores[oppTeam]} / {t("first_to_points", { n: seriesTarget })}</span>}
          {p.statusNote && <span>{p.statusNote}</span>}
        </div>
      </section>

      {/* ===== Table ===== */}
      <main
        className="flex-1 relative m-2 mt-1 rounded-3xl border-4 border-amber-900/70 shadow-inner min-h-0"
        style={{ background: feltGradient(getTheme().felt) }}
      >
        {[1, 2, 3].map((r) => {
          const pid = seatByRel[r];
          const pl = p.players[pid];
          const isTurn = p.phase === "playing" && p.turn === pid;
          const wonLast = p.phase === "trick-done" && winnerCard?.player === pid;
          const isPartner = pl.team === myTeam;
          return (
            <div key={pid} className={cn("absolute flex flex-col items-center gap-1", posClass[r])}>
              <div
                className={cn(
                  "pl-1 pr-2 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border-2 bg-black/45 backdrop-blur-sm",
                  isTurn || wonLast ? "border-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.6)]" : "border-white/10"
                )}
              >
                <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black", TEAM_BG[pl.team])}>
                  {initials(pl.name)}
                </span>
                <span className="max-w-[84px] truncate">
                  {pl.name}
                  {isPartner && pid !== p.viewer ? " (partner)" : ""}
                </span>
                {pl.isBot ? (
                  <span className="text-[9px] px-1 rounded bg-white/15">BOT</span>
                ) : p.isOnline ? (
                  <span className={cn("w-2 h-2 rounded-full", pl.connected === false ? "bg-red-400" : "bg-green-400")} title={pl.connected === false ? "Disconnected" : "Online"} />
                ) : null}
                {pid === p.chooser && p.trump && <span className="text-yellow-300" title="Chose trump">★</span>}
              </div>
              <div className="flex">
                {Array.from({ length: Math.min(pl.handCount, 13) }).map((_, i) => (
                  <CardBack key={i} className={i > 0 ? "-ml-4" : ""} />
                ))}
              </div>
            </div>
          );
        })}

        {/* You label */}
        <div className={cn("absolute flex flex-col items-center z-10", posClass[0])}>
          <div
            className={cn(
              "pl-1 pr-2 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border-2 bg-black/45 backdrop-blur-sm",
              myTurn || winnerCard?.player === p.viewer ? "border-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.6)]" : "border-white/10"
            )}
          >
            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black", TEAM_BG[myTeam])}>
              {initials(me.name)}
            </span>
            <span className="max-w-[90px] truncate">{me.name} (you)</span>
            {p.viewer === p.chooser && p.trump && <span className="text-yellow-300">★</span>}
          </div>
        </div>

        {/* Big trump badge on table */}
        <div className="absolute top-2 left-2 z-10 flex flex-col items-center pointer-events-none">
          <div
            className={cn(
              "w-11 h-14 rounded-xl bg-white flex items-center justify-center text-3xl font-bold shadow-lg border-2 border-yellow-300",
              p.trump && isRed(p.trump) ? "text-red-600" : "text-gray-900"
            )}
          >
            {p.trump ? SUIT_SYMBOL[p.trump] : "?"}
          </div>
          <div className="mt-1 text-[10px] font-black bg-black/60 text-yellow-200 px-1.5 py-0.5 rounded-full border border-yellow-300/40">
            {p.trump ? `TRUMP: ${SUIT_NAME[p.trump].toUpperCase()}` : "NO TRUMP YET"}
          </div>
        </div>

        {/* Sar pile */}
        {p.pile > 0 && (
          <div className="absolute top-3 right-2 z-10 flex flex-col items-center pointer-events-none">
            <div className="relative w-9 h-12">
              {Array.from({ length: Math.min(p.pile, 4) }).map((_, i) => (
                <CardBack key={i} size="sm" className="w-8 h-11" />
              )).map((el, i) => (
                <div key={i} className="absolute" style={{ top: -i * 3, left: i * 2 }}>{el}</div>
              ))}
            </div>
            <div className="mt-1 text-[10px] font-black bg-black/60 text-yellow-200 px-1.5 py-0.5 rounded-full border border-yellow-300/40 whitespace-nowrap">
              Pile: {p.pile}
            </div>
            {p.pileLeader !== null && p.players[p.pileLeader] && (
              <div className="mt-0.5 text-[9px] text-white/80 bg-black/50 px-1.5 rounded max-w-[90px] text-center leading-tight">
                {p.pileLeader === p.viewer ? "You" : p.players[p.pileLeader].name} need 1 more
              </div>
            )}
          </div>
        )}

        {/* Trick area */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-44 h-44">
            <div className="absolute inset-6 rounded-full border-2 border-dashed border-white/15" />
            {p.trick.map((pc) => {
              const r = rel(pc.player);
              const pos = [
                "bottom-0 left-1/2 -translate-x-1/2",
                "right-0 top-1/2 -translate-y-1/2",
                "top-0 left-1/2 -translate-x-1/2",
                "left-0 top-1/2 -translate-y-1/2",
              ][r];
              return (
                <div key={pc.card.id} className={cn("absolute pop-in", pos)}>
                  <PlayingCard card={pc.card} size="md" highlight={winnerCard?.card.id === pc.card.id} />
                </div>
              );
            })}
            {p.trick.length === 0 && p.phase === "playing" && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-white/70 text-xs px-8">
                {p.lastWinner !== null && p.players[p.lastWinner]
                  ? t("won_last", { name: p.players[p.lastWinner].name })
                  : t("name_leads", { name: "" })}
              </div>
            )}
            {p.phase === "trick-done" && winnerCard && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold bg-black/60 px-2 py-0.5 rounded-full border border-yellow-300/50 text-yellow-200">
                {t("picks_it", { name: p.players[winnerCard.player].name })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ===== Status ===== */}
      <div className="text-center text-[13px] px-3 pb-1 min-h-[1.6rem] font-medium">
        {myTurn ? (
          <span className="text-yellow-300 font-bold animate-pulse">
            {t("your_turn")}
            {p.trick.length > 0
              ? ` — ${t("follow_suit")} ${SUIT_SYMBOL[p.trick[0].card.suit]} ${SUIT_NAME[p.trick[0].card.suit]} ${t("if_you_can")}`
              : ` — ${t("lead_any")}`}
          </span>
        ) : p.phase === "playing" ? (
          <span className="text-emerald-100/90">
            {t("waiting_for", { name: p.players[p.turn]?.name ?? "" })}
          </span>
        ) : p.phase === "choose-trump" ? (
          <span className="text-emerald-100/90">{p.message}</span>
        ) : (
          <span className="text-emerald-100/90">{p.message}</span>
        )}
      </div>

      {/* ===== Hand ===== */}
      <footer className="px-1 pb-2 pt-0.5 bg-emerald-950/80 border-t border-emerald-800">
        <div className="flex justify-center py-2 px-2">
          {sortHand(p.myHand, p.trump).map((c, i) => {
            const playable = myTurn && p.legalIds.includes(c.id);
            return (
              <PlayingCard
                key={c.id}
                card={c}
                size="lg"
                onClick={myTurn ? () => { sfx.playCard(); p.onPlay(c); } : undefined}
                disabled={myTurn && !playable}
                dimmed={myTurn && !playable}
                style={{ marginLeft: i === 0 ? 0 : overlap, zIndex: i }}
                className={cn(playable && "ring-2 ring-yellow-300 -translate-y-1")}
              />
            );
          })}
          {p.myHand.length === 0 && p.phase !== "choose-trump" && (
            <div className="h-20 flex items-center text-emerald-300 text-sm">No cards</div>
          )}
        </div>
        <div className="text-center text-[11px] text-emerald-200/80 pb-0.5">
          Your team: <b className={TEAM_TEXT[myTeam]}>{p.players[p.viewer].name} + {p.players[(p.viewer + 2) % 4].name}</b>
          {"  "}•{"  "}Opponents: {p.players[(p.viewer + 1) % 4].name} + {p.players[(p.viewer + 3) % 4].name}
        </div>
      </footer>

      {/* ===== Trump chooser ===== */}
      {p.canChooseTrump && p.chooserHand && (
        <Overlay>
          <h2 className="text-xl font-black mb-1">{t("choose_trump")}</h2>
          <p className="text-emerald-200 text-sm mb-3">{t("first_5_pick")}</p>
          {(p.redealCount ?? 0) > 0 && <p role="status" className="mb-3 text-xs text-yellow-200">{t("weak_hand_note")}</p>}
          <div className="flex gap-1 mb-4 justify-center flex-wrap">
            {sortHand(p.chooserHand, null).map((c) => (
              <PlayingCard key={c.id} card={c} size="md" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 w-full max-w-[300px]">
            {SUITS.map((s: Suit) => (
              <button
                key={s}
                onClick={() => { sfx.trump(); p.onChooseTrump(s); }}
                className={cn(
                  "bg-white rounded-2xl py-3 px-2 font-bold flex flex-col items-center shadow active:scale-95",
                  isRed(s) ? "text-red-600" : "text-gray-900"
                )}
              >
                <span className="text-3xl leading-none">{SUIT_SYMBOL[s]}</span>
                <span className="text-xs mt-1 text-gray-600">{SUIT_NAME[s]}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-emerald-200/70">{t("ten_not_allowed")}</p>
        </Overlay>
      )}

      {/* ===== Hand over ===== */}
      {p.phase === "hand-over" && (
        <Overlay>
          {(() => {
            const winTeam = p.tricksWon[0] > p.tricksWon[1] ? 0 : 1;
            const kot = p.tricksWon[winTeam] === 13;
            const youWon = winTeam === myTeam;
            return (
              <>
                <div className="text-5xl mb-2">{seriesDone ? "🏆" : kot ? "👑" : youWon ? "🎉" : "😞"}</div>
                <h2 className="text-2xl font-black mb-1">
                  {seriesDone
                    ? `${myTeam === winTeam ? "Your team" : "Opponents"} win the series!`
                    : `${kot ? "CLEAN SWEEP! " : ""}${youWon ? "Your team wins!" : "Opponents win"}`}
                </h2>
                <p className="text-emerald-200 text-sm mb-4">
                  Team {winTeam === 0 ? "A" : "B"}: {p.players[winTeam].name} + {p.players[winTeam + 2].name}
                  {seriesDone
                    ? ` — first to ${seriesTarget} points`
                    : kot ? " picked all 13 — +2 points!" : " — +1 point"}
                </p>
                <div className="grid grid-cols-2 gap-3 w-full max-w-[300px] mb-5">
                  {[myTeam, oppTeam].map((team, idx) => (
                    <div
                      key={team}
                      className={cn("rounded-2xl p-3 text-center border-2", team === winTeam ? "border-yellow-300 bg-emerald-800/60" : "border-emerald-700 bg-emerald-900/40")}
                    >
                      <div className={cn("text-[11px] font-black uppercase", TEAM_TEXT[team])}>{idx === 0 ? t("you_picked") : t("they_picked")}</div>
                      <div className="text-4xl font-black">{p.tricksWon[team]}</div>
                      <div className="text-[11px] text-emerald-200/70">{t("tricks_hand")}</div>
                      <div className="text-sm mt-1">{t("total_pts", { n: `${p.scores[team]}` })}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { sfx.click(); p.onQuit(); }}
                    className="px-5 py-3 rounded-2xl bg-emerald-800 border border-emerald-600 font-semibold active:scale-95"
                  >
                    {t("quit")}
                  </button>
                  <button
                    onClick={() => { sfx.deal(); p.onNextHand(); }}
                    className="px-6 py-3 rounded-2xl bg-yellow-400 text-emerald-950 font-black shadow-lg active:scale-95"
                  >
                    {seriesDone ? `${t("new_series")} →` : t("next_hand")}
                  </button>
                </div>
              </>
            );
          })()}
        </Overlay>
      )}
    </div>
  );
}

export function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 bg-emerald-950/95 backdrop-blur-sm flex flex-col p-4 overflow-y-auto">
      <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center slide-up my-auto py-2">{children}</div>
    </div>
  );
}
