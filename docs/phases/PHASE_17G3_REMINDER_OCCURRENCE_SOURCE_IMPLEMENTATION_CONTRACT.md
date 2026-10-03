# Phase 17G.3B — Medication Reminder Occurrence Source Implementation Contract

**CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** Documentation and engineering contract only. Date: 2026-10-03. Repository: `bait0ngxaxa/demi`.

**17G.3A DECISIONS CLOSED / OWNER APPROVED. Adherence remains deferred and is not part of the cleared runtime slice.** This contract hands off only the bounded Reminder Occurrence Source to **17G.3C**. No runtime, schema, migration, service, route, Server Action, UI, test, dependency or environment change is delivered here. Notification delivery and notification-system authority remain gated under 17J.

## 1. Authority, baseline and source evidence

[AGENTS.md](../../AGENTS.md) was read first. Starting local HEAD: `d9f72c164ea9296493c72b2a234bafe17a7caf6a` — `docs(phase-17g3a): close reminder source and adherence decisions`. Starting working tree clean. This matches the owner-observed remote main; no independent remote-head fetch is claimed.

The authoritative [17G.3A decision pack](./PHASE_17G3_REMINDER_ADHERENCE_DECISION_PACK.md), including actual interactive owner answers, governs this contract. Technical choices below do not reopen its business/product/privacy decisions.

| Inspected source | Relevant established behavior |
| --- | --- |
| [CONTEXT](../CONTEXT.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md), [17G.0B closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md) | Q30–Q53 closed; MED-01 exact SELF; MED-02 separate/gated; Q45 separates source from delivery |
| [17G.1 contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md), [handoff](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_HANDOFF.md), [17G.2 contract](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_CONTRACT.md), [handoff](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_IMPLEMENTATION_HANDOFF.md) | 17G.1/17G.2 IMPLEMENTED / CLOSED; earlier future/status/deployment statements are historical evidence |
| [Prisma schema](../../prisma/schema.prisma), [foundation migration](../../prisma/migrations/20261002120000_personal_medication_foundation/migration.sql), [schedule migration](../../prisma/migrations/20261003120000_daily_medication_schedules/migration.sql) | UUID children; unique parent/TIME(6) minute; immutable child UPDATE; INSERT/DELETE require locked ACTIVE parent; terminal STOPPED parent; no occurrence ledger |
| [Definitions](../../src/modules/medications/domain/personal-medication-definitions.ts), [TIME adapter](../../src/modules/medications/domain/medication-local-time.ts), [schemas](../../src/modules/medications/schemas/personal-medication-schemas.ts) and their tests | 0..1,440 unique canonical HH:mm; Prisma Date is a TIME carrier only; strict bounded objects/UUID/version validation |
| [SELF policy](../../src/modules/medications/policies/personal-medication-policy.ts), [persisted owner resolver](../../src/modules/medications/services/personal-medication-access-service.ts) and policy/service tests | ACTIVE persisted User/PATIENT/exact Person/PatientProfile; server-derived owner; no work/delegated fallback |
| [Query service](../../src/modules/medications/services/personal-medication-query-service.ts), [mutation service](../../src/modules/medications/services/personal-medication-service.ts), [medication service tests](../../src/modules/medications/services/personal-medication-services.test.ts), [schedule service tests](../../src/modules/medications/services/medication-schedule-services.test.ts) | Detail uses one Serializable snapshot; desired-set replacement retains unchanged children; every accepted mutation advances parent.updatedAt, including no-op; source key must not include that version |
| [Transport](../../src/modules/medications/transport/), [protected page](../../app/app/personal/medications/page.tsx), [PostgreSQL tests](../../tests/integration/personal-medication.integration.test.ts) | Bounded parsing, sanitized errors, request-time uncached SELF reads; existing tests exercise real child identity, versions, role matrix, snapshots and stop/edit races |
| [Serializable helper](../../src/lib/db/serializable-transaction.ts), [application errors](../../src/shared/errors/application-error.ts), [audit service](../../src/modules/audit/services/audit-service.ts) | Existing transaction/error/audit boundaries; helper has two immediate retries after the initial attempt for known P2002/P2034 aborts; no new retry framework in this slice |
| [Reporting cursor](../../src/modules/reporting/services/program-report-query-service.ts), [import preview binding](../../src/modules/patient-provisioning/transport/patient-import-file-binding.ts), [server env accessor](../../src/lib/env/server.ts), [invitation token service](../../src/modules/family/services/caregiver-invitation-token-service.ts) | Bounded strict base64url JSON precedent; server-only SHA/HMAC and timing-safe comparison precedent; existing IDENTITY_HASH_SECRET already used for domain-separated bindings |
| [package.json](../../package.json), [integration runner](../../scripts/integration.mjs), [unit config](../../vitest.config.mts), [integration config](../../vitest.integration.config.mts), [Next config](../../next.config.ts) | Node observed locally via node --version: v24.20.0; package has no engines pin; @types/node ^20; established lint/typecheck/test/integration scripts; no lint:strict/architecture:check script; no cacheComponents setting |

Repository searches found no medication occurrence service or notification source registry/queue/outbox/job mechanism requiring reuse. Existing medication list UUID cursors describe persisted parents, not a derived occurrence snapshot; reuse their authorization discipline, not their payload. Reporting has base64url JSON, but its unsigned cursor does not carry an authoritative clock: its decoder is not sufficient unchanged here. No generic reminder framework is introduced.

### Owner-confirmed migration evidence

Application of **20261003120000_daily_medication_schedules** was confirmed externally by the owner after implementation review. **Migration application was confirmed externally by the owner; no deployment command output is attributed to this agent.** No environment, production PASS, deployed command/output or browser/device UAT PASS is asserted. Earlier handoff evidence remains historical and unchanged.

## 2. Reused immutable decisions and scope

| Approved decision | Binding interpretation here |
| --- | --- |
| G3-OD01 / OD08=A exclusion | Source only; no adherence vocabulary/persistence/actions |
| G3-OD02 / OD14=A | Deterministic derivation, no occurrence table or historical ledger |
| G3-OD03=A | Child identity + Bangkok local date; opaque deterministic versioned key |
| G3-OD04=A | Local time/date authoritative; UTC instant only at the comparison/interoperability boundary |
| G3-OD05 / OD06=A | Current committed ACTIVE/current children only; no backfill; unchanged child stable; remove/re-add new identity |
| G3-OD07=A | Bounded future interval; numeric engineering limits defined below |
| G3-OD12=A | Minimum internal projection; no default medication name; no 17J system authority |
| G3-OD13=A | dueAt > evaluationAsOf within [from,to); no elapsed discovery/catch-up |
| G3-OD09–OD11 | DEFERRED / OUT OF SOURCE SLICE; future adherence actor/history/binding remain unresolved |

