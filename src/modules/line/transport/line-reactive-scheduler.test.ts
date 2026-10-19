import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LineHelpWorkItem,
  LineReactiveOperationalOutcome,
  LineReactiveWorkItem,
} from "../domain/line-reactive-types";

const mocks = vi.hoisted(() => ({
  state: { callbacks: [] as Array<() => void | Promise<void>> },
  after: vi.fn((callback: () => void | Promise<void>) => {
    mocks.state.callbacks.push(callback);
  }),
  executeLineReactiveAppointment: vi.fn(),
  executeLineReactiveHelp: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../services/line-reactive-appointment-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/line-reactive-appointment-service")>()),
  executeLineReactiveAppointment: mocks.executeLineReactiveAppointment,
}));
vi.mock("../services/line-reactive-help-service", () => ({
  executeLineReactiveHelp: mocks.executeLineReactiveHelp,
}));

import {
  MAX_LINE_REACTIVE_WORKERS_PER_REQUEST,
  scheduleLineReactiveWork,
} from "./line-reactive-scheduler";

function workItem(index: number, deadline = 45_000): LineReactiveWorkItem {
  return {
    intent: "PATIENT_NEXT_APPOINTMENT",
    webhookEventId: `event-${index}`,
    eventOccurredAt: new Date("2026-10-15T02:00:00.000Z"),
    localExecutionDeadline: deadline,
    lineUserId: `U${"a".repeat(32)}`,
    replyToken: `reply-token-${index}`,
    isRedelivery: false,
  };
}

function helpWorkItem(index: number, throttled = false): LineHelpWorkItem {
  return { ...workItem(index), intent: "HELP", throttled };
}

describe("LINE transient reactive scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.callbacks.length = 0;
  });

  it("registers no post-response work for an empty job list", () => {
    scheduleLineReactiveWork([]);

    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("runs no more than four workers and awaits every job inside after()", async () => {
    const items = Array.from({ length: 9 }, (_, index) => workItem(index));
    let active = 0;
    let maximumActive = 0;
    const started: string[] = [];
    let release: () => void = () => undefined;
    let firstWorkersStarted: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstFour = new Promise<void>((resolve) => {
      firstWorkersStarted = resolve;
    });
    const execute = vi.fn(async (item: LineReactiveWorkItem) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(item.webhookEventId);
      if (started.length === MAX_LINE_REACTIVE_WORKERS_PER_REQUEST) {
        firstWorkersStarted();
      }
      await gate;
      active -= 1;
      return "COMPLETED_EMPTY" as const;
    });

    scheduleLineReactiveWork(items, { execute, monotonicNow: () => 0, logSummary: vi.fn() });
    const afterCallback = mocks.state.callbacks[0];
    if (!afterCallback) throw new Error("Expected one after() callback");
    const completion = Promise.resolve(afterCallback());
    await firstFour;

    expect(maximumActive).toBe(4);
    expect(started).toEqual(["event-0", "event-1", "event-2", "event-3"]);
    release();
    await completion;

    expect(execute).toHaveBeenCalledTimes(items.length);
    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(started).toHaveLength(items.length);
  });

  it("contains one job failure and continues pulling later jobs", async () => {
    const items = Array.from({ length: 7 }, (_, index) => workItem(index));
    const started: string[] = [];
    const execute = vi.fn(async (item: LineReactiveWorkItem) => {
      started.push(item.webhookEventId);
      if (item.webhookEventId === "event-2") {
        throw new Error("private transient job failure");
      }
      return "COMPLETED_EMPTY" as const;
    });

    scheduleLineReactiveWork(items, { execute, monotonicNow: () => 0, logSummary: vi.fn() });
    const afterCallback = mocks.state.callbacks[0];
    if (!afterCallback) throw new Error("Expected one after() callback");

    await expect(afterCallback()).resolves.toBeUndefined();
    expect(started).toHaveLength(items.length);
    expect(execute).toHaveBeenCalledTimes(items.length);
  });

  it("skips queued work that is already locally expired", async () => {
    const execute = vi.fn().mockResolvedValue("COMPLETED_EMPTY");
    scheduleLineReactiveWork([workItem(0, 10)], {
      execute,
      monotonicNow: () => 10,
      logSummary: vi.fn(),
    });
    const afterCallback = mocks.state.callbacks[0];
    if (!afterCallback) throw new Error("Expected one after() callback");

    await expect(afterCallback()).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("dispatches each intent to its own executor and appointment work stays on the existing executor", async () => {
    mocks.executeLineReactiveAppointment.mockResolvedValue("COMPLETED_EMPTY");
    mocks.executeLineReactiveHelp.mockResolvedValue("COMPLETED_HELP");
    const appointment = workItem(0);
    const help = helpWorkItem(1, true);

    scheduleLineReactiveWork([appointment, help], { monotonicNow: () => 0, logSummary: vi.fn() });
    await mocks.state.callbacks[0]?.();

    expect(mocks.executeLineReactiveAppointment).toHaveBeenCalledOnce();
    expect(mocks.executeLineReactiveAppointment).toHaveBeenCalledWith(appointment, { monotonicNow: expect.any(Function) });
    expect(mocks.executeLineReactiveHelp).toHaveBeenCalledOnce();
    expect(mocks.executeLineReactiveHelp).toHaveBeenCalledWith(help, { monotonicNow: expect.any(Function) });
  });

  it("logs one aggregate outcome summary per intent without identifiers or content", async () => {
    const outcomes = new Map<string, LineReactiveOperationalOutcome>([
      ["event-0", "COMPLETED_WITH_APPOINTMENT"],
      ["event-1", "COMPLETED_HELP"],
      ["event-2", "THROTTLED"],
      ["event-3", "THROTTLED"],
    ]);
    const execute = vi.fn(async (item: LineReactiveWorkItem): Promise<LineReactiveOperationalOutcome> => {
      const outcome = outcomes.get(item.webhookEventId);
      if (!outcome) throw new Error("private failure detail");
      return outcome;
    });
    const logSummary = vi.fn();

    scheduleLineReactiveWork(
      [workItem(0), helpWorkItem(1), helpWorkItem(2, true), helpWorkItem(3, true), helpWorkItem(4), workItem(5, 0)],
      { execute, monotonicNow: () => 0, logSummary },
    );
    await mocks.state.callbacks[0]?.();

    expect(logSummary).toHaveBeenCalledOnce();
    const summary: unknown = logSummary.mock.calls[0]?.[0];
    expect(summary).toEqual({
      PATIENT_NEXT_APPOINTMENT: { COMPLETED_WITH_APPOINTMENT: 1, EXPIRED_BEFORE_QUERY: 1 },
      HELP: { COMPLETED_HELP: 1, THROTTLED: 2, INFRASTRUCTURE_FAILURE: 1 },
    });
    expect(JSON.stringify(summary)).not.toMatch(/event-|reply-token|U[a]{32}|private/u);
  });

  it("contains after() registration failures after durable acceptance", () => {
    expect(() => scheduleLineReactiveWork([workItem(0)], {
      registerAfter: () => {
        throw new Error("request context unavailable");
      },
    })).not.toThrow();
  });
});
