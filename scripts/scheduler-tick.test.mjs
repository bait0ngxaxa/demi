import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { runSchedulerTick, SCHEDULER_TICK_URL } from "./scheduler-tick.mjs";

const secret = "s".repeat(40);
const stepNames = ["medicationDrain", "appointmentDrain", "appointmentPurge", "medicationPurge"];

function completedSummary() {
  return {
    status: "COMPLETED",
    durationMs: 12,
    steps: Object.fromEntries(stepNames.map((name) => [name, {
      status: "COMPLETED",
      batches: 1,
      counts: name.endsWith("Purge") ? { deleted: 0 } : { claimed: 0 },
    }])),
  };
}

function harness(response) {
  const log = vi.fn();
  const fetchImpl = vi.fn(typeof response === "function" ? response : async () => response);
  return { log, fetchImpl, run: () => runSchedulerTick({ secret, fetchImpl, log }) };
}

function runCli({ status = 200, body }) {
  const scriptPath = fileURLToPath(new URL("./scheduler-tick.mjs", import.meta.url));
  const scriptUrl = pathToFileURL(scriptPath).href;
  const source = [
    "globalThis.fetch = async () => new Response(process.env.DEMI_SCHEDULER_FIXTURE, { status: Number(process.env.DEMI_SCHEDULER_STATUS) });",
    "process.argv[1] = process.env.DEMI_SCHEDULER_SCRIPT;",
    "await import(process.env.DEMI_SCHEDULER_SCRIPT_URL);",
  ].join("\n");
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8",
    env: {
      ...process.env,
      DEMI_SCHEDULER_SECRET: secret,
      DEMI_SCHEDULER_FIXTURE: typeof body === "string" ? body : JSON.stringify(body),
      DEMI_SCHEDULER_STATUS: String(status),
      DEMI_SCHEDULER_SCRIPT: scriptPath,
      DEMI_SCHEDULER_SCRIPT_URL: scriptUrl,
    },
  });
}

describe("scheduler tick script", () => {
  it("calls the loopback tick and logs only the aggregate result", async () => {
    const summary = completedSummary();
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

  it.each(["LOCK_BUSY", "TOO_SOON"]) ("treats the expected %s skip as successful", async (reason) => {
    const { log, run } = harness(new Response(JSON.stringify({ status: "SKIPPED", reason }), { status: 200 }));
    await expect(run()).resolves.toBe(0);
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "SKIPPED", reason });
  });

  it("fails on HTTP 200 when any step failed even if the top-level status says COMPLETED", async () => {
    const summary = completedSummary();
    summary.steps.appointmentDrain = { status: "FAILED", batches: 0, counts: {} };
    const { log, run } = harness(new Response(JSON.stringify(summary), { status: 200 }));
    await expect(run()).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "FAILED", summary });
  });

  it("fails on explicit failure, deferred work, and unexpected NOT_STARTED steps", async () => {
    const failed = { ...completedSummary(), status: "FAILED" };
    failed.steps.medicationDrain = { status: "FAILED", batches: 0, counts: {} };
    const deferred = { ...completedSummary(), status: "DEFERRED" };
    deferred.steps.appointmentDrain = { status: "DEFERRED", deferredReason: "EXECUTION_BUDGET", batches: 0, counts: {} };
    const notStarted = completedSummary();
    notStarted.steps.appointmentDrain = { status: "NOT_STARTED", batches: 0, counts: {} };

    for (const summary of [failed, deferred, notStarted]) {
      const { run } = harness(new Response(JSON.stringify(summary), { status: 200 }));
      await expect(run()).resolves.toBe(1);
    }
  });

  it("rejects malformed and unexpected responses without echoing response content", async () => {
    const privateValue = "U12345 private patient or line detail";
    const invalidBodies = ["<html>", JSON.stringify({ status: "COMPLETED", patientId: privateValue }), JSON.stringify({ status: "COMPLETED" })];
    for (const body of invalidBodies) {
      const { log, run } = harness(new Response(body, { status: 200 }));
      await expect(run()).resolves.toBe(1);
      expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "INVALID_RESPONSE" });
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateValue);
    }
  });

  it.each([404, 503])("fails on HTTP %i without echoing the body", async (status) => {
    const { log, run } = harness(new Response("private detail", { status }));
    await expect(run()).resolves.toBe(1);
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "HTTP_ERROR", status });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private detail");
  });

  it("fails when the application is unreachable", async () => {
    const unreachable = harness(async () => { throw new Error("connect ECONNREFUSED"); });
    await expect(unreachable.run()).resolves.toBe(1);
    expect(unreachable.log).toHaveBeenCalledWith("scheduler_tick", { outcome: "UNREACHABLE" });
  });

  it("uses the actual process exit code for success, expected skips, and failed HTTP 200 results", () => {
    const successful = runCli({ body: completedSummary() });
    expect(successful.error).toBeUndefined();
    expect(successful.status).toBe(0);

    const skipped = runCli({ body: { status: "SKIPPED", reason: "LOCK_BUSY" } });
    expect(skipped.error).toBeUndefined();
    expect(skipped.status).toBe(0);

    const failedSummary = completedSummary();
    failedSummary.steps.medicationDrain = { status: "FAILED", batches: 0, counts: {} };
    const failed = runCli({ body: failedSummary });
    expect(failed.error).toBeUndefined();
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain('"outcome":"FAILED"');
    expect(failed.stdout).not.toContain(secret);
  });

  it.each([undefined, "", "short"]) ("does not call the app when the secret is %j", async (value) => {
    const fetchImpl = vi.fn();
    const log = vi.fn();
    await expect(runSchedulerTick({ secret: value, fetchImpl, log })).resolves.toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("scheduler_tick", { outcome: "NOT_CONFIGURED" });
  });
});
