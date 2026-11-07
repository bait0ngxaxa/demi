# GitHub Actions CI

## Purpose and triggers

`DEMI CI` runs four independent jobs on separate isolated GitHub-hosted VMs, without `needs` dependencies. All four must pass for a green baseline; failures propagate without retries, exclusions or `continue-on-error`. Runner availability/account concurrency can delay otherwise independent jobs. It runs for pull requests targeting `main` and via `workflow_dispatch`. There is no push-to-main, schedule or deployment trigger. Concurrency is scoped to workflow and PR/ref; a running job is not cancelled by a newer run. GitHub may replace an older pending run with the latest pending run in the same group. Different refs have separate ephemeral databases.

This removes local desktop contention from routine CI verification; it does not establish a performance improvement or resolve the intermittent historical 5-second deadlines. See [the engineering closure evidence](FINAL_ENGINEERING_CLOSURE.md), including the two subsequent local full passes and the unresolved timing cause.

## Jobs and command dependencies

| Stable job ID | Check name | Commands after checkout and `npm ci` | Timeout |
| --- | --- | --- | --- |
| `quality` | Code Quality | `npm run prisma:generate`; `npm run lint`; `npm run typecheck`; `npm run prisma:migrations:check -- origin/main` | 20 minutes |
| `unit` | Unit Tests | `npm run prisma:generate`; `npm run test` | 20 minutes |
| `integration` | Full PostgreSQL integration | `npm run test:db:up`; `npm run test:integration`; always `npm run test:db:down` | 60 minutes |
| `build` | Production Build | `npm run prisma:generate`; `npm run build` | 20 minutes |

Every job has its own checkout, Node setup and install. Prisma generation precedes consumers of generated types/enums/client; it does not migrate or require a running database. Only integration starts PostgreSQL and generates its client through the established test command. Quality checkout fetches all refs so the filesystem/Git-only migration checker can compare with `origin/main`; the explicit argument avoids assuming a local `main` branch exists on a detached PR checkout. No database is needed for that check.

Default Vitest discovery includes `src`, `app`, `scripts` and `deploy` tests. Integration discovery exclusively includes `tests/integration/**/*.test.ts` using its separate config. The two jobs do not duplicate the database suite. Vitest logs report file/test pass/fail totals and duration; GitHub reports command and whole-job timing.

The 20-minute initial budgets allow setup and headroom over the documented local unit baseline (236 seconds), lint/typecheck and successful 4 GiB build; they are operational bounds, not measured hosted runtimes or per-test deadline changes. Integration retains 60 minutes. Review actual hosted timings before adjusting job budgets.

## Build environment

Build runs Next.js 16.3.0 with `NODE_OPTIONS=--max-old-space-size=4096` scoped only to its build step. The previous local default-heap TypeScript worker exhausted its heap; the documented 4 GiB build passed with type checking enabled. This controls V8 heap, not total process/VM memory.

Initial CI wiring supplies no application environment values. Source inspection found lazy Prisma/server configuration getters, session access after request-time APIs (`cookies`/`connection`), and no static database seeding requirement. Hosted build execution must confirm this assumption. Runtime environment validators remain strict. Public `NEXT_PUBLIC_*` values, if ever needed, are embedded/frozen at build time: use only explicitly synthetic nonproduction values and document each added value after evidence establishes necessity. Never deploy this verification output.

No database, Supabase service key, LINE credential or production API is provisioned for build. Dependency installation and `next/font/google` (Noto Sans Thai / Geist Mono) require network downloads; compilation is isolated from production services, not offline. Build artifacts are neither uploaded nor deployed. A build pass verifies compilation/type checking/route generation, not working production provider configuration or runtime readiness.

## Historical evidence

