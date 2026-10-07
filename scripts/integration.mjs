import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const integrationEnvPath = resolve(repositoryRoot, ".env.integration");
const composePath = resolve(repositoryRoot, "compose.integration.yaml");
const keepaliveKey = createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 12);
const keepalivePidPath = resolve(tmpdir(), `demi-integration-wsl-${keepaliveKey}.pid`);
const keepaliveMarker = `demi-integration-keepalive-${keepaliveKey}`;
const supportedActions = new Set([
  "db:up",
  "db:down",
  "db:reset",
  "db:status",
  "migrate",
  "migrate:populated",
  "migrate:line-populated",
  "migrate:line-reactive-populated",
  "test",
  "test:focused",
  "verify",
]);

function fail(message) {
  console.error(`Integration environment failed: ${message}`);
  process.exit(1);
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    fail(`${filePath} does not exist`);
  }

  const values = {};

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/u);

    if (!match) {
      continue;
    }

    values[match[1]] = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  }

  return values;
}

function getIntegrationEnvironment() {
  const inheritedIntegrationEnvironment =
    process.env.DATABASE_URL &&
    process.env.DIRECT_URL &&
    process.env.DEMI_TEST_DATABASE_URL;
  const configuredEnvironment = inheritedIntegrationEnvironment ? {} : parseEnvFile(integrationEnvPath);
  const environment = { ...process.env, ...configuredEnvironment };
  const testUrl = environment.DEMI_TEST_DATABASE_URL;

  if (environment.NODE_ENV === "production") {
    fail("integration commands require NODE_ENV other than production");
  }

  if (!testUrl || environment.DATABASE_URL !== testUrl || environment.DIRECT_URL !== testUrl) {
    fail("DATABASE_URL and DIRECT_URL must both equal DEMI_TEST_DATABASE_URL");
  }

  let parsedTestUrl;

  try {
    parsedTestUrl = new URL(testUrl);
  } catch {
    fail("DEMI_TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsedTestUrl.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(parsedTestUrl.hostname)
  ) {
    fail("the committed integration environment must target local PostgreSQL only");
  }

  return environment;
}

function requireCommittedIntegrationTarget(environment) {
  const committedEnvironment = parseEnvFile(integrationEnvPath);
  if (environment.DEMI_TEST_DATABASE_URL !== committedEnvironment.DEMI_TEST_DATABASE_URL) {
    fail("migrate:populated is limited to the repository's committed disposable integration database");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
  });

  if (result.error) {
    if (options.allowMissing && result.error.code === "ENOENT") {
      return null;
    }

    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }

      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }

    process.exit(result.status ?? 1);
  }

  return result;
}

function resolveDockerRuntime(environment) {
  const directDocker = run("docker", ["version", "--format", "{{.Server.Version}}"], {
    allowFailure: true,
    allowMissing: true,
    capture: true,
  });

  if (directDocker?.status === 0) {
    return { kind: "direct" };
  }

  if (process.platform !== "win32") {
    fail("Docker Engine is unavailable");
  }

  const distribution = environment.DEMI_DOCKER_WSL_DISTRO ?? "Ubuntu";

  if (!/^[A-Za-z0-9._-]+$/u.test(distribution)) {
    fail("DEMI_DOCKER_WSL_DISTRO contains unsupported characters");
  }

  const dockerCheck = run(
    "wsl.exe",
    ["-d", distribution, "--", "docker", "version", "--format", "{{.Server.Version}}"],
    { allowFailure: true, allowMissing: true, capture: true },
  );

  if (dockerCheck?.status !== 0) {
    fail(`Docker Engine is unavailable in WSL distribution ${distribution}`);
  }

  const wslPathResult = run("wsl.exe", ["-d", distribution, "--", "pwd"], {
    capture: true,
  });
  const wslRepositoryRoot = wslPathResult.stdout.trim();

  if (!wslRepositoryRoot.startsWith("/")) {
    fail("could not resolve the repository path inside WSL");
  }

  return { kind: "wsl", distribution, repositoryRoot: wslRepositoryRoot };
}

