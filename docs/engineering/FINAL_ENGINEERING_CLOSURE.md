# DEMI — Final Engineering Closure

Recorded 2026-11-07, Asia/Bangkok. This is an engineering evidence record, not production release approval.

## 1. Baseline and commits

- Starting HEAD: `e01e518c5c9cb51ffc11aa1f476d7fd3fcd409a9`, branch `main`, clean working tree. The actual HEAD matched the supplied reviewed baseline; no newer work was discarded.
- Source/documentation HEAD tested by final regression: `79780a132bd81daa583473e2f3d4b86c6f36c6d8`.
- Commit 1: `324d3bdf807fbc4a9de721b8977e6bafa7ef5c12` — `perf(db): harden reviewed unbounded queries without changing behavior`.
- Commit 2: `79780a132bd81daa583473e2f3d4b86c6f36c6d8` — `docs: reconcile current requirements and release records with implementation`.
- Commit 3 / final HEAD: the commit introducing this report, titled `test: verify engineering cleanup and record closure evidence`. Resolve its exact SHA with the command below; embedding this report's own commit hash would change that hash. The resolved SHA is also supplied in the delivery response.

```sh
git log --diff-filter=A -1 --format=%H -- docs/engineering/FINAL_ENGINEERING_CLOSURE.md
git log --oneline e01e518c5c9cb51ffc11aa1f476d7fd3fcd409a9..HEAD
```

Commit 3 changes documentation only. The complete implementation/documentation diff was reviewed before the final broad checks; no application code changed afterward. No dependencies, lockfiles, schemas, migrations, runtime configuration, clinical wording, authentication or authorization rules were changed. No commit was pushed.

## 2. Query hardening

The current allowlist had exactly seven explicit FOLLOW-UP exceptions. Full caller, schema/index, transaction and consumer evidence is in [QUERY_HARDENING_AUDIT.md](./QUERY_HARDENING_AUDIT.md). No historical exception outside those seven was targeted.

| File / function / query | Original concern and actual risk | Disposition / change | Test evidence and remaining limitation |
| --- | --- | --- | --- |
| `src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts` / `getHospitalHierarchyDirectory` / Hospital | All non-retired Hospitals; global report totals, exact-Hospital lookup and browser filtering consume the whole hierarchy. No domain cardinality limit. | DEFERRED_WITH_EVIDENCE. Preserve complete discovery/counts; follow-up must page the consumer contract, search and separate whole-directory totals together. | Existing hierarchy/global-report tests included in broad suites. No new pagination implemented or claimed. Full registry/browser memory cost remains. |
| `src/modules/hospital-service-areas/services/hospital-network-governance-service.ts` / `getHospitalNetworkForAdmin` / managed service areas | All active operational Children of one Parent; the ADMIN detail UI derives counts, empty state and role-change availability from the full array. Children per Parent are not bounded. | DEFERRED_WITH_EVIDENCE. Retain complete operational associations; adopt existing `listHospitalServiceAreasForAdmin` pages with whole-scope counts/existence and navigation in a later coordinated change. | Existing network/service-area/parent-led onboarding tests included in broad suites. No canonical hierarchy or Patient authority change. This complete-array query still grows with the network. |
| `src/modules/hospital-governance/services/hospital-governance-service.ts` / `evaluateRegistrationRows` / Hospital | Full registry read and retention for normalized-name similarity. Raw name membership queries would miss NFC/whitespace/Thai case equivalence; the CSV supplies names, not codes. | FIXED. Traverse the complete existing SERIALIZABLE snapshot in 250-row immutable-ID batches; retain only submitted-name matches. Keep apply re-evaluation, intra-file duplicates, explicit confirmation, generated codes, uniqueness constraints and replay handling. No migration/index added. | New PostgreSQL test `finds normalised names beyond two registry batches without losing within-file duplicates`: 503 Hospitals, three cross-batch matches, Unicode/whitespace variants, file duplicates and rejected unconfirmed apply. Parent-led suite: 30 PASS. Still O(registry size) time; required actual-match output can grow. No truncated sample. |
| `src/modules/account-security/services/mediated-password-reset-service.ts` / `listQuarantinedMediatedPasswordResets` / `workforceActivation` | Global unreconciled quarantine inventory can grow indefinitely. The production break-glass consumer loads it before selecting its ADMIN's unique reset. | DEFERRED_WITH_EVIDENCE. No item dropped. Future scoped break-glass lookup and per-storage keyset operational inventory must retain uniqueness/provider safety. | Mediated reset focused suite: 53 PASS; broad suite also covers its authorization/audit/lifecycle cases. Complete queue materialization remains; no operational volume evidence was supplied. |
| Same full file/function as preceding row / `accountRecovery` | Same global inventory risk for patient recovery; expiry does not resolve uncertain provider outcomes. | DEFERRED_WITH_EVIDENCE. Existing ADMIN revalidation, predicates and transaction retained. Same coordinated follow-up. | Same 53-test focused suite. No status, anti-enumeration, reconciliation or audit changes. Full unresolved inventory remains. |
| Same full file/function as preceding row / `linePasswordRecoveryCapability` | Same global inventory risk for LINE recovery; uncertain operations remain quarantined until safely reconciled. | DEFERRED_WITH_EVIDENCE. No arbitrary cap or silent omission. Same coordinated follow-up. | Same 53-test focused suite. Provider reconciliation safety unchanged; full unresolved inventory remains. |
| `src/modules/account-security/services/password-change-service.ts` / `listUnresolvedPasswordChangeOperations` / User | CLI previously materialized every fenced User before printing. Inspection showed `--list` only lists; reconciliation explicitly targets one User/operation, rather than automatically draining the list. | FIXED. Added `iterateUnresolvedPasswordChangeOperations`, using 100-row immutable User-ID keyset batches; CLI streams it in deterministic ID order. Preserve the complete chronological list service for compatibility and the original per-operation reconciliation lock/idempotency/audit. | New PostgreSQL test `traverses every unresolved operation across batches when earlier fences are released`: 205 operations, tied start times, no skips/duplicates while earlier fences clear, then empty traversal. The live inventory is not a snapshot: new/replaced operations behind the cursor require another scan. Listing never records completion. The compatibility list still buffers its complete output. |

