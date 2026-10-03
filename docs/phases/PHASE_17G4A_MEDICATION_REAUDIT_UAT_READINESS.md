# Phase 17G.4A — Medication Automated Security / DB / Privacy Re-audit

**Disposition: PASS / AUTOMATED RE-AUDIT COMPLETE.** Required automated verification passed for the bounded MED-01 scope. No unresolved BLOCKER or MAJOR defect was found. One statistics-sensitive PostgreSQL plan assertion was corrected in its existing test only; runtime behavior, schema and migrations were not changed. A global Prisma diff also reported unrelated Family/Work drift, recorded below as INFO.

วันที่: 2026-10-03. Repository: `bait0ngxaxa/demi`.

## 1. Baseline / HEAD

- Starting `HEAD`: `149dad9f5c5ea147055e45f8ba9250fce8ae7834` — `feat(phase-17g3c): implement reminder occurrence source`.
- Local `refs/remotes/origin/main` points to the same commit. No fetch was performed.
- Starting branch/status: `main...origin/main`; working tree clean.
- AGENTS.md was read before source review. No user changes were present to preserve.

## 2. Audit scope

Source and test review covered MED-01 creation, edit, stop, list, detail, schedule replacement, derived occurrence discovery, pagination and revalidation; authorization, IDOR, SQL invariants, transaction/retry behavior, concurrency, privacy, audit, error handling, caching, migrations and adjacent Family/Work boundaries. Targeted and full automated checks ran against the project’s dedicated local disposable PostgreSQL integration database. No product behavior was added. The sole code change is a test-only planner setting that stabilizes the existing ordered-index usability assertion; no runtime, schema or migration file changed.

## 3. Authoritative approved decisions

The reviewed authoritative sources were:

- [17G.0B closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md): Q30–Q53 CLOSED / OWNER APPROVED; MED-01 Patient SELF only; STOPPED terminal; MED-02 REQUIREMENT-GATED; Family/Work authority does not grant medication access.
- [17G.1 contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md) and [handoff](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_HANDOFF.md): bounded personal tracking, private audit, exact persisted owner, terminal lifecycle.
- [17G.2 contract](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_CONTRACT.md) and [handoff](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_IMPLEMENTATION_HANDOFF.md): unique minute-only daily `HH:mm`, Asia/Bangkok, atomic replace-all, stable retained child IDs and immutable STOPPED schedule history.
- [17G.3A decisions](./PHASE_17G3_REMINDER_ADHERENCE_DECISION_PACK.md), [17G.3B contract](./PHASE_17G3_REMINDER_OCCURRENCE_SOURCE_IMPLEMENTATION_CONTRACT.md) and [17G.3C handoff](./PHASE_17G3_REMINDER_OCCURRENCE_SOURCE_IMPLEMENTATION_HANDOFF.md): derived source only; future-only discovery; no historical ledger; adherence deferred; 17J delivery/system authority gated.
- [Project context](../CONTEXT.md) and [Phase 17 UAT backlog](./PHASE_17_UAT_BACKLOG.md).

No approved decision was reopened. Source revalidation is structural backing only; `sourceKey` does not prove prior observation. This absence of historical issuance proof is approved.

## 4. Source inventory

Reviewed `prisma/schema.prisma`; both medication migrations; all production files under `src/modules/medications/` relevant to domain definitions, TIME conversion, occurrence derivation, schemas, SELF policy, persisted owner resolution, medication query/mutation services, cursor codec, schedule form parsing and Server Actions; `/app/personal/medications` page, workspace and controls; the complete medication PostgreSQL integration test inventory and named high-value test bodies; `serializable-transaction.ts`, Prisma and server-env accessors, application errors, auth actor resolution and audit service/schema. Also reviewed `package.json`, `next.config.ts`, the installed Next Server Actions guidance, integration runner, CONTEXT and UAT backlog.

