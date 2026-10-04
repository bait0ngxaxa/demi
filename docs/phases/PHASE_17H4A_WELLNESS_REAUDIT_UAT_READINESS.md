# Phase 17H.4A — Wellness Automated Security / DB / Privacy Re-audit

**Disposition: PASS / AUTOMATED RE-AUDIT COMPLETE.** The approved bounded WELL-01 / WELL-02 / WELL-03 scope passed the required automated unit, PostgreSQL, migration, schema, type and lint verification. No unresolved BLOCKER or MAJOR correctness, authorization, persistence, concurrency, or privacy defect was found. The only source additions are regression tests for cross-domain cursor rejection and both Weight owner-lock race orderings; no runtime, schema, or migration correction was required.

This disposition establishes automated re-audit completion and readiness for separate manual UAT tracking. It is not production certification, device/browser UAT acceptance, a penetration test, legal/privacy governance approval, or deployment approval.

วันที่: 2026-10-04 (Asia/Bangkok). Repository: bait0ngxaxa/demi.

## 1. Baseline / HEAD

- Starting HEAD: eb15a9a284750129ac25062037b43bd14ead9623 — fix(phase-17h3): preserve consumed intent review and restore focus.
- This equals the expected baseline supplied for the audit. No newer commit existed at audit start; there were no newer commits to reconcile.
- Starting branch/worktree was clean. No user changes were overwritten.
- Final HEAD remains the same. This audit did not commit or push.
- AGENTS.md was read first. Thai text and UTF-8 were preserved.

## 2. Audit scope

The audit covers only the approved bounded Wellness scope: WELL-01 Personal Meal Journal, WELL-02 Personal Exercise Journal, and WELL-03 Personal Weight Goal / TARGET-ONLY. The purpose was implementation-to-contract reconciliation and automated security, persistence, concurrency, privacy, date, cursor, migration, and regression review. Q54–Q83 were not reopened.

No product scope was added. Manual browser, mobile, device, and BFCache UAT was not performed and remains separate.

## 3. Approved semantic boundaries and authoritative sources

The following approved meanings remain distinct:

| Domain | Approved record | Confirmed exclusions |
| --- | --- | --- |
| Meal | One Patient-reported consumed meal/snack occasion: category, occurredOn, optional description | No nutrition truth, calories/macros, clinical interpretation, Goal completion, future scheduled meal, or photo runtime |
| Exercise | One Patient-reported actually performed session: activityName, occurredOn, optional durationMinutes and note | No prescription, taxonomy, Goal completion, calories, distance/reps/sets/intensity, or wearable truth |
| Weight Goal | One current Patient-selected target: targetWeightKg and optional targetDate | No current weight, observation/history, progress, BMI, clinical target, or achieved/overdue lifecycle |

Authoritative decision and implementation sources reviewed:

- AGENTS.md; docs/CONTEXT.md; docs/phases/PHASE_17_UAT_BACKLOG.md.
- PHASE_17H0_WELLNESS_DECISION_PACK.md and PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md, including approved Q54–Q83 closeout and deferred/excluded scope.
- PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md and implementation handoff.
- PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION_CONTRACT.md and implementation handoff.
- PHASE_17H3_WEIGHT_GOAL_IMPLEMENTATION_CONTRACT.md and implementation handoff.
- PHASE_17G4A_MEDICATION_REAUDIT_UAT_READINESS.md as the comparable audit evidence/methodology.

No approved semantic decision was reopened or widened.

## 4. Source inventory

Reviewed the Wellness domain modules and route, including:

- src/modules/meals/ — schemas, transport parsers/actions, SELF owner resolution, query and mutation services, cursor codec, unit tests.
- src/modules/exercises/ — schemas, transport parsers/actions, SELF owner resolution, query and mutation services, cursor codec, unit tests.
- src/modules/weight-goals/ — decimal/date domain rules, parsers/actions, query and mutation services, unit tests.
- app/app/personal/wellness/ — page, three independent workspaces, shared private authority, lifecycle and page tests.
- prisma/schema.prisma and the three Wellness migrations listed in section 9.
- Auth actor-context and protected application actor resolution; audit schema/service; transaction helpers; application errors; Prisma/server environment accessors.
- scripts/integration.mjs, compose.integration.yaml, package.json, next.config.ts and installed Next.js guidance for request-time rendering and Server Action request-body handling.

