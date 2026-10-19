import "server-only";

import { after } from "next/server";

import {
  LINE_HELP_INTENT,
  type LineReactiveIntent,
  type LineReactiveMonotonicClock,
  type LineReactiveOperationalOutcome,
  type LineReactiveWorkItem,
} from "../domain/line-reactive-types";
import {
  executeLineReactiveAppointment,
  isLineReactiveWorkItemLocallyEligible,
} from "../services/line-reactive-appointment-service";
import { executeLineReactiveHelp } from "../services/line-reactive-help-service";

export const MAX_LINE_REACTIVE_WORKERS_PER_REQUEST = 4;

/** Aggregate counts only: no event, user, token, text or reply content. */
export type LineReactiveReplySummary = Partial<
  Record<LineReactiveIntent, Partial<Record<LineReactiveOperationalOutcome, number>>>
>;

export type LineReactiveSchedulerDependencies = {
  readonly registerAfter?: (callback: () => Promise<void>) => void;
  readonly execute?: (
    workItem: LineReactiveWorkItem,
    dependencies: { readonly monotonicNow: LineReactiveMonotonicClock },
  ) => Promise<LineReactiveOperationalOutcome>;
  readonly monotonicNow?: LineReactiveMonotonicClock;
  readonly logSummary?: (summary: LineReactiveReplySummary) => void;
};

function executeLineReactiveWorkItem(
  workItem: LineReactiveWorkItem,
  dependencies: { readonly monotonicNow: LineReactiveMonotonicClock },
): Promise<LineReactiveOperationalOutcome> {
  return workItem.intent === LINE_HELP_INTENT
    ? executeLineReactiveHelp(workItem, dependencies)
    : executeLineReactiveAppointment(workItem, dependencies);
}

async function runLineReactiveWorkers(
  workItems: readonly LineReactiveWorkItem[],
  dependencies: LineReactiveSchedulerDependencies,
): Promise<void> {
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const execute = dependencies.execute ?? executeLineReactiveWorkItem;
  const summary: LineReactiveReplySummary = {};
  const record = (intent: LineReactiveIntent, outcome: LineReactiveOperationalOutcome): void => {
    const counts = summary[intent] ?? {};
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    summary[intent] = counts;
  };
  let nextIndex = 0;
  const workerCount = Math.min(MAX_LINE_REACTIVE_WORKERS_PER_REQUEST, workItems.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < workItems.length) {
      const workItem = workItems[nextIndex];
      nextIndex += 1;
      if (!workItem) {
        continue;
      }
      try {
        if (!isLineReactiveWorkItemLocallyEligible(workItem, monotonicNow)) {
          record(workItem.intent, "EXPIRED_BEFORE_QUERY");
          continue;
        }
        record(workItem.intent, await execute(workItem, { monotonicNow }));
      } catch {
        // A transient job is isolated; it has no durable retry state.
        record(workItem.intent, "INFRASTRUCTURE_FAILURE");
      }
    }
  });

  await Promise.all(workers);
  (dependencies.logSummary ?? ((value) => console.info("line_reactive_reply_summary", value)))(summary);
}

export function scheduleLineReactiveWork(
  workItems: readonly LineReactiveWorkItem[],
  dependencies: LineReactiveSchedulerDependencies = {},
): void {
  if (workItems.length === 0) {
    return;
  }

  const registerAfter = dependencies.registerAfter ?? after;
  try {
    registerAfter(async () => {
      try {
        await runLineReactiveWorkers(workItems, dependencies);
      } catch {
        // Post-response failures do not change the durable webhook receipt.
      }
    });
  } catch {
    // Durable acceptance remains successful when transient scheduling fails.
  }
}
