import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID, sign, verify as verifySignature } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, symlinkSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");
const integrationEnvPath = resolve(repositoryRoot, ".env.integration");
const lineWorkflowPath = "/api/line/workflow/verify";
const scopedAppointmentsPath = "/line/workflow/appointments";
const publicOrigin = "https://demi.example.org";
const accountChannelId = "1000000001";
const miniChannelId = "2000000001";
const accountLiffId = "1000000001-Account";
const miniLiffId = "2000000001-MiniSmoke";
const hospitalName = "โรงพยาบาลสังเคราะห์ MINI smoke";
const workflowCookieName = "__Secure-DEMI_LINE_WORKFLOW";

function requireCheck(condition, message) {
  if (!condition) throw new Error(`LINE workflow Next smoke failed: ${message}`);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) throw new Error("Committed local integration environment is missing");
  const values = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (match) values[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }
  return values;
}

function systemEnvironment() {
  const output = {};
  for (const name of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "ComSpec"]) {
    if (process.env[name] !== undefined) output[name] = process.env[name];
  }
  return output;
}

function testDatabaseEnvironment() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("LINE workflow Next smoke is blocked in a production environment");
  }
  const configured = parseEnvFile(integrationEnvPath);
  const databaseUrl = configured.DEMI_TEST_DATABASE_URL;
  if (!databaseUrl || configured.DATABASE_URL !== databaseUrl || configured.DIRECT_URL !== databaseUrl) {
    throw new Error("LINE workflow Next smoke requires the committed disposable integration database");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("The committed integration database URL is invalid");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("LINE workflow Next smoke only permits local PostgreSQL");
  }
  return {
    ...systemEnvironment(),
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    DEMI_TEST_DATABASE_URL: databaseUrl,
  };
}

// Mirrors lineChannelTupleDefinition: the server derives the inventory from the channel variables below.
function tupleKey(channel) {
  const definition = JSON.stringify(["LINE_CHANNEL_V2", channel.kind, channel.channelId, channel.environment, "server-config"]);
  return createHash("sha256").update(definition).digest("hex");
}

function makeSyntheticConfiguration(identityHashSecret) {
  const inventory = {
    channels: [
      { kind: "ACCOUNT", channelId: accountChannelId, environment: "ACCOUNT" },
      { kind: "MINI", channelId: miniChannelId, environment: "DEVELOPING" },
    ],
  };
  const keyring = {
    currentKid: "next-smoke",
    keys: [{
      kid: "next-smoke",
      encryptionKey: randomBytes(32).toString("base64url"),
      sessionKey: randomBytes(32).toString("base64url"),
    }],
  };
  return { inventory, keyring, identityHashSecret };
}

function buildApplicationEnvironment(databaseEnvironment, authUrl, configuration) {
  return {
    ...databaseEnvironment,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    IDENTITY_HASH_SECRET: configuration.identityHashSecret,
    NEXT_PUBLIC_SUPABASE_URL: authUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_line_workflow_smoke",
    DEMI_LINE_LOGIN_CHANNEL_ID: accountChannelId,
    DEMI_LINE_PUBLIC_ORIGIN: publicOrigin,
    NEXT_PUBLIC_DEMI_LINE_LIFF_ID: accountLiffId,
    DEMI_LINE_MINI_APP_ENVIRONMENT: "DEVELOPING",
    DEMI_LINE_MINI_APP_CHANNEL_ID: miniChannelId,
    DEMI_LINE_MINI_APP_LIFF_ID: miniLiffId,
    DEMI_LINE_MINI_APP_CONTEXT_KEYRING: JSON.stringify(configuration.keyring),
  };
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectListen(new Error("Could not bind the local test server"));
        return;
      }
      resolveListen(address.port);
    });
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(payload));
}

function makeAuthToken({ privateKey, issuer, userId, sessionId }) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: `${issuer}/auth/v1`,
    aud: "authenticated",
    sub: userId,
    session_id: sessionId,
    role: "authenticated",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    iat: now,
    exp: now + 3_600,
  };
  const encodedHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "next-smoke-auth", typ: "JWT" })).toString("base64url");
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return { token: `${signingInput}.${signature}`, claims };
}

