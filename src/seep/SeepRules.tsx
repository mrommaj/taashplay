import { useT } from "../game/i18n";

export default function SeepRules({ expanded = false }: { expanded?: boolean }) {
  const t = useT();
  const rules = (
    <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-emerald-100/80">
      <li>{t("seq_r1")}</li>
      <li>{t("seq_r2")}</li>
      <li>{t("seq_r3")}</li>
      <li>{t("seq_r4")}</li>
      <li>{t("seq_r5")}</li>
      <li>{t("seq_r6")}</li>
    </ul>
  );
  return expanded ? rules : (
    <details className="text-sm text-emerald-200">
      <summary className="cursor-pointer py-3 hover:text-white">{t("how_to_play")}</summary>
      {rules}
    </details>
  );
}
