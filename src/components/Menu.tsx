import GameMenu from "./GameMenu";
import { useT } from "../game/i18n";

export type MenuAction =
  | { kind: "bots"; name: string; seriesTarget: number | null }
  | { kind: "host"; name: string; seriesTarget: number | null }
  | { kind: "join"; name: string; code: string };

interface Props {
  onAction: (action: MenuAction) => void;
  muted: boolean;
  onToggleMute: () => void;
}

export default function Menu({ onAction, muted, onToggleMute }: Props) {
  const t = useT();
  return (
    <GameMenu
      title="RANG"
      subtitle={t("sar_label")}
      seriesOptions={[
        { label: t("quick_game"), value: null },
        { label: t("first_to_points", { n: 5 }), value: 5 },
        { label: t("first_to_points", { n: 9 }), value: 9 },
      ]}
      onBack={() => { /* shells handle their own back */ }}
      onAction={(action) => onAction(
        action.kind === "bots"
          ? { kind: "bots", name: action.name, seriesTarget: action.seriesTarget }
          : action.kind === "host"
            ? { kind: "host", name: action.name, seriesTarget: action.seriesTarget }
            : { kind: "join", name: action.name, code: action.code ?? "" },
      )}
      howToPlay={
        <details className="mt-2 text-sm text-emerald-100/85">
          <summary className="cursor-pointer py-2 hover:text-white">How to play</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
            <li>{t("r_r1")}</li>
            <li>{t("r_r2")}</li>
            <li>{t("r_r3")}</li>
            <li>{t("r_r4")}</li>
            <li>{t("r_r5")}</li>
          </ul>
        </details>
      }
      muted={muted}
      onToggleMute={onToggleMute}
    />
  );
}
