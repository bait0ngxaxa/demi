import { pathToFileURL } from "node:url";

// One notification scheduler tick against the local Next.js process (never through nginx, which blocks
// /api/internal/*). Run by deploy/systemd/demi-scheduler.service with `node --env-file=/etc/demi/demi.env`.
// Prints the route's aggregate summary only; never the secret.

export const SCHEDULER_TICK_URL = "http://127.0.0.1:3000/api/internal/scheduler/tick";
// Above maxDuration for hosts that enforce it; the self-hosted tick has its own 290 s Prisma transaction cap.
export const SCHEDULER_TICK_TIMEOUT_MS = 320_000;

const STEP_NAMES = ["medicationDrain", "appointmentDrain", "appointmentPurge", "medicationPurge"];
const STEP_COUNT_FIELDS = {
  medicationDrain: ["remainingDue", "deliveryWindowExpired", "materialized", "claimed", "providerAccepted", "retryScheduled", "suppressed", "permanentFailure", "unknownOutcome"],
  appointmentDrain: ["remainingDue", "claimed", "providerAccepted", "retryScheduled", "suppressed", "permanentFailure", "unknownOutcome"],
  appointmentPurge: ["deleted"],
  medicationPurge: ["deleted"],
};

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateCounts(value, allowedFields) {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedFields.includes(key))) return null;
  const counts = {};
  for (const [key, count] of Object.entries(value)) {
    if (!isCount(count)) return null;
    counts[key] = count;
  }
  return counts;
}

function validateStep(value, name) {
  if (!isRecord(value) || !["COMPLETED", "FAILED", "DEFERRED", "NOT_STARTED"].includes(value.status) || !isCount(value.batches)) return null;
  const isDeferred = value.status === "DEFERRED";
  const expectedKeys = isDeferred ? ["status", "deferredReason", "batches", "counts"] : ["status", "batches", "counts"];
  if (!hasExactKeys(value, expectedKeys)) return null;
  const counts = validateCounts(value.counts, STEP_COUNT_FIELDS[name]);
  if (!counts) return null;
  if (isDeferred && !["EXECUTION_BUDGET", "BATCH_LIMIT"].includes(value.deferredReason)) return null;
  return isDeferred
    ? { status: value.status, deferredReason: value.deferredReason, batches: value.batches, counts }
    : { status: value.status, batches: value.batches, counts };
}

function validateSummary(value) {
  if (!isRecord(value)) return null;
  if (value.status === "SKIPPED") {
    return hasExactKeys(value, ["status", "reason"]) && ["LOCK_BUSY", "TOO_SOON"].includes(value.reason)
      ? { kind: "SKIPPED", reason: value.reason }
      : null;
  }
  if (!["COMPLETED", "FAILED", "DEFERRED"].includes(value.status) || !hasExactKeys(value, ["status", "durationMs", "steps"]) || !isCount(value.durationMs)) return null;
  if (!isRecord(value.steps) || !hasExactKeys(value.steps, STEP_NAMES)) return null;

  const steps = {};
  for (const name of STEP_NAMES) {
    const step = validateStep(value.steps[name], name);
    if (!step) return null;
    steps[name] = step;
  }

  const failed = Object.values(steps).some(({ status }) => status === "FAILED" || status === "NOT_STARTED");
  const deferred = Object.values(steps).some(({ status }) => status === "DEFERRED");
  if (value.status === "FAILED" && !failed) return null;
  if (value.status === "DEFERRED" && !deferred) return null;
  if (value.status === "COMPLETED" && !failed && !deferred) {
    return { kind: "COMPLETED", summary: { status: value.status, durationMs: value.durationMs, steps } };
  }
  if (failed) return { kind: "FAILED", summary: { status: value.status, durationMs: value.durationMs, steps } };
  if (deferred) return { kind: "DEFERRED", summary: { status: value.status, durationMs: value.durationMs, steps } };
  return null;
}

export async function runSchedulerTick({
  secret = process.env.DEMI_SCHEDULER_SECRET,
  fetchImpl = fetch,
  log = console.log,
  url = SCHEDULER_TICK_URL,
  timeoutMs = SCHEDULER_TICK_TIMEOUT_MS,
} = {}) {
  if (!secret || secret.trim().length < 32) {
    log("scheduler_tick", { outcome: "NOT_CONFIGURED" });
    return 1;
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    log("scheduler_tick", { outcome: "UNREACHABLE" });
    return 1;
  }
  if (response.status !== 200) {
    // 404: secret mismatch or unset on the server; 503: tick failed. The body is not echoed.
    log("scheduler_tick", { outcome: "HTTP_ERROR", status: response.status });
    return 1;
  }
  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    log("scheduler_tick", { outcome: "INVALID_RESPONSE" });
    return 1;
  }
  const result = validateSummary(responseBody);
  if (!result) {
    log("scheduler_tick", { outcome: "INVALID_RESPONSE" });
    return 1;
  }
  if (result.kind === "SKIPPED") {
    log("scheduler_tick", { outcome: "SKIPPED", reason: result.reason });
    return 0;
  }
  if (result.kind === "COMPLETED") {
    log("scheduler_tick", { outcome: "OK", summary: result.summary });
    return 0;
  }
  log("scheduler_tick", { outcome: result.kind, summary: result.summary });
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runSchedulerTick({ log: (event, details) => console.log(event, JSON.stringify(details)) });
}
