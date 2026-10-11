export type FeltTheme = "green" | "blue" | "red";
export type BackTheme = "blue" | "red";

export interface ThemeChoice {
  felt: FeltTheme;
  back: BackTheme;
}

const KEY = "taash-theme";

export const FELT_COLORS: Record<FeltTheme, [string, string, string]> = {
  green: ["#1f8a4c", "#14632f", "#0d4420"],
  blue: ["#1e5fa8", "#144a7d", "#0e3357"],
  red: ["#a83232", "#7d1f1f", "#521313"],
};

export const BACK_GRADIENTS: Record<BackTheme, string> = {
  blue: "repeating-linear-gradient(45deg,#1e3a8a 0,#1e3a8a 3px,#3b82f6 3px,#3b82f6 6px)",
  red: "repeating-linear-gradient(45deg,#7f1d1d 0,#7f1d1d 3px,#ef4444 3px,#ef4444 6px)",
};

export function getTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeChoice>;
      if (parsed.felt === "green" || parsed.felt === "blue" || parsed.felt === "red") {
        return { felt: parsed.felt, back: parsed.back === "red" ? "red" : "blue" };
      }
    }
  } catch { /* default */ }
  return { felt: "green", back: "blue" };
}

export function setTheme(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch { /* keep session */ }
}

export function feltGradient(felt: FeltTheme): string {
  const [a, b, c] = FELT_COLORS[felt];
  return `radial-gradient(ellipse at center, ${a} 0%, ${b} 65%, ${c} 100%)`;
}

export function bhabhiFelt(felt: FeltTheme): [string, string] {
  const mid = FELT_COLORS[felt];
  return [lighten(mid[1]), mid[1]];
}

function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 32);
  const g = Math.min(255, ((n >> 8) & 255) + 32);
  const b = Math.min(255, (n & 255) + 32);
  return `rgb(${r},${g},${b})`;
}