The route composes three domain workspaces. No generic WellnessEntry/EAV model, shared business payload table, mixed Wellness history, or cross-domain business policy/service was found.

## 5. Audit matrix

| Area | Result | Evidence |
| --- | --- | --- |
| Approved semantics / domain separation | PASS | Contracts, decision closeout, source/model/UI review |
| Persisted Patient SELF authorization | PASS | Owner resolvers and integration authorization cases |
| IDOR / resource-existence disclosure | PASS | Owner-scoped reads/writes/anchors and safe action mappings |
| Meal / Exercise / Weight database invariants | PASS | Forward migrations, Prisma schema, fresh PostgreSQL catalog/direct-write assertions |
| Migration application | PASS | Empty disposable DB; all 36 migrations applied |
| Meal / Exercise receipt idempotency | PASS | Focused and full PostgreSQL lifecycle/race/audit tests |
| Weight terminal intent and owner-lock races | PASS | Focused and full PostgreSQL tests for both lock orderings |
| Expected-version concurrency | PASS | Domain tests and PostgreSQL guarded-write/race tests |
| Atomic, minimized mutation audit | PASS | Service transaction inspection and PostgreSQL rollback/audit assertions |
| Cursor integrity / pagination | PASS | Domain cursor tests, 103-row integration traversals, added cross-domain misuse regression |
| Bangkok civil dates | PASS | Three process timezone runs and boundary tests |
| Decimal / duration boundaries | PASS | Domain/transport tests and direct PostgreSQL constraints |
| Shared client privacy authority | PASS with MINOR test-hardening observation | One shared authority, denial clearing, generations, delayed responses; pair coverage is compositional, detailed in section 19 |
| Initial server read / cache behavior | PASS | Request-time page, persisted SELF reads, all-or-nothing render tests, Next docs/source |
| Audit/log/error minimization | PASS | Scoped source search, exact audit input and fixed action mappings |
| Secondary-use / excluded scope | PASS | Repository reference searches |
| Manual browser/mobile/device/BFCache UAT | NOT EXECUTED | Tracked separately; not required for automated PASS |

## 6. Persisted SELF authorization matrix

For each externally reachable Wellness action, the authority chain is authenticated actor → fresh persisted ACTIVE User → persisted PATIENT role → exact Person binding → exact PatientProfile. The PatientProfile owner is resolved server-side on each request. ActorContext role claims are only an early gate and do not establish persisted authority or ownership.

| Domain | Operation | Request-time check and resource scope |
| --- | --- | --- |
| Meal | Create/replay | Fresh persisted SELF; server-derived owner; receipt and record scoped to that owner |
| Meal | First-page list / continuation | Fresh persisted SELF on both; row and anchor lookups scoped to owner; cursor is not authority |
| Meal | Edit / delete | Fresh persisted SELF in mutation transaction; owner + record + expected version |
| Exercise | Create/replay | Fresh persisted SELF; server-derived owner; dedicated owner/nonce receipt |
| Exercise | First-page list / continuation | Fresh persisted SELF on both; row and anchor lookups scoped to owner; cursor is not authority |
| Exercise | Edit / delete | Fresh persisted SELF in mutation transaction; owner + record + expected version |
| Weight | Get current | Fresh persisted SELF; unique current-goal lookup by derived owner |
| Weight | Create/replay/reconciliation | Fresh persisted SELF under owner-row lock; receipt and goal decisions owner-scoped |
| Weight | Edit / remove | Fresh persisted SELF under the same owner-row lock; owner + goal + expectedUpdatedAt |

The explicit deny fixtures cover another Patient, inactive/suspended User, removed PATIENT role, invalid User↔Person binding, missing PatientProfile, Hospital MEMBER, Hospital OWNER, OSM, assigned OSM, Family/caregiver including an active appointment grant, and ADMIN-only. PATIENT + Work role remains own SELF only. No Work, Family, Hospital, or OSM authority is unioned into Wellness.