No other production module calls medication services. The service exports found are create, update, stop, schedule replace, list, detail, occurrence list and occurrence revalidation; each protected operation reaches the persisted SELF resolver. `resolvePersonalMedicationOwner` is an internal authority helper, not a resource operation.

## 5. Authorization matrix

The persisted resolver checks exact `actor.personId`, exact related `actor.userId`, persisted `UserStatus.ACTIVE`, persisted `PATIENT` role and an existing `PatientProfile`; the owner ID is derived server-side. Each resource predicate includes that owner. ActorContext's role list is only an initial gate and cannot supply ownership or override persisted status/role.

| Operation | Persisted SELF check | Resource scope / stale authority |
| --- | --- | --- |
| Create | Inside Serializable mutation transaction | Owner is derived; client owner/status/source fields are rejected |
| Text update / stop | Inside Serializable mutation transaction | Owner + id + ACTIVE + expected aggregate version |
| Schedule replace | Inside Serializable mutation transaction | Same guarded parent claim before child changes |
| List | Persisted resolver on every request | Owner + status scope for rows and cursor anchor |
| Detail | Inside Serializable read transaction | Owner + medication ID |
| Occurrence first page / continuation | Inside each Serializable snapshot | Owner + medication ID; continuation also checks signed actor-bound cursor and current version/status |
| Occurrence revalidation | Inside each Serializable snapshot | Owner + source parent ID; returns no alternate source |

The source and PostgreSQL fixtures cover own-only multi-role PATIENT, another Patient, OSM, assigned OSM, Hospital MEMBER/OWNER, routine ADMIN, Family caregiver, appointment-grant caregiver, suspended account, removed persisted role, missing profile and mismatched user/person binding. The complete 28-file / 366-test PostgreSQL suite passed, including the MED-01 authorization matrix.

## 6. IDOR / resource disclosure

Valid foreign UUID and nonexistent UUID use owner-scoped `findFirst` and the same `NotFoundError` for detail, update, stop, schedule replacement, occurrence discovery, continuation and revalidation. List cursors are scoped by owner and status. Invalid detail UUID also maps to not-found. A source key is recomputed against current child rows; a cursor is authenticated and followed by fresh resource authorization. Neither is an authority token.

The integration suite explicitly compares foreign and missing behavior across resource operations; it passed on the dedicated local database. No ownership/existence difference was found in source or executed assertions.

## 7. Database invariant matrix

| Invariant | Application | PostgreSQL source guarantee | Evidence status this run |
| --- | --- | --- | --- |
| PersonalMedication owner | Resolver-derived owner predicates | Required PatientProfile FK; DELETE/UPDATE RESTRICT | Fresh PostgreSQL FK and owner-scope assertions passed |
| Status/stoppedAt pairing | Create and stop services | ACTIVE iff stoppedAt NULL; STOPPED iff non-NULL CHECK | Fresh PostgreSQL CHECK/direct-write assertions passed |
| STOPPED terminal / text preserved on stop | Mutations require ACTIVE | BEFORE UPDATE trigger rejects every UPDATE of OLD STOPPED; ACTIVE→STOPPED cannot change text or identity | Fresh PostgreSQL direct UPDATE and lifecycle assertions passed |
| Parent identity | No owner-transfer operation | Trigger protects id, patientProfileId and createdAt on UPDATE | Fresh PostgreSQL direct UPDATE assertions passed |
| List indexes | Owner/status predicates, deterministic order | Active/stopped composite ordering indexes | Live catalog definitions match migration; ordered-path assertions passed |
| Schedule parent / deletion | Read/replace through authorized parent | Required FK, RESTRICT on delete/update | Fresh PostgreSQL FK/RESTRICT assertions passed |
| Unique local time | Strict schema rejects duplicates | Unique `(personalMedicationId, localTime)` | Fresh PostgreSQL duplicate-time assertion passed |
| Minute-only time | Canonical 5-character `HH:mm`; UTC carrier rejects seconds/ms | `TIME(6) WITHOUT TIME ZONE`, `[00:00,24:00)`, `EXTRACT(SECOND)=0` CHECK | Fresh PostgreSQL seconds/fractions/range assertions passed |
| Schedule child mutation | Replace collection by delete/add | Every child UPDATE rejected; INSERT/DELETE `FOR UPDATE` parent then require ACTIVE | Fresh PostgreSQL immutability/STOPPED/locking assertions passed |
| Schedule maximum | At most 1,440 distinct application values | Minute CHECK + uniqueness imply at most 1,440 valid times | Unit and PostgreSQL maximum-bound assertions passed |