function makeAuthServer({ keyPair, userId, sessionId, accessToken, claims, authUrl }) {
  let userRequests = 0;
  const publicJwk = {
    ...keyPair.publicKey.export({ format: "jwk" }),
    kid: "next-smoke-auth",
    use: "sig",
    alg: "RS256",
  };
  const authUser = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "mini-smoke@example.invalid",
    phone: null,
    email_confirmed_at: new Date(claims.iat * 1_000).toISOString(),
    phone_confirmed_at: null,
    last_sign_in_at: new Date(claims.iat * 1_000).toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    factors: [],
    created_at: new Date(claims.iat * 1_000).toISOString(),
    updated_at: new Date(claims.iat * 1_000).toISOString(),
    is_anonymous: false,
  };

  const handleRequest = (request, response) => {
    const requestUrl = new URL(request.url ?? "/", authUrl);
    if ((requestUrl.pathname === "/auth/v1/.well-known/jwks.json" || requestUrl.pathname === "/auth/v1/keys") && request.method === "GET") {
      sendJson(response, 200, { keys: [publicJwk] }, { "cache-control": "public, max-age=300" });
      return;
    }
    if (requestUrl.pathname === "/auth/v1/user" && request.method === "GET") {
      userRequests += 1;
      const authorization = request.headers.authorization;
      if (authorization !== `Bearer ${accessToken}` || !verifyMockSession(accessToken, keyPair.publicKey, authUrl, userId, sessionId)) {
        sendJson(response, 401, { code: "invalid_token", message: "Synthetic session is not active" });
        return;
      }
      sendJson(response, 200, authUser, { "cache-control": "private, no-store" });
      return;
    }
    sendJson(response, 404, { code: "not_found" });
  };

  return { handleRequest, getUserRequestCount: () => userRequests };
}

function verifyMockSession(token, publicKey, authUrl, expectedUserId, expectedSessionId) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], "base64url");
    return header.alg === "RS256" && header.kid === "next-smoke-auth" &&
      verifySignature("RSA-SHA256", signed, publicKey, signature) &&
      claims.iss === `${authUrl}/auth/v1` && claims.aud === "authenticated" &&
      claims.sub === expectedUserId && claims.session_id === expectedSessionId &&
      Number.isSafeInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1_000);
  } catch {
    return false;
  }
}

function makeAuthCookie(authUrl, token, userId, expiresAt) {
  const session = {
    access_token: token,
    token_type: "bearer",
    expires_in: 3_600,
    expires_at: expiresAt,
    refresh_token: "synthetic-refresh-token",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "mini-smoke@example.invalid",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_anonymous: false,
    },
  };
  const cookieName = `sb-${new URL(authUrl).hostname.split(".")[0]}-auth-token`;
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  return `${cookieName}=${cookieValue}`;
}

function hashRateLimitKey(category, principal) {
  return createHash("sha256").update(`DEMI_LINE_WORKFLOW_RATE_LIMIT_V1:${category}:${principal}`).digest("hex");
}