[Integration baseline run 42355925551](https://github.com/bait0ngxaxa/demi/actions/runs/42355925551), HEAD `8a63e49e00558c09ec03f42e71e27481f997c3e3`: SUCCESS, 76/76 files and 1,424/1,424 tests, PostgreSQL startup, Prisma generation/migrations, isolation and cleanup passed. Run 6m40s; integration command 5m08s. This is historical evidence for integration only. The expanded workflow requires a new run at its current HEAD with all four checks successful; these historical results do not establish that new jobs pass.

## Runtime and lifecycle

- Standard `ubuntu-24.04` x64 runner for each job; timeouts listed above. Repository metadata verified on 2026-11-07 reports `bait0ngxaxa/demi` as **PUBLIC**. The [first hosted run](https://github.com/bait0ngxaxa/demi/actions/runs/42354597328) observed 4 CPUs, approximately 15 GiB total RAM and 14 GiB available RAM before/after tests, with no swap use or integration test timeout. It failed on configuration/assertion errors; these snapshots show no memory exhaustion but cannot exclude transient pressure.
- GitHub currently documents 4 vCPUs, 16 GB RAM and 14 GB SSD for public standard Linux runners. The private-repository limits are separately 2 vCPUs, 8 GB RAM and 14 GB SSD; they did not describe that run. Visibility may change, and actual available resources depend on the runner image and OS/tool overhead. Verify CPU, memory and disk diagnostics in every run rather than treating current visibility or one measurement as permanent.
- Node.js `24.22.1`, matching the documented local baseline. Official checkout `v7.0.1` and setup-node `v7.1.0` are pinned to immutable commit SHAs. Review upstream releases before updating those pins.
- `npm ci` installs the committed lockfile. setup-node caches npm download data, not `node_modules`.
- `npm run test:db:up` uses `compose.integration.yaml`: PostgreSQL `17-alpine`, healthcheck/wait, localhost port `55432`, database `demi_test`, tmpfs storage and the existing read-only init SQL mount. The runner image already includes Docker Engine and Compose v2; no WSL is needed. The existing script selects its direct Docker path on Linux.
- `npm run test:integration` generates Prisma Client for the runner platform, validates database identity, deploys migrations, then runs the full Vitest suite. The schema uses native Prisma binaries by default; no Windows-generated client is copied or cached. The lockfile includes platform-specific optional packages for Linux. Actual hosted execution is still required to establish runtime compatibility.
- Existing global setup, database reset guards, `fileParallelism: false`, default 5,000 ms per-test deadline, fixtures and failure propagation remain unchanged.
- `npm run test:db:down` runs with `always()` even after install/start/test failure, when the runner can reach it. It removes Compose containers, volumes and orphans. Cleanup failure remains a visible failed step and does not replace the original test step result. Forced VM termination can prevent cleanup; the VM and tmpfs are ephemeral regardless.

Node and action SHAs are pinned; the existing PostgreSQL tag and GitHub runner image can change upstream. This is reproducible from the committed npm lockfile and integration configuration, not a bit-for-bit frozen OS/container image.

## Safety boundaries

Only the committed disposable `.env.integration` credentials are used. No Actions secrets, environment secrets, production URLs, patient datasets, or production Supabase, LINE or Cloudflare credentials are configured. Unit tests retain the existing synthetic defaults in `vitest.setup.ts` and scoped mocks; no live provider is provisioned. `contents: read` is the sole GITHUB_TOKEN permission; checkout does not persist credentials. PR code runs through `pull_request`, never `pull_request_target`.

The existing checks require all three database URLs to match the committed loopback target, `NODE_ENV=test`, database/user `demi_test`, schema `public` and the Compose-installed `DEMI_DISPOSABLE_INTEGRATION_DATABASE_V1` marker before migration/destructive test reset. Do not override the URLs or bypass these guards to repair CI. No persistent shared database or production infrastructure is involved. No raw logs/database artifacts are uploaded; avoid adding environment dumps or expanded Compose configuration to diagnostics because they expose disposable credentials.

## Manual execution and reading results

1. Open **GitHub Repository → Actions → DEMI CI → Run workflow**.
2. Select the intended branch and run it. `workflow_dispatch` is available when this workflow exists on the default branch, subject to repository Actions settings and the caller's permissions. The initial PR can run before the workflow is merged to the default branch.
3. Open each of **Code Quality**, **Unit Tests**, **Full PostgreSQL integration**, and **Production Build** and inspect its actual steps/conclusion for the current PR HEAD. For integration, check runner diagnostics, dependency installation, PostgreSQL startup, Prisma generation/migrations, Vitest results and the cleanup step individually.
4. Read the job summary for the integration command's exit code, elapsed seconds and step outcome. Vitest's test step log provides passed/failed file/test counts, exact failing test names and durations. The Actions run/job durations include setup and cleanup; the command duration includes generation and migrations. An interrupted test step may have no elapsed-time summary; inspect its logs and GitHub timing instead.

Only the historical integration PASS above is established by this guide at implementation time; new runs must be verified separately. A local Windows pass or successful workflow lint is not hosted execution evidence. Record a run URL, tested SHA, result, duration, file/test counts and cleanup outcome when verifying this workflow. A failed run remains FAIL even if an isolated rerun later passes.

## Failure diagnosis

| Symptom | Next check |
| --- | --- |
| No run / queued / approval required | Actions enabled, action allowlist permits the pinned official actions, fork approval, PR base `main`, concurrency, account quota/budget and runner availability. |
| Node/npm install fails | Setup-node download/network errors, lockfile consistency, native Linux optional dependencies and available disk. Keep `npm ci`; do not regenerate the lockfile without a demonstrated correctness issue. |
| Migration order checker cannot read base | Confirm quality checkout fetched `origin/main`; do not disable the check. |
| Build fails | Inspect the first compilation/type/prerender error, font download errors, heap/disk diagnostics and exact missing configuration. Preserve validation; add synthetic configuration only when justified. Major application defects block review rather than justify broad CI workarounds. |
| Unit tests fail | Read exact test names and duration in Vitest logs; reproduce only affected files with existing test defaults/mocks, without production credentials. |
| PostgreSQL startup fails | Docker/Compose versions and healthcheck/startup log; verify the committed init SQL mount and port availability. Do not switch to a shared database. |
| Identity check fails | Stop and recreate only the disposable environment using the existing lifecycle commands; never disable validation. |
| Prisma migration fails | Original migration error and disposable identity; distinguish schema/migration errors from network/resource failures. Do not edit applied migrations or use production credentials. |
| Vitest timeout / worker termination | Preserve the original failure, exact test and reported duration. Compare initial/final CPU, memory and disk snapshots and command/run timing. Snapshots cannot prove or exclude a transient pressure spike. Reproduce the exact case through `npm run test:integration:focused -- tests/integration/<file>.integration.test.ts` in a separately verified disposable environment; distinguish environmental pressure from a deterministic defect and state uncertainty. |
| Cleanup fails | Inspect its separate failed step alongside the original failure. The VM is disposable; investigate Docker availability without concealing test failure. |

Do not increase timeouts, add retries, skip cases, reduce fixtures, split/parallelize tests or alter business logic to force green CI. If resources prove insufficient, record measured bottlenecks and propose a larger or self-hosted runner as a separate decision.

## Usage, ownership and future changes

At the currently verified PUBLIC visibility, standard hosted runs are free and do not consume the plan's included compute usage. If visibility changes to private, standard hosted usage draws from the owner's plan allowance, with overage subject to current pricing and spending limits; the standard runner resource allocation may also decrease to the private-repository limits above. Cache/artifact storage has separate allowances. Recheck actual visibility, per-run diagnostics and account plan/billing after any visibility change. This workflow changes no visibility, billing setting or spending limit. Each PR update/manual run can consume four jobs; parallel execution reduces wall-clock time but total usage sums all job durations; concurrency avoids overlapping runs within a group but does not eliminate pending runs or total usage.

The owner must allow GitHub Actions and the pinned official actions, have suitable permissions/quota, and merge the PR through existing review/protection rules. No production secret or external service provisioning is needed. After this PR is merged, configure all four verified checks as described below; this workflow does not change branch protection.

To change runner size later, first collect actual run/resource evidence, obtain separate cost/security approval, then change the relevant `jobs.<id>.runs-on` to an approved runner label in a focused PR. Preserve lifecycle commands and all database guards. Larger runners, VPS/self-hosted provisioning, deployments, production access, product requirements/ADRs, test tuning and automated retries remain out of scope.

## Agent workflow and review gate

Implement → focused local tests/targeted lint for fast feedback → review diff and validate workflow → commit and push → update the existing Draft PR → inspect all four hosted jobs → resolve evidence-backed failures → engineering review → merge only after owner approval. Do not routinely run full unit/integration suites or production builds locally as a PR prerequisite. Full local execution remains appropriate for explicitly justified debugging/exceptional cases in a verified disposable environment.

For every new HEAD, record run URL, SHA, each job conclusion/duration, unit/integration totals, build result and cleanup outcome in the PR. Verify all four actual check names under PR **Checks**, not just the overall badge. Keep names stable. A failed, skipped, cancelled or unverified job is not a green review baseline. Historical successes do not substitute for the current HEAD. Leave the PR open; no automatic merge or deployment.

## Owner: required checks after merge

After all four checks have actually reported and passed, and this PR is reviewed/merged, an owner can use **Settings → Rules → Rulesets → New branch ruleset**, target `main`, enable **Require a pull request before merging** and **Require status checks to pass**, then select the exact reported checks: **Code Quality**, **Unit Tests**, **Full PostgreSQL integration**, **Production Build** (GitHub Actions source, where offered). Alternatively use **Settings → Branches → Branch protection rule** for `main` and add the same checks. Confirm them in the PR Checks interface first; do not require invented names. Availability/permissions depend on the repository plan. Keep review requirements consistent with repository policy; do not enable auto-merge. No settings are changed by this work.

## Official references

- [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node): supported action versions, Node version selection and npm caching.
- [Node distribution index](https://nodejs.org/dist/index.json): Node 24.22.1 Linux x64 distribution.
- [Hosted runner resources](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and [Ubuntu 24.04 image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md): resource limits and Docker/Compose availability.
- [Manual workflow execution](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): permissions, default-branch availability and usage.

- [Required status check rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets): owner configuration after verified checks and review.
- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables): build-time public values versus server runtime configuration.
