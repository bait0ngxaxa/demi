import Link from "next/link";

import {
  ROUND_SUMMARY_STEP,
  type RoundCompletionFact,
  type RoundStepState,
  type RoundStepStatus,
} from "../domain/round-steps";
import { formatRoundDate, roundLockedLabel, roundSkipDescription, roundStepStatusLabel } from "./round-labels";

type StepCode = RoundStepState["code"] | typeof ROUND_SUMMARY_STEP;

type RoundStepTimelineProps = {
  steps: readonly RoundStepState[];
  roundNumber: number;
  currentStep?: StepCode;
  completion: RoundCompletionFact | null;
  locked: boolean;
  hrefForStep?: (code: StepCode) => string;
};

function StateIcon({ status }: { status: RoundStepStatus }): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {status === "DONE" ? <path d="m5 12 4 4L19 6" /> : status === "SKIPPED" ? <path d="M5 12h14" /> : status === "LOCKED" ? (
        <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
      ) : <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}

export function RoundStepTimeline({
  steps, roundNumber, currentStep, completion, locked, hrefForStep,
}: RoundStepTimelineProps): React.JSX.Element {
  const summaryStatus: RoundStepStatus = completion ? "DONE" : locked ? "LOCKED" : "TODO";
  const nodes = [
    ...steps.map((step) => ({
      code: step.code,
      label: step.label,
      status: step.status,
      statusLabel: roundStepStatusLabel(step),
      meta: step.status === "DONE"
        ? `${formatRoundDate(step.evidence?.at ?? null)}${step.evidence?.byDisplayName != null ? ` · ${step.evidence.byDisplayName}` : ""}`
        : step.status === "SKIPPED"
          ? `เหตุผลที่ข้าม: ${roundSkipDescription(step) ?? "ไม่ระบุเหตุผล"} · ${formatRoundDate(step.skip?.at ?? null)}`
          : step.status === "LOCKED" ? roundLockedLabel(roundNumber) : "ยังไม่ได้บันทึก",
    })),
    {
      code: ROUND_SUMMARY_STEP,
      label: `สรุปและจบบริการครั้งที่ ${roundNumber}`,
      status: summaryStatus,
      statusLabel: completion ? "บันทึกแล้ว" : locked ? "ยังเปิดไม่ได้" : "ยังไม่ได้บันทึก",
      meta: completion
        ? `${formatRoundDate(completion.completedAt)}${completion.completedByDisplayName != null ? ` · ${completion.completedByDisplayName}` : ""}`
        : locked ? roundLockedLabel(roundNumber) : "ยังไม่ได้บันทึก",
    },
  ];

  return (
    <ol aria-label="ขั้นตอนของครั้งนี้" className="min-w-0">
      {nodes.map((node, index) => {
        const resolved = node.status === "DONE" || node.status === "SKIPPED";
        const current = node.code === currentStep;
        const className = `relative flex min-h-11 min-w-0 gap-3 rounded-control p-2 text-sm ${current ? "bg-brand-soft ring-1 ring-brand" : ""}`;
        const content = (
          <>
            <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface font-semibold ${resolved ? "border-brand text-brand-strong" : "border-border-strong text-text"}`}>
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 break-words pb-3">
              <span className="block font-semibold text-text">{node.label}</span>
              <span className={`mt-1 flex items-center gap-1 ${node.status === "DONE" ? "text-success" : node.status === "SKIPPED" ? "text-warning" : "text-text-muted"}`}>
                <StateIcon status={node.status} />{node.statusLabel}
              </span>
              <span className="mt-1 block text-xs leading-5 text-text-subtle">{node.meta}</span>
            </span>
          </>
        );

        return (
          <li className="relative" key={node.code}>
            {index < nodes.length - 1 ? (
              <span aria-hidden="true" className={`pointer-events-none absolute -bottom-2 left-6 top-10 z-10 w-px ${resolved ? "bg-brand" : "bg-border"}`} />
            ) : null}
            {hrefForStep ? (
              <Link aria-current={current ? "step" : undefined} className={`${className} hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2`} href={hrefForStep(node.code)}>
                {content}
              </Link>
            ) : <div className={className}>{content}</div>}
          </li>
        );
      })}
    </ol>
  );
}
