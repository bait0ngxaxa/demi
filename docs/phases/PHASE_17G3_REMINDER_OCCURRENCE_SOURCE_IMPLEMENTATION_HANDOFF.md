# Phase 17G.3C — Medication Reminder Occurrence Source Implementation Handoff

Date: 2026-10-03. Repository: `bait0ngxaxa/demi`. **Phase 17G.3C — IMPLEMENTED / CLOSED.** Bounded Reminder Occurrence Source only; all required automated implementation evidence passed.

## Baseline and files

Starting HEAD: `206bea8ef6e26ea500e9b6c5ede279b0edf4fc07`; starting working tree clean. HEAD matches the owner-observed main; no independent remote fetch is claimed. AGENTS.md and the [binding 17G.3B contract](./PHASE_17G3_REMINDER_OCCURRENCE_SOURCE_IMPLEMENTATION_CONTRACT.md), [approved decisions](./PHASE_17G3_REMINDER_ADHERENCE_DECISION_PACK.md), CONTEXT/backlog and relevant incumbent code were inspected. No material source contradiction was found.

Added files under `src/modules/medications/`:

- `domain/medication-reminder-occurrence.ts` and matching `.test.ts`: identity, calendar/instant validation, Bangkok conversion, bounded derivation and tuple guards.
- `schemas/medication-reminder-occurrence-schemas.ts` and matching `.test.ts`: strict query, known source and cursor payload.
- `services/medication-reminder-occurrence-cursor.ts` and matching `.test.ts`: canonical actor-bound HMAC cursor.
- `services/medication-reminder-occurrence-query-service.ts` and matching `.test.ts`: protected read/pagination/revalidation.

Extended `tests/integration/personal-medication.integration.test.ts` using existing disposable fixtures/cleanup and deterministic transaction latches. Documentation changes are this handoff and minimal current-status addenda in CONTEXT, backlog and contract. No existing runtime helper was changed. No Prisma/schema/migration/package/dependency/env/transport/route/UI changes, ADR, commit or push.

## Exact API and semantics

[Service](../../src/modules/medications/services/medication-reminder-occurrence-query-service.ts) exports:

```ts
listOwnPersonalMedicationReminderOccurrences(actor, input, dependencies = {})
// Promise<MedicationReminderOccurrencePage>
revalidateOwnPersonalMedicationReminderOccurrence(actor, knownSource, dependencies = {})
// Promise<MedicationReminderOccurrenceRevalidation>
// dependencies: { database?: PrismaClient; now?: () => Date }
```

Both accept ActorContext or null/undefined and unknown raw input, with explicit return types. All four production files are server-only. Query is exactly `{ medicationId, from, to, cursor? }`; known input is the exact eight-field source DTO from the contract. There is no caller clock/page size/timezone/owner field and no public transport.

Source identity is SHA-256 over UTF-8 `demi.personal-medication-reminder-source.v1`, NUL, lowercase child UUID, NUL, strict Bangkok date. Output `medsrc_v1_` plus unpadded canonical base64url digest: 53 characters/32 decoded bytes. No secret/version/text/clock enters identity. Keys retain identity across text/no-op edits and secret rotation; deleted/re-added HH:mm uses a new child family. Duplicate child/time/date or duplicate key, including a collision across distinct tuples, fails closed. Collision guard is tested directly with synthetic tuples; production has no hash override.

Date range is Gregorian 1970-01-01..9999-12-31. All timestamps require exact 24-character UTC `YYYY-MM-DDTHH:mm:ss.SSSZ`, real calendar/time values and parse/ISO round trip. Versions/known dueAt allow canonical years 0001..9999; query/asOf is bounded to 1970-01-01T00:00:00.000Z..9999-12-31T16:59:59.999Z.

Bangkok conversion parses the actual date's UTC arithmetic carrier, subtracts exactly 25,200,000 ms, and verifies explicit Asia/Bangkok Gregorian/Latin/h23 `Intl.DateTimeFormat.formatToParts` date/hour/minute/second. Unavailable/mismatching IANA data fails closed; no fallback. Midnight/08:00/23:59 and next midnight map to the four contract fixtures. Endpoint local-date enumeration uses UTC arithmetic on from/to-minus-1ms and the same IANA guard; no process-local getters or local Date constructor.