Prisma cannot express the medication CHECKs/triggers; the forward SQL migration supplies them, and direct PostgreSQL tests exercised them. `prisma migrate diff` returned exit code 2 for unrelated Family/Work constraints and index names; its output contained no `PersonalMedication` or `MedicationSchedule` differences. No production database state is inferred.

## 8. Transaction, retry, atomicity and concurrency

Create/update/stop and schedule replace use one Serializable transaction for persisted SELF, guarded mutation and audit. Schedule replace claims parent `updatedAt` before child delete/create, retains unchanged child IDs, writes one audit and reads its return detail in that transaction. Reads of detail and occurrence source use a Serializable snapshot. Occurrence first-page `evaluationAsOf` is captured once outside the retry callback; continuation does not call the clock.

The shared helper retries Prisma P2034 and P2002 up to two times after the initial attempt. This is an existing shared policy, with no backoff/jitter. P2002 can represent a deterministic uniqueness error and may repeat pointlessly, but the medication schema prevents duplicate desired times and the transaction rollback prevents partial mutation/audit. Changing the global helper is outside this narrow audit without new evidence. Mutations obtain `now()` per callback attempt; aborted attempts are not externally visible, and the final committed attempt supplies its timestamp/version.

Static review found same-transaction audit calls and no root-client audit call inside a mutation. The fresh PostgreSQL run passed audit-failure and child-write rollback tests, same-token replacement/edit/stop races, stop-vs-replace lock barriers, and source read/continuation freshness cases. The final integration suite passed 366/366 tests. No lost update, partial schedule set, duplicate audit or stale-source rebase was observed.

## 9. STOPPED lifecycle

Application update/stop/schedule operations require ACTIVE and the exact `updatedAt`; stop is ACTIVE→STOPPED with monotonic version and one `personal_medication.stopped` audit. Repeated stop conflicts. Parent trigger rejects all ordinary STOPPED updates. Child trigger blocks STOPPED insert/delete and all child updates. STOPPED detail reads retained schedule rows; retracking creates a new parent with no copied schedules. Occurrence discovery returns no new source for STOPPED; continuation conflicts; known-source revalidation returns STALE. These lifecycle and direct-SQL guards passed the fresh PostgreSQL tests.

The DB does not prohibit privileged parent DELETE when no child FK blocks it. This is consistent with the approved contract: no ordinary delete action, and governance/legal deletion is a separate privileged process. No database retention policy is inferred.

## 10. Schedule integrity

Application values are strict ASCII `HH:mm`, minute-only, unique and limited to 1,440; no trim, coercion, locale conversion or silent deduplication. The Prisma carrier is constructed/extracted with UTC getters only. It is not returned as an instant. Native `TIME(6)` plus the SQL CHECK preserves minute precision independently of DB session timezone. The trigger serializes child insert/delete against parent stop and makes schedule child identity/time/createdAt immutable.

