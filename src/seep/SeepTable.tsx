import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SUIT_NAME, SUIT_SYMBOL, isRed, rankLabel, teamOf, type Card } from "../game/engine";
import { cn } from "../utils/cn";
import { sfx } from "../game/sound";
import { availableSeepMoves, captureSuggestion, itemCards, previewSeepMove, seepValue, type SeepAction, type SeepMove, type SeepView } from "./engine";
import SeepRules from "./SeepRules";

function CardFace({ card }: { card: Card }) {
  return <span className={cn("relative flex aspect-[5/7] w-full items-center justify-center rounded-lg bg-white font-serif", isRed(card.suit) ? "text-red-600" : "text-slate-900")}>
    <span className="absolute left-1.5 top-1 font-sans text-sm font-bold leading-none">{rankLabel(card.rank)}</span>
    <span className="mt-2 text-2xl">{SUIT_SYMBOL[card.suit]}</span>
    <span className="absolute bottom-1 right-1.5 font-sans text-[9px] text-slate-500">{seepValue(card)}</span>
  </span>;
}

interface Props {
  view: SeepView;
  onAction: (action: SeepAction) => void;
  onQuit: () => void;
  onNext?: () => void;
  muted: boolean;
  onToggleMute: () => void;
  roomCode?: string;
  voiceControls?: ReactNode;
  connectionNote?: string;
}

