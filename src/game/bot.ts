export type BotDifficulty = "normal" | "hard";

const KEY = "taash-bot-difficulty";

export function getBotDifficulty(): BotDifficulty {
  try {
    return localStorage.getItem(KEY) === "hard" ? "hard" : "normal";
  } catch {
    return "normal";
  }
}

export function setBotDifficulty(difficulty: BotDifficulty): void {
  try { localStorage.setItem(KEY, difficulty); } catch { /* keep session */ }
}

export function randomOf<T>(items: T[]): T | null {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}