async function createSyntheticPatient(database, lineSubject, identityHashSecret, created) {
  const hospital = await database.hospital.create({ data: {
    hospitalCode: `MINI-${randomUUID().slice(0, 8)}`,
    name: hospitalName,
    status: "ACTIVE",
  } });
  created.hospitals.push(hospital.id);

  const person = await database.person.create({ data: {
    identityKeyHash: createHash("sha256").update(randomUUID()).digest("hex"),
    givenName: "ทดสอบ",
    familyName: "MINI smoke",
  } });
  created.people.push(person.id);

  const userId = randomUUID();
  const authSubject = randomUUID();
  const user = await database.user.create({ data: { id: userId, personId: person.id, authSubject, status: "ACTIVE" } });
  created.users.push(user.id);
  await database.userRole.create({ data: { userId: user.id, role: "PATIENT" } });

  const profile = await database.patientProfile.create({ data: { personId: person.id } });
  created.profiles.push(profile.id);
  const relationship = await database.patientHospitalRelationship.create({ data: {
    patientProfileId: profile.id,
    hospitalId: hospital.id,
    hospitalNumber: `HN-MINI-${randomUUID().slice(0, 8)}`,
  } });
  created.relationships.push(relationship.id);

  const fingerprint = createHmac("sha256", identityHashSecret)
    .update(`DEMI_LINE_SUBJECT_V1:${lineSubject}`)
    .digest("hex");
  const fingerprintKeyId = createHmac("sha256", identityHashSecret)
    .update("DEMI_LINE_FINGERPRINT_KEY_ID_V1")
    .digest("hex")
    .slice(0, 24);
  const binding = await database.lineAccountBinding.create({ data: {
    userId: user.id,
    lineUserId: lineSubject,
    lineSubjectFingerprint: fingerprint,
    lineSubjectFingerprintKeyId: fingerprintKeyId,
  } });
  created.bindings.push(binding.id);

  return { created, userId, authSubject, bindingId: binding.id, hospitalId: hospital.id, personId: person.id };
}

async function cleanupSyntheticPatient(database, fixture, userRateHash, globalRateHash) {
  if (!fixture) return;
  if (fixture.created.bindings.length > 0) {
    if (userRateHash && globalRateHash) {
      await database.$executeRaw`DELETE FROM "LineWorkflowRateLimitBucket"
        WHERE "keyHash" = ${userRateHash} OR "keyHash" = ${globalRateHash}`;
    }
    await database.lineAuthorizationLifecycle.deleteMany({ where: { bindingId: { in: fixture.created.bindings } } });
    await database.lineAccountActionIntent.deleteMany({ where: { userId: { in: fixture.created.users } } });
    await database.auditEvent.deleteMany({ where: { actorUserId: { in: fixture.created.users } } });
    await database.lineAccountBinding.deleteMany({ where: { id: { in: fixture.created.bindings } } });
  }
  if (fixture.created.relationships.length > 0) {
    await database.patientHospitalRelationship.deleteMany({ where: { id: { in: fixture.created.relationships } } });
  }
  if (fixture.created.profiles.length > 0) {
    await database.patientProfile.deleteMany({ where: { id: { in: fixture.created.profiles } } });
  }
  if (fixture.created.users.length > 0) {
    await database.userRole.deleteMany({ where: { userId: { in: fixture.created.users } } });
    await database.user.deleteMany({ where: { id: { in: fixture.created.users } } });
  }
  if (fixture.created.people.length > 0) {
    await database.person.deleteMany({ where: { id: { in: fixture.created.people } } });
  }
  if (fixture.created.hospitals.length > 0) {
    await database.hospital.deleteMany({ where: { id: { in: fixture.created.hospitals } } });
  }
}

