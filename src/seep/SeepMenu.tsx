import GameMenu from "../components/GameMenu";
import { useT } from "../game/i18n";
import SeepRules from "./SeepRules";

export type SeepMenuAction = {
  kind: "bots" | "host" | "join";
  name: string;
  seriesTarget: number | null;
  code?: string;
};

interface Props {
  onAction: (action: SeepMenuAction) => void;
  onBack: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export default function SeepMenu({ onAction, onBack, muted, onToggleMute }: Props) {
  const t = useT();
  return (
    <GameMenu
      title="SEEP"
      subtitle="Build houses. Capture. Sweep."
      seriesOptions={[
        { label: t("quick_game"), value: null },
        { label: t("first_to_baazis", { n: 2 }), value: 2 },
        { label: t("first_to_baazis", { n: 3 }), value: 3 },
      ]}
      onBack={onBack}
      onAction={onAction}
      howToPlay={<SeepRules />}
      muted={muted}
      onToggleMute={onToggleMute}
    />
  );
}
