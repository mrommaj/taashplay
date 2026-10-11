import GameMenu from "../components/GameMenu";
import { useT } from "../game/i18n";
import BhabhiRules from "./BhabhiRules";

export type BhabhiMenuAction = {
  kind: "bots" | "host" | "join";
  name: string;
  seriesTarget: number | null;
  players?: number;
  code?: string;
};

interface Props {
  onAction: (action: BhabhiMenuAction) => void;
  onBack: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

void 0;

export default function BhabhiMenu({ onAction, onBack, muted, onToggleMute }: Props) {
  const t = useT();
  return (
    <GameMenu
      title="BHABHI"
      subtitle={t("thulla") + " · Get away"}
      seriesOptions={[
        { label: t("quick_round"), value: null },
        { label: t("best_3"), value: 2 },
        { label: t("best_5"), value: 3 },
      ]}
      onBack={onBack}
      onAction={(action) => onAction(action.kind === "bots" || action.kind === "host" || action.kind === "join"
        ? { ...action }
        : action)}
      howToPlay={<BhabhiRules />}
      muted={muted}
      onToggleMute={onToggleMute}
    />
  );
}