Boundary validation reviewed: medication name raw max 1,000 UTF-16 code units then normalized max 200; instruction raw max 4,000 then normalized max 2,000; mutation version max 40 and strict UUID fields. Schedule form parsing allows only three application fields, caps UUID/version/JSON strings, enforces 16 KiB aggregate UTF-8 and checks those bounds before `JSON.parse`; schema then limits 1,440 and rejects duplicate times. The medication Server Action request is still materialized by Next.js before the action runs; `next.config.ts` sets a 6 MiB framework body cap. Text action code copies FormData entries before Zod applies field maxima. That work is bounded by the existing framework cap and invalid fields cannot reach persistence; no unbounded source-service transport exists. Tightening the shared Server Action body limit or adding new request infrastructure was not part of this phase.

Residual precision limit: JavaScript `Date` cannot represent PostgreSQL sub-millisecond fractions. The SQL CHECK is therefore the authoritative defense against fractional-second rows; the ORM adapter can reject visible non-zero seconds/milliseconds but cannot prove that a privileged constraint-bypassing write did not lose a microsecond during conversion. Normal SQL writes were rejected by the CHECK in PostgreSQL tests. Runtime DB-role privileges and behavior under deliberately disabled/dropped constraints were not available for verification; this is a privileged-DB trust-boundary validation item, not a demonstrated application-path defect.

## 11. Source-key cryptography

The implementation hashes UTF-8 `demi.personal-medication-reminder-source.v1`, NUL, canonical lowercase schedule UUID, NUL, Bangkok `YYYY-MM-DD`. SHA-256 output is `medsrc_v1_` plus canonical unpadded base64url: 53 ASCII characters and 32 decoded bytes. It excludes secret, parent ID, text, version, dueAt and query clock. Decoder checks alphabet, digest length and canonical re-encoding. A bounded tuple map fails closed on duplicate key/collision. Key knowledge grants no authority and does not prove historical issuance.

Contract and source align. Current medication unit and integration suites passed stable key, date/child variation, secret independence, malformed trailing-bit and collision assertions.

## 12. Cursor security

Cursor format is `medcur_v1_<payload>.<tag>`. Canonical JSON contains exactly nine ordered fields: cursorVersion, sourceVersion, medicationId, aggregateVersion, from, to, evaluationAsOf, lastDueAt and lastSourceKey. Payload is bounded to 512 bytes / 1,024 cursor characters, lossless UTF-8 and canonical unpadded base64url. Decode validates strict schema then reconstructs JSON and byte-compares, rejecting duplicate keys, reordered fields, whitespace, alternate escaping and unknown fields.

HMAC-SHA-256 uses domain separation plus canonical actor User UUID and Person UUID and `IDENTITY_HASH_SECRET`; the comparison uses `timingSafeEqual`. Actor mismatch, modified fields, invalid tag and secret rotation reject. A forged backdated `evaluationAsOf` cannot pass without a valid MAC. The cursor still carries no authorization; persisted SELF/resource/version checks run first. Current cursor unit and PostgreSQL tests passed the backdate/tamper/rotation and stale-continuation assertions.

## 13. Pagination / evaluationAsOf

Source derivation selects one owner-scoped medication and at most 1,441 child rows (1,440 plus invalid-state sentinel), derives at most 11,520 candidates over at most eight dates, sorts by numeric `dueAt` then source key, and returns at most 100 with 101 lookahead. Continuation preserves authenticated `evaluationAsOf`, binds aggregate version/scope and requires the exact anchor; stale, stopped, mismatched or missing-anchor requests conflict without rebase. It does not call `now()` again. Test source includes 205-item traversal and aged-sequence/fresh-discovery separation.

The current unit and PostgreSQL suites passed bound, 101-lookahead, multi-page traversal, anchor, stale-version and aged-sequence assertions. The returned sequence had no skip or duplicate.

## 14. Future-only / no backfill

Discovery enforces `[from,to)` and `dueAt > evaluationAsOf`; equality and elapsed times are excluded. Edits use the current committed ACTIVE schedule set and do not backfill. Re-polling after elapsed time cannot rediscover the occurrence. An established signed page sequence may continue after a returned source becomes elapsed, under the same version and asOf. Current unit/PostgreSQL boundary and continuation tests passed. No late, grace, catch-up, MISSED or intake inference exists in runtime semantics.

