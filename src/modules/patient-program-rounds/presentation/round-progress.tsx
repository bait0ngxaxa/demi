import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";

import type { RoundSummary } from "../services/round-query-service";
import { formatRoundDate, roundLockedLabel, ROUND_STATE_LABELS } from "./round-labels";

const STATE_VARIANTS: Readonly<Record<RoundSummary["state"], StatusVariant>> = {
  COMPLETED: "success",
  IN_PROGRESS: "info",
  NOT_STARTED: "neutral",
  LOCKED: "neutral",
};

/** R1-D: shared by the staff overview and the Patient SELF view (read-only). */
export function RoundProgressSummary({ round }: { round: RoundSummary }): React.JSX.Element {
  const percent = round.totalItems === 0 ? 0 : Math.round((round.resolvedItems / round.totalItems) * 100);

  return (
    <span className="block min-w-0 space-y-2">
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="block min-w-0 text-base font-semibold text-text">{round.title}</span>
        <StatusBadge variant={STATE_VARIANTS[round.state]}>
          {round.state === "COMPLETED" ? "✓ " : round.state === "LOCKED" ? "🔒 " : ""}
          {round.state === "LOCKED" ? roundLockedLabel(round.roundNumber) : ROUND_STATE_LABELS[round.state]}
        </StatusBadge>
      </span>
      <span
        aria-label={`ความคืบหน้า ${round.resolvedItems} จาก ${round.totalItems} รายการ`}
        aria-valuemax={round.totalItems}
        aria-valuemin={0}
        aria-valuenow={round.resolvedItems}
        className="block h-2 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
      >
        <span className="block h-full rounded-full bg-action-primary" style={{ width: `${percent}%` }} />
      </span>
      <span className="block text-sm text-text-muted">
        {round.resolvedItems}/{round.totalItems} รายการ
        {round.completedAt
          ? ` · เสร็จเมื่อ ${formatRoundDate(round.completedAt)}${round.completedByDisplayName ? ` · ${round.completedByDisplayName}` : ""}`
          : ""}
      </span>
    </span>
  );
}
