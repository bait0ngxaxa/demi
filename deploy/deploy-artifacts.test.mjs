import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SCHEDULER_TICK_TIMEOUT_MS, SCHEDULER_TICK_URL } from "../scripts/scheduler-tick.mjs";

const deployDirectory = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = resolve(deployDirectory, "..");
const read = (path) => readFileSync(join(deployDirectory, path), "utf8");
const { apps } = createRequire(import.meta.url)("./pm2/ecosystem.config.cjs");

describe("PM2 ecosystem", () => {
  const [app] = apps;

  it("defines exactly one fork-mode instance", () => {
    expect(apps).toHaveLength(1);
    expect(app.exec_mode).toBe("fork");
    expect(app.instances).toBe(1);
  });

  it("lets Next.js drain after() callbacks for at least 30 seconds before SIGKILL", () => {
    expect(app.kill_timeout).toBeGreaterThanOrEqual(30_000);
    expect(app.listen_timeout).toBeGreaterThan(0);
    expect(app.max_memory_restart).toMatch(/^\d+[MG]$/u);
  });

  it("binds next start to loopback on the port the scheduler tick calls", () => {
    expect(app.script).toBe(`${app.cwd}/node_modules/next/dist/bin/next`);
    expect(app.args).toBe(`start --hostname 127.0.0.1 --port ${new URL(SCHEDULER_TICK_URL).port}`);
    expect(new URL(SCHEDULER_TICK_URL).hostname).toBe("127.0.0.1");
  });

  it("loads secrets with --env-file and passes none through PM2's env", () => {
    expect(app.node_args).toBe("--env-file=/etc/demi/demi.env");
    expect(app.env).toEqual({ NODE_ENV: "production" });
    expect(app.out_file).toMatch(/^\/var\/log\/demi\//u);
    expect(app.error_file).toMatch(/^\/var\/log\/demi\//u);
  });
});

describe("systemd scheduler units", () => {
  const service = read("systemd/demi-scheduler.service");
  const timer = read("systemd/demi-scheduler.timer");

  it("runs the tick script once per activation with the env file and a bounded timeout", () => {
    expect(service).toMatch(/^Type=oneshot$/mu);
    expect(service).toMatch(/^ExecStart=\/usr\/bin\/node --env-file=\/etc\/demi\/demi\.env \/srv\/demi\/current\/scripts\/scheduler-tick\.mjs$/mu);
    const timeout = Number(service.match(/^TimeoutStartSec=(\d+)$/mu)?.[1]);
    expect(timeout * 1000).toBeGreaterThan(SCHEDULER_TICK_TIMEOUT_MS);
  });

  it("fires every minute and catches up after downtime", () => {
    expect(timer).toContain("OnCalendar=*-*-* *:*:00");
    expect(timer).toMatch(/^AccuracySec=1s$/mu);
    expect(timer).toMatch(/^Persistent=true$/mu);
    expect(timer).toMatch(/^Unit=demi-scheduler\.service$/mu);
  });
});

describe("scheduler and restore release gates", () => {
  const scheduler = read("../src/modules/notification-scheduler/services/notification-scheduler-tick-service.ts");
  const readiness = read("../src/modules/notification-scheduler/services/notification-scheduler-readiness-service.ts");
  const releaseGate = read("../docs/operations/RELEASE_GATE.md");
  const restoreRunbook = read("../docs/operations/SUPABASE_PRODUCTION.md");
  const schedulerStatusMigration = read("../prisma/migrations/20261029120000_notification_scheduler_tick_status/migration.sql");

  it("defines bounded per-queue scheduler work and a successful-tick readiness signal", () => {
    expect(scheduler).toContain("NOTIFICATION_SCHEDULER_DRAIN_BATCH_SIZE");
    expect(scheduler).toContain('"DEFERRED"');
    expect(readiness).toContain("NOTIFICATION_SCHEDULER_HEALTHY_MAX_AGE_MS");
    expect(readiness).toContain("healthy:");
    expect(readiness).toContain("lastTickStatus");
    expect(schedulerStatusMigration).toContain('ADD COLUMN "lastTickStatus"');
    expect(schedulerStatusMigration).toContain('"lastTickCompletedAt" IS NOT NULL THEN \'COMPLETED\'::"NotificationSchedulerTickStatus"');
    expect(releaseGate).toContain("DEFERRED");
    expect(releaseGate).toContain("NOT_STARTED");
    expect(releaseGate).toContain("lastTickStatus=COMPLETED");
  });

  it("requires format-specific fail-fast restore and validation evidence", () => {
    expect(restoreRunbook).toContain("ON_ERROR_STOP=1");
    expect(restoreRunbook).not.toContain("ON_ERROR_STOP=0");
    expect(restoreRunbook).toContain("pg_restore");
    expect(restoreRunbook).toContain("migrate diff");
    expect(restoreRunbook).toContain("backup-time reference");
    expect(releaseGate).toContain("backup-time reference");
  });

  it("keeps code, operational, and business acceptance as separate states", () => {
    expect(releaseGate).toContain("CODE VERIFIED");
    expect(releaseGate).toContain("OPERATIONALLY VERIFIED");
    expect(releaseGate).toContain("BUSINESS APPROVED");
  });
});

describe("nginx example", () => {
  const nginx = read("nginx/demi.conf.example");
  const limits = [...nginx.matchAll(/location ([^{]+)\{[^}]*?client_max_body_size (\d+)k;/gu)]
    .map(([, location, kib]) => ({ location: location.trim(), bytes: Number(kib) * 1024 }));

  it("keeps the global body limit at 1m and blocks /api/internal/", () => {
    expect(nginx).toMatch(/^\s*client_max_body_size 1m;/mu);
    expect(nginx).toMatch(/location \^~ \/api\/internal\/ \{\s*return 404;/u);
  });

  it("raises the body limit only for upload routes, to exactly what the validators accept", async () => {
    const jiti = (await import("jiti")).createJiti(import.meta.url, {
      alias: { "server-only": join(repositoryRoot, "node_modules", "server-only", "empty.js"), "@": join(repositoryRoot, "src") },
    });
    const { PATIENT_EVIDENCE_MAX_MULTIPART_BYTES } = await jiti.import(join(repositoryRoot, "src/modules/patient-evidence/transport/patient-evidence-upload-parser.ts"));
    const { MAX_PATIENT_IMPORT_BYTES } = await jiti.import(join(repositoryRoot, "src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts"));
    const nextConfig = (await jiti.import(join(repositoryRoot, "next.config.ts"))).default;
    // next.config.ts serverActions.bodySizeLimit ("6mb", binary megabytes) bounds the import Server Action.
    const serverActionBytes = Number.parseInt(nextConfig.experimental.serverActions.bodySizeLimit, 10) * 1024 * 1024;
    expect(limits).toEqual([
      { location: "= /app/patients/provision", bytes: serverActionBytes },
      // app/api/v1/hospital/patient-import/failed-rows/route.ts: MAX_REQUEST_BYTES = MAX_PATIENT_IMPORT_BYTES + 256 KiB.
      { location: "= /api/v1/hospital/patient-import/failed-rows", bytes: MAX_PATIENT_IMPORT_BYTES + 256 * 1024 },
      { location: "~ ^/app/patients/[^/]+/evidence/upload$", bytes: PATIENT_EVIDENCE_MAX_MULTIPART_BYTES },
      { location: "~ ^/api/hospital-content/[^/]+/images$", bytes: PATIENT_EVIDENCE_MAX_MULTIPART_BYTES },
    ]);
  });

  it("accepts only Cloudflare-originated TLS and restores the client address from Cloudflare ranges", () => {
    expect(nginx).toContain("ssl_certificate /etc/ssl/cloudflare/<PROD_HOST>.origin.pem;");
    expect(nginx).toContain("ssl_client_certificate /etc/ssl/cloudflare/origin-pull-ca.pem;");
    expect(nginx).toMatch(/^\s*ssl_verify_client on;/mu);
    expect(nginx).toContain("include /etc/nginx/snippets/cloudflare-real-ip.conf;");
    expect(nginx).not.toMatch(/letsencrypt|certbot/u);
  });

  it("keeps every proxy read timeout below Cloudflare's 100 s limit", () => {
    const timeouts = [...nginx.matchAll(/proxy_read_timeout (\d+)s;/gu)].map(([, seconds]) => Number(seconds));
    expect(timeouts.length).toBeGreaterThan(0);
    expect(Math.max(...timeouts)).toBeLessThan(100);
  });

  it("forwards the original host and scheme, overwrites X-Forwarded-For and disables buffering for streamed pages", () => {
    expect(nginx).toContain("proxy_set_header Host $host;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
    expect(nginx).toContain("proxy_set_header X-Forwarded-For $remote_addr;");
    expect(nginx).toContain("proxy_buffering off;");
    expect(nginx).toMatch(/Strict-Transport-Security/u);
    expect(nginx).not.toMatch(/demi\.example|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?<!127\.0\.0\.1)/u);
  });
});