function readKeepalivePid() {
  if (!existsSync(keepalivePidPath)) {
    return null;
  }

  const value = readFileSync(keepalivePidPath, "utf8").trim();

  return /^\d+$/u.test(value) ? Number(value) : null;
}

function isExpectedKeepaliveProcess(processId) {
  const command = [
    `$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${processId}" -ErrorAction SilentlyContinue`,
    `if ($process -and $process.Name -eq "wsl.exe" -and $process.CommandLine -match "${keepaliveMarker}") { exit 0 }`,
    "exit 1",
  ].join("; ");
  const result = run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { allowFailure: true, capture: true },
  );

  return result?.status === 0;
}

function startWslKeepalive(runtime) {
  const existingProcessId = readKeepalivePid();

  if (existingProcessId && isExpectedKeepaliveProcess(existingProcessId)) {
    return;
  }

  if (existsSync(keepalivePidPath)) {
    unlinkSync(keepalivePidPath);
  }

  const keepalive = spawn(
    "wsl.exe",
    [
      "-d",
      runtime.distribution,
      "--",
      "bash",
      "-lc",
      `exec -a ${keepaliveMarker} sleep 86400`,
    ],
    { detached: true, stdio: "ignore", windowsHide: true },
  );

  if (!keepalive.pid) {
    fail("could not start the WSL keepalive process");
  }

  writeFileSync(keepalivePidPath, String(keepalive.pid), "utf8");
  keepalive.unref();
}

function stopWslKeepalive() {
  const processId = readKeepalivePid();

  try {
    if (processId && isExpectedKeepaliveProcess(processId)) {
      process.kill(processId);
    }
  } finally {
    if (existsSync(keepalivePidPath)) {
      unlinkSync(keepalivePidPath);
    }
  }
}

function runCompose(runtime, environment, args) {
  if (runtime.kind === "direct") {
    return run(
      "docker",
      ["compose", "--env-file", integrationEnvPath, "-f", composePath, ...args],
      { env: environment },
    );
  }

  const wslEnvPath = `${runtime.repositoryRoot}/.env.integration`;
  const wslComposePath = `${runtime.repositoryRoot}/compose.integration.yaml`;

  return run(
    "wsl.exe",
    [
      "-d",
      runtime.distribution,
      "--",
      "docker",
      "compose",
      "--env-file",
      wslEnvPath,
      "-f",
      wslComposePath,
      ...args,
    ],
    { env: environment },
  );
}

function databaseUp(runtime, environment) {
  if (runtime.kind === "wsl") {
    startWslKeepalive(runtime);
  }

  runCompose(runtime, environment, ["up", "--wait", "--wait-timeout", "60"]);
}

function databaseDown(runtime, environment) {
  try {
    runCompose(runtime, environment, ["down", "--volumes", "--remove-orphans"]);
  } finally {
    if (runtime.kind === "wsl") {
      stopWslKeepalive();
    }
  }
}

