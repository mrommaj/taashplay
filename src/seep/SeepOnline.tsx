import { useState } from "react";
import { isMuted, setMuted } from "../game/sound";
import TeamLobby from "../components/TeamLobby";
import VoiceChatControls from "../components/VoiceChatControls";
import SeepTable from "./SeepTable";
import { useSeepRoom } from "./useSeepRoom";

export default function SeepOnline({ role, name, code, seriesTarget, onQuit }: { role: "host" | "guest"; name: string; code?: string; seriesTarget?: number | null; onQuit: () => void }) {
  const room = useSeepRoom(role, name, code, seriesTarget ?? null);
  const [muted, setMute] = useState(isMuted);
  const [copyNote, setCopyNote] = useState("");
  const quit = () => { room.voice.leave(); onQuit(); };
  const share = async () => {
    const text = `Play Seep with me. Choose Seep > Play with friends > Join a friend's room. Code: ${room.code}`;
    const url = new URL(window.location.href); url.search = ""; url.hash = "";
    try {
      if (navigator.share) await navigator.share({ title: "Seep card game", text, url: url.href });
      else { await navigator.clipboard.writeText(`${url.href}\n${text}`); setCopyNote("Invite copied"); }
    } catch { /* Canceling share keeps the room open. */ }
  };
  if (room.view) return <SeepTable view={room.view} onAction={room.action} onQuit={quit}
    onNext={role === "host" ? room.next : undefined} muted={muted} onToggleMute={() => { setMuted(!muted); setMute(!muted); }}
    roomCode={room.code} voiceControls={<VoiceChatControls voice={room.voice} compact />}
    connectionNote={room.status === "reconnecting" ? "Restoring the room service. Keep this screen open." : room.error || undefined} />;
  const ready = !!room.lobby && room.lobby.seatsTaken.filter(Boolean).length >= 2 && !room.lobby.pendingNames.length && room.status === "ready";
  return <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-8 text-white"><div className="my-auto w-full">
    <button type="button" onClick={quit} className="mb-4 min-h-11 text-sm text-emerald-200">{"< Back"}</button>
    <h1 className="text-center text-3xl font-black">SEEP</h1>
    <p className="mt-2 text-center text-sm text-emerald-200">{role === "host" ? "Your private table" : `Joining as ${name}`}</p>
    {room.status === "connecting" && <p role="status" className="py-10 text-center text-sm text-emerald-100">{room.progress}</p>}
    {(room.status === "error" || room.status === "closed") && <div className="py-8 text-center"><p role="alert" className="text-sm text-amber-200">{room.error || "The host closed the room or the connection was lost."}</p><button type="button" onClick={room.retry} className="mt-5 min-h-12 rounded-xl bg-yellow-400 px-6 py-3 font-bold text-emerald-950">Try again</button></div>}
    {(room.status === "ready" || room.status === "reconnecting") && room.lobby && <>
      <div className="mt-6 text-center"><p className="text-xs text-emerald-200">Seep room code</p><p className="my-2 select-text font-mono text-4xl font-black tracking-[0.22em] text-yellow-200">{room.code}</p>
        {role === "host" && <div className="flex justify-center gap-6"><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(room.code); setCopyNote("Copied"); } catch { setCopyNote("Select and copy the code above."); } }} className="min-h-11 text-xs underline underline-offset-2">Copy code</button><button type="button" onClick={share} className="min-h-11 text-xs underline underline-offset-2">Share invite</button></div>}
        {copyNote && <p role="status" className="text-xs text-emerald-200">{copyNote}</p>}
      </div>
      <VoiceChatControls voice={room.voice} />
      <TeamLobby names={room.lobby.names} seatsTaken={room.lobby.seatsTaken} viewer={room.lobby.viewer}
        pendingTeam={room.pendingTeam} onChooseTeam={role === "guest" ? room.chooseTeam : undefined} />
      {room.teamError && <p role="alert" className="mt-3 text-xs text-amber-200">{room.teamError}</p>}
      <p role="status" className="mt-4 text-center text-xs text-emerald-200/80">{room.lobby.pendingNames.length ? `Choosing teams: ${room.lobby.pendingNames.join(", ")}` : "Empty seats become bots. Partners sit opposite."}</p>
      {role === "host" ? <button type="button" disabled={!ready} onClick={room.start} className="mt-4 min-h-14 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-emerald-950 disabled:opacity-40">{ready ? "Start Seep" : "Waiting for players and team choices"}</button>
        : <p className="mt-4 text-center text-sm text-yellow-200">{room.lobby.viewer < 0 ? "Choose your team to join." : "Waiting for the host to start."}</p>}
      <p className="mt-3 text-center text-xs text-emerald-200/60">Keep this screen open and awake.</p>
    </>}
  </div></main>;
}