## 15. Revalidation

Revalidation validates the supplied source shape, resolves current persisted SELF and owner-scoped parent, recomputes only the supplied date from current child rows, then returns exactly CURRENT with current version or STALE. It may consider a known elapsed source structurally CURRENT. Text edits/identical retained schedules can remain CURRENT; removed/replaced/re-added child identity and STOPPED become STALE. Foreign/missing returns the same NotFound; ineligible actor is Forbidden. It does not discover alternatives or reconstruct unknown elapsed sources. Current PostgreSQL lifecycle tests passed. CURRENT does not imply delivery permission or prior observation.

## 16. Bangkok timezone

Stored time remains local `HH:mm`; date identity is strict Gregorian Bangkok date. Conversion subtracts the fixed current +07:00 offset and verifies the result through explicit IANA `Asia/Bangkok` `Intl.DateTimeFormat` parts, failing closed on mismatch/unavailable IANA data. There are no process-local Date getters, browser timezone, Patient timezone or TIME-carrier-date dependencies in derivation. Three separate process-TZ runs (UTC, Asia/Bangkok, America/Los_Angeles) each passed 3 files / 87 tests; PostgreSQL session timezone UTC/Asia-Bangkok cases passed in the full integration suite. Midnight, 08:00, 23:59, rollover, leap/year boundaries and supported range assertions also passed.

## 17. Privacy / data-flow map

```text
Authenticated Patient identity
  → persisted User ACTIVE + PATIENT + exact Person + PatientProfile resolver
  → owner-scoped PersonalMedication
  → owner-scoped MedicationSchedule
  → derived ReminderOccurrence (no occurrence persistence)
```

| Boundary | Read / returned data | Authority / persistence / audit | Excluded sensitive fields |
| --- | --- | --- | --- |
| SELF resolver | User/Person/profile relationship; returns internal PatientProfile ID | Persisted identity is authoritative; no new record/audit | Profile PII, Hospital, OSM, Family, caregiver |
| Medication list/detail | Only owner’s medication DTO; selected detail adds sorted `{localTime}` | Patient SELF; PersonalMedication persisted; reads do not audit | Internal owner IDs, auth IDs, audit IDs, unrelated profile/clinical data |
| Occurrence source | Parent medication ID, source key/version, kind, local date/time, dueAt, aggregate version | Same persisted SELF; derived only; no persistence or audit | medicationName, instructionText, schedule child UUID, PatientProfile ID/name, National ID, HN, contact, Hospital, OSM, caregiver, recipient |
| Cursor | Medication ID, aggregate version, query window, evaluationAsOf, last due/key, HMAC | Integrity and actor binding only; not authorization; not persisted | PatientProfile/User/Person IDs, medication text, child UUID, recipient |
| Audit write | Actor User ID, action, `PersonalMedication`, parent resource UUID; metadata omitted | Transactional create/update/stop/schedule-update only | Medication/instruction text, times, child IDs, Patient PII, occurrence list/key/cursor |

`sourceKey` is opaque sensitive operational metadata. It is not a public identity, bearer credential or evidence that an occurrence was previously observed.

## 18. Logging / error privacy

No medication production `console.*` or logger calls were found. Mutation/read services translate unexpected DB/crypto/clock failures to generic `InfrastructureError`; Server Actions translate known codes to fixed Thai messages and unknown failures to a fixed refresh message. Errors do not serialize Prisma causes, SQL, stacks, paths, medication text, schedules, cursor, source key, HMAC secret or owner identifiers. The page rethrows unexpected server failures to the framework error boundary and does not construct a response from the raw error. No request body/DTO dump was found.

## 19. Audit-event findings