Bounds: 7 days/604,800,000 ms; 8 local dates; 1,440 schedules; 11,520 candidate tuples; page 100/lookahead 101; cursor 1,024 characters/512 JSON bytes. Parent select is only id/status/updatedAt plus child id/localTime ordered localTime then id with 1,441 sentinel. No per-occurrence DB query; only bounded in-memory derivation/sort. DTO construction is limited to the returned page.

Discovery requires `[from,to)` and `dueAt > evaluationAsOf`. First-page clock is called once, cloned/validated outside Serializable retries. Continuation never calls now and retains authenticated original asOf, even if an already discovered sequence ages while paging. Fresh queries exclude newly elapsed candidates. STOPPED and zero-schedule first pages succeed empty. No catch-up/backfill/history.

Canonical cursor format is `medcur_v1_<payload>.<tag>`. Exact JSON order: cursorVersion, sourceVersion, medicationId, aggregateVersion, from, to, evaluationAsOf, lastDueAt, lastSourceKey. HMAC-SHA-256 uses incumbent getServerEnv().IDENTITY_HASH_SECRET over UTF-8 `demi.personal-medication-reminder-cursor.v1`, NUL, canonical actor User UUID, NUL, canonical actor Person UUID, NUL, canonical JSON bytes. Decoder bounds/re-encodes base64url, validates lossless UTF-8/strict shape/predicates, reconstructs explicit ordered JSON and compares bytes, then timingSafeEqual on exact 32-byte digests. Whitespace/reordering/escaping/duplicates/unknown fields/tampering/actor mismatch/rotation reject with safe ValidationError. Rotation invalidates cursors only.

Each page/revalidation resolves persisted ACTIVE User/PATIENT/exact User→Person→PatientProfile and one owner-scoped parent in a fresh Serializable snapshot. Initial policy is only a gate. Cursor/sourceKey never grants authority. Foreign and nonexistent parents return the same safe NotFound. OSM/assigned OSM/Hospital MEMBER/OWNER/ADMIN/Family/appointment grant authority is denied; multi-role Patient accesses own SELF only.

Pagination sorts numeric dueAt then code-unit sourceKey. Continuation requires unchanged ACTIVE parent version, authentic matching scope and exact existing anchor, then seeks after that anchor. Version/scope/STOPPED/absent anchor conflicts rather than rebasing. No transaction spans requests. Latches prove an old coherent snapshot during replace/text/stop commit; fresh post-commit queries see current truth. Version guarantee covers incumbent service-mediated mutations, not arbitrary privileged SQL bypass.

Revalidation recomputes only supplied date/current DB children and requires exact key/date/time/dueAt. It ignores input aggregateVersion as a freshness gate and returns CURRENT with the new version after text/retained no-op edits. Removal/time replacement/re-add/STOPPED yields only STALE. Known elapsed sources can remain CURRENT without clock lookup. Unknown/mismatched sources reveal no alternate DTO/key/list. CURRENT cannot prove prior issuance, historical eligibility or delivery permission.

## Privacy, audit, cache and lifecycle review

Stable runtime diff reviewed for clock forgery/canonicalization, actor/resource scope, stale continuation, elapsed discovery, STOPPED/foreign leakage, projection, retries, revalidation and side effects. No production logs, protected result/authorization cache, medication text/PII selection, raw child ID in DTO/cursor, AuditEvent call or persistence operation. patientProfileId appears only in the server-derived owner predicate. Infrastructure errors are sanitized; known ApplicationError passes through and incumbent exhausted abort retries map to Conflict.

Lifecycle A–M evidence: zero schedules; stable same child/date; distinct next date; text/identical reordered replacement retains key but advances version/conflicts cursor; removal/re-add changes family and old key stale; 07:00→09:00 and 10:00→11:00 qualify, 10:00→09:00 does not; equality excluded; STOPPED empty/conflict/stale; retrack new parent with zero schedules. No clinical discontinuation or delivery cancellation claim.

## Executed verification

