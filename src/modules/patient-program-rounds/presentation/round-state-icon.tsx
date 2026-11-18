import type { RoundStepStatus } from "../domain/round-steps";

export function RoundStateIcon({ status }: { status: RoundStepStatus }): React.JSX.Element {
  return (
    <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {status === "DONE" ? <path d="m5 12 4 4L19 6" /> : status === "SKIPPED" ? <path d="M5 12h14" /> : status === "LOCKED" ? (
        <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
      ) : <circle cx="12" cy="12" r="7" />}
    </svg>
  );
}