IDs, nonces, cursors, goal IDs, and expected-version tokens are locators/claims to validate, never authority.

## 7. IDOR and existence disclosure

Meal and Exercise edit/delete and anchor lookups include the derived owner in resource predicates. Valid foreign identifiers and missing identifiers follow the same safe NOT_FOUND/CONFLICT mapping required by their operation; action responses do not reveal whether a foreign row or receipt exists. Replay loads through an owner-scoped receipt/resource path. A cursor or nonce cannot bypass current persisted SELF resolution.

Weight edit/remove and receipt reconciliation likewise use owner-scoped queries after current persisted SELF. A foreign or missing goal is not disclosed; stale expectedUpdatedAt uses safe conflict behavior. No unscoped existence/version probe before owner validation was found.

## 8. Cross-domain architecture

Meal, Exercise, and Weight remain separate models, schemas, services, mutations, receipts, and private client state. Their shared pieces are responsibility-neutral transaction, audit, auth, and privacy-generation infrastructure. Each domain does not use another domain's service or policy as business authority. No mixed Wellness timeline, shared business table, cross-domain mutation, or owner authority inferred from another domain object was found.

## 9. Database invariant matrix

| Invariant | Verified definition |
| --- | --- |
| Meal entry | PatientProfile FK with RESTRICT; enum category BREAKFAST/LUNCH/DINNER/SNACK; occurredOn DATE with static Gregorian range; description VARCHAR(1000), nullable and structurally nonblank; no date/category/content uniqueness |
| Meal history index | patientProfileId, occurredOn DESC, createdAt DESC, id DESC |
| Meal receipt | PK patientProfileId + submissionNonce; unique mealEntryId locator; only owner FK; no Meal FK; no payload; survives physical Meal deletion |
| Exercise entry | PatientProfile FK with RESTRICT; activityName VARCHAR(120), nonblank CHECK; occurredOn DATE; nullable INTEGER duration with CHECK 1..1,000,000; nullable note VARCHAR(1000), nonblank when present |
| Exercise history index | patientProfileId, occurredOn DESC, createdAt DESC, id DESC |
| Exercise receipt | PK patientProfileId + submissionNonce; unique exerciseEntryId locator; only owner FK; no Exercise FK; no payload; survives physical Exercise deletion |
| Weight Goal | Unique patientProfileId (structural 0..1); NUMERIC(10,3); CHECK target > 0 and <= 1,000,000; nullable DATE targetDate with static range only; PatientProfile FK RESTRICT |
| Weight Goal receipt | PK patientProfileId + submissionNonce; unique intendedWeightGoalId; only owner FK; no Goal FK and no payload/hash/rejection reason; survives Goal removal |
| Timestamp/version fields | TIMESTAMPTZ(3); business mutations use monotonically advanced updatedAt |

Fresh PostgreSQL catalog and direct-write assertions checked these definitions, including required bounds and rejected malformed writes. There is no date/category or exercise content uniqueness, no dynamic targetDate >= today database rule, no Observation/history/status field, and no FK to care data or Goal Plan.

## 10. Migration integrity

The audited forward migrations are:

- 20261003140000_personal_meal_journal
- 20261004100000_personal_exercise_journal
- 20261004120000_personal_weight_goal

All three are additive forward migrations; historical migrations were unchanged. A new local disposable database was created from empty and all 36 migrations applied successfully. PostgreSQL catalog tests confirmed the Wellness CHECK, UNIQUE, FK and ordering-index definitions. Receipt tables do not cascade with payload deletion. No Weight Observation table, care-data FK, or Goal Plan FK exists.

The safe integration runner verified local loopback endpoint configuration, equal integration database URLs, and NODE_ENV=test before use. compose.integration.yaml uses a disposable tmpfs-backed PostgreSQL 17 container. No production database was accessed. The integration runner's final cleanup removed the test container/network; npm run test:db:status afterward showed no running service.

A global Prisma migrate diff check returned exit code 2 due to unrelated historical constraint/index-name drift in existing non-Wellness models (including Family/Work/care models). Its reported differences contained no Wellness object drift. This is recorded as INFO, not attributed to these migrations.