export default function SeepTable({ view, onAction, onQuit, onNext, muted, onToggleMute, roomCode, voiceControls, connectionNote }: Props) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<string[]>([]);
  const [houseValue, setHouseValue] = useState(9);
  const [error, setError] = useState("");
  const [showRules, setShowRules] = useState(false);
  const previous = useRef<SeepView | null>(null);
  const mine = teamOf(view.viewer);
  const other = (1 - mine) as 0 | 1;
  const myTurn = view.turn === view.viewer && (view.phase === "opening" || view.phase === "playing");
  const ending = view.phase === "deal-over" || view.phase === "match-over";
  const moves = useMemo(() => availableSeepMoves(view), [view]);
  const legalCards = new Set(moves.map((move) => move.cardId));
  const handCard = view.hand.find((card) => card.id === selectedCard);

  useEffect(() => {
    setSelectedCard(null); setSelectedFloor([]); setError("");
    const before = previous.current;
    previous.current = view;
    if (!before || before.handNumber !== view.handNumber) { sfx.deal(); return; }
    if (view.revision === before.revision) return;
    if (view.result && !before.result) {
      const winner = view.result.baaziWinner ?? view.result.winner;
      if (winner === mine) sfx.handWin(); else if (winner !== null) sfx.handLose();
    } else if (view.lastMove?.sweep && before.movesPlayed !== view.movesPlayed) sfx.kot();
    else if (before.movesPlayed !== view.movesPlayed) sfx.playCard();
    if (view.turn === view.viewer && before.turn !== view.viewer && !ending) sfx.yourTurn();
  }, [view.revision, view.handNumber, view.viewer]);

  const selectCard = (card: Card) => {
    setSelectedCard(card.id); setError("");
    const capture = moves.find((move) => move.cardId === card.id && move.kind === "capture");
    const build = moves.find((move) => move.cardId === card.id && move.kind === "build");
    setSelectedFloor(capture?.floorIds ?? build?.floorIds ?? []);
    setHouseValue(view.phase === "opening" ? view.bid! : build?.kind === "build" ? build.value : 9);
  };
  const submit = (kind: SeepMove["kind"]) => {
    if (!selectedCard) return;
    const move: SeepMove = kind === "build"
      ? { kind, cardId: selectedCard, floorIds: selectedFloor, value: houseValue }
      : { kind, cardId: selectedCard, floorIds: kind === "drop" ? [] : selectedFloor };
    const result = previewSeepMove(view, move);
    if (!result.ok) { setError(result.error); return; }
    setError(""); onAction(move);
  };
  const useBuildSuggestion = () => {
    const move = moves.find((candidate) => candidate.cardId === selectedCard && candidate.kind === "build" && candidate.value === houseValue);
    if (move) { setSelectedFloor(move.floorIds); setError(""); }
    else setError(`No suggested ${houseValue}-house for this card. Select floor cards for your own build or choose another value.`);
  };

  return <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col text-white">
    <header className="flex items-center justify-between gap-3 border-b border-emerald-800 px-4 py-2">
      <button type="button" onClick={onQuit} className="min-h-11 text-sm text-emerald-200">{"< Quit"}</button>
      <div className="text-center"><h1 className="text-2xl font-black tracking-wide">SEEP</h1><p className="text-[10px] text-emerald-200/75">{roomCode ? `Room ${roomCode}` : `Deal ${view.handNumber}`}</p></div>
      <button type="button" onClick={onToggleMute} aria-pressed={!muted} className="min-h-11 text-xs text-emerald-200">Sound {muted ? "off" : "on"}</button>
    </header>
    {voiceControls && <div className="relative z-30">{voiceControls}</div>}
    {connectionNote && <p role="status" className="px-3 py-2 text-center text-xs text-amber-200">{connectionNote}</p>}
    <div className="flex items-center justify-between gap-4 border-b border-emerald-800 px-4 py-3">
      <div><p className="text-[11px] text-sky-300">Your team</p><p className="text-2xl font-black">{view.points[mine]} <span className="text-xs font-normal text-emerald-200">pts</span></p></div>
      <div className="text-center text-[10px] leading-relaxed text-emerald-200/80"><p>{view.lead === 0 ? "Baazi starts level" : `${(view.lead > 0 ? 0 : 1) === mine ? "You" : "They"} lead by ${Math.abs(view.lead)}`}</p><p>100-point lead wins</p></div>
      <div className="text-right"><p className="text-[11px] text-rose-300">Other team</p><p className="text-2xl font-black">{view.points[other]} <span className="text-xs font-normal text-emerald-200">pts</span></p></div>
    </div>
    <div className="grid grid-cols-4 gap-2 px-3 py-3">
      {view.players.map((player) => <div key={player.id} className={cn("min-w-0 border-b-2 pb-2 text-center", view.turn === player.id && !ending ? "border-yellow-300" : "border-transparent")}>
        <p className={cn("truncate text-xs font-bold", teamOf(player.id) === mine ? "text-sky-200" : "text-rose-200")}>{player.id === view.viewer ? "You" : player.name}</p>
        <p className="mt-1 text-[9px] text-emerald-200/65">{player.handCount} cards{player.isBot ? " / bot" : player.id === (view.viewer + 2) % 4 ? " / partner" : ""}</p>
      </div>)}
    </div>

    <main className="flex-1 px-3">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold">The floor</h2><button type="button" onClick={() => setShowRules(!showRules)} className="min-h-10 text-xs text-emerald-200 underline underline-offset-2">{showRules ? "Close rules" : "Rules"}</button></div>
      {showRules && <div className="mb-4"><SeepRules expanded /></div>}
      {view.phase === "bid" ? <div className="py-8 text-center text-sm text-emerald-200">Four floor cards stay hidden until the bid.</div>
        : <div className="grid max-h-[45dvh] min-h-[150px] grid-cols-4 content-start gap-2 overflow-y-auto rounded-2xl bg-emerald-800/25 p-2 sm:grid-cols-6">
          {view.floor.map((item) => <div key={item.id} className={item.kind === "house" ? "col-span-2" : ""}>
            <button type="button" disabled={!myTurn || !selectedCard} aria-pressed={selectedFloor.includes(item.id)}
              aria-label={item.kind === "house" ? `Select ${item.value} house` : `Select ${rankLabel(item.groups[0][0].rank)} of ${SUIT_NAME[item.groups[0][0].suit]}`}
              onClick={() => { setError(""); setSelectedFloor((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]); }}
              className={cn("block w-full rounded-lg border-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-200", selectedFloor.includes(item.id) ? "border-yellow-300 ring-1 ring-yellow-300" : "border-transparent")}>
              {item.kind === "loose" ? <CardFace card={item.groups[0][0]} /> : <span className="flex min-h-[106px] flex-col justify-center rounded-lg border border-emerald-500/70 bg-emerald-950/80 px-3 py-2">
                <span className="text-xl font-black text-yellow-200">House {item.value}</span>
                <span className="mt-1 text-[10px] text-emerald-200">{item.groups.length > 1 ? "Cemented" : "Single"} / {itemCards(item).length} cards</span>
                <span className="mt-1 truncate text-[10px] text-emerald-100">{item.owners.map((id) => id === view.viewer ? "You" : view.players[id].name).join(" + ")}</span>
              </span>}
            </button>
            {item.kind === "house" && <details className="text-[10px] text-emerald-200"><summary className="cursor-pointer py-2">See house cards</summary><p className="pb-2 leading-relaxed">{item.groups.map((group) => group.map((card) => `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`).join(" + ")).join(" | ")}</p></details>}
          </div>)}
          {!view.floor.length && <p className="col-span-full py-8 text-center text-sm text-emerald-200/70">Empty floor. The next player must drop a card.</p>}
        </div>}
      <p className="min-h-10 py-2 text-center text-xs leading-relaxed text-emerald-100/80" aria-live="polite">{view.message}</p>
    </main>

    <footer className="sticky bottom-0 z-10 border-t border-emerald-800 bg-emerald-950 px-3 pt-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {view.phase === "bid" && view.bidder === view.viewer ? <div className="mb-3">
        <p className="text-center text-sm font-bold text-yellow-200">Choose your bid</p>
        <p className="mt-1 text-center text-xs text-emerald-200/75">Only values in your first four cards are available.</p>
        <div className="mt-3 flex justify-center gap-2">{view.bids.map((value) => <button key={value} type="button" onClick={() => onAction({ kind: "bid", value })} className="min-h-11 min-w-12 rounded-lg bg-yellow-400 px-3 py-2 font-bold text-emerald-950">{value}</button>)}</div>
      </div> : <p className={cn("mb-2 text-center text-xs font-semibold", myTurn ? "text-yellow-200" : "text-emerald-200")}>
        {myTurn ? view.phase === "opening" ? `Bid ${view.bid}: capture, drop, or build ${view.bid}.` : "Choose a hand card, then select floor cards." : ending ? "Deal complete" : `Waiting for ${view.players[view.turn].name}`}
      </p>}
      <div className="grid max-h-[170px] grid-cols-6 gap-1.5 overflow-y-auto p-1 sm:grid-cols-8">
        {view.hand.map((card) => <button type="button" key={card.id} disabled={!myTurn || !legalCards.has(card.id)}
          aria-label={`${rankLabel(card.rank)} of ${SUIT_NAME[card.suit]}, capture value ${seepValue(card)}`}
          aria-pressed={selectedCard === card.id} onClick={() => selectCard(card)}
          className={cn("rounded-lg border-2 transition-transform focus-visible:outline-2 focus-visible:outline-yellow-200", selectedCard === card.id ? "-translate-y-0.5 border-yellow-300 ring-1 ring-yellow-300" : "border-transparent", myTurn && !legalCards.has(card.id) && "opacity-40")}>
          <CardFace card={card} />
        </button>)}
        {!view.hand.length && <p className="col-span-full py-2 text-center text-xs text-emerald-200/70">{view.phase === "bid" || view.phase === "opening" ? "Waiting for the opening move and full deal." : "All cards played."}</p>}
      </div>
      {myTurn && <>
        {handCard && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-200">
          <span>Card value: {seepValue(handCard)} / {selectedFloor.length} floor items selected</span>
          <button type="button" onClick={() => { setSelectedFloor(captureSuggestion(view, handCard.id)?.floorIds ?? []); setError(""); }} className="min-h-9 underline underline-offset-2">Auto pick</button>
        </div>}
        <div className="mt-1 flex items-center gap-2 text-xs">
          <label htmlFor="seep-house-value" className="text-emerald-200">House</label>
          <select id="seep-house-value" value={houseValue} onChange={(event) => { setHouseValue(Number(event.target.value)); setError(""); }} disabled={view.phase === "opening"}
            className="min-h-10 rounded-lg border border-emerald-700 bg-emerald-900 px-2 text-white">
            {[9, 10, 11, 12, 13].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <button type="button" disabled={!handCard} onClick={useBuildSuggestion} className="min-h-10 px-2 text-emerald-200 underline underline-offset-2 disabled:opacity-40">Suggest build</button>
          <button type="button" onClick={() => { setSelectedFloor([]); setError(""); }} className="ml-auto min-h-10 text-emerald-200">Clear</button>
        </div>
        {error && <p role="alert" className="pb-2 text-xs leading-relaxed text-amber-200">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={!handCard} onClick={() => submit("capture")} className="min-h-11 rounded-lg bg-yellow-400 py-2 text-sm font-bold text-emerald-950 disabled:opacity-40">Capture</button>
          <button type="button" disabled={!handCard} onClick={() => submit("build")} className="min-h-11 rounded-lg border border-emerald-600 py-2 text-sm font-bold disabled:opacity-40">Build house</button>
          <button type="button" disabled={!handCard} onClick={() => submit("drop")} className="min-h-11 rounded-lg border border-emerald-600 py-2 text-sm font-bold disabled:opacity-40">Drop</button>
        </div>
      </>}
    </footer>

    {ending && view.result && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-emerald-950/95 px-6 py-10 text-center">
      <div className="slide-up w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-yellow-200">{view.seriesDone ? "Series complete" : view.phase === "match-over" ? "Baazi complete" : `Deal ${view.handNumber} complete`}</p>
        <h2 className="mt-3 text-3xl font-black">{view.seriesDone && (view.baazis[mine] >= (view.seriesTarget ?? Infinity)) ? "Your team wins the series!" : view.seriesDone ? "Opponents win the series" : (view.result.baaziWinner ?? view.result.winner) === null ? "A tied deal" : (view.result.baaziWinner ?? view.result.winner) === mine ? "Your team wins!" : "The other team wins"}</h2>
        <div className="my-6 grid grid-cols-2 gap-6">
          {[mine, other].map((team) => <div key={team}><p className="text-xs text-emerald-200">{team === mine ? "Your team" : "Other team"}</p><p className="mt-2 text-4xl font-black">{view.result!.points[team]}</p><p className="mt-2 text-xs text-emerald-200/70">{view.result!.cardPoints[team]} cards + {view.result!.bonuses[team]} sweeps</p></div>)}
        </div>
        <p className="text-sm leading-relaxed text-emerald-200">{view.result.reason}</p>
        {view.phase === "deal-over" && <p className="mt-2 text-sm font-bold text-yellow-200">
          {view.lead === 0 ? "The running score is level." : `${(view.lead > 0 ? 0 : 1) === mine ? "Your team leads" : "The other team leads"} by ${Math.abs(view.lead)}.`}
        </p>}
        <p className="mt-2 text-xs text-emerald-200/70">
          Baazis: {view.baazis[mine]} - {view.baazis[other]}{view.seriesTarget ? ` (series plays to ${view.seriesTarget})` : ""}
        </p>
        {onNext ? <button type="button" onClick={onNext} className="mt-6 min-h-12 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950">{view.seriesDone ? "New series" : view.phase === "match-over" ? "Next deal" : "Next deal"}</button>
          : <p className="mt-6 text-sm text-yellow-200">Waiting for the host to deal again.</p>}
        <button type="button" onClick={onQuit} className="mt-3 min-h-11 w-full text-sm text-emerald-200">Back to menu</button>
      </div>
    </div>}
  </div>;
}