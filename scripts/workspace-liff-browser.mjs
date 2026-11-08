// Real Next routes, protected layout, Supabase SSR cookies, login server action,
// PostgreSQL and Chromium. Only external provider/SDK responses are synthetic.
// Requires the existing disposable DB (test:db:up + prisma:migrate:test), plus
// Playwright installed outside the repo. See ADR-0031 for exact commands.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { assertDisposableIntegrationDatabase, assertDisposableIntegrationEnvironment, readCommittedIntegrationEnvironment } from "./integration-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { chromium } = process.env.DEMI_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(resolve(process.env.DEMI_PLAYWRIGHT_MODULE)).href)
  : require("playwright");
const workspaceId = "1000000001-Workspace";
const destination = "/app/personal/medications";
const secondary = `${destination}?liff.hback=2&lineAppVersion=14.19.1`;
const login = `/login?returnTo=${encodeURIComponent(destination)}`;
const environment = { ...readCommittedIntegrationEnvironment(), NODE_ENV: "test" };
assertDisposableIntegrationEnvironment(environment);
const { PrismaClient } = require("@prisma/client");
const database = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });

function listen(server) {
  return new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => done(server.address().port));
  });
}
function deferred() {
  let release;
  const promise = new Promise((done) => { release = done; });
  return { promise, release };
}
function inside(parent, child) {
  const path = relative(parent, child);
  return path && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

let temporary;
let server;
let browser;
let person;
let user;
let authActive = true;
let authUserRequests = 0;
const keypair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const subject = randomUUID();
const identity = `liff-browser-${randomUUID().slice(0, 8)}`;
const password = randomBytes(24).toString("base64url");
const secret = randomBytes(32).toString("base64url");
let token;
let session;
const provider = createServer(async (request, response) => {
  const url = new URL(request.url, "http://local.invalid");
  let status = 404;
  let body = { code: "not_found" };
  if (url.pathname.endsWith("/jwks.json") || url.pathname.endsWith("/keys")) {
    status = 200;
    body = { keys: [{ ...keypair.publicKey.export({ format: "jwk" }), kid: "liff-browser", alg: "RS256", use: "sig" }] };
  } else if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    if (input.email === user?.providerLoginAlias && input.password === password) {
      authActive = true;
      status = 200;
      body = session;
    } else {
      status = 400;
      body = { code: "invalid_credentials", msg: "Synthetic credentials rejected" };
    }
  } else if (url.pathname === "/auth/v1/user") {
    authUserRequests += 1;
    status = authActive && request.headers.authorization === `Bearer ${token}` ? 200 : 401;
    body = status === 200 ? session.user : { code: "session_not_found", message: "Synthetic session expired" };
  }
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-supabase-api-version": "2024-01-01" });
  response.end(JSON.stringify(body));
});