## 11. Meal idempotency and persistence

Meal create uses a dedicated owner/nonce receipt in the same Serializable transaction as the Meal entry and created audit. Same owner + same nonce replays the current surviving entry; after physical deletion the receipt remains and the nonce returns CREATE_CONSUMED without resurrection. Same payload with a different nonce is a separate intentional entry. There is no automatic nonce rotation. Receipt/entry/audit transaction failure rolls back the partial result. PostgreSQL tests cover concurrent same-nonce requests, replay/deleted replay, duplicate intentional content, edit/delete races, delete/delete, and audit rollback. No duplicate payload or success audit on replay was observed.

## 12. Exercise idempotency and persistence

Exercise follows its own dedicated owner/nonce receipt and Exercise-local consumed classification. It uses a separate Serializable transaction path and does not share Meal receipts or nonces. A committed delete leaves the receipt, so the same nonce cannot recreate the performed session. A fresh nonce permits an intentional duplicate session. The focused and full PostgreSQL suites cover replay, consumed-after-delete, concurrent same nonce, duplicate content with a fresh nonce, mutation races and audit rollback. No cross-domain nonce or receipt reuse was found.

## 13. Weight terminal intent and owner-lock concurrency

Weight create/edit/remove and replay use ReadCommitted and lock the PatientProfile owner row FOR UPDATE before deciding the Weight Goal state. After the lock, the service re-resolves persisted SELF and follows the same lock order for all Weight operations. Create receipts are committed with a terminal created or occupied-slot decision. Once an occupied-goal rejection commits, removing the existing goal cannot reactivate that nonce.

Real PostgreSQL tests establish both lock orderings:

- Same-nonce race: one receipt, at most one goal, at most one created audit; retry deterministically replays or reports consumed.
- Different-nonce empty-slot race: one goal, two receipts, one created audit.
- Losing nonce after winner removal: CREATE_CONSUMED and no resurrection.
- Occupied rejection followed by removal: rejection receipt remains terminal; no mutation audit for rejection.
- Create-first then remove: create intent is consumed before removal; same nonce remains consumed.
- Remove-first then create: removal commits before create decides; new create succeeds with its own receipt/audit.

No unlocked second transaction consumes a loser. These PostgreSQL race tests were added because the previous evidence did not directly hold the owner lock and force each ordering. The tests passed in focused and full integration runs; runtime behavior did not change.

## 14. Weight transaction ambiguity

Only a committed business decision is definitive. Receipt persistence failure, audit failure, P2002/P2034, deadlock, timeout, rollback, or commit acknowledgement ambiguity cannot be converted to an occupied-goal rejection. The action maps uncertain outcomes to UNCONFIRMED, preserving the same nonce and frozen intent for explicit reconciliation. A committed create returns REPLAY; a committed rejection returns CREATE_CONSUMED; true rollback with no receipt may process normally. No second unlocked transaction consumes a losing request.

Server Action error mappings return fixed user-safe messages; raw database/Prisma messages are not exposed. The Weight integration tests inject receipt persistence failure, audit failure, P2002, P2034, and commit-ack ambiguity, then verify UNCONFIRMED and same-nonce reconciliation. Deadlock/timeout were not independently induced against PostgreSQL; source review confirms these thrown transaction failures follow the same catch-to-UNCONFIRMED path rather than the committed occupancy decision.

## 15. Optimistic concurrency

Across Meal, Exercise, and Weight, expectedUpdatedAt is checked before normalized no-op detection. Current-version actual change succeeds; current-version normalized identical input is NOOP where applicable; stale identical or changed input conflicts. Guarded update/delete claims allow one edit/delete race winner and one delete/delete winner. A stale edit cannot resurrect a physically deleted entry. Weight owner-row locking preserves expectedUpdatedAt checks. UpdatedAt advances monotonically at TIMESTAMPTZ(3) precision.

Focused domain and PostgreSQL tests passed these paths.

## 16. Mutation audit atomicity and data minimization

Expected action names are exact:

| Domain | Actions |
| --- | --- |
| Meal | personal_meal.created, personal_meal.updated, personal_meal.deleted |
| Exercise | personal_exercise.created, personal_exercise.updated, personal_exercise.deleted |
| Weight | personal_weight_goal.created, personal_weight_goal.updated, personal_weight_goal.deleted |

Each audit write receives the same transaction client as its mutation. Audit failure rolls back the business write; failed mutation has no success audit. REPLAY, NOOP, reads, and Weight occupied-create rejection do not emit a mutation audit.

AuditEvent records actorUserId, action, resourceType, optional resourceId, nullable metadata, and createdAt. Wellness calls provide no metadata payload; persisted metadata is null. No Meal description/category/date, Exercise activity/note/date/duration, Weight value/date, Patient name, National ID, HN, payload hash, or clinical interpretation is written. Resource IDs identify the affected record; no user-entered journal or target values are included.

## 17. Cursor integrity and pagination

Meal and Exercise each use a distinct versioned cursor prefix and separator, HMAC-SHA256 with the existing IDENTITY_HASH_SECRET, canonical base64url encoding, timing-safe tag comparison, length bounds, actor and owner binding, scope/page/order binding, and a stable last-row anchor. Cursor payloads contain ordering/locator fields only, not journal text or Weight values. Fresh persisted SELF is resolved on continuation and anchor lookup is owner-scoped.

A cross-domain decoder regression was added: a valid Meal cursor passed to Exercise and a valid Exercise cursor passed to Meal are both rejected safely. Cursor tampering, wrong actor/owner, malformed/noncanonical encodings, stale or changed/deleted/foreign anchors, and secret behavior are covered in domain tests. No generic Wellness cursor was introduced.

Meal and Exercise use page size 50, fetch 51, deterministic occurredOn DESC / createdAt DESC / id DESC ordering. PostgreSQL integration traverses 103 rows in each domain without gaps or duplicates, including intentional duplicate content. Weight has no history list, pagination, or cursor.

## 18. Bangkok civil-date, browser bounds, decimal and duration

Meal and Exercise allow past/today Bangkok civil dates and reject future dates. Weight create permits null/today/future and rejects past; edit can retain an unchanged naturally passed targetDate, changed dates must be today/future, and explicit clear is allowed. Dates are validated as Gregorian YYYY-MM-DD, stored as PostgreSQL DATE, and do not acquire a fake UTC business meaning. The server's Bangkok date is authoritative. Leap/year and Bangkok-midnight rollover assertions passed.

Three timezone runs executed the following focused date commands, each with 3 files / 136 tests passing:

- UTC: $env:TZ='UTC'; npm run test -- --run src/modules/meals/schemas/personal-meal-schemas.test.ts src/modules/exercises/schemas/personal-exercise-schemas.test.ts src/modules/weight-goals/domain/personal-weight-goal.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
- Asia/Bangkok: $env:TZ='Asia/Bangkok'; npm run test -- --run src/modules/meals/schemas/personal-meal-schemas.test.ts src/modules/exercises/schemas/personal-exercise-schemas.test.ts src/modules/weight-goals/domain/personal-weight-goal.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
- America/Los_Angeles: $env:TZ='America/Los_Angeles'; npm run test -- --run src/modules/meals/schemas/personal-meal-schemas.test.ts src/modules/exercises/schemas/personal-exercise-schemas.test.ts src/modules/weight-goals/domain/personal-weight-goal.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Meal/Exercise controls do not ship a stale static max that blocks a newly valid Bangkok date; their static lower bound is structural only. Weight targetDate has no min/max, preserving unchanged naturally passed dates. Automated DOM/source assertions establish only markup behavior; they do not establish real browser behavior.

Weight transport/domain/client use a canonical decimal string. Prisma Decimal persists to NUMERIC(10,3), and DTO returns a string. No JavaScript Number is used as a business representation. Tests pass 0.001, 72.5, 72.55, 72.555 and 1,000,000; normalize leading/trailing zeros; reject zero, above maximum, excess scale/rounding, sign, exponent, comma, Unicode digits, trailing garbage and final newline. PostgreSQL CHECKs reject nonpositive/over-maximum stored values and invalid DATE range; uniqueness enforces one goal per owner. As the approved 17H.3 contract specifies, SQL type/CHECKs enforce stored invariants rather than the original decimal text grammar: a privileged raw SQL over-scale assignment can be rounded by NUMERIC(10,3), while the server schema rejects excess scale before persistence. No alternate application write path bypassing that server validation was found; no database trigger was added to reinterpret the approved contract.