Medication mutation actions are `personal_medication.created`, `.updated`, `.stopped` and `.schedule_updated`; each call passes actor/resource only and omits metadata, using the same transaction client. Reads, occurrence pages, continuation and revalidation contain no audit call. `AuditEvent` schema itself would permit many medication/time metadata keys, so privacy depends on this narrow callsite; source tests inspect metadata and PostgreSQL test source checks counts. No live DB count was performed now.

## 20. Cache / cross-user leakage

No `use cache`, `unstable_cache`, React shared result cache, protected module-level result map, browser storage or IndexedDB is used for medication data. The page awaits `connection()` and resolves the protected actor at request time. Only infrastructure objects/configuration are reused (`PrismaClient`, parsed server env); no Patient result is retained there. Client drafts exist only in component state; an opaque actor-specific React key remounts them on account change. Action revalidation is UX invalidation, not authorization.

## 21. Family / Work boundary regression

Medication source imports no Family, appointment-grant, OSM, Hospital or work authorization. Queries scope through PatientProfile SELF only. The PostgreSQL suite passed assigned OSM, Hospital MEMBER/OWNER, routine ADMIN, caregiver relationship and active appointment-grant denials; multi-role PATIENT is own-only. Static adjacent-module search found no Family/Work callsite or DTO using medication records.

## 22. MED-02 absence

No prescription/order/reconciliation/provider/dispensing/administration domain, hidden admin path, role fallback or Hospital/OSM medication UI/model was found. The only medication schema/runtime objects are PersonalMedication and MedicationSchedule plus the derived server-only source code. MED-02 remains REQUIREMENT-GATED.

Goal Plan independence was also checked by source search: medication services do not import PatientProgram/Goal Plan services or mutate program, goal, activity or completion records; Goal Plan code has no medication operation. Medication status/schedule is not derived into program completion or reduction success.

## 23. Adherence absence

Runtime medication code has no TAKEN, SKIPPED, MISSED, DELAYED, adherence/compliance persistence, score, dose-taken action or intake inference. ACTIVE/STOPPED describes DEMI tracking only. References to deferred adherence occur in the approved decision/contract/handoff documents. OD09–OD11 remain deferred.

## 24. 17J delivery absence

No medication queue/outbox/worker/cron/scheduler/polling daemon, LINE/push/SMS/email integration, device token, recipient, notification consent/preference/quiet-hours, retry or delivery attempt/status was found in runtime medication code. The occurrence service has no route, Server Action or UI caller. 17J remains separately requirement-gated; source derivation is not delivery.

## 25. Test-gap analysis

The repository contains targeted policy/schema/domain/cursor/service/Server Action/UI tests and one shared PostgreSQL integration file. Source test names and assertions cover the priority areas: foreign/missing equivalence; persisted role/suspension/profile checks; actual adjacent-role denials; direct FK/CHECK/trigger/UNIQUE/TIME writes; audit and child rollback; aggregate and stop races with latches; source continuation/revalidation; cursor backdate/tamper; 205-item pagination; strict future boundary; no read audit/version write; and timezone fixtures.

The current targeted medication unit run passed **13 files / 255 tests**; the full unit run passed **196 files / 1,569 tests**; the fresh targeted MED-01 PostgreSQL file passed **53/53** after the test-only planner correction; the final PostgreSQL suite passed **28 files / 366 tests**. Priority authorization, IDOR, DB constraints, rollback, concurrency, cursor forgery, future-only boundaries, revalidation and read privacy therefore have current executable evidence. A Prisma schema diff reports unrelated Family/Work differences, while the medication tables have no diff entries. The G1→G2 upgrade path was also tested on the disposable DB: one pre-existing medication row survived and G2 created zero schedule rows. The actual deployment database role grants remain externally unverified.

The server-only occurrence exports have no current public transport. A future transport must bound raw request bytes/field count before JSON/object parsing; the existing strict service schemas alone are not a substitute for a transport boundary. No speculative endpoint limits were added.