function migrate(environment) {
  run(process.execPath, [resolve(repositoryRoot, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    env: environment,
  });
}

async function migratePopulated(environment, runtime) {
  const migrationsRoot = resolve(repositoryRoot, "prisma", "migrations");
  const currentMigration = "20261005120000_hospital_content_publishing";
  const temporaryRoot = mkdtempSync(join(tmpdir(), "demi-hospital-content-migration-"));
  const safeTemporaryRoot = resolve(temporaryRoot);
  const safeTempBase = resolve(tmpdir());
  if (!safeTemporaryRoot.startsWith(`${safeTempBase}${sep}`)) {
    fail("temporary migration workspace resolved outside the system temporary directory");
  }

  const temporaryMigrations = join(safeTemporaryRoot, "migrations");
  const temporarySchema = join(safeTemporaryRoot, "schema.prisma");
  mkdirSync(temporaryMigrations);

  try {
    databaseDown(runtime, environment);
    databaseUp(runtime, environment);

    for (const entry of readdirSync(migrationsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name >= currentMigration) continue;
      cpSync(join(migrationsRoot, entry.name), join(temporaryMigrations, entry.name), { recursive: true });
    }
    cpSync(join(migrationsRoot, "migration_lock.toml"), join(temporaryMigrations, "migration_lock.toml"));
    writeFileSync(temporarySchema, [
      "generator client {",
      '  provider = "prisma-client-js"',
      "}",
      "",
      "datasource db {",
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      "}",
      "",
    ].join("\n"), "utf8");

    run(process.execPath, [
      resolve(repositoryRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      temporarySchema,
    ], { env: environment });
    run(process.execPath, [resolve(repositoryRoot, "scripts", "seed-hospital-master.mjs")], { env: environment });

    const { PrismaClient, HospitalStatus } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    let hospitalBefore;
    let contactBefore;
    try {
      const hospital = await prisma.hospital.findUniqueOrThrow({
        where: { hospitalCode: "KANG" },
        select: { id: true },
      });
      await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.ACTIVE } });
      await prisma.hospitalContact.create({
        data: { hospitalId: hospital.id, addressText: "ที่อยู่ก่อนการย้ายฐานข้อมูล", phoneNumber: "02-123-4567" },
      });
      hospitalBefore = await prisma.hospital.findUniqueOrThrow({
        where: { id: hospital.id },
        select: { id: true, hospitalCode: true, name: true, parentHospitalId: true, status: true, updatedAt: true },
      });
      contactBefore = await prisma.hospitalContact.findUniqueOrThrow({
        where: { hospitalId: hospital.id },
        select: { id: true, hospitalId: true, addressText: true, phoneNumber: true, createdAt: true, updatedAt: true },
      });
    } finally {
      await prisma.$disconnect();
    }

    migrate(environment);

    const verificationClient = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    try {
      const hospitalAfter = await verificationClient.hospital.findUniqueOrThrow({
        where: { id: hospitalBefore.id },
        select: { id: true, hospitalCode: true, name: true, parentHospitalId: true, status: true, updatedAt: true },
      });
      const contactAfter = await verificationClient.hospitalContact.findUniqueOrThrow({
        where: { id: contactBefore.id },
        select: { id: true, hospitalId: true, addressText: true, phoneNumber: true, createdAt: true, updatedAt: true },
      });
      const contentCount = await verificationClient.hospitalContent.count();
      if (
        JSON.stringify(hospitalBefore) !== JSON.stringify(hospitalAfter) ||
        JSON.stringify(contactBefore) !== JSON.stringify(contactAfter) ||
        contentCount !== 0
      ) {
        fail("populated Hospital migration changed existing identity/Contact or created Content rows");
      }
      console.log("Hospital Content migration preserved a populated Hospital master and HospitalContact; no Content backfill created");
    } finally {
      await verificationClient.$disconnect();
    }
  } finally {
    if (safeTemporaryRoot.startsWith(`${safeTempBase}${sep}`)) {
      rmSync(safeTemporaryRoot, { recursive: true, force: true });
    }
  }
}

