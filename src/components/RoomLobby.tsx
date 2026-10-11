import type { ReactNode } from "react";
import { useT } from "../game/i18n";
import { sfx } from "../game/sound";

export interface RoomPlayer {
  name: string;
  tag?: string;
  online?: boolean | null; // true: green, false: red, null: no dot
}

export interface RoomLobbyProps {
  title: string;
  subtitle?: string;
  ruleLine?: string; // short descriptor e.g. "Sar (2 in a row) · No trump" — shown below the code
  code: string;
  players: RoomPlayer[];
  playersCaption?: string;
  canStart: boolean;
  startDisabledLabel?: string;
  onStart: () => void;
  onBack: () => void;
  onCopy: () => void;
  onShare: () => void;
  statusNote?: string;
  voiceControls?: ReactNode;
  children?: ReactNode; // custom content between players and start
}

export default function RoomLobby({
  title, subtitle, ruleLine, code, players, playersCaption,
  canStart, startDisabledLabel, onStart, onBack, onCopy, onShare, statusNote, voiceControls, children,
}: RoomLobbyProps) {
  const t = useT();

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 py-10 text-white">
      <div className="my-auto w-full">
        <button type="button" onClick={onBack} className="mb-5 min-h-11 text-sm text-emerald-200 hover:text-white">
          {"< "}{t("back")}
        </button>

        <header className="mb-5 text-center">
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-emerald-200/75">{subtitle}</p>}
        </header>

        <button
          type="button"
          onClick={onCopy}
          className="w-full rounded-2xl bg-amber-400 p-4 text-center text-emerald-950 shadow-lg active:scale-[0.98]"
        >
          <span className="block text-[11px] font-bold uppercase tracking-widest text-emerald-950/70">{t("room_code")} / {t("tap_to_copy")}</span>
          <span className="mt-1 block select-all font-mono text-3xl font-black tracking-[0.25em]">{code}</span>
        </button>
        <button
          type="button"
          onClick={onShare}
          className="mt-2 w-full rounded-2xl border border-emerald-600 bg-emerald-800 px-4 py-3 font-bold active:scale-[0.98]"
        >
          📤 {t("share_invite")}
        </button>

        {ruleLine && (
          <p className="mt-3 text-center text-xs font-semibold text-yellow-200/90">{ruleLine}</p>
        )}

        <section className="mt-4 rounded-2xl border border-emerald-800 bg-emerald-950/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">{playersCaption ?? t("players")}</p>
          <ul className="mt-2 divide-y divide-emerald-800 text-sm">
            {players.map((player, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-2.5">
                <span className="truncate font-semibold">{player.name}</span>
                <span className="flex items-center gap-2 text-[10px] text-emerald-200/65 shrink-0">
                  {player.online != null && <span className={`h-2 w-2 rounded-full ${player.online ? "bg-green-400" : "bg-red-400"}`} />}
                  {player.tag && <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 font-bold text-yellow-200">{player.tag}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[11px] font-medium text-emerald-200/80">{statusNote}</p>
        </section>

        {children}

        {voiceControls && <div className="mt-3">{voiceControls}</div>}

        {canStart ? (
          <button
            type="button"
            onClick={() => { sfx.deal(); onStart(); }}
            className="mt-4 w-full rounded-2xl bg-yellow-400 py-3.5 text-base font-black text-emerald-950 shadow-lg active:scale-[0.98]"
          >
            {t("start_game")}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="mt-4 w-full rounded-2xl border-2 border-emerald-700 bg-emerald-950/50 py-3.5 text-base font-black text-emerald-200/60"
          >
            {startDisabledLabel ?? t("waiting_host")}
          </button>
        )}
      </div>
    </main>
  );
}
