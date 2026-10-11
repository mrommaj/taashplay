import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SUIT_NAME, SUIT_SYMBOL, isRed, rankLabel, type Card } from "../game/engine";
import { bhabhiFelt, getTheme } from "../game/theme";
import { useT } from "../game/i18n";
import { sfx } from "../game/sound";
import { highestLedCard, type BhabhiView } from "./engine";
import BhabhiRules from "./BhabhiRules";
import "./table.css";

interface Props {
  view: BhabhiView;
  onPlay: (id: string) => void;
  onQuit: () => void;
  onRematch?: () => void;
  muted: boolean;
  onToggleMute: () => void;
  roomCode?: string;
  voiceControls?: ReactNode;
  connectionNote?: string;
}

function Face({ card }: { card: Card }) {
  return <span className="bhabhi-card-face" data-red={isRed(card.suit)}>
    <span className="bhabhi-card-index"><b>{rankLabel(card.rank)}</b><span>{SUIT_SYMBOL[card.suit]}</span></span>
    <span className="bhabhi-card-suit">{SUIT_SYMBOL[card.suit]}</span>
    <span className="bhabhi-card-bottom">{rankLabel(card.rank)}</span>
  </span>;
}

export default function BhabhiTable({ view, onPlay, onQuit, onRematch, muted, onToggleMute, roomCode, voiceControls, connectionNote }: Props) {
  const t = useT();
  const [showRules, setShowRules] = useState(false);
  const rulesDialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<BhabhiView | null>(null);
  const me = view.players[view.viewer];
  const myTurn = view.phase === "playing" && view.turn === view.viewer;
  const legal = new Set(view.legalIds);
  const lead = view.trick[0]?.card.suit;
  const highest = highestLedCard(view.trick);
  const remaining = view.players.filter((player) => !player.out).length;

  // Keep the whole hand in ONE row on any phone: shrink cards and increase overlap as hands grow.
  // Every card needs at least ~15px of exposed left strip so its rank+suit stays readable.
  const handCount = view.hand.length;
  const avail = Math.min(typeof window !== "undefined" ? window.innerWidth : 400, 720) - 40;
  const cardW = handCount <= 6 ? 54 : handCount <= 10 ? 50 : handCount <= 14 ? 44 : 36;
  const step = handCount > 1 ? Math.max(15, Math.min(cardW, Math.floor((avail - cardW) / (handCount - 1)))) : cardW;

  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!before || before.round !== view.round) { sfx.deal(); return; }
    if (before.revision === view.revision) return;
    if (view.phase === "game-over" && before.phase !== "game-over") {
      if (view.loser === view.viewer) sfx.handLose();
      else sfx.handWin();
    } else if (view.trick.length > before.trick.length) sfx.playCard();
    else if (me.out && !before.players[view.viewer].out) sfx.trickWin();
    else if (view.phase === "playing" && view.turn === view.viewer && (before.turn !== view.viewer || before.phase === "trick-end")) sfx.yourTurn();
  }, [view, me.out]);

  useEffect(() => {
    if (showRules && !rulesDialog.current?.open) rulesDialog.current?.showModal();
    else if (!showRules && rulesDialog.current?.open) rulesDialog.current.close();
  }, [showRules]);

  const seat = (relative: number) => {
    const player = view.players[(view.viewer + relative) % view.players.length];
    return <div className={`bhabhi-seat bhabhi-seat-${relative}`} data-active={view.phase === "playing" && view.turn === player.id} data-out={player.out}>
      <span className="bhabhi-avatar" aria-hidden="true">{player.name.slice(0, 2).toUpperCase()}</span>
      <span className="bhabhi-seat-name" title={player.name}>{player.name}</span>
      <span className="bhabhi-seat-count">{player.out ? "Safe" : <><b>{player.handCount}</b> cards</>}{!player.out && player.isBot ? " / bot" : ""}</span>
    </div>;
  };

  // Positions for 5- and 6-player games (relative percent of the felt panel).
  const manySeatPositions: { top: string; left: string }[] =
    view.players.length === 5
      ? [
          { top: "8%", left: "50%" },   // opponent 1
          { top: "20%", left: "6%" },   // opponent 2
          { top: "20%", left: "94%" },  // opponent 3
          { top: "48%", left: "8%" },   // opponent 4
        ]
      : [
          { top: "7%", left: "50%" },
          { top: "15%", left: "8%" },
          { top: "15%", left: "92%" },
          { top: "46%", left: "6%" },
          { top: "46%", left: "94%" },
        ];

  const manySeat = (player: (typeof view.players)[number], index: number) => {
    const position = manySeatPositions[index] ?? manySeatPositions[0];
    return (
      <div
        key={player.id}
        className="bhabhi-seat bhabhi-seat-many"
        style={{ top: position.top, left: position.left }}
        data-active={view.phase === "playing" && view.turn === player.id}
        data-out={player.out}
      >
        <span className="bhabhi-avatar" aria-hidden="true">{player.name.slice(0, 2).toUpperCase()}</span>
        <span className="bhabhi-seat-name" title={player.name}>{player.name}</span>
        <span className="bhabhi-seat-count">{player.out ? "Safe" : <><b>{player.handCount}</b> cards</>}{!player.out && player.isBot ? " / bot" : ""}</span>
      </div>
    );
  };

  let instruction = `Waiting for ${view.players[view.turn].name}`;
  if (view.phase === "trick-end" && view.result) {
    instruction = view.result.kind === "pickup"
      ? `${view.players[view.result.player].name} picks up ${view.result.count} cards`
      : "Cards cleared. The highest card leads next.";
  } else if (me.out) instruction = "You got away. Watch the rest of the round.";
  else if (myTurn) {
    if (view.forcedLeadId === "S14" && view.trickNumber === 1) instruction = "Start with your Ace of Spades";
    else if (view.forcedLeadId) instruction = "Lead the card drawn from the discard pile";
    else if (lead) instruction = view.hand.some((card) => card.suit === lead)
      ? `Follow ${SUIT_NAME[lead]}`
      : view.trickNumber === 1 ? "No spades. Play any card." : "No matching suit. Play any card for thulla.";
    else instruction = "Lead any highlighted card";
  }

  const [hi, lo] = bhabhiFelt(getTheme().felt);
  return (
    <div className="bhabhi-game" style={{ "--felt-hi": hi, "--felt-lo": lo } as CSSProperties}>
      <header className="bhabhi-header">
        <button type="button" onClick={onQuit} className="bhabhi-text-button">{"<"} {t("quit")}</button>
        <div className="bhabhi-title"><h1>BHABHI</h1><span>{roomCode ? `Room ${roomCode}` : `${t("round")} ${view.round}`} / {t("no_trump")}</span></div>
        <div className="bhabhi-header-actions">
          <button type="button" onClick={onToggleMute} aria-pressed={!muted} className="bhabhi-text-button">{t("sound")} {muted ? t("off_short") : t("on_short")}</button>
          <button type="button" onClick={() => setShowRules(true)} aria-label={t("how_to_play")} className="bhabhi-rules-button">?</button>
      </div>
    </header>
    {voiceControls && <div className="bhabhi-voice">{voiceControls}</div>}
    {connectionNote && <p role="status" className="bhabhi-connection-note">{connectionNote}</p>}

    <main className="bhabhi-felt" aria-label="Bhabhi table">
      <div className="bhabhi-table-meta">
        <span>{lead ? `${SUIT_SYMBOL[lead]} ${SUIT_NAME[lead]}` : `${t("round")} ${view.trickNumber}`}</span>
        <span>{remaining}{t("still_in")}</span>
      </div>
      {view.players.length <= 4 ? (
        <>{seat(1)}{seat(2)}{seat(3)}</>
      ) : (
        view.players
          .filter((player) => player.id !== view.viewer)
          .map((player, index) => manySeat(player, index))
      )}
      <div className={`bhabhi-trick ${view.players.length > 4 ? "bhabhi-trick-many" : ""}`} aria-label="Cards played this trick">
        {view.trick.map((play) => {
          const relative = (play.player - view.viewer + view.players.length) % view.players.length;
          return <div key={`${view.trickNumber}-${play.card.id}`} className={`bhabhi-play bhabhi-play-${relative}`}
            data-pickup={view.phase === "trick-end" && view.result?.kind === "pickup" && highest?.player === play.player}
            aria-label={`${view.players[play.player].name}: ${rankLabel(play.card.rank)} of ${SUIT_NAME[play.card.suit]}`}>
            <div className="bhabhi-play-arrival"><Face card={play.card} /></div>
          </div>;
        })}
        {!view.trick.length && <div className="bhabhi-empty-trick">
          {view.trickNumber === 1 ? <><span className="bhabhi-opening-suit" aria-hidden="true">{SUIT_SYMBOL.S}</span><p>Ace of Spades starts</p></>
            : <><p>{view.turn === view.viewer ? t("you_lead") : t("name_leads", { name: view.players[view.turn].name })}</p>
              {view.lastTrick && <span>{view.lastTrick.kind === "pickup" ? t("picks_up_n", { name: view.players[view.lastTrick.player].name, n: view.lastTrick.count }) : t("last_pickup")}</span>}
            </>}
        </div>}
      </div>
      <div className="bhabhi-self" data-active={myTurn}>
        <span className="bhabhi-turn-dot" aria-hidden="true" />
        <span>{me.name} <span className="bhabhi-dim">(you)</span></span>
        {me.out && <span className="bhabhi-safe-label">Safe</span>}
      </div>
    </main>

    <div className="bhabhi-status" data-active={myTurn} data-thulla={view.result?.kind === "pickup"} aria-live="polite">
      {view.result?.kind === "pickup" ? <strong key={`pickup-${view.trickNumber}`} className="bhabhi-thulla">THULLA</strong>
        : myTurn ? <strong>Your turn</strong> : null}
      <span>{instruction}</span>
    </div>
    <footer className="bhabhi-hand">
      {view.series && (
        <div className="bhabhi-series-row" aria-label={`Series: first to ${view.series.target} Bhabhis loses`} role="img">
          <span>Series (first to {view.series.target}):</span>
          {view.players.map((player) => (
            <b key={player.id}>
              <span className="max-w-[8ch] truncate">{player.id === view.viewer ? "You" : player.name}</span>
              <span className="bhabhi-series-dot" aria-hidden="true">
                {"●".repeat(view.series!.losses[player.id])}{"○".repeat(Math.max(0, view.series!.target - view.series!.losses[player.id]))}
              </span>
            </b>
          ))}
        </div>
      )}
      <div className="bhabhi-hand-heading"><h2>{t("your_hand")} <b>{me.handCount}</b></h2><span>{t("discarded")}: {view.discardCount}</span></div>
      <div className="bhabhi-hand-cards" aria-label="Your cards">
        {view.hand.map((card, index) => <button key={card.id} type="button" disabled={!myTurn || !legal.has(card.id)}
          data-playable={myTurn && legal.has(card.id)} data-illegal={myTurn && !legal.has(card.id)}
          style={{ width: cardW, marginLeft: index === 0 ? 0 : step - cardW, zIndex: index + 1 }}
          aria-label={`Play ${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}`} onClick={() => onPlay(card.id)}>
          <Face card={card} />
        </button>)}
        {!view.hand.length && <p className="bhabhi-no-cards">{me.out ? t("got_away") : t("waiting_for", { name: "" })}</p>}
      </div>
    </footer>

    <dialog ref={rulesDialog} className="bhabhi-rules-dialog" aria-labelledby="bhabhi-rules-title" onClose={() => setShowRules(false)}>
      <div className="bhabhi-dialog-heading"><h2 id="bhabhi-rules-title">{t("how_to_play")}</h2><button type="button" onClick={() => setShowRules(false)} className="bhabhi-text-button">{t("back")} ×</button></div>
      <BhabhiRules expanded />
    </dialog>

    {view.phase === "game-over" && view.loser !== null && <div className="bhabhi-result-screen" role="dialog" aria-label="Round result">
      <div className="slide-up">
        <p className="bhabhi-result-eyebrow">{view.seriesDone ? t("series_complete") : t("round_complete")}</p>
        <h2>{view.seriesDone
          ? view.players.filter((player) => (view.series?.losses[player.id] ?? 0) === Math.min(...view.series!.losses)).some((player) => player.id === view.viewer)
            ? "You won the series!"
            : "Series lost"
          : view.loser === view.viewer ? "Last one with cards" : "You got away!"}</h2>
        <p className="bhabhi-result-copy">
          {view.seriesDone
            ? `${view.players[view.loser].name} collected enough Bhabhis to end the series.`
            : `${view.players[view.loser].name} is the Bhabhi this round.`}
        </p>
        <ul className="bhabhi-result-list">{view.players.map((player) => (
          <li key={player.id}>
            <span>{player.name}{player.id === view.viewer ? " (you)" : ""}</span>
            <span data-lost={player.id === view.loser}>
              {view.series
                ? `${player.id === view.loser ? `${player.handCount} cards left · ` : ""}${view.series.losses[player.id]} Bhabhi${view.series.losses[player.id] === 1 ? "" : "s"}`
                : player.id === view.loser ? `${player.handCount} cards left` : "Safe"}
            </span>
          </li>
        ))}</ul>
        {onRematch ? (
          <button type="button" onClick={onRematch} className="bhabhi-primary">
            {view.seriesDone ? t("new_series") : view.series ? t("next_round") : t("play_again")}
          </button>
        ) : (
          <p className="bhabhi-result-copy">{t("waiting_host")}</p>
        )}
        <button type="button" onClick={onQuit} className="bhabhi-text-button bhabhi-result-back">{t("back_menu")}</button>
      </div>
    </div>}
    </div>
  );
}