async function migrateLinePopulated(environment, runtime) {
  const migrationsRoot = resolve(repositoryRoot, "prisma", "migrations");
  const currentMigration = "20261006120000_line_account_linking_rich_menu";
  const temporaryRoot = mkdtempSync(join(tmpdir(), "demi-line-migration-"));
  const safeTemporaryRoot = resolve(temporaryRoot);
  const safeTempBase = resolve(tmpdir());
  if (!safeTemporaryRoot.startsWith(`${safeTempBase}${sep}`)) {
    fail("temporary migration workspace resolved outside the system temporary directory");
  }

  const temporaryMigrations = join(safeTemporaryRoot, "migrations");
  const temporarySchema = join(safeTemporaryRoot, "schema.prisma");
  mkdirSync(temporaryMigrations);
  let prisma;
  try {
    databaseDown(runtime, environment);
    databaseUp(runtime, environment);
    for (const entry of readdirSync(migrationsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name >= currentMigration) continue;
      cpSync(join(migrationsRoot, entry.name), join(temporaryMigrations, entry.name), { recursive: true });
    }
    cpSync(join(migrationsRoot, "migration_lock.toml"), join(temporaryMigrations, "migration_lock.toml"));
    writeFileSync(temporarySchema, [
      "generator client {",
      '  provider = "prisma-client-js"',
      "}",
      "",
      "datasource db {",
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      "}",
      "",
    ].join("\n"), "utf8");

    generate(environment);
    run(process.execPath, [
      resolve(repositoryRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      temporarySchema,
    ], { env: environment });

    const { createHash, randomUUID } = await import("node:crypto");
    const { PrismaClient, Role, UserStatus } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    await prisma.$connect();
    const fixture = randomUUID();
    const person = await prisma.person.create({
      data: {
        identityKeyHash: createHash("sha256").update(`line-migration-person:${fixture}`).digest("hex"),
        givenName: "ข้อมูลเดิม",
      },
      select: { id: true, identityKeyHash: true, givenName: true },
    });
    const user = await prisma.user.create({
      data: { personId: person.id, status: UserStatus.ACTIVE },
      select: { id: true, personId: true, status: true, authSubject: true },
    });
    await prisma.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
    const rolesBefore = await prisma.userRole.findMany({ where: { userId: user.id }, select: { role: true } });
    await prisma.$disconnect();
    prisma = undefined;

    migrate(environment);
    const verify = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    try {
      const [personAfter, userAfter, rolesAfter, bindings, intents, receipts, indexes] = await Promise.all([
        verify.person.findUniqueOrThrow({ where: { id: person.id }, select: { id: true, identityKeyHash: true, givenName: true } }),
        verify.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, personId: true, status: true, authSubject: true } }),
        verify.userRole.findMany({ where: { userId: user.id }, select: { role: true } }),
        verify.lineAccountBinding.count({ where: { userId: user.id } }),
        verify.lineAccountActionIntent.count({ where: { userId: user.id } }),
        verify.lineWebhookEventReceipt.count(),
        verify.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('LineAccountBinding_active_subject_fingerprint_key', 'LineAccountBinding_active_user_key')`,
      ]);
      if (
        JSON.stringify(personAfter) !== JSON.stringify(person) ||
        JSON.stringify(userAfter) !== JSON.stringify(user) ||
        JSON.stringify(rolesAfter) !== JSON.stringify(rolesBefore) ||
        bindings !== 0 || intents !== 0 || receipts !== 0 || indexes.length !== 2 ||
        !indexes.every((index) => index.indexdef.includes("WHERE (\"unlinkedAt\" IS NULL)"))
      ) {
        fail("Line account migration failed its populated database preservation/invariant check");
      }
      console.log("LINE migration preserved an existing DEMI User, Person, and role; created empty account tables and both active-only indexes");
    } finally {
      await verify.$disconnect();
    }
  } finally {
    if (prisma) await prisma.$disconnect();
    databaseDown(runtime, environment);
    if (safeTemporaryRoot.startsWith(`${safeTempBase}${sep}`)) {
      rmSync(safeTemporaryRoot, { recursive: true, force: true });
    }
  }
}

async function migrateLineReactivePopulated(environment, runtime) {
  const migrationsRoot = resolve(repositoryRoot, "prisma", "migrations");
  const currentMigration = "20261007120000_line_reactive_patient_appointment_receipt";
  const temporaryRoot = mkdtempSync(join(tmpdir(), "demi-line-reactive-migration-"));
  const safeTemporaryRoot = resolve(temporaryRoot);
  const safeTempBase = resolve(tmpdir());
  if (!safeTemporaryRoot.startsWith(`${safeTempBase}${sep}`)) {
    throw new Error("temporary migration workspace resolved outside the system temporary directory");
  }

  const temporaryMigrations = join(safeTemporaryRoot, "migrations");
  const temporarySchema = join(safeTemporaryRoot, "schema.prisma");
  mkdirSync(temporaryMigrations);
  let prisma;
  try {
    databaseDown(runtime, environment);
    databaseUp(runtime, environment);
    for (const entry of readdirSync(migrationsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name >= currentMigration) continue;
      cpSync(join(migrationsRoot, entry.name), join(temporaryMigrations, entry.name), { recursive: true });
    }
    cpSync(join(migrationsRoot, "migration_lock.toml"), join(temporaryMigrations, "migration_lock.toml"));
    writeFileSync(temporarySchema, [
      "generator client {",
      '  provider = "prisma-client-js"',
      "}",
      "",
      "datasource db {",
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      "}",
      "",
    ].join("\n"), "utf8");

    generate(environment);
    run(process.execPath, [
      resolve(repositoryRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      temporarySchema,
    ], { env: environment });

    const { PrismaClient, LineWebhookEventOutcome, LineWebhookEventType } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    const priorReceiptId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const newReceiptId = "01ARZ3NDEKTSV4RRFFQ69G5FAG";
    const priorEventOccurredAt = new Date("2026-10-01T00:00:00.000Z");
    await prisma.$connect();
    const priorReceipt = await prisma.lineWebhookEventReceipt.create({
      data: {
        webhookEventId: priorReceiptId,
        eventType: LineWebhookEventType.FOLLOW,
        eventOccurredAt: priorEventOccurredAt,
        outcome: LineWebhookEventOutcome.IGNORED,
      },
    });
    await prisma.$disconnect();
    prisma = undefined;

    migrate(environment);

    const verificationClient = new PrismaClient({ datasources: { db: { url: environment.DATABASE_URL } } });
    prisma = verificationClient;
    await verificationClient.$connect();
    const retainedReceipt = await verificationClient.lineWebhookEventReceipt.findUniqueOrThrow({
      where: { webhookEventId: priorReceiptId },
    });
    if (
      retainedReceipt.webhookEventId !== priorReceipt.webhookEventId ||
      retainedReceipt.eventType !== priorReceipt.eventType ||
      retainedReceipt.eventOccurredAt.getTime() !== priorReceipt.eventOccurredAt.getTime() ||
      retainedReceipt.acceptedAt.getTime() !== priorReceipt.acceptedAt.getTime() ||
      retainedReceipt.outcome !== priorReceipt.outcome
    ) {
      throw new Error("reactive enum migration changed an existing LINE webhook receipt");
    }

    await verificationClient.lineWebhookEventReceipt.create({
      data: {
        webhookEventId: newReceiptId,
        eventType: LineWebhookEventType.PATIENT_NEXT_APPOINTMENT,
        eventOccurredAt: new Date("2026-10-02T00:00:00.000Z"),
        outcome: LineWebhookEventOutcome.ACCEPTED,
      },
    });
    let duplicateCode;
    try {
      await verificationClient.lineWebhookEventReceipt.create({
        data: {
          webhookEventId: newReceiptId,
          eventType: LineWebhookEventType.PATIENT_NEXT_APPOINTMENT,
          eventOccurredAt: new Date("2026-10-02T00:00:00.000Z"),
          outcome: LineWebhookEventOutcome.ACCEPTED,
        },
      });
    } catch (error) {
      duplicateCode = error?.code;
    }
    const receiptColumns = await verificationClient.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'LineWebhookEventReceipt'
      ORDER BY ordinal_position
    `;
    const enumLabels = await verificationClient.$queryRaw`
      SELECT t.typname AS enum_name, e.enumlabel AS value
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('LineWebhookEventType', 'LineWebhookEventOutcome')
      ORDER BY t.typname, e.enumsortorder
    `;
    const eventTypes = enumLabels.filter((row) => row.enum_name === "LineWebhookEventType").map((row) => row.value);
    const outcomes = enumLabels.filter((row) => row.enum_name === "LineWebhookEventOutcome").map((row) => row.value);
    if (
      duplicateCode !== "P2002" ||
      receiptColumns.map((row) => row.column_name).join(",") !== "webhookEventId,eventType,eventOccurredAt,acceptedAt,outcome" ||
      eventTypes.join(",") !== "FOLLOW,UNFOLLOW,RICHMENUSWITCH,PATIENT_NEXT_APPOINTMENT" ||
      outcomes.join(",") !== "APPLIED,STALE,IGNORED,ACCEPTED"
    ) {
      throw new Error("reactive LINE migration changed receipt schema, enum values, or webhookEventId uniqueness");
    }

    await verificationClient.lineWebhookEventReceipt.deleteMany({
      where: { webhookEventId: { in: [priorReceiptId, newReceiptId] } },
    });
    console.log("LINE reactive enum migration preserved an existing receipt, retained all prior enum values, accepted a PATIENT_NEXT_APPOINTMENT/ACCEPTED receipt, and kept the five-column receipt shape and unique webhookEventId invariant");
  } finally {
    if (prisma) await prisma.$disconnect();
    databaseDown(runtime, environment);
    if (safeTemporaryRoot.startsWith(`${safeTempBase}${sep}`)) {
      rmSync(safeTemporaryRoot, { recursive: true, force: true });
    }
  }
}

function generate(environment) {
  run(process.execPath, [resolve(repositoryRoot, "node_modules", "prisma", "build", "index.js"), "generate"], {
    env: environment,
  });
}

function test(environment) {
  run(
    process.execPath,
    [
      resolve(repositoryRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      "vitest.integration.config.mts",
    ],
    { env: environment },
  );
}

function testFocused(environment, relativeTestPath) {
  if (
    !relativeTestPath ||
    !/^tests\/integration\/[A-Za-z0-9._/-]+\.integration\.test\.ts$/u.test(relativeTestPath) ||
    relativeTestPath.split("/").includes("..")
  ) {
    fail("test:focused requires one integration test path under tests/integration");
  }

  generate(environment);
  migrate(environment);
  run(
    process.execPath,
    [
      resolve(repositoryRoot, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      "vitest.integration.config.mts",
      relativeTestPath,
    ],
    { env: environment },
  );
}

function verifyIntegration(environment) {
  generate(environment);
  migrate(environment);
  test(environment);
}

const action = process.argv[2];

if (!supportedActions.has(action)) {
  fail(`expected one of: ${[...supportedActions].join(", ")}`);
}

const environment = getIntegrationEnvironment();

if (action === "migrate") {
  migrate(environment);
  process.exit(0);
}

if (action === "test") {
  verifyIntegration(environment);
  process.exit(0);
}

if (action === "test:focused") {
  testFocused(environment, process.argv[3]);
  process.exit(0);
}

const runtime = resolveDockerRuntime(environment);

if (action === "db:up") {
  databaseUp(runtime, environment);
} else if (action === "db:down") {
  databaseDown(runtime, environment);
} else if (action === "db:reset") {
  databaseDown(runtime, environment);
  databaseUp(runtime, environment);
} else if (action === "db:status") {
  runCompose(runtime, environment, ["ps", "--all"]);
} else if (action === "verify") {
  try {
    databaseDown(runtime, environment);
    databaseUp(runtime, environment);
    verifyIntegration(environment);
  } finally {
    databaseDown(runtime, environment);
  }
} else if (action === "migrate:populated") {
  requireCommittedIntegrationTarget(environment);
  await migratePopulated(environment, runtime);
} else if (action === "migrate:line-populated") {
  requireCommittedIntegrationTarget(environment);
  await migrateLinePopulated(environment, runtime);
} else if (action === "migrate:line-reactive-populated") {
  requireCommittedIntegrationTarget(environment);
  await migrateLineReactivePopulated(environment, runtime);
}