try {
  await assertDisposableIntegrationDatabase(database);
  const providerPort = await listen(provider);
  const authUrl = `http://127.0.0.1:${providerPort}`;
  const claims = { iss: `${authUrl}/auth/v1`, aud: "authenticated", sub: subject, role: "authenticated", session_id: randomUUID(), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  const signingInput = [Buffer.from(JSON.stringify({ alg: "RS256", kid: "liff-browser", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url")].join(".");
  token = `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), keypair.privateKey).toString("base64url")}`;
  session = { access_token: token, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, expires_at: claims.exp,
    user: { id: subject, aud: "authenticated", role: "authenticated", email: "liff-browser@example.invalid", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), is_anonymous: false } };
  person = await database.person.create({ data: { identityKeyHash: createHmac("sha256", secret).update(`thai-national-id\0${identity}`).digest("hex"), givenName: "LIFF", familyName: "Browser fixture" } });
  user = await database.user.create({ data: { personId: person.id, authSubject: subject, providerLoginAlias: `liff-${randomUUID()}@example.invalid`, status: "ACTIVE", roles: { create: { role: "PATIENT" } } } });
  await database.patientProfile.create({ data: { personId: person.id } });

  temporary = mkdtempSync(resolve(tmpdir(), "demi-liff-browser-"));
  assert(inside(resolve(tmpdir()), resolve(temporary)));
  const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(files.status, 0);
  for (const name of new Set(files.stdout.split("\0").filter(Boolean))) {
    if (name === ".env" || name.startsWith(".env.") || name.startsWith(".git/") || name.startsWith("node_modules/") || name.startsWith(".next/")) continue;
    const target = resolve(temporary, name);
    assert(inside(temporary, target));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(root, name), target);
  }
  symlinkSync(resolve(root, "node_modules"), resolve(temporary, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  if (process.argv.includes("--baseline")) {
    // Red-capability check against the reviewed HEAD, in the disposable copy only.
    for (const name of ["proxy.ts", "app/app/layout.tsx", "app/login/page.tsx", "app/workspace-liff-entry.tsx", "app/workspace-liff-bootstrap.tsx", "app/workspace-liff-gateway.ts", "src/modules/line/domain/line-liff-browser.ts", "src/components/line/liff-browser-context-store.ts"]) {
      const original = spawnSync("git", ["show", `93f0ac1062425950cacff62d9b22fbbe9026b826:${name}`], { cwd: root, encoding: "utf8", windowsHide: true });
      assert.equal(original.status, 0);
      writeFileSync(resolve(temporary, name), original.stdout, "utf8");
    }
  }
  // Compile-time replacement in a disposable copy only. No production mock flag or loader seam.
  const configPath = resolve(temporary, "next.config.ts");
  writeFileSync(configPath, readFileSync(configPath, "utf8").replace("const nextConfig: NextConfig = {", 'const nextConfig: NextConfig = { webpack(config) { config.resolve.alias["@line/liff$"] = "' + resolve(temporary, "tests/fixtures/workspace-liff-sdk.mjs").replaceAll("\\", "/") + '"; return config; },'), "utf8");
  const portProbe = createServer();
  const port = await listen(portProbe);
  await new Promise((done) => portProbe.close(done));
  const base = `http://127.0.0.1:${port}`;
  const system = Object.fromEntries(Object.entries(process.env).filter(([name]) => ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec"].includes(name)));
  server = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: temporary, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...system, ...environment, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", IDENTITY_HASH_SECRET: secret,
      NEXT_PUBLIC_SUPABASE_URL: authUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_liff_browser", DEMI_LINE_LOGIN_CHANNEL_ID: "1000000001", DEMI_LINE_PUBLIC_ORIGIN: "https://demi.example.org",
      NEXT_PUBLIC_DEMI_LINE_LIFF_ID: "1000000001-Account", NEXT_PUBLIC_DEMI_LINE_WORKSPACE_LIFF_ID: workspaceId,
      DEMI_LINE_MINI_APP_ENVIRONMENT: "DEVELOPING", DEMI_LINE_MINI_APP_CHANNEL_ID: "2000000001", DEMI_LINE_MINI_APP_LIFF_ID: "2000000001-Mini" },
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  server.stderr.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  const deadline = Date.now() + 60000;
  while (!output.includes("Ready in")) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Isolated Next startup failed: ${output.slice(-2000)}`);
    await new Promise((done) => setTimeout(done, 200));
  }
  browser = await chromium.launch({ headless: true, ...(process.env.DEMI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DEMI_CHROMIUM_EXECUTABLE } : {}) });

  async function scenario(label, run, storageState) {
    const context = await browser.newContext({ ...(storageState ? { storageState } : {}), viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const events = [];
    await page.exposeBinding("__liffEvent", (_source, kind, path, id) => { events.push({ kind, path, id }); });
    await page.addInitScript(() => {
      for (const method of ["replaceState", "pushState"]) {
        const original = history[method].bind(history);
        history[method] = (...args) => {
          if (args[2] && new URL(args[2], location.href).href !== location.href) void window.__liffEvent(`url:${method}`, new URL(args[2], location.href).pathname + new URL(args[2], location.href).search);
          return original(...args);
        };
      }
    });
    page.on("request", (request) => {
      if (request.isNavigationRequest()) events.push({ kind: "document", path: new URL(request.url()).pathname + new URL(request.url()).search });
      if (request.headers().rsc === "1") events.push({ kind: "rsc", path: new URL(request.url()).pathname });
    });
    page.on("response", (response) => {
      if (response.request().headers().rsc === "1") events.push({ kind: "rsc:response", path: new URL(response.url()).pathname, type: response.headers()["content-type"], rewrite: response.headers()["x-nextjs-rewritten-path"] });
    });
    await page.route("**/__line_sdk/**", (route) => route.fulfill({ status: 200, body: "{}" }));
    await page.route("https://liff.line.me/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const target = path === "/1000000001-Account" ? "/line/account"
        : `/?liff.state=${encodeURIComponent(path.slice(`/${workspaceId}`.length) || "/app")}`;
      return route.fulfill({ status: 302, headers: { location: base + target } });
    });
    try {
      await run({ context, page, events, base });
      console.log(JSON.stringify({ ok: true, case: label, events }));
    } catch (error) {
      console.error(JSON.stringify({ ok: false, case: label, events, browserErrors: await page.locator("body").innerText().catch(() => "unavailable") }));
      console.error(output.slice(-3500));
      throw error;
    } finally {
      await context.close();
    }
  }
  const launch = async (page) => page.goto(`${base}/?liff.state=${encodeURIComponent(destination)}`);
  let signedIn;
  await scenario("B/E delayed module + init, real unauthenticated redirect, login and exact return", async ({ page, context, events }) => {
    const moduleWait = deferred();
    const initWait = deferred();
    await page.route("**/__line_sdk/**", async (route) => {
      if (new URL(page.url()).pathname !== "/") await (route.request().url().endsWith("/module") ? moduleWait.promise : initWait.promise);
      await route.fulfill({ status: 200, body: "{}" });
    });
    await launch(page);
    await page.waitForURL(`${base}${secondary}`);
    await page.waitForFunction(() => document.querySelector('[aria-busy="true"]'));
    await page.waitForTimeout(1500); // Exceeds the real Next meta-refresh fallback.
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, secondary);
    assert(!await page.locator("body").innerText().then((text) => text.includes("Browser fixture")));
    assert(!events.some((event) => event.kind === "rsc" && event.path.startsWith("/app")));
    moduleWait.release();
    await page.waitForFunction(() => performance.getEntriesByType("resource").some((entry) => entry.name.endsWith("/__line_sdk/module")));
    await page.waitForTimeout(250);
    assert(!events.some((event) => event.kind === "rsc" && event.path.startsWith("/app")));
    initWait.release();
    await page.waitForURL(`${base}${login}`);
    await page.locator("#nationalId").fill(identity);
    assert.equal(await page.locator('input[name="returnTo"]').inputValue(), destination);
    await page.locator("#password").fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(`${base}${destination}`);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    const resolved = events.findIndex((event) => event.kind === "init:resolved" && event.path === secondary);
    assert(resolved >= 0 && resolved < events.findIndex((event) => event.kind === "rsc" && event.path.startsWith("/app")));
    assert(!events.slice(0, resolved).some((event) => event.kind.startsWith("url:")));
    assert.equal(events.filter((event) => event.kind === "init:start").length, 2);
    signedIn = await context.storageState();
    assert(authUserRequests > 0);
    await page.screenshot({ path: resolve(tmpdir(), "demi-liff-browser-mobile.png") });
  });
  await scenario("A/F existing DEMI session, then Workspace refresh", async ({ page, events }) => {
    await launch(page);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    assert(!events.some((event) => event.kind.startsWith("url:") && event.path.startsWith("/login")));
    const count = events.filter((event) => event.kind === "init:start").length;
    await page.reload();
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    assert.equal(events.filter((event) => event.kind === "init:start").length, count + 1);
  }, signedIn);
  await scenario("G session expired: SDK first, server reauthentication with exact destination", async ({ page }) => {
    await launch(page);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    authActive = false;
    await page.reload();
    await page.waitForURL(`${base}${login}`);
    await page.locator("#nationalId").waitFor();
    authActive = true;
  }, signedIn);
  for (const mode of ["pending", "reject"]) {
    await scenario(mode === "pending" ? "C init pending beyond timeout" : "D SDK rejects", async ({ page, events }) => {
      await page.route("**/__line_sdk/init", async (route) => {
        if (new URL(page.url()).pathname === "/") return route.fulfill({ status: 200, body: "{}" });
        if (mode === "pending") await new Promise((done) => page.once("close", done));
        else await route.fulfill({ status: 503, body: "{}" });
      });
      await launch(page);
      await page.waitForURL(`${base}${secondary}`);
      await page.getByRole("heading", { name: "เปิดผ่าน LINE ไม่สำเร็จ", exact: true }).waitFor();
      assert.equal(await page.locator("main a,main button,meta[http-equiv=refresh]").count(), 0);
      assert(!events.some((event) => event.kind === "rsc" && event.path.startsWith("/app")));
      assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, secondary);
    });
  }
  await scenario("H ordinary browser and refresh never initialize LIFF", async ({ page, events }) => {
    await page.goto(`${base}${destination}`);
    await page.waitForURL(`${base}${login}`);
    await page.locator("#nationalId").waitFor();
    await page.reload();
    await page.locator("#nationalId").waitFor();
    assert(!events.some((event) => event.kind === "module:start"));
  });
  await scenario("I Workspace -> Account -> ordinary /app -> reload -> back/forward", async ({ page, events }) => {
    await launch(page);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    await page.goto("https://liff.line.me/1000000001-Account");
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context"))?.current === "ACCOUNT");
    await page.goBack();
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context"))?.current === "WORKSPACE");
    await page.goForward();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context"))?.current === "ACCOUNT");
    const count = events.filter((event) => event.kind === "init:start" && event.id === workspaceId).length;
    await page.goto(`${base}${destination}`);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    await page.goBack();
    await page.goForward();
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    assert.equal(events.filter((event) => event.kind === "init:start" && event.id === workspaceId).length, count);
    // A real new Workspace LIFF entry works even though the last app was Account.
    await launch(page);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    assert.equal(events.filter((event) => event.kind === "init:start" && event.id === workspaceId).length, count + 2);
  }, signedIn);
  await scenario("I MINI -> Account -> ordinary app; MINI -> Workspace LIFF URL", async ({ page, events }) => {
    await page.goto(`${base}/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS`);
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context"))?.current === "MINI");
    assert(!events.some((event) => event.kind === "init:start" && event.id === workspaceId));
    await page.goto("https://liff.line.me/1000000001-Account");
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context"))?.current === "ACCOUNT");
    assert(await page.evaluate(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context")).mini));
    await page.goto(`${base}${destination}`);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    assert(!events.some((event) => event.kind === "init:start" && event.id === workspaceId));
    await launch(page);
    await page.getByRole("heading", { name: "ยาของฉัน", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("demi.line.liff.context")).mini), false);
    assert.equal(events.filter((event) => event.kind === "init:start" && event.id === workspaceId).length, 2);
  }, signedIn);
  console.log("Workspace LIFF browser integration passed (mock providers; no Android/iOS UAT claimed).");
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise((done) => server.once("exit", done)), new Promise((done) => setTimeout(done, 5000))]);
  }
  provider.closeAllConnections();
  await new Promise((done) => provider.close(done));
  if (user) {
    const throttleHash = createHmac("sha256", secret).update(`DEMI_AUTH_ATTEMPT_THROTTLE_V1\0PASSWORD_LOGIN\0IDENTITY\0${person.identityKeyHash}`).digest("hex");
    await database.authenticationAttemptThrottleBucket.deleteMany({ where: { keyHash: throttleHash } });
    await database.patientProfile.deleteMany({ where: { personId: person.id } });
    await database.userRole.deleteMany({ where: { userId: user.id } });
    await database.user.delete({ where: { id: user.id } });
  }
  if (person) await database.person.delete({ where: { id: person.id } });
  await database.$disconnect();
  if (temporary && inside(resolve(tmpdir()), resolve(temporary))) rmSync(temporary, { recursive: true, force: true });
}
