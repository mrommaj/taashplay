import type { CSSProperties } from "react";
import type { Card } from "../game/engine";
import { SUIT_SYMBOL, isRed, rankLabel } from "../game/engine";
import { BACK_GRADIENTS, getTheme } from "../game/theme";
import { cn } from "../utils/cn";

interface Props {
  card: Card;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

const sizes = {
  sm: "w-9 h-[3.25rem] text-xs rounded-md",
  md: "w-12 h-[4.25rem] text-sm rounded-lg",
  lg: "w-14 h-20 text-base rounded-xl",
};

export default function PlayingCard({
  card,
  size = "md",
  disabled,
  dimmed,
  highlight,
  onClick,
  className,
  style,
}: Props) {
  const red = isRed(card.suit);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      style={style}
      className={cn(
        "relative shrink-0 bg-gradient-to-br from-white to-gray-100 border border-gray-300 shadow-md select-none flex flex-col items-center justify-center font-bold transition-all duration-150",
        sizes[size],
        red ? "text-red-600" : "text-gray-900",
        onClick && !disabled && "active:scale-95 hover:-translate-y-1 cursor-pointer shadow-lg",
        dimmed && "opacity-35 grayscale-[0.4] saturate-50",
        highlight && "ring-[3px] ring-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.8)] scale-105",
        className
      )}
    >
      {/* Rank — always visible on the left strip */}
      <span className="absolute top-0.5 left-1 leading-none">{rankLabel(card.rank)}</span>
      {/* Suit — under the rank so it stays visible even when cards overlap */}
      <span
        className={cn(
          "absolute left-1 leading-none",
          size === "lg" ? "top-[18px] text-lg" : "top-[16px] text-base"
        )}
      >
        {SUIT_SYMBOL[card.suit]}
      </span>
      {/* Big center suit */}
      <span className={cn("leading-none mt-3", size === "sm" ? "text-base" : "text-2xl")}>
        {SUIT_SYMBOL[card.suit]}
      </span>
      {/* Corner rank (bottom right) */}
      <span className="absolute bottom-0.5 right-1 leading-none rotate-180">
        {rankLabel(card.rank)}
      </span>
    </button>
  );
}

export function CardBack({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  const { back } = getTheme();
  return (
    <div
      className={cn(
        "shrink-0 rounded-md border shadow",
        back === "red" ? "border-red-950" : "border-blue-950",
        size === "sm" ? "w-6 h-9" : "w-10 h-14",
        className
      )}
      style={{ background: BACK_GRADIENTS[back] }}
    />
  );
}