## 26. Corrective fixes / findings

No BLOCKER or MAJOR MED-01 defect was confirmed. One MINOR test-only correction was made after a reproducible fresh-database failure: the ordered-index EXPLAIN assertion disabled sequential scans but still let PostgreSQL choose the other status index and add a Sort based on small-fixture cost estimates. The assertion now disables planner sorts locally inside the test transaction as well, making it verify whether the matching ordered index can satisfy the query. It then passed in the full 53-case medication PostgreSQL file and final 366-case suite. Application queries, schema, migrations and production behavior are unchanged.

INFO residuals are recorded in sections 7, 8, 10 and 32: aggregate `updatedAt` covers service-mediated schedule mutations but not privileged direct SQL; the shared retry helper retries P2002/P2034 immediately; Prisma TIME uses a millisecond-resolution Date carrier while the DB CHECK owns minute precision; text action field limits run after framework FormData materialization under a 6 MiB cap; deployment DB-role privileges are not visible in repository source; and a full-schema Prisma diff reports unrelated Family/Work differences. These do not demonstrate a reachable MED-01 application bypass in the inspected call graph.

## 27. Commands actually run

Baseline and audit commands included `git rev-parse HEAD`, `git status --short --branch`, `git show-ref --verify refs/remotes/origin/main`, `rg --files`, focused `rg -n` searches, UTF-8 reads of authoritative documents/source/migrations, `git ls-files --eol`, `npm run test:db:status`, `git diff --check` and final diff review. `.env.integration` values were parsed only to verify the dedicated local endpoint and were not printed.

Executed verification and results:

| Command / action | Result |
| --- | --- |
| `npm run test -- src/modules/medications` | 13 files / 255 tests PASS |
| `npm run test` | 196 files / 1,569 tests PASS. Vitest’s default config excludes `tests/integration`; the later integration-only assertion change does not affect this result. |
| `npm run lint` | PASS, including after the test-only correction |
| `npm run typecheck` | PASS, including after the test-only correction |
| `npm run test:db:status` | Dedicated `demi-integration-postgres-1` healthy on loopback |
| `npm run test:db:reset` + `npm run prisma:migrate:test` | Disposable database recreated; all 33 migrations applied from zero, including 17G.1 and 17G.2 |
| Temporary pre-G2 migration set (32 migrations) → insert synthetic legacy medication → official `prisma migrate deploy` for G2 → verify row/schedule count | PASS: parent identity, owner, text and ACTIVE status preserved; schedule count remained 0. Synthetic fixture and temporary harness were removed. |
| `node .\node_modules\vitest\vitest.mjs run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` | After the planner-test correction: 1 file / 53 tests PASS. Before correction, the fresh database reproduced one EXPLAIN assertion failure (52 passed / 1 failed); exact selected case by itself passed, confirming fixture-history sensitivity. |
| `npm run test:integration` | Initial fresh run: 28 files / 365 passed / 1 planner assertion failed. Final run after correction: 28 files / 366 tests PASS. |
| Process-TZ matrix, three medication time/occurrence/schema files under each `TZ=UTC`, `TZ=Asia/Bangkok`, `TZ=America/Los_Angeles` | Each process resolved the requested zone and passed 3 files / 87 tests |
| `prisma migrate diff --from-url <dedicated demi_test URL> --to-schema-datamodel prisma/schema.prisma --exit-code` | Overall exit 2 due Family/Work constraint/index differences; output had no `PersonalMedication` or `MedicationSchedule` differences |
| `git diff --check` | PASS; Git emitted LF-to-CRLF working-copy warnings for modified tracked docs/test files, with no whitespace errors |

The migration-history-from-zero check was executed only against the local disposable integration database; no production migration state is asserted. `npm run build` was not run (docs and an existing integration assertion only changed). Browser/device/manual UAT was not run.

## 28. Migration / schema verification

