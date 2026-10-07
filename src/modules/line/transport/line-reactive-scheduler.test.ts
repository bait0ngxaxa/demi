import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LineReactiveWorkItem } from "../domain/line-reactive-types";

const mocks = vi.hoisted(() => ({
  state: { callbacks: [] as Array<() => void | Promise<void>> },
  after: vi.fn((callback: () => void | Promise<void>) => {
    mocks.state.callbacks.push(callback);
  }),
}));

vi.mock("next/server", () => ({ after: mocks.after }));

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
    });

    scheduleLineReactiveWork(items, { execute, monotonicNow: () => 0 });
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
    });

    scheduleLineReactiveWork(items, { execute, monotonicNow: () => 0 });
    const afterCallback = mocks.state.callbacks[0];
    if (!afterCallback) throw new Error("Expected one after() callback");

    await expect(afterCallback()).resolves.toBeUndefined();
    expect(started).toHaveLength(items.length);
    expect(execute).toHaveBeenCalledTimes(items.length);
  });

  it("skips queued work that is already locally expired", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    scheduleLineReactiveWork([workItem(0, 10)], {
      execute,
      monotonicNow: () => 10,
    });
    const afterCallback = mocks.state.callbacks[0];
    if (!afterCallback) throw new Error("Expected one after() callback");

    await expect(afterCallback()).resolves.toBeUndefined();
    expect(execute).not.toHaveBeenCalled();
  });

  it("contains after() registration failures after durable acceptance", () => {
    expect(() => scheduleLineReactiveWork([workItem(0)], {
      registerAfter: () => {
        throw new Error("request context unavailable");
      },
    })).not.toThrow();
  });
});