Q30–Q53, G2-OD01/G2-OD02 and existing SELF/terminal lifecycle/timezone decisions remain closed. Medication remains independent of Goal Plan. A Patient schedule represents chosen personal tracking, not prescription instructions, physician orders or a clinical administration record. An occurrence is a scheduled tracking point, not proof of clinical due, delivered notification, intake or outcome.

```text
PersonalMedication (exact SELF; ACTIVE/STOPPED)
    └── MedicationSchedule (current immutable child identity + HH:mm)
            ▼
    17G.3C server-only READ source + structural revalidation
            │ stable key / date / time / boundary instant only
            ▼ future separately authorized handoff
    17J Notification Delivery (future / requirement-gated)
            ├── consent / opt-in / preferences / recipient
            ├── channel / device / provider / disclosure / quiet hours
            └── duplicate suppression / attempts / retries / delivery state
```

## 3. Exact service boundary and DTO

Implement both exports in `src/modules/medications/services/medication-reminder-occurrence-query-service.ts`, with explicit return types and `import "server-only"`. Node server execution only; no Edge/browser entry point.

| Export | Contract |
| --- | --- |
| listOwnPersonalMedicationReminderOccurrences(actor, input, dependencies = {}) | actor: ActorContext or null/undefined; input: unknown validated as { medicationId, from, to, cursor? }; returns Promise<MedicationReminderOccurrencePage> |
| revalidateOwnPersonalMedicationReminderOccurrence(actor, knownSource, dependencies = {}) | same actor boundary; knownSource: unknown validated as the strict source DTO below; returns Promise<MedicationReminderOccurrenceRevalidation> |
| MedicationReminderOccurrenceDependencies | { database?: PrismaClient; now?: () => Date }; reuse getPrisma and incumbent injectable server clock convention; dependencies are trusted server composition, never input/transport fields |

No route, Server Action, UI caller, browser projection, global scan, all-own-medication aggregation, service account, ADMIN bypass, system principal or recipient resolution is part of 17G.3C. A future 17J consumer is not authorized to call these SELF services by this contract. No fabricated Patient actor or delegated grant bridge.

**MedicationReminderOccurrenceSource**, exact server-only fields:

| Field | Exact value/meaning |
| --- | --- |
| sourceKey | canonical medsrc_v1_ key in section 5 |
| sourceVersion | literal number 1 |
| kind | literal PERSONAL_MEDICATION_DAILY |
| personalMedicationId | canonical lowercase parent UUID; locator, not authority |
| localDate | strict Gregorian YYYY-MM-DD Bangkok calendar date |
| localTime | existing strict HH:mm |
| dueAt | canonical UTC instant YYYY-MM-DDTHH:mm:ss.SSSZ |
| aggregateVersion | parent.updatedAt.toISOString() from the read snapshot; freshness, not identity |

**MedicationReminderOccurrencePage**: `{ items: MedicationReminderOccurrenceSource[], nextCursor: string | null, evaluationAsOf: string, aggregateVersion: string }`. At most 100 items. Empty is `items: []`, `nextCursor: null`; still includes the snapshot version/asOf. No total/history/status/intake fields.

**MedicationReminderOccurrenceRevalidation** is exactly `{ status: "CURRENT", aggregateVersion: string }` or `{ status: "STALE" }`. No source list or reconstructed source DTO is returned. CURRENT describes structural backing in the new snapshot only, never permission to deliver.

Omit patientProfileId from results and cursor. Internally it is required only for the owner predicate. No separate owner handoff projection is needed now. Any future internal owner projection must be separately authorized, server-only, neither recipient identity nor authority, and must not reach a browser.

## 4. Authorization, lifecycle and read snapshot

Use assertPersonalMedicationSelf for the initial actor gate, then resolvePersonalMedicationOwner inside **runSerializableTransaction**. Check current persisted ACTIVE User + PATIENT role + exact actor User/Person binding + existing PatientProfile every query/revalidation/page. Reject missing/inconsistent profile, stale role or inactive account; no implicit profile provisioning. Multi-role PATIENT accesses own SELF only.

OSM/assigned OSM, Hospital MEMBER/OWNER, routine ADMIN, Family/caregiver and appointment-caregiver grant confer **zero MED-01 authority**. Eligible Patient caregiver/ADMIN likewise has own SELF only. Input strictly rejects patientProfileId, personId, ownerId, userId and other unknown fields.

Owner-scoped parent lookup: id + server-derived patientProfileId. Foreign/nonexistent parent uses the same default NotFoundError, before any status/version disclosure. Use a new focused explicit select rather than existing personalMedicationSelect/detailSelect, which load medication text:

- Parent: id, status, updatedAt.
- Nested schedules: id, localTime, ordered localTime ASC then id ASC, take 1,441 as a defensive over-limit sentinel. Require at most the domain maximum 1,440 before derivation; sentinel/invalid persisted rows fail closed rather than silently truncating. Valid DB constraints already enforce that ceiling.
- Owner resolver's incumbent minimal profile select only. Do not select medicationName, instructionText, createdAt, stoppedAt or child.createdAt for derivation.

Authorization, parent status/version and child rows come from the same transaction client/snapshot, including any relation queries Prisma performs separately. Reuse incumbent Serializable read convention and bounded retries; no unrelated read before/after used as authoritative data. Freeze first-page clock outside the retried callback. Return only after transaction success. No writes/audit/version advancement.

| State | First-page discovery | Continuation | Known-source revalidation |
| --- | --- | --- | --- |
| Own ACTIVE, zero children | Empty page | Validate cursor/version/anchor first; inconsistent continuation conflicts | STALE |
| Own ACTIVE, current children | Derive eligible future sources | Same version/ACTIVE, exact anchor, original asOf | Exact identity/time match → CURRENT |
| Own STOPPED | Empty page, no source generation; ordinary history stays readable | ConflictError / refresh required; never silently empty/rebase | STALE |
| Foreign/missing parent | NotFoundError | NotFoundError | Same NotFoundError; no existence probe via STALE |
| Ineligible actor | ForbiddenError | ForbiddenError | ForbiddenError |

Each page is a fresh consistent DB snapshot with an equal aggregate freshness token, **not a transaction held open across requests**. A read concurrent with edit/stop may coherently observe the old committed snapshot; a subsequent post-commit continuation must conflict. Revalidation can likewise become stale after it returns. No locking guarantee spans delivery.

