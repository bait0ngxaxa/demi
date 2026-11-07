# GitHub Actions full integration CI

## Purpose and triggers

`DEMI Full Integration` runs the existing complete PostgreSQL integration suite in an isolated GitHub-hosted VM. It runs for pull requests targeting `main` and via `workflow_dispatch`. There is no push-to-main, schedule or deployment trigger. Concurrency is scoped to workflow and PR/ref; a running job is not cancelled by a newer run. GitHub may replace an older pending run with the latest pending run in the same group. Different refs have separate ephemeral databases.

This removes local desktop contention from routine CI verification; it does not establish a performance improvement or resolve the intermittent historical 5-second deadlines. See [the engineering closure evidence](FINAL_ENGINEERING_CLOSURE.md), including the two subsequent local full passes and the unresolved timing cause.

## Runtime and lifecycle

- Standard `ubuntu-24.04` x64 runner; job timeout 60 minutes. GitHub currently documents 2 vCPUs, 8 GB RAM and 14 GB SSD for private repositories, and 4 vCPUs, 16 GB RAM and 14 GB SSD for public repositories. Available memory/disk are lower after OS/tool overhead. Runtime diagnostics are authoritative for each run.
- Node.js `24.22.1`, matching the documented local baseline. Official checkout `v7.0.1` and setup-node `v7.1.0` are pinned to immutable commit SHAs. Review upstream releases before updating those pins.
- `npm ci` installs the committed lockfile. setup-node caches npm download data, not `node_modules`.
- `npm run test:db:up` uses `compose.integration.yaml`: PostgreSQL `17-alpine`, healthcheck/wait, localhost port `55432`, database `demi_test`, tmpfs storage and the existing read-only init SQL mount. The runner image already includes Docker Engine and Compose v2; no WSL is needed. The existing script selects its direct Docker path on Linux.
- `npm run test:integration` generates Prisma Client for the runner platform, validates database identity, deploys migrations, then runs the full Vitest suite. The schema uses native Prisma binaries by default; no Windows-generated client is copied or cached. The lockfile includes platform-specific optional packages for Linux. Actual hosted execution is still required to establish runtime compatibility.
- Existing global setup, database reset guards, `fileParallelism: false`, default 5,000 ms per-test deadline, fixtures and failure propagation remain unchanged.
- `npm run test:db:down` runs with `always()` even after install/start/test failure, when the runner can reach it. It removes Compose containers, volumes and orphans. Cleanup failure remains a visible failed step and does not replace the original test step result. Forced VM termination can prevent cleanup; the VM and tmpfs are ephemeral regardless.

Node and action SHAs are pinned; the existing PostgreSQL tag and GitHub runner image can change upstream. This is reproducible from the committed npm lockfile and integration configuration, not a bit-for-bit frozen OS/container image.

## Safety boundaries

Only the committed disposable `.env.integration` credentials are used. No Actions secrets, environment secrets, production URLs, patient datasets, Supabase, LINE or Cloudflare credentials are configured. `contents: read` is the sole GITHUB_TOKEN permission; checkout does not persist credentials. PR code runs through `pull_request`, never `pull_request_target`.

The existing checks require all three database URLs to match the committed loopback target, `NODE_ENV=test`, database/user `demi_test`, schema `public` and the Compose-installed `DEMI_DISPOSABLE_INTEGRATION_DATABASE_V1` marker before migration/destructive test reset. Do not override the URLs or bypass these guards to repair CI. No persistent shared database or production infrastructure is involved. No raw logs/database artifacts are uploaded; avoid adding environment dumps or expanded Compose configuration to diagnostics because they expose disposable credentials.

## Manual execution and reading results

1. Open **GitHub Repository → Actions → DEMI Full Integration → Run workflow**.
2. Select the intended branch and run it. `workflow_dispatch` is available when this workflow exists on the default branch, subject to repository Actions settings and the caller's permissions. The initial PR can run before the workflow is merged to the default branch.
3. Open **Full PostgreSQL integration**. Check runner diagnostics, dependency installation, PostgreSQL startup, Prisma generation/migrations, Vitest results and the cleanup step individually.
4. Read the job summary for the integration command's exit code, elapsed seconds and step outcome. Vitest's test step log provides passed/failed file/test counts, exact failing test names and durations. The Actions run/job durations include setup and cleanup; the command duration includes generation and migrations. An interrupted test step may have no elapsed-time summary; inspect its logs and GitHub timing instead.

No hosted PASS is asserted by this guide. A local Windows pass or successful workflow lint is not hosted execution evidence. Record a run URL, tested SHA, result, duration, file/test counts and cleanup outcome when verifying this workflow. A failed run remains FAIL even if an isolated rerun later passes.

## Failure diagnosis

| Symptom | Next check |
| --- | --- |
| No run / queued / approval required | Actions enabled, action allowlist permits the pinned official actions, fork approval, PR base `main`, concurrency, account quota/budget and runner availability. |
| Node/npm install fails | Setup-node download/network errors, lockfile consistency, native Linux optional dependencies and available disk. Keep `npm ci`; do not regenerate the lockfile without a demonstrated correctness issue. |
| PostgreSQL startup fails | Docker/Compose versions and healthcheck/startup log; verify the committed init SQL mount and port availability. Do not switch to a shared database. |
| Identity check fails | Stop and recreate only the disposable environment using the existing lifecycle commands; never disable validation. |
| Prisma migration fails | Original migration error and disposable identity; distinguish schema/migration errors from network/resource failures. Do not edit applied migrations or use production credentials. |
| Vitest timeout / worker termination | Preserve the original failure, exact test and reported duration. Compare initial/final CPU, memory and disk snapshots and command/run timing. Snapshots cannot prove or exclude a transient pressure spike. Reproduce the exact case through `npm run test:integration:focused -- tests/integration/<file>.integration.test.ts` in a separately verified disposable environment; distinguish environmental pressure from a deterministic defect and state uncertainty. |
| Cleanup fails | Inspect its separate failed step alongside the original failure. The VM is disposable; investigate Docker availability without concealing test failure. |

Do not increase timeouts, add retries, skip cases, reduce fixtures, split/parallelize tests or alter business logic to force green CI. If resources prove insufficient, record measured bottlenecks and propose a larger or self-hosted runner as a separate decision.

## Usage, ownership and future changes

Standard hosted usage in private repositories consumes the account's included Actions minutes; overage, spending limits and cache storage depend on the account plan and current GitHub pricing. Public standard hosted runs are currently free. Check the repository's actual visibility and account billing rather than assuming either case. This workflow changes no visibility, billing setting or spending limit. Each PR update/manual run can consume another full job; concurrency avoids overlapping runs within a group but does not eliminate pending runs or total usage.

The owner must allow GitHub Actions and the pinned official actions, have suitable permissions/quota, and merge the PR through existing review/protection rules. No production secret or external service provisioning is needed. Optionally configure this job as a required branch-protection check through the established repository process; the workflow does not change branch protection.

To change runner size later, first collect actual run/resource evidence, obtain separate cost/security approval, then change `jobs.integration.runs-on` to an approved runner label in a focused PR. Preserve lifecycle commands and all database guards. Larger runners, VPS/self-hosted provisioning, deployments, production access, product requirements/ADRs, test tuning and automated retries remain out of scope.

## Official references

- [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node): supported action versions, Node version selection and npm caching.
- [Node distribution index](https://nodejs.org/dist/index.json): Node 24.22.1 Linux x64 distribution.
- [Hosted runner resources](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and [Ubuntu 24.04 image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md): resource limits and Docker/Compose availability.
- [Manual workflow execution](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): permissions, default-branch availability and usage.