Disposition totals: **2 FIXED / 0 ACCEPTED_BOUNDED_BY_DOMAIN / 5 DEFERRED_WITH_EVIDENCE**. Removed only the two resolved allowlist entries. The five deferred entries remain explicit FOLLOW-UPs with evidence links. Query checker and lint protection are unchanged: **349 reviewed unbounded reads, none new, 5 FOLLOW-UPs**.

## 3. Documentation reconciliation

Commit 2 updated these seven files:

- `docs/requirements/REMAINING_GAPS.md`: audited every previous unfinished item; separated implementation, external content, operational evidence and agency decisions. Removed stale Legal/Consent and Program-report implementation gaps. Reconciled network Phase A, accepted navigation/defaults, already-confirmed CVD and appointment-time decisions; retained the provisional NOTIF-03 lateness decision separately.
- `docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md`: preserved all 155 IDs and the existing status vocabulary. CARE-12 now VERIFIED_COMPLETE based on current accepted behavior and named PostgreSQL tests. CARE-01/02 remain CONTENT_PENDING for unreceived official content; CARE-15 remains CONTENT_PENDING for the outcome list. Legal rows retain IMPLEMENTED, with obsolete RD-2 notes explicitly historical. Counts: 125 VERIFIED_COMPLETE, 21 IMPLEMENTED, 3 CONTENT_PENDING, 5 SUPERSEDED, 1 RETIRED; PARTIAL/MISSING/AGENCY_GOVERNED are zero.
- `docs/requirements/WB_ALIGNMENT_DECISIONS.md`: dated EC-2026-11-07 amendment records accepted Work navigation/role UI and clinical/default behavior, reported cross-role/mobile/LINE success, and the outstanding outcome list. Acceptance does not imply receipt of official clinical content.
- `docs/operations/RELEASE_GATE.md`: separated CODE VERIFIED, BUSINESS APPROVED/attestation and OPERATIONALLY VERIFIED. T-01..T-21 and G-01..G-06 remain open. C-01's old form requirement is superseded for accepted timeline behavior; C-04 reflects the already-recorded CVD decision. C-02 and C-03 remain open.
- `PRODUCT.md`, `docs/requirements/REPORTING_ACCESS_CANONICAL.md`, `docs/requirements/WB_ROUND_ACTIVITY_CROSSWALK.md`: short current amendments prevent old phase/backlog/default statements being read as current redesign requirements. Historical phase records and accepted ADRs were not rewritten or deleted.

Commit 1 added the query audit above. Commit 3 adds this report. Thai text, existing document BOMs and working-copy CRLF style were preserved; new Markdown uses UTF-8 without BOM. An initial ad-hoc encoding comparison incorrectly compared working-copy CRLF to Git-normalized LF; the corrected UTF-8/BOM/non-mixed-CRLF check passed without an encoding change.

## 4. Verification matrix

Environment: Windows/PowerShell, Node `v24.22.1`, npm `11.19.1`, Next `16.3.0`, generated Prisma Client `6.19.3`, repository disposable PostgreSQL 17 container at the committed integration target. Started the previously stopped test container via `npm run test:db:up`; 119 existing migrations applied successfully on that disposable database. No production database/provider/device evidence was collected. Provider effects use the repository's test adapters where specified by the suites.

