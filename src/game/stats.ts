import { useSyncExternalStore } from "react";

export type GameKey = "rang" | "bhabhi" | "seep" | "rummy";
const KEY = "taash-stats";
const EVENT = "taash-stats-changed";

export interface GameStats {
  wins: Record<GameKey, number>;
  streakGame: GameKey | null;
  streak: number;
}

let cached: GameStats | null = null;

function load(): GameStats {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GameStats>;
      cached = {
        wins: {
          rang: p.wins?.rang ?? 0,
          bhabhi: p.wins?.bhabhi ?? 0,
          seep: p.wins?.seep ?? 0,
          rummy: p.wins?.rummy ?? 0,
        },
        streakGame: p.streakGame ?? null,
        streak: p.streak ?? 0,
      };
      return cached;
    }
  } catch { /* ignore invalid data */ }
  cached = { wins: { rang: 0, bhabhi: 0, seep: 0, rummy: 0 }, streakGame: null, streak: 0 };
  return cached;
}

function read(): GameStats {
  return load();
}

function persist(stats: GameStats): void {
  cached = stats;
  try { localStorage.setItem(KEY, JSON.stringify(stats)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Call once per result per device; true when the local viewer's team/seat won the round. */
export function recordResult(game: GameKey, wonRound: boolean): void {
  const stats = read();
  if (wonRound) {
    stats.wins[game] += 1;
    stats.streak = stats.streakGame === game ? stats.streak + 1 : 1;
    stats.streakGame = game;
  } else {
    stats.streak = 0;
    stats.streakGame = null;
  }
  persist(stats);
}

export function useStats(): GameStats {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener(EVENT, callback);
      return () => window.removeEventListener(EVENT, callback);
    },
    read,
  );
}

export function resetStats(): void {
  persist({ wins: { rang: 0, bhabhi: 0, seep: 0, rummy: 0 }, streakGame: null, streak: 0 });
}