Exercise duration accepts blank as null; otherwise 1–10 ASCII digits, raw transport field <=20 UTF-16 units, numeric range 1..1,000,000. Decimal, signs, exponent, Unicode digits, parseInt-prefix acceptance and inferred duration are rejected.

## 19. Shared Wellness private authority and lifecycle

All three workspaces receive the same WellnessPrivateAuthority instance. A domain DENIED synchronously invalidates that authority, advances the generation, clears the parent session and therefore clears all three domains. Delayed responses are accepted only while their captured shared generation remains current. The parent lifecycle tests confirm one shared authority, payload clearing across all domains, pagehide invalidation, persisted pageshow reload, and Strict Mode cleanup/setup recovery. No localStorage or IndexedDB private journal/target persistence was found.

Current test evidence is compositional across source and target domains: Meal DENIED invalidation, Exercise DENIED invalidation, Weight DENIED invalidation, Meal/Exercise delayed read and mutation suppression, and delayed Weight mutation suppression all use the same shared generation mechanism. The tests do not enumerate six source→target pairs as separate end-to-end cases, and a delayed Weight read-after-sibling-denial has no dedicated direct test. Source review shows no pair-specific branch in the shared authority. This is a MINOR test-hardening observation, not an observed leakage defect. Add explicit pairwise delayed-read/mutation cases if future client lifecycle changes introduce domain-specific invalidation logic.

Actor-specific remount keys are opaque hashes rather than raw IDs in the DOM. The route does not persist private payload in browser storage or URL/query parameters. New account render state is remounted by the opaque actor key; delayed mutation responses after unmount/authority change are dropped.

## 20. Initial server read, cache, and private rendering

The Wellness page uses the installed Next.js request-time connection API, resolves the protected actor before private reads, then independently invokes Meal, Exercise, and Weight services that each re-resolve persisted SELF. Initial private data is serialized only after all three reads succeed; any domain denial/error prevents sibling payload rendering. Three independent random create nonces are generated; the remount key is opaque; raw actor/PatientProfile IDs are not passed unnecessarily.

Page tests cover request-time connection, denial from each domain, opaque remount key, independent nonces, and all-or-nothing sibling rendering. Parent invalidation removes the three child workspaces and their rows, drafts, selected/edit state, nonce/cursor values, and Weight target from rendered client state. No React/Next shared result cache or public/static cache was found around Wellness private queries. revalidatePath is used for freshness after applicable mutations, not as authorization.

## 21. Logging and safe errors

Scoped Wellness production-source searches found no console.log/error, logger calls, raw FormData dumps, DTO/payload serialization, cursor/receipt logging, or raw Prisma error exposure. Server Actions map authentication/authorization, conflict, validation, and infrastructure outcomes to fixed Thai messages. Meal/Exercise foreign/missing behavior and Weight goal errors do not disclose another Patient, receipt internals, intended Weight Goal ID, SQL/Prisma details, or stack traces.

Repository code cannot establish hosting/proxy/provider logs or their retention/minimization; those remain unverified infrastructure items.

## 22. Secondary use and deferred-scope search

No external production module imports Wellness models/services or automatically feeds Meal, Exercise, or Weight into PatientGoalPlan/PatientGoalItem, PatientFollowup, PatientBaseline, PatientFinalAssessment, Hospital dashboards, Program reporting, adherence, cohorts, analytics, Family views, notifications, or reminders. Weight does not read care weight; Exercise does not complete Goal items; Meal does not infer nutrition.

Searches found no Wellness Weight Observation, BMI, Wellness score/advice, nutrition/macros/calories, meal photo, richer exercise metrics/GPS/wearables, sharing/export/API, Family/Hospital/OSM visibility, reminder/delivery, or generic WellnessEntry metadata JSON. The Personal Weight Observation remains DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.