| Exact command / scope | Result | Evidence |
| --- | --- | --- |
| `npm run test:integration:focused -- tests/integration/parent-led-child-onboarding.integration.test.ts` | PASS | 30 tests, including new 503-Hospital traversal case. |
| `npm run test:integration:focused -- tests/integration/mediated-password-reset.integration.test.ts` | PASS | 53 tests, including new 205-operation live traversal case. |
| `npm run test -- src/modules/hospital-governance/domain/hospital-registration-csv.test.ts src/modules/hospital-governance/services/hospital-governance-service.test.ts src/modules/account-security/services/password-change-service.test.ts scripts/check-unbounded-find-many.test.mjs` | PASS | 4 files / 34 tests. |
| `npm run lint:find-many` | PASS | 349 reviewed reads, no new/stale entries, 5 explicit FOLLOW-UPs; also passed inside final lint. |
| `npx eslint src/modules/hospital-governance/services/hospital-governance-service.ts src/modules/account-security/services/password-change-service.ts scripts/password-change-reconcile.mjs tests/integration/parent-led-child-onboarding.integration.test.ts tests/integration/mediated-password-reset.integration.test.ts` | PASS | Changed source/CLI/integration files. |
| `npm run test -- scripts/business-flow-gap-canonical.test.mjs` | PASS | 4 tests: row shape/unique IDs, one known status, summary counts, concrete missing item for PARTIAL. Also included in full unit suite. |
| `npm run lint` | PASS | Full ESLint and query guard, exit 0. |
| `npm run typecheck` | PASS | Repository script uses 4 GB heap; exit 0. Passed before Commit 1 and again after Commit 2. |
| `npm run test` | PASS | 591 files / **6,612 tests**, 236.28 s. One full run, after stable diff and green lint/typecheck. |
| `npm run test:integration` | FAIL | **74 files passed / 2 failed; 1,422 tests passed / 2 timed out**, 814.76 s. Both failures were the unchanged 5,000 ms test deadline, detailed below. No complete-suite rerun or weakened timeout. |
| `npm run build` | FAIL | Turbopack compiled successfully in 42 s; TypeScript worker then exhausted its approximately 2 GB JavaScript heap. No type diagnostic preceded the OOM. |
| PowerShell: `$env:NODE_OPTIONS='--max-old-space-size=4096'; npm run build` | PASS | Process-only retry: complete build, TypeScript checking and route generation succeeded, exit 0. Previous NODE_OPTIONS restored afterward. No config change, type-check bypass, added flag framework or deployment. Retry justified by explicit heap exhaustion and the existing 4 GB typecheck convention. |
| `git diff --check` and `git diff e01e518c5c9cb51ffc11aa1f476d7fd3fcd409a9 --check` | PASS | Stable diff/whitespace review before broad checks; report checked again before Commit 3. |

The five requested unmodified command invocations yielded **3 PASS / 2 FAIL / 0 BLOCKED**. The additional memory-adjusted build passed. The two full test suites together yielded **8,034 passing tests / 2 timeouts**; focused reruns are separate evidence, not extra unique coverage or a replacement for the failed integration run.

### Timeout investigation ledger

No source, test assertion, timeout, retry rule or static-analysis configuration was changed to obtain these results. Commands below use the committed disposable environment and unchanged integration global-setup safeguards. Runs were sequential, with no concurrent integration consumers.

```sh
node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/workforce-onboarding-v2.integration.test.ts -t 'replays 50 rows with their original created classification and no duplicate audit'
node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/report-pipeline-e2e.integration.test.ts
```

| Experiment | Result / interpretation |
| --- | --- |
| Broad integration: workforce bulk replay, `workforce-onboarding-v2.integration.test.ts:902` | FAIL: 5,000 ms test deadline; test reported 5,165 ms. This is `provisionWorkforceBulk`, not modified hospital registration or password-change traversal. |
| Same workforce case, isolated twice | PASS both times; suite test-phase durations 4.62 s / 4.63 s. Each run selected 1 case, with 214 intentionally filtered cases (not missing broad coverage). Evidence supports timing sensitivity; it does not prove the host/DB contention cause. |
| Broad integration: report pipeline, `report-pipeline-e2e.integration.test.ts:211` | FAIL: 5,000 ms deadline; test reported 5,016 ms. Test writes a Program through server actions and checks workbook cells; it does not call either changed query function. |
| Report pipeline, isolated run 1 | FAIL: same 5,000 ms deadline; test-phase duration 5.58 s. This disproved the initial assumption that isolation alone would always clear it. |
| Same report pipeline at starting SHA in a detached worktree, same dependencies/database/environment | PASS, test-phase duration 4.52 s. This is one baseline test, not a passing baseline suite. |
| Current source report pipeline, isolated runs 2 and 3 | PASS consecutively, test-phase durations 4.59 s / 4.71 s, without any code/timeout change. No deterministic functional regression reproduced. Timing margin is small; precise host/DB latency cause remains unproven. |

