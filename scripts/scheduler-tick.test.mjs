import { describe, expect, it, vi } from "vitest";

import { runSchedulerTick, SCHEDULER_TICK_URL } from "./scheduler-tick.mjs";

const secret = "s".repeat(40);

function harness(response) {
  const log = vi.fn();
  const fetchImpl = vi.fn(typeof response === "function" ? response : async () => response);
  return { log, fetchImpl, run: () => runSchedulerTick({ secret, fetchImpl, log }) };
}

describe("scheduler tick script", () => {
  it("calls the loopback tick with the bearer secret and logs the aggregate summary", async () => {
    const summary = { status: "COMPLETED", durationMs: 12 };
    const { log, fetchImpl, run } = harness(new Response(JSON.stringify(summary), { status: 200 }));
    await expect(run()).resolves.toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(SCHEDULER_TICK_URL, expect.objectContaining({
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
    }));
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "OK", summary });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });

  it("treats a skipped tick as success", async () => {
    const { run } = harness(new Response(JSON.stringify({ status: "SKIPPED", reason: "LOCK_BUSY" }), { status: 200 }));
    await expect(run()).resolves.toBe(0);
  });

  it.each([404, 503])("fails on HTTP %i without echoing the body", async (status) => {
    const { log, run } = harness(new Response("private detail", { status }));
    await expect(run()).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "HTTP_ERROR", status });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private detail");
  });

  it("fails when the app is unreachable or the response is not JSON", async () => {
    const unreachable = harness(async () => { throw new Error("connect ECONNREFUSED"); });
    await expect(unreachable.run()).resolves.toBe(1);
    expect(unreachable.log).toHaveBeenCalledWith("scheduler_tick", { outcome: "UNREACHABLE" });
    const invalid = harness(new Response("<html>", { status: 200 }));
    await expect(invalid.run()).resolves.toBe(1);
  });

  it.each([undefined, "", "short"])("does not call the app when the secret is %j", async (value) => {
    const fetchImpl = vi.fn();
    const log = vi.fn();
    await expect(runSchedulerTick({ secret: value, fetchImpl, log })).resolves.toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "NOT_CONFIGURED" });
  });
});
