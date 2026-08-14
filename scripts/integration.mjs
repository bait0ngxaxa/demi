import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
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
  "test",
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
}