The broad failures remain FAIL. A repeatable all-green integration result is outstanding; neither timeout is claimed to be a proven pre-existing product defect or a proven cleanup regression. No full rerun was justified after unchanged source and the focused investigation.

Build OOM evidence was traced to Next's TypeScript worker; the installed `node_modules/next/dist/docs/01-app/02-guides/memory-usage.md`, `dist/build/type-check.js` and `dist/lib/worker.js` were inspected before the process-only heap adjustment. Static analysis remained enabled.

There are no `architecture:check` or `lint:strict` package scripts at this HEAD; the established `lint`/`typecheck` commands were used. No new module boundary was introduced. Production operational checks T-01..T-21: **NOT RUN** in this cleanup, not automatically closed by local tests or Product Owner statements.

Local raw command logs remain under `%TEMP%\demi-engineering-closure-e01e518` (`lint.log`, `typecheck.log`, `test.log`, `integration.log`, `workforce-isolated-1.log`, `workforce-isolated-2.log`, `report-isolated-1.log`..`report-isolated-3.log`, `report-baseline.log`, `build.log`, `build-4gb.log`). They are local session artifacts, not production evidence or committed portable CI artifacts.

## 5. Outstanding items and boundaries

| Category | Outstanding item |
| --- | --- |
| Confirmed product/reporting gap | **“ผลลัพธ์ที่ได้” — customer-provided outcome phrase/value list**, CARE-15 / WB-PD-02 / C-02. Not supplied, invented or implemented in this cleanup. |
| Customer content pending | Official PAM/PROMs source wording/scoring and assessor text not proven received (CARE-01/02 / C-03). Acceptance of existing behavior/defaults does not deliver these texts. Agency Terms/Privacy/consent texts remain G-01 dependencies despite delivered ADR-0028 software. |
| Deferred technical debt | Five explicit query exceptions above; import scan latency/actual-match response size; compatibility list memory; live CLI entries created/replaced behind its cursor require another scan. Existing NOTIF-03 15-minute provisional engineering-default confirmation remains separately tracked; mobile acceptance alone does not approve that specific threshold. |
| Verification risk | Broad integration has two disclosed deadline failures; focused passes have limited timing headroom. A consistently green integration run and characterization of the timing cause remain outstanding. Build needs additional heap in this environment; plain default-heap build did not pass. |
| Deployment / operations | T-01..T-21: production configuration, scheduler/queue progress and provider delivery, backup/restore, rollback drill, security/monitoring, LINE/OA/LIFF/Rich Menu configuration and specified device evidence. No production acceptance inferred from local build/tests. |
| Agency governance | G-01..G-06: controller/legal basis/consent and real-data use, residency, record-time disclosure, small-count policy, onward export distribution and recovery communication. Valid family relationships and resource-specific grants remain permanent runtime requirements; governance documents are not feature switches. |
| Local artifact cleanup limitation | Automatic approval review rejected removal of the task-created baseline worktree/dependency junction with `blocked by policy`; deletion did not execute. `%TEMP%\demi-closure-baseline-e01e518` remains detached at the starting SHA, with a `node_modules` junction to the main dependency directory. No removal bypass attempted. The main working tree was clean before this report, and no debug instrumentation was added. The disposable test container was started for verification and is still available. |

No reproduced business-flow or authorization defect was found. The global non-ended Hospital OWNER/MEMBER versus OSM incompatibility, including cross-Hospital/profession-independent enforcement, is unchanged. Existing tests were exercised rather than redesigning accepted Work/clinical/role/mobile/LINE flows. This is not a fresh exhaustive security audit or a claim that production data was inspected.

## 6. Release recommendation

**ENGINEERING CLEANUP COMPLETE WITH DOCUMENTED DEFERRED RISKS**

The seven query exceptions have explicit evidence-backed dispositions; two are fixed with real multi-batch PostgreSQL tests and five remain visible. Current normative documents reflect the accepted product baseline without closing missing content or external operational/governance evidence. Lint, typecheck, all unit tests, focused query tests, canonical validation and the memory-adjusted production build passed.

The full integration run did not pass: its two deadline failures and subsequent focused/baseline results remain disclosed. The default-heap build failure and local worktree cleanup rejection are also retained. No application/test/security rule was weakened to hide these limitations. This recommendation closes the scoped engineering/documentation assignment with those deferred risks; it does **not** authorize a production release or declare the outstanding outcome list, official content, governance or production checks complete.
