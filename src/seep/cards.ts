import type { Card } from "../game/engine.ts";

export const seepValue = (card: Card): number => card.rank === 14 ? 1 : card.rank;
export const seepPoints = (card: Card): number => card.suit === "S" ? seepValue(card)
  : card.rank === 14 ? 1 : card.suit === "D" && card.rank === 10 ? 6 : 0;
export const totalPoints = (cards: Card[]): number => cards.reduce((sum, card) => sum + seepPoints(card), 0);

export function findSum(cards: Card[], target: number): Card[] | null {
  if (target < 0 || target > 13) return null;
  const best: (Card[] | null)[] = Array.from({ length: target + 1 }, () => null);
  best[0] = [];
  const worth = (set: Card[]) => totalPoints(set) * 100 + set.length;
  for (const card of cards) {
    const value = seepValue(card);
    for (let sum = target; sum >= value; sum--) {
      const previous = best[sum - value];
      if (!previous) continue;
      const candidate = [...previous, card];
      if (!best[sum] || worth(candidate) > worth(best[sum]!)) best[sum] = candidate;
    }
  }
  return best[target];
}

export function collectSums(cards: Card[], target: number): Card[][] {
  let remaining = [...cards];
  const groups: Card[][] = [];
  while (remaining.length) {
    const group = findSum(remaining, target);
    if (!group?.length) break;
    const used = new Set(group.map((card) => card.id));
    groups.push(group);
    remaining = remaining.filter((card) => !used.has(card.id));
  }
  return groups;
}

// Prove that selected loose cards split into non-overlapping equal-value sets.
export function partitionCards(cards: Card[], target: number): Card[][] | null {
  if (!cards.length) return [];
  if (target < 1 || target > 13 || cards.some((card) => seepValue(card) > target)
    || cards.reduce((sum, card) => sum + seepValue(card), 0) % target !== 0) return null;
  const failed = new Set<string>();
  function split(remaining: Card[]): Card[][] | null {
    if (!remaining.length) return [];
    const key = remaining.map(seepValue).join(",");
    if (failed.has(key)) return null;
    const first = remaining[0];
    const chosen = [0];
    function fill(start: number, needed: number): Card[][] | null {
      if (!needed) {
        const used = new Set(chosen);
        const rest = split(remaining.filter((_, index) => !used.has(index)));
        return rest ? [chosen.map((index) => remaining[index]), ...rest] : null;
      }
      let lastValue = -1;
      for (let i = start; i < remaining.length; i++) {
        const value = seepValue(remaining[i]);
        if (value > needed || value === lastValue) continue;
        lastValue = value;
        chosen.push(i);
        const answer = fill(i + 1, needed - value);
        if (answer) return answer;
        chosen.pop();
      }
      return null;
    }
    const answer = fill(1, target - seepValue(first));
    if (!answer) failed.add(key);
    return answer;
  }
  return split([...cards].sort((a, b) => seepValue(b) - seepValue(a)));
}