## 23. Form and transport hardening

Meal, Exercise, and Weight parsers are operation-specific allowlists; reject duplicate/unknown business fields, File values, owner/authority fields, and bounded business-field overflows. Aggregate business payload is bounded at 16 KiB UTF-8. No raw FormData logging exists.

The parsers intentionally ignore framework-reserved $ACTION_ fields. Installed Next.js Server Action handling reads/enforces the configured raw request limit (6 MiB in next.config.ts) before multipart action materialization/dispatch; the application parser runs after action materialization. Arbitrary extra framework-prefixed fields therefore cannot grant authority or bypass business-field bounds, though they are not counted by the application business-payload aggregate cap. This is a MINOR shared transport-hardening observation, not a demonstrated authorization or persistence bypass. No generic request framework was added. External proxy limits/logging were not verifiable from the repository.

## 24. Query and index observations

Meal and Exercise owner/history query shapes match their composite ordering indexes. Weight current-goal lookup uses the unique owner key; its receipt uses owner+nonce primary key and unique intended goal ID. Weight's owner-lock query targets PatientProfile primary key. No Weight list/cursor query exists.

The fresh PostgreSQL tests verified catalog definitions. No brittle planner assertion was added against a tiny synthetic table; no workload evidence justified additional indexes or EXPLAIN tuning.

## 25. Automated verification evidence

All PostgreSQL execution used the repo's safe integration runner and its loopback-only disposable test database, not production.

| Check | Result |
| --- | --- |
| Focused Wellness unit/UI/domain/transport/page/privacy/cursor set | 20 files / 232 tests PASS; includes cross-domain cursor rejection regression |
| Focused unit command | npm run test -- --run src/modules/meals src/modules/exercises src/modules/weight-goals app/app/personal/wellness — PASS; 20 files / 232 tests |
| Timezone matrix | UTC, Asia/Bangkok, America/Los_Angeles: each 3 files / 136 tests PASS |
| Focused PostgreSQL Meal + Exercise + Weight integration | 3 files / 81 tests PASS |
| Prisma generate | npm run prisma:generate — PASS; Prisma Client 6.19.3 |
| Prisma validate | .\node_modules\.bin\prisma.cmd validate — PASS |
| Fresh database migration | PASS; all 36 migrations from empty database |
| Typecheck | npm run typecheck — PASS |
| Lint | npm run lint — PASS |
| Full unit suite | npm run test — PASS; 216 files / 1,801 tests |
| Full PostgreSQL integration | node scripts/integration.mjs verify — PASS; 31 files / 447 tests, 85.65 seconds; runner shut down disposable DB |
| Post-run DB status | npm run test:db:status — PASS; no running integration service |
| Diff whitespace | git diff --check — PASS before documentation updates; rerun at final review |

The full unit and integration suites ran once after implementation and focused checks were stable. A narrow Weight delayed-response coverage question was assessed afterward; no runtime was changed. No full suite was repeated. The isolated late audit test additions were verified with their focused checks as described below.

Focused PostgreSQL command: npm run test -- --config vitest.integration.config.mts tests/integration/personal-meal.integration.test.ts tests/integration/personal-exercise.integration.test.ts tests/integration/personal-weight-goal.integration.test.ts. Environment came from the local integration env file without printing credentials; host was 127.0.0.1, database demi_test, URLs matched, NODE_ENV=test.

Fresh migration application used npm run test:db:up followed by node scripts/integration.mjs migrate. The final fresh full run used node scripts/integration.mjs verify, which reapplied all migrations, ran integration tests, and removed the disposable service during cleanup. The post-cleanup command was npm run test:db:status.

The Weight lock-order tests were included in the focused and full PostgreSQL runs. The cross-domain cursor test was included in the focused unit set and full unit suite. Prisma generation was also part of the full safe integration verification.

Package scripts do not define architecture:check. No Wellness-specific Impeccable detector is configured in this repository; no new tool was installed. No production build/dev server was run because changed runtime behavior was not required for this audit and no runtime code changed.

## 26. Findings