| Command / evidence | Result |
| --- | --- |
| `npm run test -- src/modules/medications/domain/medication-reminder-occurrence.test.ts src/modules/medications/schemas/medication-reminder-occurrence-schemas.test.ts` | 2 files / 69 tests PASS. Initial run had one test-mock failure (Intl constructor prototype); corrected mock/restore, targeted rerun passed. No production workaround. |
| `npm run test -- src/modules/medications/services/medication-reminder-occurrence-cursor.test.ts` | 1 file / 15 tests PASS |
| `npm run test -- src/modules/medications/services/medication-reminder-occurrence-query-service.test.ts` | 1 file / 38 tests PASS |
| `npm run test -- src/modules/medications` | 13 files / 255 tests PASS, including all four new files (122 tests) and incumbent regression subset |
| `node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` | 1 file / 52 tests PASS at that state |
| Same targeted integration command with `-t 'source continuation rechecks'` after adding that test | 1 PASS / 52 skipped; focused evidence for the later isolated test addition |
| Three separate process TZs, each `node node_modules/vitest/vitest.mjs run` with the two domain/schema paths above | UTC, Asia/Bangkok, America/Los_Angeles: each 2 files / 69 tests PASS; identical exact key/conversion fixtures |
| Three separate process TZs, each targeted PostgreSQL command above with `-t 'source timezone evidence'` | Each 2 PASS / 50 skipped at that state; session UTC and Asia/Bangkok in each process, transaction-local set_config only |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npx eslint tests/integration/personal-medication.integration.test.ts` then `npm run typecheck` | PASS after the isolated later eligibility-test addition |
| `git diff --check` | PASS before broad confirmation and at final documentation closeout |
| `npm run test` | One final broad run: 196 files / 1,569 tests PASS |
| `npm run test:integration` | One final broad run: 28 files / 366 tests PASS; personal-medication file includes all 53 tests. Existing runner generated Prisma Client v6.19.3 and found 33 migrations / none pending on disposable DB. |
| `npm run build` | NOT RUN — server-only, no route/UI/schema/package/framework/build boundary; lint/types/tests verify the slice |

Disposable environment was checked without printing credentials: all three DB URLs agree, loopback port 55432, demi_test, nonproduction test runner; existing PostgreSQL was reachable. No DB reset/production configuration change. The final integration wrapper's incumbent generation/migrate-deploy is disposable setup, not a new schema/deployment. Runtime Node v24.20.0. APIs checked with local Next data-security guide, Context7 Zod documentation and official [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) / [Buffer](https://nodejs.org/docs/latest-v24.x/api/buffer.html) docs. No architecture:check/lint:strict script exists; dependency direction/server-only imports reviewed directly.

## Acceptance evidence against all 75 contract criteria

These rows identify the actual implementation/test signal rather than repeat the checklist. D = [domain](../../src/modules/medications/domain/medication-reminder-occurrence.ts), DT = [domain tests](../../src/modules/medications/domain/medication-reminder-occurrence.test.ts), S = [schemas](../../src/modules/medications/schemas/medication-reminder-occurrence-schemas.ts), ST = [schema tests](../../src/modules/medications/schemas/medication-reminder-occurrence-schemas.test.ts), C = [cursor](../../src/modules/medications/services/medication-reminder-occurrence-cursor.ts), CT = [cursor tests](../../src/modules/medications/services/medication-reminder-occurrence-cursor.test.ts), Q = [query service](../../src/modules/medications/services/medication-reminder-occurrence-query-service.ts), QT = [service tests](../../src/modules/medications/services/medication-reminder-occurrence-query-service.test.ts), PG = [real PostgreSQL tests](../../tests/integration/personal-medication.integration.test.ts).

| Criteria | Actual evidence and limit |
| --- | --- |
| 1–7 | File inventory: four server-only production files, four tests, one PG extension, four docs only. Q owner-scoped findFirst accepts one medication; no Prisma/migration/persistence/history/adherence/delivery/transport/UI additions. |
| 8–12 | Q ownRecord reuses unchanged resolver/policy. QT exact predicate/minimal owner select; PG persisted inactive/role/profile/User/Person mismatches, actual Work/Family/grant matrix, multi-role own only, identical foreign/missing NotFound. |
| 13–15 | Q ACTIVE/STOPPED/zero branches; QT empty/read checks; PG source lifecycle retains terminal children and retrack zero. |
| 16–19 | D canonical Gregorian/HH:mm/key functions and guard; DT exact fixture, UUID lowercase, real leap/bounds, different child/date, invalid trailing bits and independent synthetic collision/duplicate guard. |
| 20–23 | PG source lifecycle text/identical/reorder/remove/re-add assertions and child-key correspondence; QT current/stale; D preimage includes only namespace/child/date. CT rotation test retains sourceKey. |
| 24–27 | D UTC carrier/subtraction/IANA verify and strict round trip; DT four exact fixtures, leap/year rollover, limits, invalid/offset/timezone-less/normalized values and unavailable/mismatched IANA. No persisted instant. |
| 28–30 | S window + D candidate filter. DT inclusive/exclusive/equality/past interval; QT fresh query excludes newly elapsed; PG before/after/equal edit cases. |
| 31–33 | Q clock outside helper and continuation from authenticated cursor. QT once/clone/retry plus three-page aging sequence/fresh-query exclusion; PG continuation throwing clock proves no recapture. |
| 34–37 | D constants/date/product/schedule guards and numeric/code-unit sort; DT exact seven days/+1ms/eight dates/11,520 and invalid duplicates; QT 99/100/101 and 205 traversal without skips/duplicates; Q 1,441 sentinel/101 slice. |
| 38–41 | C explicit nine-field canonical reconstruction, bounds/lossless decode/tag validation; CT independent signer, tampered each field, canonical/duplicate/reordered/UTF-8/actor/rotation rejection. Q resolves authority before codec. Cursor fields inspected for privacy. |
| 42–46 | Q fresh Serializable helper/parent version/exact anchor checks; QT version/scope/anchor/stop conflicts and transaction options; PG edit/no-op/stop-between-pages plus coherent old snapshot concurrent commit/fresh read. No per-occurrence DB call. |
| 47–49 | Q explicit minimal select and eight-field DTO; QT exact selected/result keys. C payload has no child/owner/text; source hash is opaque. Keys confer no authority/issuance/delivery guarantee (documented). |
| 50–56 | Q single-date recomputation returns CURRENT version or STALE only. QT all altered inputs/unknown elapsed/current elapsed/version distinction; PG text/no-op/removal/re-add/stop/foreign persisted checks. No alternative key/DTO output. |
| 57–60 | Q no mutation/audit/cache/log imports/calls; QT write/audit spies/unchanged version/safe errors; PG actual AuditEvent counts and updatedAt checks across reads/pages/revalidation. S/C strict raw bounds/canonical rejection. Complete privacy review above. |
| 61–63 | Executed DT/ST/CT/QT commands above: 69 + 15 + 38 tests; medication subset 255 PASS. |
| 64–66 | Targeted PG 52 PASS plus later eligibility test 1 PASS; final PG file 53 PASS within full 28-file/366-test suite; three process × two session timezone cases PASS; source lifecycle/pagination/concurrency/edit equality/retrack tests map A–M. |
| 67–70 | Staged command history above; one repaired mock failure disclosed; one final unit then one final integration run PASS. No browser/device/deployment PASS. 17G.2 migration confirmation remains external owner evidence, unchanged. |
| 71–74 | No implementation of deferred OD09–OD11, 17J authority/delivery, MED-02 or Goal Plan coupling. No shared helper/authority/schema/ADR change. Source matches bounded additive contract. |
| 75 | This handoff records API/files/evidence/limits/status; current documentation addenda and final tree inventory completed at closeout. |

## Remaining boundaries and final working tree

Final HEAD remains `206bea8ef6e26ea500e9b6c5ede279b0edf4fc07`. Working tree: four modified tracked files (integration test, CONTEXT, backlog, contract) and nine new files (eight module production/test files and this handoff), 13 task-scoped files total. No schema/migration/UI/route/transport/package/shared-helper change. Runtime/source/test diff was stable and reviewed before final broad runs; subsequent changes only record documentation evidence/status. New files pass strict UTF-8/no-BOM/no-replacement/no-trailing-whitespace checks; local handoff links and complete acceptance numbering 1..75 verified. Historical documentation bodies retained; only relevant historical headings/current inventory updated. Git line-ending normalization notices are informational; no broad formatting/encoding rewrite.

No unresolved implementation issue or outstanding failed runtime check. The initial Intl test mock failure was repaired and all required checks subsequently passed. Build/dev server/browser/device UAT/production deployment NOT RUN; no inference of their PASS. No product decision reopened. Adherence remains deferred (OD09–OD11); 17J owns requirement-gated delivery/system authority/content disclosure; MED-02 requirement-gated. Owner-confirmed 17G.2 migration application is external evidence only. Source revalidation is current structural membership, not historical issuance proof; delivery may race later changes. No shared-result cache or durable occurrence ledger exists.

**Exact final status: Phase 17G.3C — IMPLEMENTED / CLOSED — bounded Reminder Occurrence Source only.**

Next after successful closeout: **Phase 17G.4A — Medication Automated Security / DB / Privacy Re-audit**. Not started here. No commit or push.
