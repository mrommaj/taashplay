import type { RoomVoiceChat } from "../game/useRoomVoice";

export default function VoiceChatControls({ voice, compact = false }: { voice: RoomVoiceChat; compact?: boolean }) {
  const { state, join, toggleMic, leave, resumeAudio } = voice;
  const label = state.requesting ? "Allow microphone..."
    : state.joined ? state.muted ? "Unmute mic" : "Mute mic" : "Join voice";
  const note = state.joined
    ? state.muted ? "Mic muted; still listening"
      : state.others === 0 ? "Waiting for others to join"
      : `${state.connections}/${state.others} connected`
    : "Chat with all room players";

  return (
    <div className={compact
      ? "shrink-0 border-b border-emerald-800 bg-emerald-950/90 px-3 py-1"
      : "mt-3 border-t border-emerald-800 py-2"}>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <button
          type="button"
          onClick={state.joined ? toggleMic : join}
          disabled={!state.ready || state.requesting || !!state.unavailable}
          aria-label={state.joined ? state.muted ? "Unmute your microphone" : "Mute your microphone" : "Join voice chat with all players"}
          aria-pressed={state.joined && !state.muted}
          className="flex min-h-11 shrink-0 items-center gap-2 text-xs font-bold text-emerald-100 hover:text-white focus-visible:outline-2 focus-visible:outline-yellow-300 disabled:opacity-50"
        >
          <svg width="17" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
            {(!state.joined || state.muted) && <path d="m3 3 18 18" />}
          </svg>
          {state.unavailable ? "Voice unavailable" : label}
        </button>
        <span className="min-w-0 text-[10px] text-emerald-200/70" role="status">{state.requesting ? "Accept the browser prompt" : note}</span>
        {(state.joined || state.requesting) && (
          <button type="button" onClick={leave} className="min-h-11 text-xs text-emerald-200 underline underline-offset-2 hover:text-white">
            {state.requesting ? "Cancel" : "Leave voice"}
          </button>
        )}
      </div>
      {state.playbackBlocked && (
        <button type="button" onClick={resumeAudio} className="mb-1 min-h-11 text-xs font-bold text-yellow-200 underline underline-offset-2">
          Tap to hear players
        </button>
      )}
      {(state.error || state.unavailable) && (
        <p role="alert" className="pb-2 text-xs leading-relaxed text-amber-200">{state.error || state.unavailable}</p>
      )}
    </div>
  );
}