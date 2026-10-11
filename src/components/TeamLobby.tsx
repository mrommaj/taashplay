import { TEAM_SEATS, type TeamId } from "../game/lobby";
import { cn } from "../utils/cn";

interface Props {
  names: string[];
  seatsTaken: boolean[];
  viewer: number;
  started?: boolean;
  pendingTeam?: TeamId | null;
  onChooseTeam?: (team: TeamId) => void;
}

export default function TeamLobby({
  names, seatsTaken, viewer, started = false, pendingTeam = null, onChooseTeam,
}: Props) {
  return (
    <section aria-label="Room teams" className="mt-5">
      <h3 className="text-lg font-black">
        {onChooseTeam && viewer < 0 ? "Choose your team" : "Your teams"}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-emerald-200/80">
        {onChooseTeam
          ? started
            ? "Choose an available place to take over a bot. Teams are then locked."
            : "Join the host as their partner, or play on the other team."
          : "Friends choose their own team. Each team has two places."}
      </p>

      <div className="mt-3 grid gap-3">
        {([0, 1] as const).map((team) => {
          const seats = TEAM_SEATS[team];
          const count = seats.filter((seat) => seatsTaken[seat]).length;
          const selected = viewer >= 0 && viewer % 2 === team;
          const full = count === 2 && !selected;
          const locked = started && viewer >= 0;
          const letter = team === 0 ? "A" : "B";
          const content = (
            <>
              <span className="flex items-center justify-between gap-3">
                <span className={cn("text-sm font-black", team === 0 ? "text-sky-300" : "text-rose-300")}>
                  Team {letter}
                </span>
                <span className="text-xs text-white/65">{count} / 2 players</span>
              </span>
              <span className="mt-0.5 block text-xs text-emerald-100/75">
                {team === 0 ? "With the host" : "Against the host"}
              </span>
              <span className="mt-3 grid grid-cols-2 gap-3">
                {seats.map((seat) => (
                  <span key={seat} className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {seatsTaken[seat] ? names[seat] : "Open place"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-white/55">
                      {seat === 0 ? (viewer === 0 ? "You, host" : "Host")
                        : seat === viewer ? "You"
                        : seatsTaken[seat] ? "Joined"
                        : started ? "Bot playing" : "Bot if left empty"}
                    </span>
                  </span>
                ))}
              </span>
              {onChooseTeam && (
                <span className={cn(
                  "mt-3 block border-t pt-2.5 text-sm font-bold",
                  selected ? "border-yellow-300/30 text-yellow-200" : "border-white/10 text-white",
                )}>
                  {pendingTeam === team ? "Confirming team..."
                    : selected ? `You are on Team ${letter}`
                    : full ? "Team full"
                    : locked ? "Teams locked"
                    : team === 0 ? "Join as host's partner" : "Join the other team"}
                </span>
              )}
            </>
          );

          return onChooseTeam ? (
            <button
              key={team}
              type="button"
              aria-pressed={selected}
              disabled={pendingTeam !== null || full || locked}
              onClick={() => onChooseTeam(team)}
              className={cn(
                "w-full rounded-2xl border-2 p-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-300",
                selected ? "border-yellow-300 bg-emerald-800/55"
                  : team === 0 ? "border-sky-500/40 bg-sky-950/40 hover:border-sky-300"
                  : "border-rose-500/40 bg-rose-950/40 hover:border-rose-300",
                full ? "cursor-not-allowed opacity-55" : "cursor-pointer",
                pendingTeam !== null && "cursor-wait",
              )}
            >
              {content}
            </button>
          ) : (
            <div key={team} className={cn("border-l-2 py-2 pl-3", team === 0 ? "border-sky-400" : "border-rose-400")}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}