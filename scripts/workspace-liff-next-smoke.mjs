// Real Next.js smoke for the Workspace LIFF pre-authentication lifecycle (ADR-0031).
//
// Runs the existing production build (`npm run build` first) with `next start`
// and requests, without any DEMI session cookie, the URLs a Workspace LIFF
// primary/secondary redirect produces. It records how Next.js actually answers
// (HTTP redirect vs. streamed client redirect) so the lifecycle decision rests
// on executable evidence, not on a mocked layout. It never contacts LINE, never
// sends a DEMI or LINE credential, and points the database at an unreachable
// local address so no database is read.
//
//   node scripts/workspace-liff-next-smoke.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");

function fail(message) {
  throw new Error(`Workspace LIFF Next smoke failed: ${message}`);
}

if (process.env.NODE_ENV === "production" && process.env.DEMI_DEPLOYMENT_STAGE === "production") {
  fail("blocked in a production deployment environment");
}
if (!existsSync(resolve(repositoryRoot, ".next", "BUILD_ID"))) fail("run `npm run build` first");

function publicHost() {
  // The server reads its own .env; only the host is needed for the canonical-host check.
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const path = resolve(repositoryRoot, name);
    if (!existsSync(path)) continue;
    const match = readFileSync(path, "utf8").match(/^\s*DEMI_LINE_PUBLIC_ORIGIN\s*=\s*["']?([^"'\s]+)/mu);
    if (match) return new URL(match[1]).host;
  }
  return process.env.DEMI_LINE_PUBLIC_ORIGIN ? new URL(process.env.DEMI_LINE_PUBLIC_ORIGIN).host : fail("DEMI_LINE_PUBLIC_ORIGIN is not configured");
}

async function freePort() {
  return new Promise((done, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

function get(port, host, path) {
  return new Promise((done, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", headers: { host, "user-agent": "Mozilla/5.0 Line/14.19.0 LIFF" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (body.length < 400_000) body += chunk;
      });
      response.on("end", () => done({ status: response.statusCode, location: response.headers.location ?? null, cacheControl: response.headers["cache-control"] ?? null, body }));
    });
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error(`timeout for ${path}`)));
    req.end();
  });
}

/** Next.js answers a redirect() thrown after the shell streamed with 200 + an in-document redirect. */
function streamedRedirectTarget(body) {
  const meta = body.match(/<meta id="__next-page-redirect" http-equiv="refresh" content="\d+;url=([^"]+)"/u);
  if (meta) return meta[1].replaceAll("&amp;", "&");
  const digest = body.match(/NEXT_REDIRECT;(?:replace|push);([^;"\\]+);/u);
  return digest ? digest[1] : null;
}

/**
 * Whether the Workspace LIFF bootstrap's client reference is part of the
 * document that carries the redirect. Next.js puts the redirect in the head
 * (`<meta http-equiv="refresh" content="1;url=...">`) and in the RSC payload;
 * the client router replaces the route after hydration, or the meta refresh
 * loads /login as a new document after 1 s.
 *
 * This proves only that the boundary is delivered with that document. It does
 * NOT prove that JavaScript hydrated or that liff.init() completed before the
 * redirect; that ordering is covered by app/workspace-liff-redirect-ordering
 * .test.tsx (start is ordered, completion is not guaranteed) and by device UAT.
 */
function bootstrapPosition(body) {
  return { bootstrapInDocument: body.includes("WorkspaceLiffBootstrap") };
}

function describe(result) {
  if (result.status >= 300 && result.status < 400) return { kind: "HTTP_REDIRECT", status: result.status, target: result.location, bootstrapInDocument: false };
  const target = streamedRedirectTarget(result.body);
  return { kind: target ? "STREAMED_REDIRECT" : "DOCUMENT", status: result.status, target, ...bootstrapPosition(result.body) };
}

const cases = [
  { label: "Workspace primary redirect (Android)", path: "/?liff.state=%2Fapp%2Fpersonal%2Fmedications&lineAppVersion=14.19.1", expect: (r) => r.kind === "DOCUMENT" && r.status === 200 },
  { label: "login page initializes inside the Workspace LIFF", path: "/login?returnTo=%2Fapp%2Fpersonal%2Fmedications", expect: (r) => r.kind === "DOCUMENT" && r.status === 200 && r.bootstrapInDocument },
  { label: "secondary redirect, Patient medication after in-LINE login", path: "/app/personal/medications?liff.hback=2&lineAppVersion=14.19.1", returnTo: "/app/personal/medications" },
  { label: "secondary redirect, Patient wellness", path: "/app/personal/wellness", returnTo: "/app/personal/wellness" },
  { label: "secondary redirect, OSM screening", path: "/app/patients/assigned?task=screening&liff.hback=2", returnTo: "/app/patients/assigned?task=screening" },
  { label: "secondary redirect, Hospital workspace", path: "/app?liff.hback=2", returnTo: null },
  { label: "unauthorized resource", path: "/app/patients/11111111-1111-4111-8111-111111111111?liff.hback=2", returnTo: null },
];

const port = await freePort();
const host = publicHost();
const server = spawn(process.execPath, [resolve(repositoryRoot, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    // Unreachable local database: an unauthenticated request must not need one.
    DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:1/unreachable",
    DIRECT_URL: "postgresql://smoke:smoke@127.0.0.1:1/unreachable",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk; });
server.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  const deadline = Date.now() + 90_000;
  while (!/Ready in|started server|Local:/u.test(serverOutput)) {
    if (server.exitCode !== null) fail(`next start exited early:\n${serverOutput.slice(-2000)}`);
    if (Date.now() > deadline) fail("next start did not become ready");
    await new Promise((done) => setTimeout(done, 250));
  }

  let failures = 0;
  for (const item of cases) {
    const result = await get(port, host, item.path);
    const observed = describe(result);
    let ok;
    if (item.expect) ok = item.expect(observed);
    else {
      const expected = item.returnTo === null ? "/login" : `/login?returnTo=${encodeURIComponent(item.returnTo)}`;
      const target = observed.target ? new URL(observed.target, "https://smoke.invalid") : null;
      // The in-document redirect must reach the login allowlist, and the init boundary must be in that document.
      ok = observed.kind !== "DOCUMENT" && target !== null && `${target.pathname}${target.search}` === expected &&
        (observed.kind === "HTTP_REDIRECT" || observed.bootstrapInDocument);
    }
    if (!ok) failures += 1;
    console.log(JSON.stringify({ ok, case: item.label, path: item.path, ...observed, cacheControl: result.cacheControl }));
  }
  if (failures) fail(`${failures} case(s) did not match`);
  console.log("Workspace LIFF Next smoke passed");
} finally {
  server.kill();
}