Existing application mutations advance parent.updatedAt. Published child triggers do not independently advance it for privileged/direct SQL; the cursor guarantee covers incumbent service-mediated mutations. Do not claim the version is a historical revision ledger or a detector for arbitrary privileged DB bypass. No new trigger/schema change is needed or approved.

## 5. Exact canonical source key

Canonical preimage bytes, with no trailing separator/newline:

```text
UTF8("demi.personal-medication-reminder-source.v1")
|| 0x00
|| UTF8(canonical-lowercase-MedicationSchedule-UUID)
|| 0x00
|| UTF8(strict-Bangkok-YYYY-MM-DD)
```

Compute SHA-256 with node:crypto createHash, UTF-8 input; output `medsrc_v1_` + the 32 digest bytes encoded unpadded base64url. Exactly **53 ASCII characters**: 10-character prefix + 43-character digest. Validate full length/alphabet/prefix, decoded digest length 32 and byte-for-byte canonical base64url re-encoding (reject noncanonical trailing bits/padding). No secret, environment-specific input or persisted source-key column.

Use established APIs from [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) and [Node Buffer encodings](https://nodejs.org/docs/latest-v24.x/api/buffer.html): createHash/createHmac, timingSafeEqual, UTF-8 and base64url. Node's decoder accepts more than the canonical URL alphabet, so enforce the stated alphabet/round-trip checks explicitly. No newer crypto API or package is required by this contract.

Same child/date always has the same key; different child/date has a different expected key. UUID input is validated and lowercased using incumbent UUID semantics before hashing. Parent ID/version/text/query time/provider/delivery/adherence are absent from the preimage. Text edit and retained children in identical replacement preserve keys; remove/re-add same HH:mm creates a different child/key family.

Maintain a bounded key→tuple map for each derivation/revalidation operation. If distinct tuples produce one key, fail closed with sanitized InfrastructureError; never merge or return partial results. Duplicate candidate tuple/child/time violating persisted invariants also fails closed. Test the focused pure guard with constructed distinct tuples sharing a synthetic key; no production hash override in dependencies, no database uniqueness for an unpersisted key.

SourceKey is sensitive operational metadata, **not a bearer credential, delivery ID, delivery idempotency guarantee or proof of historical observation**. It grants zero authorization; no raw child UUID crosses a browser boundary. Identity version changes require an explicit later contract; do not silently rewrite v1.

## 6. Canonical dates, timestamps and Bangkok conversion

Choose a dependency-free fixed-current-Bangkok conversion, checked against the explicit IANA zone at the conversion boundary. Local date is ASCII Gregorian YYYY-MM-DD, validated for actual month/day/leap year, length 10 and supported date range **1970-01-01 through 9999-12-31**. No Buddhist-year interpretation. localTime reuses length 5 and incumbent minute regex. No trimming/coercion/locale digits.

All timestamp inputs/DTO/cursor values use a strict canonical RFC3339 UTC subset: exactly **24 ASCII characters**, `YYYY-MM-DDTHH:mm:ss.SSSZ`, four-digit year 0001..9999, actual Gregorian date, hours 00..23/minutes/seconds 00..59, exactly three fractional digits. Require finite epoch and exact toISOString round trip; reject offset, timezone-less string, lowercase z, leap second, 24:00, whitespace, Date objects/numbers and normalized invalid dates. This deliberately accepts one representation, not every RFC3339 spelling. Source dueAt seconds/milliseconds are always zero.

For query from/to and server evaluationAsOf, require supported instant range **1970-01-01T00:00:00.000Z through 9999-12-31T16:59:59.999Z**, inclusive, so adding seven hours keeps the Bangkok date within four-digit years. These are representation safety limits, not medication start/end dates or historical lookup approval. Versions use canonical UTC syntax without the query-range restriction. A known local 1970-01-01 midnight converts into UTC 1969-12-31; known-source dueAt validation permits that canonical representation without enabling discovery.

Exact conversion:

1. Validate real Gregorian localDate and HH:mm, not just regex.
2. Parse the fully specified UTC ISO carrier **localDate + T + localTime + :00.000Z** solely as an arithmetic reference for this actual calendar date; verify its exact ISO round trip.
3. Subtract **25,200,000 ms (7 hours)**, yielding the UTC boundary instant; serialize with toISOString. This is not the schedule's 1970 TIME carrier and is not stored.
4. Round-trip that instant through Intl.DateTimeFormat with locale `en-US-u-ca-gregory-nu-latn`, explicit timeZone `Asia/Bangkok`, calendar `gregory`, numberingSystem `latn`, hourCycle `h23`, numeric year and 2-digit month/day/hour/minute/second. Use formatToParts, not locale-string parsing. Require date/time parts to equal the requested localDate/HH:mm/00 exactly. Unavailable ICU/zone or mismatch → sanitized InfrastructureError, no fixed-offset fallback.

For interval local-date enumeration, add 25,200,000 ms to from and to-minus-1ms, take their UTC ISO date parts, and verify those date/time mappings against the same explicit Bangkok formatter. Enumerate actual calendar dates inclusive between these endpoints using UTC epoch-day arithmetic (86,400,000 ms) only, validating bounds. Reuse a formatter object within an operation; it contains no Patient data. No implicit today, local Date constructor/getters, browser/machine timezone, arbitrary client offset, Patient timezone preference or persisted UTC recurrence.

The pinned [IANA tzdb 2025b Asia source](https://data.iana.org/time-zones/tzdb-2025b/asia) specifies Asia/Bangkok +07:00 without DST rules after April 1920; the supported domain starts in 1970. This evidence does not promise future civil-time policy never changes. The runtime IANA round-trip guard fails closed if its zone data disagrees; a future legal offset change requires a focused contract/conversion update, not silently becoming UTC recurrence or a user setting. Explicit-zone parts and ISO arithmetic follow [ECMA-402 DateTimeFormat](https://tc39.es/ecma402/#sec-intl.datetimeformat.prototype.formattoparts) and [ECMAScript ISO date-time rules](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-time-string-format). These are design evidence, not conversion tests executed in 17G.3B.

| Local date/time Asia/Bangkok | Required dueAt in 17G.3C tests |
| --- | --- |
| 2026-10-04 00:00 | 2026-10-03T17:00:00.000Z |
| 2026-10-04 08:00 | 2026-10-04T01:00:00.000Z |
| 2026-10-04 23:59 | 2026-10-04T16:59:00.000Z |
| 2026-10-05 00:00 | 2026-10-04T17:00:00.000Z |

Run these in separate processes with TZ=UTC, TZ=Asia/Bangkok and TZ=America/Los_Angeles. Include leap/day/month/year rollover and noncanonical/invalid dates. Never mutate process-global TZ inside parallel tests. The existing TIME adapter still only extracts stored HH:mm; it must not become the occurrence conversion owner.

## 7. Query validation, clock and exact work limits

Strict query object: medicationId (existing UUID normalization), from/to (section 6), optional cursor (nonempty string only; null/empty is invalid; omit for first page). No pageSize, limit, client evaluationAsOf, timezone, date range recurrence, owner or extra fields. Raw maxima: medicationId 36 code units, timestamps 24, cursor 1,024 ASCII characters; at most four keys. Check raw bounds before cursor decode/JSON or candidate allocation. No HTTP body exists in this slice; no global request-config change.

| Constant | Exact engineering value |
| --- | --- |
| MAX_WINDOW_DAYS | 7 |
| MAX_WINDOW_MS | 604,800,000; require 0 < to - from <= this |
| PAGE_SIZE | 100, fixed; no caller override |
| LOOKAHEAD | 101 |
| MAX_LOCAL_DATES | 8 intersecting dates for a seven-day half-open interval |
| MAX_SCHEDULES | 1,440, reuse existing domain bound |
| MAX_CANDIDATE_TUPLES | 11,520 = 1,440 × 8 per query operation/page |
| MAX_CURSOR_LENGTH / MAX_CURSOR_JSON_BYTES | 1,024 encoded ASCII characters / 512 decoded UTF-8 bytes |

Seven days means elapsed interval duration, not seven date labels. A partial starting day can intersect eight local dates. Exact endpoint to is exclusive; use to-1ms for date enumeration because timestamps have millisecond precision. No rounding the interval outward and no silently widening backward. A seven-day minute lattice yields at most 10,080 eligible minute instants before the future/seek filters; the conservative work/allocation ceiling is 11,520 candidates. No DB query per occurrence/N+1, no cross-medication input or unbounded allocation. A bounded in-memory candidate array + tuple map + deterministic sort is sufficient; O(schedules × dates) derivation, O(candidates log candidates) sort, O(candidates) memory. DTO construction/returned items are bounded to 101/100; guard malformed persisted schedules/count before work. No generate_series SQL or optimization framework.

First page: after initial actor gate/input validation, capture dependencies.now() (default new Date()) **exactly once**, clone/validate it, and freeze evaluationAsOf before entering retryable transaction work. Invalid/out-of-supported-domain server clock → InfrastructureError. All candidates require **dueAt >= from, dueAt < to, dueAt > evaluationAsOf**. A from earlier than asOf remains the same requested bound; elapsed candidates are filtered, not rebuilt. An entirely elapsed interval returns empty after authorization/parent resolution.

Strict future is relative to this captured query reference, not a promise that dueAt is still future when the response arrives. Current children/status come from the transaction snapshot; asOf is not proof those children existed at any historical instant. No commit-time/history reconstruction or due-time observation claim is made.

Continuation recovers the original authenticated cursor evaluationAsOf; it does not replace it with now or call now while deriving a page. Thus a source may become elapsed while a genuine established sequence is paging and still appear on a later page. This is continuation of prior future discovery, not new elapsed discovery. A fresh cursorless query captures a new server asOf and cannot rediscover elapsed points. There is no cursor TTL, grace period, late/overdue/missed state or catch-up endpoint; replaying a genuine cursor continues the same bounded query and never proves historical occurrence existence.

Equality example: at evaluationAsOf=2026-10-04T01:00:00.000Z, today's 08:00 Bangkok is **excluded**, even when equal to from. A consumer must have obtained it earlier. If future 17J needs at-due/late discovery, a separate source decision is required. Retrying delivery of an already obtained source is not source backfill.

## 8. Cursor integrity, shape and deterministic pagination

Sort by numeric dueAt ASC then sourceKey ASC using ASCII/code-unit comparison, not localeCompare. Equal due times are normally prevented by unique parent/minute; still define the tie-breaker. Cursor seek uses strictly greater `(dueAt, sourceKey)` than the last returned item.

Choose opaque versioned **base64url canonical JSON with an HMAC integrity binding**, extending repository JSON cursor and signed preview-binding conventions. Reason: an unsigned JSON cursor carrying asOf could be forged with a backdated asOf, violating server-authoritative first-page clock/no elapsed discovery even with perfect SELF authorization. Signature is integrity of paging metadata, not authority or a capability; fresh persisted SELF and owner scoping remain mandatory.

Canonical JSON payload: exactly these nine keys in this insertion order, no whitespace; use JSON.stringify on the validated explicit object, not an input spread:

```text
cursorVersion: 1
sourceVersion: 1
medicationId: lowercase UUID
aggregateVersion: canonical parent updatedAt ISO
from: canonical original ISO
to: canonical original ISO
evaluationAsOf: canonical original server ISO
lastDueAt: canonical last returned dueAt ISO
lastSourceKey: canonical last returned medsrc_v1_ key
```

Encoding: **medcur_v1_<payload-base64url>.<tag-base64url>**. Payload is UTF-8 canonical JSON (max 512 bytes); tag is 32-byte HMAC-SHA-256, unpadded base64url (43 characters). Exact tag preimage, no trailing separator:

```text
UTF8("demi.personal-medication-reminder-cursor.v1") || 0x00
|| UTF8(canonical-lowercase-actor.userId) || 0x00
|| UTF8(canonical-lowercase-actor.personId) || 0x00
|| canonical-JSON-UTF8-bytes
```

Use existing getServerEnv().IDENTITY_HASH_SECRET as UTF-8 HMAC key, following incumbent domain-separated import-preview binding; no new env, secret, package, schema or process-local signing store. Do not expose or log it. Bind to the persisted-eligible actor; actor IDs are not serialized in the payload. Tests mock existing env accessor with a fixed test secret. Invalid/missing server configuration → InfrastructureError. Secret rotation invalidates old cursors; return generic ValidationError requiring a fresh query, no unsigned fallback. Source keys remain secret-free and stable across rotation.

Decoder order: bound full length/prefix/segments/alphabet before decode; forbid padding/standard-base64 alternatives; verify decoded lengths and exact base64url re-encoding. Decode UTF-8 losslessly (re-encode bytes and compare), parse as unknown, strict-shape schema with literal versions/canonical fields, then require byte-for-byte equality with reserialized canonical JSON. This also rejects duplicate keys, reordered fields, alternative escaping, whitespace and unknown keys without a generic JSON parser. Compare tag bytes with timingSafeEqual only after 32-byte checks. Invalid encoding/shape/version/tag → default ValidationError, never private parser details. Canonical sourceKey digest receives the same trailing-bit check.

On each continuation, within fresh SELF snapshot:

1. Resolve own parent (foreign/missing → safe NotFound).
2. Authenticate/validate cursor; top-level medicationId/from/to must equal its canonical scope exactly. A well-formed, validly bound cursor with different scope → ConflictError / restart; malformed or tampered cursor → ValidationError.
3. Require parent ACTIVE and updatedAt exactly equal cursor aggregateVersion; otherwise ConflictError, before empty-result handling. No silent rebase.
4. Revalidate original window, supported asOf, and lastDueAt within original [from,to), strictly > original asOf; invalid predicate data → ValidationError.
5. Derive the bounded current set, guard collisions, require exact lastDueAt/lastSourceKey anchor in that set. Absent anchor under otherwise valid metadata → ConflictError.
6. Seek after anchor, take 101 lookahead, return first 100; nextCursor from last returned item iff item 101 exists. Empty/final page → null. Carry original asOf/window/version unchanged.

No medication text, owner/Patient PII, child ID, recipient or channel in cursor. Cursor is opaque, **not encrypted**; parent locator/version and timing are sensitive and must stay server-only. Clock integrity does not create permission for 17J. Do not expose the cursor codec as a Patient transport or export raw decoded payload.

## 9. Known-source structural revalidation

This operation accepts exactly one previously obtained source DTO, strictly validated (all eight fields, no extra authority fields). It is a bounded membership check, never a historical discovery API. It emits no occurrence list, no recomputed source DTO and no alternative key on failure.

1. Initial actor gate/raw bounds and strict source shape; fresh transaction resolves persisted SELF and the DTO's owner-scoped personalMedicationId.
2. Foreign/missing parent → identical safe NotFound; ineligible actor → Forbidden. A sourceKey/owner claim never authorizes the parent.
3. Own STOPPED → STALE; retain history untouched.
4. For current ACTIVE children, derive only the **one supplied canonical localDate** (max 1,440 candidates); guard collisions/invalid persisted data, recompute each key using actual child identity.
5. Exact sourceKey match required. Require supplied localDate/localTime/dueAt equal recomputed canonical truth. No match or a syntactically valid mismatched time/instant → STALE; malformed format/version/kind → ValidationError.
6. Return CURRENT plus **current** parent aggregateVersion if structurally matched. The supplied aggregateVersion is validated but not an equality gate: text edits/no-op replacements can change it while the source identity remains current. No updated DTO/clock eligibility is returned.

No dueAt > current-now predicate here. A known source can validate after its due instant, including equality. That proves only current structural backing, not that it was previously delivered/observed, eligible at the past time, clinically due or timely to send now. With no ledger, this service **cannot prove prior issuance of the supplied key**; deterministic keys are not credentials. The known-source calling convention plus no discovery/list/fallback output is the boundary. Do not claim a signed receipt/issuance registry exists. If future 17J needs proof of observation it needs its own approved contract/evidence. Passing only a date or unknown key must never return discoverable elapsed occurrences.

Remove/re-add same HH:mm makes old key STALE; replacement old child STALE; STOPPED STALE. Text edit or identical retained-child replacement remains CURRENT, even though continuation with the old aggregate token conflicts. Structurally CURRENT does not decide notification consent, recipient, quiet hours, timing, cancellation or permission. Revalidation may race a later edit/stop; delivery in-flight/acceptance policy is 17J's concern.

## 10. Approved edit/stop cases and derivation algorithm

| Case | Required source result |
| --- | --- |
| ACTIVE zero schedules | Zero sources |
| Same child + same localDate | Same key across repeated queries |
| Same child + next localDate | Different key |
| Text-only edit | Same source identity; new aggregate version; old continuation conflicts; known source may remain CURRENT |
| Identical/reordered schedule replacement | Unchanged child/key identity; version advances; old continuation conflicts; structural revalidation remains CURRENT |
| Remove 08:00 | Old child generates no fresh future sources; known old key STALE; no historical row rewrite |
| Remove then later add 08:00 | New child/key family; old source STALE |
| At 07:00 edit 08:00 → 09:00 | Today 09:00 may qualify if window includes it and > asOf; old 08:00 absent |
| At 10:00 edit 08:00 → 11:00 | Today 11:00 may qualify; no old 08:00 reconstruction |
| At 10:00 edit 08:00 → 09:00 | Today 09:00 elapsed and excluded; next eligible date only if in requested window |
| Edit exactly at due instant | Strict equality excluded on a new query; no grace/backfill |
| ACTIVE → STOPPED | Fresh discovery empty; continuation conflicts; known source STALE; exact saved schedules read-only |
| Retrack | New parent begins with zero schedules; no old schedule/source inheritance |

First-page algorithm: initial gate → bounded strict input → freeze server asOf → Serializable SELF/owner/status/version/child snapshot → missing/foreign NotFound → STOPPED/zero empty → enumerate bounded local dates → validate/convert candidates → filter [from,to) AND strict future → canonical key/collision guard → deterministic sort → first 101/return 100 + cursor/metadata → transaction success → no writes/audit. Continuation applies section 8 checks before empty handling. Schedules are read once; DB retrieval may use multiple bounded relation statements in the same snapshot, never per-occurrence SQL.

No past/today elapsed rebuilding or source materialization. Deleted children have no reconstructible authoritative occurrence history. STOPPED preserves its final schedule set, not every prior revision, and means stopped tracking in DEMI, not clinical discontinuation or notification cancellation. Already accepted future 17J delivery is outside this contract.

## 11. Safe error, privacy, audit and cache contract

Use incumbent [ApplicationError subclasses](../../src/shared/errors/application-error.ts) and default safe messages. No new error vocabulary or error payload carrying input data.

| Outcome | Mapping |
| --- | --- |
| Missing/noneligible actor, persisted role/binding/profile/account failure | ForbiddenError as current medication services; no resource disclosure |
| Malformed medicationId/from/to/range, over-window, unknown fields, invalid/oversized/noncanonical cursor, unsupported versions/tag | ValidationError; this new query object validates malformed ID, while valid foreign/missing IDs retain NotFound |
| Valid foreign/nonexistent parent, including revalidation | NotFoundError, identical message |
| Valid continuation scope/version/ACTIVE/anchor no longer current | ConflictError; restart cursorless, no auto-rebase |
| STOPPED first page | Successful empty page, not Conflict |
| Ordinary owned source removal/stop/mismatched canonical payload | STALE revalidation result; no existence fallback |
| Invalid server clock, key collision, DB/persisted-time/zone/conversion/env failure | Sanitized InfrastructureError; no partial success |
| Known abort retry exhaustion | ConflictError following medication mutation convention; unexpected DB/network error is InfrastructureError; no extra custom retries |

ApplicationError passes through; unknown causes map to a fixed source-read infrastructure message without underlying SQL, stack, private content or DTO. Missing actor remains Forbidden at this service boundary, consistently with the incumbent SELF resolver; any later public transport has its own authentication boundary, which is not added here.

Timing itself is sensitive. Do not log medication name/instruction, source lists/DTO dumps, local-time arrays, cursor payloads, Patient identifiers/name/National ID/HN/contact/address/Hospital/OSM/caregiver data or raw DB inputs/errors. SourceKey only where operationally necessary, never public metadata or a generic log label. No medicationName/instructionText/PII/recipient/channel/consent/delivery state by default. Final notification content disclosure and lock-screen/LINE/push text remain 17J privacy/channel decisions.

**No AuditEvent** for derivation, pagination, revalidation or ordinary read; no parent.updatedAt write or audit per occurrence. No shared/static/cross-user authorization/result/status/revalidation cache, use cache or unstable_cache; no browser persistence/UI or second source of truth. Reusing DB connection/config objects and a locale formatter is permitted, but neither stores protected query results or actor authority.

## 12. Explicit non-goals, persistence and ADR assessment

**NO Prisma model/schema change, NO migration, NO persisted occurrence/key/status, NO historical ledger.** Stable existing child IDs provide deterministic identity; current-state queries and revalidation require no durable source rows. Adding persistence would contradict OD02/OD14 unless an approved later behavior requires historical proof.

No adherence: TAKEN/SKIPPED/MISSED/DELAYED, intake times, Patient/caregiver/staff confirmation, corrections/superseding facts, history, percentages/compliance/scoring, alerts/escalation. Occurrence/silence/delivered/opened never implies intake; delivery failure never implies missed medication. OD09–OD11 stay deferred for future adherence only.

No delivery infrastructure: cron/worker/scheduled task/polling daemon/job/queue/outbox/event bus/source registry, LINE/push/email/SMS, recipient/device/provider payload, consent/preference/opt-in/quiet hours, delivery retries/attempts/status or duplicate-delivery suppression. SourceKey only supplies a stable future input, never exactly-once delivery. No global scans/service principal/new authority, clinical MED-02, Goal Plan integration, sharing/export, new recurrence/timezone setting or notification-system access.

**NO new ADR required or created.** Additive derived read model within MedicationSchedule, unchanged exact SELF, no persistence/notification/scheduler/authorization architecture change. Domain-specific cursor integrity follows existing server binding patterns and adds no cross-domain registry. If later work requires generic events/shared scheduler/system principal/cross-domain source abstraction, stop and reassess scope/ADR before widening the slice.

## 13. 17G.3C implementation file plan

These are planned paths, not files created by this documentation task. Keep the existing medication module; no empty layers or generic helpers.

| Planned path | Responsibility |
| --- | --- |
| src/modules/medications/domain/medication-reminder-occurrence.ts | Server-only focused definitions/constants/DTO types; canonical date/instant/key, tuple guard, bounded derivation/order; reuse incumbent HH:mm adapter/constants |
| src/modules/medications/schemas/medication-reminder-occurrence-schemas.ts | Strict query/known-source/cursor payload schemas; shared canonical validators and input bounds |
| src/modules/medications/services/medication-reminder-occurrence-cursor.ts | Server-only canonical cursor encoding/integrity/strict decoding using existing env; no data/authority cache |
| src/modules/medications/services/medication-reminder-occurrence-query-service.ts | Both list and revalidation exports, minimal select, SELF/Serializable snapshot, errors/paging |
| Matching .test.ts beside the four files above | Focused helper/schema/codec/service behavior tests; no production test-only hash/dependency bypass |
| tests/integration/personal-medication.integration.test.ts | Extend incumbent real PostgreSQL fixtures/lifecycle/authority/snapshot/concurrency tests |
| docs/phases/PHASE_17G3_REMINDER_OCCURRENCE_SOURCE_IMPLEMENTATION_HANDOFF.md | Actual implementation and executed evidence, criteria coverage, remaining gates |
| docs/CONTEXT.md; docs/phases/PHASE_17_UAT_BACKLOG.md; this contract | Minimal current implementation-status addenda in 17G.3C; preserve historical contract/evidence |

Avoid circular imports: focused domain primitives/types have no schema/service imports; schemas depend on those primitives; services depend on domain/schemas/incumbent resolver/helper/errors/env. node:crypto/key/codec services are server-only and never imported by client definitions/workspace. Existing auth/audit/shared transaction/env implementations remain unchanged; do not add package/config/transport/UI or top-level notification module.

## 14. Focused unit, PostgreSQL and revalidation test contract

All coverage below is **required future evidence**, not tests run in 17G.3B. Unit mocks alone cannot establish persisted authorization or concurrency.

| Test family | Required cases |
| --- | --- |
| Key | Same child/date stable; different date/child differs; remove/re-add differs; exact prefix/digest/canonical base64url/version; independent of process TZ/text/version/clock; collision injection fails closed without merging/partial result |
| Date/time | Table in section 6 in UTC/Bangkok/Los_Angeles processes; Gregorian leap/invalid/month/year rollover; 23:59→next 00:00; supported range edges; no local/browser getters; zone unavailable/mismatch fails closed; invalid persisted TIME seconds/fractions safely fail |
| Window/bounds | Inclusive from, exclusive to; > asOf, equality excluded, elapsed excluded; from before asOf preserves bound; empty past interval; exactly seven days accepted, seven days +1ms rejected, nonpositive invalid; eight-date/1,440-row ceiling; no silent truncation |
| Schema/privacy | Unknown owner/evaluationAsOf/pageSize fields rejected; strict UTC canonical grammar/round trip; raw maxima checked before parsing; no name/instruction/PII/child ID/default owner in DTO or cursor; safe messages/no private dumps |
| Cursor integrity | Deterministic encode/decode; nine exact fields/order; max bytes/length; bad alphabet/padding/trailing bits/UTF-8/duplicate or unknown keys/version/timestamps/key reject; modified asOf/window/version/anchor/tag rejects; different actor binding rejects; secret rotation rejects cursor but leaves sourceKey stable |
| Paging | Fixed 100; 99/100/101 boundaries/lookahead; consistent dueAt/key ordering and seek; no skip/duplicate across all stable pages; frozen asOf even when now advances; dependency clock called once first page and not again on continuation/retry; fresh query excludes newly elapsed source |
| Freshness | Text edit/identical replacement preserves keys but conflicts old cursor; replace/stop conflicts; scope mismatch/anchor absence conflicts; STOPPED first page empty, continuation conflict; first-page coherent old/new snapshot; no silent rebasing |
| Authorization | Null/mismatched/inactive/stale persisted User/role/Person/profile fail closed; own SELF allowed; other Patient safe NotFound; OSM/assigned OSM/Hospital MEMBER/OWNER/ADMIN/Family/appointment caregiver denied; multi-role own only; key/cursor never bypass resolver |
| Lifecycle | All cases in section 10; zero/ACTIVE/STOPPED; additions/removal/clear/retrack; same child retained, new child re-added; no today elapsed/backfill/grace/missed |
| Read side effects | No audit call/write/version update, including empty/stale/error/continuation; only minimal parent/child select/no text; sanitized DB/key/clock/zone/env errors; shared bounded aborted-transaction retry only |

**Revalidation tests:** ACTIVE unchanged → CURRENT; text edit and identical replacement → CURRENT with new version; removal/time replacement/remove-and-readd/STOPPED → STALE; foreign/missing cannot distinguish existence; malformed key/schema/version → Validation; syntactically canonical changed localTime/dueAt → STALE; changed localDate with old key → STALE; eligible actor changes → Forbidden; known source at/after dueAt can remain structurally CURRENT. Unknown key/date cannot return any alternative elapsed key/DTO/list. Returned CURRENT is not a delivery permission. Assert no audit/version change in every path.

**Real PostgreSQL extension required:** create persisted actors and existing medication/schedule fixtures through incumbent services. Verify real ordered due/key results and zero/STOPPED behavior, unchanged IDs on text/no-op replacement, removed/re-added key families, aggregate version conflicts and role/grant matrix. Assert AuditEvent count and parent.updatedAt unchanged across list/paging/revalidation; inspect explicit selects in focused service tests to establish no medication text loads where DB result shape alone cannot prove it.

Use deterministic latches/transaction proxies following incumbent snapshot tests, not timing-only sleeps: edit or stop commits between pages → continuation Conflict; old coherent first-page snapshot concurrent with mutation is acceptable; post-commit fresh page observes new state; stop/removal revalidation stale. Observe both relevant commit/read orders; serialization abort/retry must not blend child rows/status/version. Test source snapshot with real Prisma relation reads and account/role eligibility changes.

Run conversion/key/window unit cases in three separate TZ processes; run targeted source PostgreSQL cases under different process TZ and DB session UTC/Asia/Bangkok, using an injected transaction wrapper/set_config where appropriate. Source semantics must be unchanged. Reuse verified local disposable setup/cleanup; no new reset/schema-reset trick or weakening of STOPPED guards. Privileged raw-write tests do not imply application authority or aggregate version maintenance.

## 15. Numbered implementation acceptance checklist

1. No Prisma schema/model modification.
2. No new migration or occurrence persistence/key/status column.
3. No historical occurrence ledger/backfill/materialization.
4. No adherence vocabulary, facts, persistence, confirmations or scoring.
5. No delivery job/cron/queue/outbox/provider/channel/recipient infrastructure.
6. Server-only read service; no route, Server Action, UI/browser projection.
7. Exactly one PersonalMedication per list operation; no global/all-medication scan.
8. Persisted ACTIVE User/PATIENT/exact User→Person→PatientProfile SELF every operation/page.
9. Owner derived on server; client owner/actor fields rejected.
10. All OSM/assigned OSM/Hospital MEMBER/OWNER/routine ADMIN/Family/caregiver/grant authority denied.
11. Eligible multi-role Patient own SELF only.
12. Valid foreign/missing parent returns identical safe NotFound in list/revalidation.
13. ACTIVE schedules derive current sources only.
14. Own STOPPED first page returns empty, retained schedules untouched.
15. ACTIVE zero schedules returns empty.
16. Strict actual Gregorian Bangkok date/HH:mm, no locale/browser/Patient timezone.
17. Canonical source preimage/UTF-8/NUL/hash/base64url/prefix precisely follows section 5.
18. Same child/date has stable sourceKey.
19. Different date or child has different expected key; collisions fail closed.
20. Remove/re-add same HH:mm uses new child/key family.
21. Text edit does not alter source identity.
22. Identical desired-set replacement does not alter retained source identity.
23. sourceKey excludes aggregate version/medication text/query clock/delivery/adherence.
24. Canonical dueAt is UTC boundary representation, never persisted recurrence.
25. Fixed +07 arithmetic verifies explicit IANA Asia/Bangkok round trip and fails closed on mismatch.
26. Midnight/08:00/23:59/date rollover map exactly as section 6.
27. from/to strict canonical UTC subset, no timezone-less/offset/normalized invalid date acceptance.
28. Window is [from,to), to strictly greater than from.
29. dueAt > evaluationAsOf; exact equality excluded on first page.
30. No newly discovered elapsed/catch-up/grace/late/missed source.
31. First-page evaluationAsOf captured once on server, never accepted from input.
32. Retry and continuation preserve original evaluationAsOf.
33. Genuine continuation may include a source that elapsed while paging, without a new discovery query.
34. Exact seven-day duration bound and at most eight local dates enforced.
35. Schedules ≤1,440; candidate work/allocation ≤11,520 per operation/page; revalidation ≤1,440.
36. Fixed 100-item pages and 101 lookahead; no caller override or silent truncation.
37. Numeric dueAt then ASCII sourceKey ordering/seek deterministic.
38. Opaque canonical cursor ≤1,024 characters/512 payload bytes, exact version/shape.
39. Cursor integrity protects server asOf using incumbent domain-separated HMAC binding.
40. Cursor is not authority; fresh persisted SELF/resource lookup cannot be bypassed.
41. No owner/Patient PII/medication text/child UUID serialized in cursor.
42. Parent aggregate updatedAt binds continuation; no extra version column.
43. Changed version/STOPPED/valid scope or anchor mismatch conflicts, no silent rebase.
44. First-page authorization/parent/status/version/children share one Serializable snapshot.
45. Separate pages use fresh equal-version snapshots, not a long-lived cross-request DB transaction.
46. No N+1/query per occurrence or preload of every medication.
47. Minimal select/DTO omits medicationName/instructionText and unrelated lifecycle/owner data.
48. No Patient name/National ID/HN/contact/Hospital/OSM/caregiver/recipient information.
49. sourceKey is not bearer, delivery ID, historical proof or exactly-once guarantee.
50. Focused known-source revalidation implemented with exact CURRENT/STALE result.
51. Revalidation recomputes one date/current child identities and compares canonical time/instant.
52. Revalidation can validate known elapsed source structurally without listing/discovering elapsed sources.
53. STOP/removal/replacement/remove-readd makes old known key STALE.
54. Text/no-op version change alone does not make retained known source structurally STALE.
55. Foreign revalidation cannot probe existence or obtain alternative source data.
56. Structural CURRENT neither proves prior issuance nor grants delivery permission.
57. Derivation/paging emit no AuditEvent or version writes.
58. Revalidation emits no AuditEvent or version writes.
59. No shared/static/cross-user authority/result/status caches or browser persistence.
60. Safe error mapping, raw bounds, canonical decode and sensitive logging review complete.
61. Focused key/date/time/window/schema/collision tests pass.
62. Cursor forgery/duplicate-key/noncanonical encoding/actor-binding tests pass.
63. Stable pagination/asOf/boundary/no-skip/version-conflict tests pass.
64. Real PostgreSQL persisted authorization/lifecycle/snapshot/concurrency/revalidation evidence passes.
65. Three process TZs and DB session timezone independence evidenced honestly.
66. All edit/STOPPED/retrack examples in section 10 covered.
67. Focused/static checks precede one final unit and integration confirmation; no redundant broad loops.
68. Actual handoff distinguishes passed/failed/not-run checks and resource/pre-existing failures.
69. No inherited/false browser/device/UAT/deployment/runtime PASS claim.
70. Owner-confirmed 17G.2 migration evidence stays external; no environment/agent command invented.
71. Adherence remains explicitly deferred; OD09–OD11 not silently closed.
72. 17J remains delivery owner and system-processing/content/authority requirement-gated.
73. MED-02, independent Goal Plan and existing role/grant boundaries unchanged.
74. No new ADR under this additive read contract; widened architecture stops for reassessment.
75. Implementation handoff path/status/evidence recorded as section 13 specifies.

## 16. Staged 17G.3C verification plan — NOT executed in 17G.3B

A. Reread AGENTS/current source/this contract; confirm scripts/runtime and unchanged approved decisions.

B. Implement focused domain primitives and strict schemas; run `npm run test -- src/modules/medications/domain/medication-reminder-occurrence.test.ts src/modules/medications/schemas/medication-reminder-occurrence-schemas.test.ts`.

C. Implement focused cursor codec/service/revalidation; run explicit-path codec/service tests, then the affected medication subset. Verify clock/HMAC tampering/no audit/minimal select before DB work.

D. Extend real PostgreSQL medication tests. Inspect existing runner and validate disposable local, nonproduction environment without printing credentials: DATABASE_URL = DIRECT_URL = DEMI_TEST_DATABASE_URL. Use targeted `npx vitest run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` with that verified environment loaded. Current `npm run test:integration -- <path>` does **not** forward paths and is not targeted. Prepare incumbent client/migration history once only if necessary; no new migration/schema/generate work solely because source files changed.

E. Run specified timezone cases in separate processes and targeted PostgreSQL session/process coverage. Correct isolated failures with focused reruns; never mutate parallel process TZ or reset shared/real databases.

F. `npm run lint`, then `npm run typecheck`. No architecture:check/lint:strict script currently exists; inspect medication dependency direction/server-only boundaries directly. Recheck only invalidated checks after changes.

G. Review stable complete diff, authorization/cursor-clock integrity/snapshot/strict-future/revalidation/privacy/audit/cache/Thai encoding and `git diff --check` before broad confirmation.

H. **One final `npm run test`**, then **one final `npm run test:integration`**, justified by protected read/snapshot/pagination/security coverage. Integration wrapper itself runs existing client generation and migrate deploy for disposable setup; record that accurately, not as a new schema change/deployed migration. If broad run fails, isolate/group/reproduce and rerun affected checks; another broad run only once corrected diff is stable and new confidence is justified.

I. Production build **not automatically required** for this no-schema/no-route/no-UI slice. Run `npm run build` only if actual implementation touches a build/runtime integration boundary cheaper checks cannot verify or repository rules require it; otherwise record NOT RUN with reason. No dev server/browser/device evidence assumed. Report actual commands/counts/failures/not-run checks and implementation criteria coverage in the handoff.

## 17. Documentation validation and exact handoff status

Documentation/source/complete diff and contract consistency review performed. Local-link review covers 37 links in this contract and three added incoming links in CONTEXT/backlog (including the current MED-01 inventory). Strict UTF-8/no-BOM/mojibake and whitespace checks pass for all three changed documentation files; acceptance numbering verified 1..75. Removing only the new status addenda and reverting the single current MED-01 inventory reference matches HEAD's historical text; existing file line endings were retained. Tracked git diff --check passes; the new file's no-index --check emits no whitespace errors (exit 1 denotes its new-file difference). Final inventory/status contains only these three documentation files.

Runtime checks deliberately NOT RUN: Prisma validate/generate/migrations, unit/integration tests, lint/typecheck/build/dev server. Node version inspection, document-only validation scripts and official API reading are not runtime feature verification. No commit/push or deployed operation was performed.

No source contradiction requiring persistence/new authority/delivery infrastructure was found. Cursor clock integrity is closed by the incumbent signed-binding pattern; revalidation's lack of historical issuance proof is documented rather than invented. No unresolved product/privacy decision remains for this approved source-only slice. Engineering behavior is fixed in sections 3–11; implementation must stop/report if actual source at 17G.3C start contradicts it.

**Phase 17G.3B — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** 17G.3A DECISIONS CLOSED / OWNER APPROVED; 17G.3 runtime NOT IMPLEMENTED. 17G.1/17G.2 IMPLEMENTED / CLOSED; Q30–Q53 unchanged. **Adherence remains deferred and is not part of the cleared runtime slice.** 17J future / requirement-gated; P17D-NOTIF-01 OPEN; NOTIF-01 REQUIREMENT-GATED; MED-02 REQUIREMENT-GATED; P17F-L04/Q5 unchanged. No reminder sending/production availability is claimed.

Next: **Phase 17G.3C — Reminder Occurrence Source Implementation**, only this contract. After approved 17G runtime slices: **17G.4A — Automated security / DB / privacy re-audit**. Future adherence receives its own explicit decisions/contract/slice; 17J owns delivery and separately approved processing authority. No commit/push in this task.
