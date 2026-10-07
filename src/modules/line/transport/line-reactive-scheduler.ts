import "server-only";

import { after } from "next/server";

import type {
  LineReactiveMonotonicClock,
  LineReactiveWorkItem,
} from "../domain/line-reactive-types";
import {
  executeLineReactiveAppointment,
  isLineReactiveWorkItemLocallyEligible,
  type LineReactiveAppointmentDependencies,
} from "../services/line-reactive-appointment-service";

export const MAX_LINE_REACTIVE_WORKERS_PER_REQUEST = 4;

export type LineReactiveSchedulerDependencies = {
  readonly registerAfter?: (callback: () => Promise<void>) => void;
  readonly execute?: (
    workItem: LineReactiveWorkItem,
    dependencies: LineReactiveAppointmentDependencies,
  ) => Promise<unknown>;
  readonly monotonicNow?: LineReactiveMonotonicClock;
};

async function runLineReactiveWorkers(
  workItems: readonly LineReactiveWorkItem[],
  dependencies: LineReactiveSchedulerDependencies,
): Promise<void> {
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const execute = dependencies.execute ?? executeLineReactiveAppointment;
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
          continue;
        }
        await execute(workItem, { monotonicNow });
      } catch {
        // A transient job is isolated; it has no durable retry state.
      }
    }
  });

  await Promise.all(workers);
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