function copyTrackedWorkspace(destination) {
  const listing = spawnSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8", windowsHide: true });
  if (listing.error || listing.status !== 0 || typeof listing.stdout !== "string") {
    throw new Error("Could not enumerate tracked files for the isolated Next build");
  }
  for (const relativePath of listing.stdout.split("\0").filter(Boolean)) {
    const normalized = relativePath.replace(/\\/gu, "/");
    if (normalized === ".env" || normalized.startsWith(".env.") || normalized.startsWith(".git/") ||
        normalized.startsWith("node_modules/") || normalized.startsWith(".next/") ||
        normalized.startsWith(".vercel/") || normalized.split("/").some((part) => part.startsWith(".tmp-"))) continue;
    const source = resolve(repositoryRoot, relativePath);
    const relativeToRoot = relative(repositoryRoot, source);
    if (!relativeToRoot || relativeToRoot === ".." || relativeToRoot.startsWith(`..${sep}`)) {
      throw new Error("Tracked source path escaped the repository root");
    }
    if (!existsSync(source) || !lstatSync(source).isFile()) continue;
    const target = resolve(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  symlinkSync(resolve(repositoryRoot, "node_modules"), resolve(destination, "node_modules"), "junction");
}

function isInside(parent, candidate) {
  const path = relative(parent, candidate);
  return Boolean(path) && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

function assertNoTestProviderOrKeyMaterial(buildRoot, forbiddenValues) {
  const forbidden = [
    "DEMI_LINE_WORKFLOW_TEST_PROVIDER_MOCK",
    "DEMI_LINE_WORKFLOW_TEST_PROVIDER_SUBJECT",
    "DEMI_LINE_WORKFLOW_TEST_PROVIDER_CALL_LOG",
    "line-workflow-provider-mock.mjs",
    "synthetic-mini-id-token",
    ...forbiddenValues,
  ].filter(Boolean);
  const queue = [resolve(buildRoot, ".next", "server")];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = resolve(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      if (!/\.(?:js|mjs|json)$/u.test(entry.name)) continue;
      const contents = readFileSync(absolute, "utf8");
      if (forbidden.some((value) => contents.includes(value))) {
        throw new Error("Test Provider mock or synthetic key material appeared in the isolated Next server bundle");
      }
    }
  }
}

function getFreePort() {
  const server = createServer();
  return new Promise((resolvePort, rejectPort) => {
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectPort(new Error("Could not select a local Next port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

function setCookieHeaders(response) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""].filter(Boolean);
}

function cookiePairFromHeader(setCookie) {
  const separator = setCookie.indexOf(";");
  const pair = separator < 0 ? setCookie : setCookie.slice(0, separator);
  const equals = pair.indexOf("=");
  if (equals < 1) return null;
  return { name: pair.slice(0, equals), value: pair.slice(equals + 1), pair };
}

function verifyRequest(baseUrl, authCookie) {
  const headers = {
    origin: publicOrigin,
    "content-type": "application/json",
  };
  if (authCookie) headers.cookie = authCookie;
  return fetch(`${baseUrl}${lineWorkflowPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ intent: "OPEN_PATIENT_APPOINTMENTS", idToken: "synthetic-mini-id-token" }),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
}

function appendServerOutput(server, chunks) {
  const append = (chunk) => {
    chunks.push(chunk.toString("utf8"));
    while (chunks.join("").length > 16_000) chunks.shift();
  };
  server.stdout.on("data", append);
  server.stderr.on("data", append);
}

async function waitForNextReady(server, baseUrl, chunks) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      const logs = chunks.join("").slice(-3_000).replace(/\bU[0-9a-f]{32}\b/giu, "[synthetic LINE subject]");
      throw new Error(`Next production server exited before responding${logs ? `: ${logs}` : ""}`);
    }
    try {
      const response = await fetch(`${baseUrl}${lineWorkflowPath}`, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(3_000),
      });
      if (response.status === 405) return;
    } catch {
      // The process is still starting; retry within the fixed startup bound.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  const logs = chunks.join("").slice(-3_000).replace(/\bU[0-9a-f]{32}\b/giu, "[synthetic LINE subject]");
  throw new Error(`Next production server did not become ready${logs ? `: ${logs}` : ""}`);
}

async function stopNext(server) {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => server.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (server.exitCode === null) server.kill();
}

async function main() {
  const databaseEnvironment = testDatabaseEnvironment();
  const migrationEnvironment = { ...databaseEnvironment, NODE_ENV: "test" };
  const migration = spawnSync(process.execPath, [resolve(repositoryRoot, "scripts", "integration.mjs"), "migrate"], {
    cwd: repositoryRoot,
    env: migrationEnvironment,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true,
  });
  if (migration.error || migration.status !== 0) {
    throw new Error("Could not migrate the local disposable integration database; start it with npm run test:db:up");
  }

  const identityHashSecret = randomBytes(32).toString("base64url");
  const lineSubject = `U${randomBytes(16).toString("hex")}`;
  const configuration = makeSyntheticConfiguration(identityHashSecret);
  const fixtureTracker = { hospitals: [], people: [], users: [], profiles: [], relationships: [], bindings: [] };
  const authKeyPair = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  let authRequestHandler = (_request, response) => sendJson(response, 503, { code: "auth_not_ready" });
  const authServer = createServer((request, response) => authRequestHandler(request, response));
  let authBindings;
  let listeningAuthServer;
  let database;
  let fixture;
  let nextServer;
  let workspace;
  const providerCallLog = join(tmpdir(), `demi-line-workflow-provider-${randomUUID()}.log`);
  let userRateHash;
  let globalRateHash;

  try {
    const authPort = await listen(authServer);
    listeningAuthServer = authServer;
    const authUrl = `http://127.0.0.1:${authPort}`;

    // No .env file or inherited production secret enters the Next build or runtime.
    const syntheticEnvironment = buildApplicationEnvironment(databaseEnvironment, authUrl, configuration);
    const keyMaterial = configuration.keyring.keys.flatMap((key) => [key.encryptionKey, key.sessionKey]);
    const nextBuildEnvironment = { ...syntheticEnvironment };

    const { PrismaClient } = await import("@prisma/client");
    database = new PrismaClient({ datasources: { db: { url: databaseEnvironment.DATABASE_URL } } });
    await database.$connect();
    const fixtureIdentity = await createSyntheticPatient(database, lineSubject, identityHashSecret, fixtureTracker);
    fixture = { ...fixtureIdentity, created: fixtureTracker };
    userRateHash = hashRateLimitKey("VERIFY_USER", fixture.userId);
    globalRateHash = hashRateLimitKey("VERIFY_GLOBAL", "GLOBAL");

    const authSession = makeAuthToken({
      privateKey: authKeyPair.privateKey,
      issuer: authUrl,
      userId: fixture.authSubject,
      sessionId: randomUUID(),
    });
    const sessionId = authSession.claims.session_id;
    authBindings = makeAuthServer({
      keyPair: authKeyPair,
      userId: fixture.authSubject,
      sessionId,
      accessToken: authSession.token,
      claims: authSession.claims,
      authUrl,
    });
    authRequestHandler = authBindings.handleRequest;

    workspace = mkdtempSync(join(tmpdir(), "demi-line-mini-next-smoke-"));
    const safeWorkspace = resolve(workspace);
    const safeTempRoot = resolve(tmpdir());
    if (!isInside(safeTempRoot, safeWorkspace)) throw new Error("Isolated Next workspace escaped the system temp directory");
    copyTrackedWorkspace(workspace);

    const nextBinary = resolve(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
    console.log("Building an isolated production Next bundle with synthetic local configuration...");
    for (const mode of ["compile"]) {
      const build = spawnSync(process.execPath, [nextBinary, "build", "--webpack", "--experimental-build-mode", mode], {
        cwd: workspace,
        env: nextBuildEnvironment,
        encoding: "utf8",
        stdio: "inherit",
        windowsHide: true,
      });
      if (build.error || build.status !== 0) throw new Error(`Isolated production Next ${mode} phase failed`);
    }
    assertNoTestProviderOrKeyMaterial(workspace, keyMaterial);

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const testProviderPath = resolve(repositoryRoot, "tests", "fixtures", "line-workflow-provider-mock.mjs");
    const runtimeEnvironment = {
      ...nextBuildEnvironment,
      DEMI_LINE_WORKFLOW_TEST_PROVIDER_MOCK: "enabled",
      DEMI_LINE_WORKFLOW_TEST_PROVIDER_SUBJECT: lineSubject,
      DEMI_LINE_WORKFLOW_TEST_PROVIDER_CALL_LOG: providerCallLog,
      NODE_OPTIONS: `--import=${pathToFileURL(testProviderPath).href}`,
    };
    const outputChunks = [];
    nextServer = spawn(process.execPath, [nextBinary, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: workspace,
      env: runtimeEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    appendServerOutput(nextServer, outputChunks);
    await waitForNextReady(nextServer, baseUrl, outputChunks);

    const anonymous = await verifyRequest(baseUrl);
    requireCheck(anonymous.status === 401, "an anonymous Verify request was not rejected");
    const anonymousBody = await anonymous.json();
    requireCheck(anonymousBody.code === "LOGIN_REQUIRED", "anonymous Verify response was not finite");
    requireCheck(!setCookieHeaders(anonymous).some((cookie) => cookie.startsWith(`${workflowCookieName}=`)),
      "an anonymous request received a workflow cookie");
    requireCheck(!existsSync(providerCallLog), "LINE Provider was called before a current DEMI session existed");

    const tokenWithAuth = makeAuthCookie(authUrl, authSession.token, fixture.authSubject, authSession.claims.exp);
    let firstSuccess = null;
    let firstWorkflowCookie = null;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await verifyRequest(baseUrl, tokenWithAuth);
      const body = await response.json();
      if (attempt < 10) {
        requireCheck(response.status === 200, `a valid synthetic LINE A / DEMI A Patient request did not issue a context (HTTP ${response.status}, code ${String(body.code)})`);
        requireCheck(body.code === "SCOPE_GRANTED" && body.continuation === scopedAppointmentsPath,
          "Verify returned an unreviewed success body or continuation");
        requireCheck(Object.keys(body).sort().join(",") === "code,continuation", "Verify returned extra success fields");
        requireCheck(!JSON.stringify(body).includes(workflowCookieName), "Verify returned a cookie value in JSON");
        if (attempt === 0) {
          firstSuccess = response;
          const matchingCookies = setCookieHeaders(response)
            .map(cookiePairFromHeader)
            .filter((cookie) => cookie?.name === workflowCookieName);
          requireCheck(matchingCookies.length === 1, "Verify did not return exactly one workflow Set-Cookie");
          firstWorkflowCookie = matchingCookies[0];
        }
      } else {
        requireCheck(response.status === 429 && body.code === "RATE_LIMITED",
          "the 11th request for one authenticated User did not receive finite HTTP 429");
        requireCheck(!setCookieHeaders(response).some((cookie) => cookie.startsWith(`${workflowCookieName}=`)),
          "a rate-limited request received a workflow cookie");
      }
    }

    requireCheck(firstSuccess !== null && firstWorkflowCookie !== null, "the positive Verify response was not captured");
    const setCookie = setCookieHeaders(firstSuccess).find((cookie) => cookie.startsWith(`${workflowCookieName}=`));
    requireCheck(Boolean(setCookie), "the first positive Verify response lost Set-Cookie");
    const attributes = setCookie.split(";").slice(1).map((attribute) => attribute.trim().toLowerCase());
    requireCheck(attributes.includes("httponly"), "workflow cookie omitted HttpOnly");
    requireCheck(attributes.includes("secure"), "workflow cookie omitted Secure");
    requireCheck(/sameSite=lax/iu.test(setCookie), "workflow cookie omitted SameSite=Lax");
    requireCheck(/path=\/line\/workflow(?:;|$)/iu.test(setCookie), "workflow cookie Path was not scoped to /line/workflow");
    requireCheck(!/domain=/iu.test(setCookie), "workflow cookie was not host-only");
    const maxAge = Number(setCookie.match(/max-age=(\d+)/iu)?.[1]);
    requireCheck(Number.isInteger(maxAge) && maxAge > 0 && maxAge <= 900, "workflow cookie Max-Age was not bounded to 900 seconds");
    requireCheck(firstSuccess.headers.get("content-type")?.includes("application/json"), "Verify response content type was not JSON");
    requireCheck(firstSuccess.headers.get("cache-control")?.includes("private") &&
      firstSuccess.headers.get("cache-control")?.includes("no-store"), "Verify response cache policy was not private no-store");
    requireCheck(firstSuccess.headers.get("referrer-policy") === "no-referrer", "Verify response omitted Referrer-Policy");
    requireCheck(firstSuccess.headers.get("x-content-type-options") === "nosniff", "Verify response omitted nosniff");
    requireCheck(firstSuccess.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"),
      "Verify response omitted the frame boundary");
    requireCheck(firstSuccess.headers.get("access-control-allow-origin") === null, "Verify response enabled wildcard CORS");

    const providerCalls = existsSync(providerCallLog)
      ? readFileSync(providerCallLog, "utf8").split(/\r?\n/u).filter(Boolean).length
      : 0;
    requireCheck(providerCalls === 10, "provider mock call count did not stop at the authenticated per-user cap");
    requireCheck(authBindings.getUserRequestCount() >= 10, "the disposable Auth mock did not confirm current sessions");

    const workflowCookie = firstWorkflowCookie.pair;
    const scopedResponse = await fetch(`${baseUrl}${scopedAppointmentsPath}`, {
      headers: { accept: "text/html", cookie: `${tokenWithAuth}; ${workflowCookie}` },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    requireCheck(scopedResponse.status === 200, "the issued cookie did not authorize the scoped Appointment root");
    requireCheck(scopedResponse.headers.get("content-type")?.includes("text/html"), "scoped Appointment response was not HTML");
    requireCheck(scopedResponse.headers.get("cache-control")?.includes("private") &&
      scopedResponse.headers.get("cache-control")?.includes("no-store"), "scoped Appointment response cache policy was not private no-store");
    requireCheck(scopedResponse.headers.get("referrer-policy") === "no-referrer", "scoped Appointment response omitted Referrer-Policy");
    requireCheck(scopedResponse.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"),
      "scoped Appointment response omitted the frame boundary");
    requireCheck(!setCookieHeaders(scopedResponse).some((cookie) => cookie.startsWith(`${workflowCookieName}=`)),
      "a scoped GET minted or refreshed the workflow context");
    const scopedHtml = await scopedResponse.text();
    requireCheck(scopedHtml.includes(hospitalName), "scoped read did not return the synthetic Patient SELF relationship");

    const accountChannel = configuration.inventory.channels[0];
    const miniChannel = configuration.inventory.channels[1];
    const miniTupleKey = tupleKey(miniChannel);
    const observations = await database.lineAuthorizationLifecycle.findMany({
      where: { bindingId: fixture.bindingId, bindingVersion: 1, tupleKey: miniTupleKey },
      select: { applicability: true, observedAt: true, remoteOutcome: true },
    });
    requireCheck(observations.length === 1 && observations[0].applicability === "OBSERVED" && observations[0].observedAt instanceof Date,
      "successful issuance did not persist one MINI observation against the current binding generation");
    requireCheck(observations[0].remoteOutcome === "OBSERVED", "successful authorization did not preserve the lifecycle's observation-only outcome");
    requireCheck(accountChannel.kind === "ACCOUNT", "synthetic inventory lost its separate Account channel");

    const rateRows = await database.$queryRaw`
      SELECT "category", "hitCount" FROM "LineWorkflowRateLimitBucket"
      WHERE "keyHash" = ${userRateHash} OR "keyHash" = ${globalRateHash}
    `;
    const userBucket = rateRows.find((row) => row.category === "VERIFY_USER");
    const globalBucket = rateRows.find((row) => row.category === "VERIFY_GLOBAL");
    requireCheck(userBucket?.hitCount === 11 && globalBucket?.hitCount === 10,
      "PostgreSQL did not retain the capped per-user and global verification counters");

    console.log("PASS: anonymous Verify denied without LINE Provider I/O.");
    console.log("PASS: ten production-Next Verify requests issued bounded cookies; request eleven received 429 before LINE verification.");
    console.log("PASS: the issued cookie authorized the scoped Patient SELF Appointment read and the GET did not renew it.");
    console.log("PASS: PostgreSQL recorded one current-generation MINI observation and shared limiter counters.");
  } finally {
    await stopNext(nextServer);
    if (database) {
      try {
        await cleanupSyntheticPatient(database, fixture ?? { created: fixtureTracker }, userRateHash, globalRateHash);
      } finally {
        await database.$disconnect();
      }
    }
    await closeServer(listeningAuthServer);
    if (workspace && isInside(resolve(tmpdir()), resolve(workspace))) rmSync(resolve(workspace), { recursive: true, force: true });
    if (existsSync(providerCallLog)) unlinkSync(providerCallLog);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "LINE workflow Next smoke failed");
  process.exitCode = 1;
});