| ID | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| W4A-01 | MINOR | Framework-reserved $ACTION_ fields are ignored by business parsers and excluded from the 16 KiB business aggregate, while Next caps raw Server Action request size at 6 MiB before action materialization. No authority or persistence bypass was identified. | Documented; no shared request framework or scope expansion warranted. |
| W4A-02 | MINOR | Shared-denial privacy coverage is compositional rather than six separately named source→target delayed-response cases; Weight delayed read after sibling denial lacks a dedicated direct case. | Shared generation guards, each domain's DENIED invalidation, and delayed mutation/read cases for the other domains passed. No pair-specific implementation branch or leakage path found. Preserve as focused future test-hardening observation. |
| W4A-03 | INFO | Global Prisma migration diff reports unrelated historical constraint/index-name drift in non-Wellness models. | No Wellness drift reported; all 36 migrations apply on a fresh disposable DB. |
| W4A-04 | INFO | Payload-free receipts intentionally survive domain record deletion; no retention interval is approved. | Operational/privacy retention and account-erasure governance follow-up; no cleanup or retention semantics invented. |
| W4A-05 | INFO | Hosting, proxy, provider, and infrastructure log behavior is outside repository visibility. | Unverified infrastructure follow-up; repository paths do not emit the reviewed sensitive values. |
| W4A-06 | INFO | PostgreSQL NUMERIC(10,3) can round a privileged raw SQL value with excess fractional scale after type coercion. | This follows the approved 17H.3 division: server validation rejects over-scale input; database CHECKs enforce stored range/owner/date invariants. No alternate application write path was found. |

No BLOCKER or MAJOR finding remains. No runtime correction was required. Two test-only evidence additions were made: cross-domain cursor decoder rejection and Weight create/remove owner-lock race-order coverage.

## 27. Residual operational and privacy items

Receipt lifetime/cleanup, backup/restore, account erasure, audit retention, infrastructure log retention, proxy body limits and production runtime configuration remain operational/privacy governance follow-ups. No retention period, account-erasure behavior, production deployment, or external logging safety is inferred or added.

## 28. Manual browser/mobile/device/BFCache UAT checklist

**MANUAL / NOT EXECUTED.** This section is a readiness checklist only; no browser/device result is claimed.

- Mobile layout: narrow phone viewport; all three section anchors reachable; long Meal/Exercise history does not make Weight unreachable; forms have no horizontal overflow; Thai text wraps; touch targets are usable.
- Meal: create/edit/delete; duplicate same day/category; pagination; consumed-create recovery; future-date rejection; Bangkok midnight behavior where feasible.
- Exercise: create/edit/delete; optional duration/note; intentional duplicate session; pagination; consumed-create recovery.
- Weight: no-goal state; create; decimal entry; optional target date; edit naturally passed date while changing only weight; clear date; remove; CREATE_CONSUMED review gate; UNCONFIRMED same-nonce retry; cancel-remove focus restoration.
- Privacy/session: logout/login as another actor; role revocation where supported; Back/Forward Cache; pagehide/navigation; verify prior-user private payload does not flash; refresh after authority change.
- Accessibility: keyboard-only navigation; focus transitions; screen-reader labels/live status; remove confirmation/cancel focus; form validation and error association.

## 29. Final readiness / status

**Phase 17H.4A — PASS / AUTOMATED RE-AUDIT COMPLETE.**

- WELL-01 — IMPLEMENTED / AUTOMATED RE-AUDIT PASS.
- WELL-02 — IMPLEMENTED / AUTOMATED RE-AUDIT PASS.
- WELL-03 — IMPLEMENTED / TARGET-ONLY / AUTOMATED RE-AUDIT PASS.
- Phase 17H bounded automated scope: COMPLETE.
- Manual browser/mobile/device/BFCache UAT: NOT EXECUTED / TRACK SEPARATELY.
- Personal Weight Observation: DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.
- Preserved unchanged: 17G.4A; Family P17F-L04/L05; Q5 governance gate; parked 17E.2 consent; MED-02; and 17J delivery/system authority.

The result means automated Wellness re-audit complete and ready for manual UAT tracking only. It does not mean production certified, customer accepted, security penetration testing complete, governance/legal/privacy approved, or deployed.
