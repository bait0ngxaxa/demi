import { pathToFileURL } from "node:url";

// One notification scheduler tick against the local Next.js process (never through nginx, which blocks
// /api/internal/*). Run by deploy/systemd/demi-scheduler.service with `node --env-file=/etc/demi/demi.env`.
// Prints the route's aggregate summary only; never the secret.

export const SCHEDULER_TICK_URL = "http://127.0.0.1:3000/api/internal/scheduler/tick";
// Above the route's maxDuration (300 s) so the route, not this client, decides the outcome.
export const SCHEDULER_TICK_TIMEOUT_MS = 320_000;

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
  let summary;
  try {
    summary = await response.json();
  } catch {
    log("scheduler_tick", { outcome: "INVALID_RESPONSE" });
    return 1;
  }
  log("scheduler_tick", { outcome: "OK", summary });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runSchedulerTick({ log: (event, details) => console.log(event, JSON.stringify(details)) });
}