Static Prisma-to-SQL review found matching medication model names, UUID ownership, field lengths, enum, timestamp precision, indexes, `TIME(6)`, unique parent/time, FK actions, minute CHECK and SQL triggers. The disposable database was reset; all 33 migrations applied cleanly from zero, including `20261002120000_personal_medication_foundation` and `20261003120000_daily_medication_schedules`. No 17G.3 migration exists. The full PostgreSQL suite then passed. Separately, a temporary migration history with all 32 migrations preceding G2 was applied; a synthetic PersonalMedication row was inserted; official deploy applied G2; the row remained unchanged and the new schedule table contained zero rows. `prisma migrate diff` showed no medication-object differences; it returned 2 because of unrelated Family/Work FK and index-name drift. The owner separately confirmed 17G.2 application externally; that confirmation is not treated as production verification by this audit.

## 29. Lint / typecheck / final suites

- `npm run lint`: **PASS**.
- `npm run typecheck`: **PASS**.
- Final `npm run test`: **196 files / 1,569 tests PASS**.
- Final `npm run test:integration`: **28 files / 366 tests PASS**.

The final integration run followed the test-only planner correction; the prior failing result and its diagnosis are retained in sections 26–27.

## 30. Build status

`npm run build`: **NOT RUN**. This audit changed documentation and one existing integration-test planner setting; it touched no framework/runtime boundary. Build is not required for this diff.

## 31. Manual UAT status

No browser, device or deployed UAT was run. No accessibility, touch interaction, browser or device PASS is claimed. MED-01 automated re-audit completion is separate from manual validation of the existing **ยาของฉัน** page.

## 32. Residual risks and final disposition

Known residuals:

1. Parent `updatedAt` advances through application mutation services; direct privileged child SQL can change children without advancing it. Child triggers still enforce parent ACTIVE on ordinary insert/delete and prohibit child UPDATE. All inspected application paths use the parent-version service. This matches the approved trust boundary; no trigger/version architecture was added.
2. Occurrence query/revalidation services are server-only with no transport today. Their individual inputs have strict schemas and bounded cursor/window/work. A future transport must impose request-byte and field limits before parsing and must separately approve caller authority; no 17J system principal exists.
3. No historical occurrence issuance proof exists by approved design. CURRENT proves only current structure; `sourceKey` cannot prove prior observation, delivery, consent or intake.
4. The deployed DB credential's ability to alter/drop constraints, disable triggers or TRUNCATE is not inferable from repository source. Owner validation should confirm the application credential cannot exercise those privileged bypasses.
5. The full-schema Prisma diff exposes unrelated Family/Work FK/index-name drift; it did not report either medication table. This audit did not expand into those domains.

**Final disposition: PASS / AUTOMATED RE-AUDIT COMPLETE.** No unresolved BLOCKER or MAJOR issue violates approved MED-01 semantics. Authorization/IDOR, medication DB constraints, rollback/concurrency, STOPPED lifecycle, occurrence security, privacy, migration-from-zero and existing-data upgrade checks, lint/typecheck and final unit/integration gates passed. The global non-medication Prisma diff and application-role privilege boundary are documented INFO residuals; no new decision or architecture gate is needed for MED-01 automated completion.

17G.0 remains CLOSED; 17G.1 and 17G.2 remain IMPLEMENTED / CLOSED; 17G.3C remains IMPLEMENTED / CLOSED for the bounded Reminder Occurrence Source only. Adherence remains DEFERRED; 17J delivery/system authority and MED-02 remain REQUIREMENT-GATED. No clinical completeness, browser/device UAT, deployment, notification delivery, occurrence history, or intake is implied.

**Recommended next step:** track Phase 17G.4B manual browser/device UAT for the existing **ยาของฉัน** UI, or leave manual UAT in the common backlog and move to the next approved Phase 17 domain. Do not begin adherence, 17J or MED-02 automatically.
