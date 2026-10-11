import { useState } from "react";
import { isMuted, setMuted } from "../game/sound";
import VoiceChatControls from "../components/VoiceChatControls";
import BhabhiTable from "./BhabhiTable";
import { useBhabhiRoom } from "./useBhabhiRoom";

export default function BhabhiOnline({ role, name, code, seriesTarget, onQuit }: {
  role: "host" | "guest"; name: string; code?: string; seriesTarget?: number | null; onQuit: () => void;
}) {
  const room = useBhabhiRoom(role, name, code, seriesTarget ?? null);
  const [muted, setMute] = useState(isMuted);
  const [copyNote, setCopyNote] = useState("");
  const quit = () => { room.voice.leave(); onQuit(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopyNote("Copied"); }
    catch { setCopyNote("Select and copy the code above."); }
  };
  const share = async () => {
    const text = `Play Bhabhi with me. Choose Bhabhi > Play with friends > Join a friend's room. Code: ${room.code}`;
    const url = new URL(window.location.href); url.search = ""; url.hash = "";
    try {
      if (navigator.share) await navigator.share({ title: "Bhabhi card game", text, url: url.href });
      else { await navigator.clipboard.writeText(`${url.href}\n${text}`); setCopyNote("Invite copied"); }
    } catch { /* Canceling the native share sheet leaves the room open. */ }
  };

  if (room.view) return <BhabhiTable view={room.view} onPlay={room.play} onQuit={quit}
    onRematch={role === "host" ? room.rematch : undefined}
    muted={muted} onToggleMute={() => { setMuted(!muted); setMute(!muted); }} roomCode={room.code}
    voiceControls={<VoiceChatControls voice={room.voice} compact />}
    connectionNote={room.status === "reconnecting" ? "Restoring the room service. Keep this screen open." : room.error || undefined} />;

  const joined = room.lobby?.seats.filter((seat) => seat.occupied).length ?? 1;
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8 text-white">
      <div className="my-auto w-full">
        <button type="button" onClick={quit} className="mb-4 min-h-11 text-sm text-emerald-200">{"< Back"}</button>
        <h1 className="text-center text-3xl font-black">BHABHI</h1>
        <p className="mt-2 text-center text-sm text-emerald-200">{role === "host" ? "Your private table" : `Joining as ${name}`}</p>
        {room.status === "connecting" && <p role="status" className="py-10 text-center text-sm text-emerald-100">{room.progress}</p>}
        {(room.status === "error" || room.status === "closed") && <div className="py-8 text-center">
          <p role="alert" className="text-sm leading-relaxed text-amber-200">{room.error || "The host closed the room or the connection was lost."}</p>
          <button type="button" onClick={room.retry} className="mt-5 min-h-12 rounded-xl bg-yellow-400 px-6 py-3 font-bold text-emerald-950">Try again</button>
        </div>}
        {(room.status === "ready" || room.status === "reconnecting") && room.lobby && <>
          <div className="mt-6 text-center">
            <p className="text-xs text-emerald-200">Bhabhi room code</p>
            <p className="my-2 select-text font-mono text-4xl font-black tracking-[0.22em] text-yellow-200">{room.code}</p>
            {role === "host" && <div className="flex justify-center gap-6">
              <button type="button" onClick={copy} className="min-h-11 text-xs underline underline-offset-2">Copy code</button>
              <button type="button" onClick={share} className="min-h-11 text-xs underline underline-offset-2">Share invite</button>
            </div>}
            {copyNote && <p role="status" className="text-xs text-emerald-200">{copyNote}</p>}
          </div>
          <VoiceChatControls voice={room.voice} />
          <h2 className="mt-5 text-sm font-bold">Players ({joined}/4)</h2>
          <p className="mt-1 text-xs text-emerald-200/70">No teams. Everyone plays for themselves.</p>
          <ul className="mt-3 divide-y divide-emerald-800">
            {room.lobby.seats.map((seat) => <li key={seat.id} className="flex items-center justify-between gap-2 py-3 text-sm">
              <span className="truncate">{seat.occupied ? seat.name : "Open seat"}{seat.id === room.lobby?.viewer ? " (you)" : ""}</span>
              <span className="shrink-0 text-xs text-emerald-200/65">{seat.id === 0 ? "Host" : seat.occupied ? "Joined" : "Bot if empty"}</span>
            </li>)}
          </ul>
          {role === "host" ? <button type="button" onClick={room.start} disabled={joined < 2 || room.status !== "ready"}
            className="mt-5 min-h-14 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950 disabled:opacity-40">
            {room.status === "reconnecting" ? "Reconnecting..." : joined < 2 ? "Waiting for a friend" : `Start with ${joined} players${joined < 4 ? ` + ${4 - joined} bots` : ""}`}
          </button> : <p role="status" className="mt-5 text-center text-sm text-yellow-200">Waiting for the host to start.</p>}
          <p className="mt-3 text-center text-xs text-emerald-200/60">Keep this screen open and awake.</p>
        </>}
      </div>
    </main>
  );
}