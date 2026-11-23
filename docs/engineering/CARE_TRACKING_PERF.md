# CT-1 care tracking read — measurement (audit P3), 2026-11-22

Baseline: `723666b2` (`main`). This is the analysis step only; no query or setting changes here. It answers one question:
does the care-tracking statement stay within a budget as one Hospital grows?

## How it was measured

```bash
npm run test:db:up
npm run test:benchmark -- tests/benchmarks/care-tracking.benchmark.test.ts
npm run test:db:down
```

`tests/benchmarks/care-tracking.benchmark.test.ts` uses the disposable integration database (PostgreSQL 17,
`compose.integration.yaml`). The results below were taken while that database still ran PostgreSQL's default
`jit = on`; it now runs `jit = off` like Supabase (see the decision at the end). The setup:

- **Data:** one Hospital is grown to 500, then 2,000, then 5,000 patients. A second Hospital with 2,000 patients is out
  of scope. Both use the synthetic distribution documented in the file header (baseline, active/completed Programs
  with 1–8 rounds, vitals, follow-ups, round activities, final assessments, appointments, ended care).
- **Timed:** `ANALYZE` runs after each size, then one warm-up run and 10 measured runs.
- **What is timed:**
  - **statement:** `careTrackingQueryInternals.buildTrackingStatement` exactly as `getCareTrackingPage` issues it.
  - **jit off:** the same statement inside a transaction with `SET LOCAL jit = off`.
  - **page:** the whole `getCareTrackingPage` read (scope proof + statement + the page's batched load).
- **Plans:** `EXPLAIN (ANALYZE, BUFFERS)` is recorded for the default page, a name search and the last page, with JIT on
  and off. Representative plans are in [`care-tracking-perf/`](care-tracking-perf/).

## Results (ms)

| patients | scenario | rows | statement p50 | statement p95 | jit off p50 | jit off p95 | page p50 | page p95 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 500 | default page | 435 | 179.4 | 199.6 | 25.7 | 27.1 | 211.2 | 273.3 |
| 500 | name search (~10%) | 48 | 8.2 | 14.6 | 10.7 | 11.4 | 21.0 | 33.1 |
| 500 | last page | 435 | 171.8 | 188.5 | 25.3 | 27.3 | 195.0 | 223.3 |
| 2,000 | default page | 1,745 | 2,085.5 | 2,444.9 | 54.7 | 58.7 | 2,095.4 | 2,170.2 |
| 2,000 | name search (~10%) | 193 | 13.5 | 15.2 | 15.9 | 16.3 | 22.2 | 29.2 |
| 2,000 | last page | 1,745 | 2,083.2 | 2,672.3 | 46.7 | 55.0 | 2,093.9 | 2,109.3 |
| 5,000 | default page | 4,362 | 2,033.2 | 2,071.8 | 91.9 | 110.0 | 2,059.6 | 2,206.3 |
| 5,000 | name search (~10%) | 484 | 24.9 | 25.7 | 26.8 | 28.1 | 34.1 | 194.9 |
| 5,000 | last page | 4,362 | 2,055.0 | 2,592.9 | 91.9 | 109.8 | 2,042.0 | 2,066.5 |

Each stage filter and the overdue-appointment signal, with JIT off (statement p50 / p95):

| filter | 500 | 2,000 | 5,000 |
|---|---:|---:|---:|
| NOT_STARTED | 26.0 / 33.3 | 39.6 / 46.1 | 83.4 / 95.7 |
| READY_FOR_PROGRAM | 25.3 / 26.2 | 37.3 / 41.0 | 105.5 / 115.5 |
| IN_ROUND | 25.7 / 30.8 | 38.5 / 41.7 | 109.5 / 136.3 |
| IN_EXTRA_ROUND | 25.3 / 26.7 | 38.1 / 51.6 | 78.7 / 82.0 |
| AWAITING_AFTER | 25.2 / 25.7 | 37.8 / 40.7 | 76.0 / 80.3 |
| AWAITING_PROGRAM_END | 25.2 / 26.8 | 39.2 / 66.9 | 102.2 / 115.7 |
| PROGRAM_COMPLETED | 25.4 / 27.7 | 51.9 / 72.3 | 105.3 / 114.3 |
| CARE_ENDED | 24.8 / 26.0 | 47.5 / 51.6 | 77.1 / 108.1 |
| signal overdueAppointment | 25.6 / 31.1 | 37.4 / 43.0 | 80.6 / 112.4 |
| HN exact search | 9.2 / 10.5 | 13.2 / 14.4 | 21.7 / 22.8 |

## Finding: the cost is JIT compilation, not the scan

The statement's work grows linearly with the patients in scope. With JIT off it takes 92 ms at 5,000 patients and
every filter stays under 140 ms p95. With PostgreSQL's default JIT settings, almost all of the time is compiling the
query:

| plan | estimated total cost | JIT total | execution time |
|---|---:|---:|---:|
| 500, default page | 134,684 | 152 ms (no inlining/optimization) | 174 ms |
| 2,000, default page | 590,786 | 2,104 ms (inlining + optimization) | 2,157 ms |
| 5,000, default page | 2,355,584 | 1,978 ms (inlining + optimization) | 2,084 ms |
| 5,000, default page, `jit = off` | 2,355,584 (same plan) | — | 115 ms |
| 5,000, name search (~10%) | 132,216 | 141 ms (no inlining/optimization) | 170 ms |

The mechanism:

1. **The planner badly overestimates the statement.** At 5,000 patients it estimates 2.36 million cost units for
   about 100 ms of work. In `staged`/`tracked`, the stage `CASE` and the signal columns are inlined at several call
   sites, and each copy carries its own `EXISTS` subplans over `PatientBaseline` and the `program` CTE. The 5,000-patient
   plan repeats the baseline and completed-Program subplans four times each.
2. **The estimate crosses the default thresholds.** It passes `jit_above_cost` (100,000) at 500 patients. It passes
   `jit_inline_above_cost` and `jit_optimize_above_cost` (500,000) somewhere between 500 and 2,000 patients. From then
   on, every request pays about 2 s of LLVM inlining and optimization for roughly 350 functions.
3. **Searches escape it.** A name or HN search narrows the scope, so its estimate stays below the thresholds and it is
   fast with or without JIT. The 5,000-patient name search crosses only the first threshold: 141 ms of JIT,
   170 ms execution.
4. **The compile time is flat in data size.** It is about 2 s at both 2,000 and 5,000 patients. So the problem appears
   abruptly once a Hospital crosses the threshold and does not grow further.

What this is not:
- **Not the index layout.** Every `activity` source is reached through an index or a hash join on its
  relationship/program key: `(patientProgramId, roundNumber)` uniques on rounds, completions, vitals and activities;
  `PatientFinalAssessment.patientProgramId` unique; `PatientFollowup (patientHospitalRelationshipId, recordedAt)`;
  `PatientBaseline.patientHospitalRelationshipId` unique; `PatientAppointment (patientHospitalRelationshipId, scheduledAt)`.
- **Not the sort or the page window.** At 5,000 patients, WindowAgg plus the sort over about 4,800 rows is a few
  milliseconds.

The audit's options (a), a LATERAL rewrite of `activity`, and (b), splitting the summary from the page query, would
not remove the JIT cost. Neither is needed to meet the budget below once JIT is out of the way.

## Budget

**`getCareTrackingPage` p95 ≤ 300 ms at 5,000 patients in one Hospital.** The repository owner approved it on
2026-11-22, during the PR-C review (#58). It is measured with this benchmark here, and on staging through the Supabase
Session pooler before production (see Follow-ups).

Sample size: every figure in this document comes from 10 measured runs, so its p95 is effectively the largest sample.
That is enough to separate 100 ms from 2 s. It is not an SLO measurement: the staging measurement uses at least
30–50 runs per scenario.

| measurement | result | budget | status |
|---|---:|---:|---|
| 5,000 patients, default settings (page p95) | 2,206 ms | 300 ms | over |
| 5,000 patients, `jit = off` (statement p95, worst filter) | 136 ms | 300 ms | within; the page adds about 10–20 ms |

## Remedies, least invasive first (none applied here)

1. **Statement-scoped `SET LOCAL jit = off`.** Run the tracking statement in a sequential (non-interactive) transaction
   `[SET LOCAL jit = off, statement]`.
   - It does not depend on server or role settings, affects no other query, and works on the Session pooler.
   - It holds a connection only for those two statements.
   - A test asserts the setting is applied.
2. **`ALTER ROLE … SET jit = off`** for the application role, as an operations change.
   - It also protects other complex reads.
   - It changes every query of the role, and its value must first be read from the production project.
   - It does not keep working if the database or role is replaced.
3. **Lower the estimate.** Make `staged` `AS MATERIALIZED` so the stage `CASE` and its subplans are evaluated once.
   - This removes the duplicated subplans.
   - The estimate still grows with the patient count, so it moves the threshold instead of removing it.
   - It is worth doing together with 1 only if a plan shows a measurable gain.

## Supabase setting and decision (2026-11-22)

The Supabase project available to this account is `Demi-dev` (PostgreSQL 17.6). Its settings were read with one
read-only query as the application role `postgres`:

| setting | Demi-dev | disposable test database before this change |
|---|---|---|
| `jit` | **off** | on (PostgreSQL default) |
| `jit_above_cost` / `jit_inline_above_cost` / `jit_optimize_above_cost` | 100000 / 500000 / 500000 | same |
| role or database overrides of `jit` (`pg_db_role_setting`) | none | none |

Supabase ships `jit = off`, so a Supabase-hosted DEMI already behaves like the "jit off" columns above: about 110 ms
statement p95 at 5,000 patients. That is within the approved budget. The 2 s cost appeared only in the disposable
test database. The production project was not read directly (it is not in this account). Its value is checked with
the step added to `docs/operations/SUPABASE_PRODUCTION.md` §2.

**Decision:** no change to the request path. Remedy 1 would add a transaction (two to three more round trips to the pooler) to
every request, for a setting production already has. Instead:
- **Test database:** `compose.integration.yaml` sets `jit = off`, so integration tests and benchmarks run with the
  planner settings production runs with.
- **Production check:** `docs/operations/SUPABASE_PRODUCTION.md` §2 requires `jit = off` and says how to verify it as
  the application role.
- **Enforced check:** `/api/health` reports `checks.jitOff` from `current_setting('jit')` as the application role, so a
  platform change, a role or database override, or a new host is visible wherever someone reads that field. It is
  advisory and never turns readiness into 503: the application still works with JIT on, and taking it out of service
  would not fix a database setting. Because the response stays 200 when `jitOff` is `false`, the external uptime monitor
  (a status-code check) sees availability only and never notices JIT. `jitOff` is checked by the deploy runbook
  (`docs/operations/DEPLOY_VPS.md` requires it to be `true` after every deploy) and at the first production deploy
  (`docs/operations/SUPABASE_PRODUCTION.md` §2).
- **Reading `jitOff: false`:** it means "JIT is not confirmed off", not only "JIT is on". It is also `false` when the
  setting could not be read: the database is unreachable (`checks.database` is `false` and the response is already
  503), or the database answered but the `current_setting('jit')` query failed or timed out (still 200). Check
  `checks.database` first, then run the SUPABASE_PRODUCTION.md §2 query as the application role.
- **This benchmark:** it still times `SET LOCAL jit = on` for its page scenarios, so a regression back to a JIT-heavy
  plan stays visible.

Confirmation run with the test database at `jit = off` (ms; "jit on" is `SET LOCAL jit = on` on the same statement):

| patients | scenario | statement p50 / p95 | jit on p50 / p95 | page p50 / p95 |
|---:|---|---:|---:|---:|
| 500 | default page | 27.4 / 36.8 | 225.5 / 302.9 | 61.4 / 109.6 |
| 2,000 | default page | 44.2 / 51.3 | 2,079.4 / 2,106.8 | 54.1 / 69.1 |
| 5,000 | default page | 88.0 / 89.5 | 2,009.8 / 2,057.2 | 98.0 / 116.2 |
| 5,000 | last page | 90.2 / 92.0 | 2,015.0 / 2,054.1 | 98.5 / 115.9 |
| 5,000 | name search (~10%) | 24.6 / 26.3 | 27.2 / 27.9 | 34.3 / 48.6 |

At 5,000 patients the page p95 is 116 ms, within the 300 ms budget.

Remedy 1 or 2 becomes necessary if DEMI moves to a PostgreSQL host whose default is `jit = on`. Remedy 3 is optional
tuning; nothing in these measurements requires it.

## Follow-ups

- **Staging measurement (open).** Before production, run the scenarios above on staging through the Supabase Session
  pooler with at least 30–50 runs each. Record p50/p95 next to the budget. Confirm `/api/health` reports
  `"jitOff": true` there.
- **Production setting (open).** Read `checks.jitOff` and run the SUPABASE_PRODUCTION.md §2 query on the production
  project at its first deploy. Only Demi-dev was available for this analysis.
