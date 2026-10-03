# Phase 17G.2A — Personal Medication Daily Schedule Implementation Contract

**CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** Contract/design closeout only. No runtime, schema, migration, UI, route, service or test implementation is delivered by this task.

## 1. Authority, baseline and inspected source

Repository: `bait0ngxaxa/demi`. Starting HEAD: `49156c1321f47fc669416eb4ddd39ee512303dd6` — `test(phase-17g1): tighten plan assertion and closeout evidence`; matches the owner's observed remote-main commit. Local starting tree was clean. This records the local baseline, not an independently fetched remote-head verification. Date: 2026-10-03.

[AGENTS.md](../../AGENTS.md) was read first. Current repository source is technical truth; legacy implementation is not architecture authority. Governing evidence:

- [Project context](../CONTEXT.md), [17G.0B owner closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md), [17G.1 contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md), [17G.1 implementation handoff](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_HANDOFF.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md).
- [Prisma schema](../../prisma/schema.prisma) and published [PersonalMedication migration](../../prisma/migrations/20261002120000_personal_medication_foundation/migration.sql). The later unrelated Family migration remains part of current migration history.
- Current [medication module](../../src/modules/medications/): domain definitions, strict schemas and tests, SELF policy and tests, persisted owner resolver, query/mutation services and tests, action state and Server Actions and tests.
- Current [Personal medication workspace](../../app/app/personal/medications/): page, loading, workspace, controls and page/workspace tests; [real PostgreSQL medication integration tests](../../tests/integration/personal-medication.integration.test.ts).
- [Shared Serializable transaction helper](../../src/lib/db/serializable-transaction.ts), [audit service](../../src/modules/audit/services/audit-service.ts), [audit schema](../../src/modules/audit/schemas/audit-schemas.ts), [package scripts](../../package.json), [integration runner](../../scripts/integration.mjs), [Product](../../PRODUCT.md) and [Design](../../DESIGN.md).

Current source facts: PersonalMedication is exact PatientProfile-owned; ACTIVE/STOPPED; all STOPPED UPDATEs prohibited by the existing trigger. Mutation services use guarded owner/status/updatedAt writes and `max(now, previous + 1ms)` version advancement. Audit shares the transaction. The shared helper uses Serializable with two retries after the first attempt for P2002/P2034, immediately, without backoff/jitter. Do not claim a different retry policy exists or redesign the shared helper in this slice.

Lists are separate bounded 50-item ACTIVE/STOPPED cursor pages. Detail is selected by `?item=<uuid>#medication-detail` inside the existing route; no separate detail route. Current DTO contains only medication fields and serialized lifecycle instants. Current page is request-time, uses an opaque actor-specific presentation key, and has no shared Patient-result cache.

Storage search found PatientProfile.dateOfBirth as `@db.Date`, lifecycle/appointment instants as `@db.Timestamptz(3)`, and Asia/Bangkok presentation conventions. No `@db.Time` schedule storage convention exists. Date-of-birth/date-only handling is not authority to turn daily times into instants. Native type/locking behavior was checked against official [Prisma ORM v6 PostgreSQL mappings](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql), [PostgreSQL 17 date/time types](https://www.postgresql.org/docs/17/datatype-datetime.html) and [row locking](https://www.postgresql.org/docs/17/explicit-locking.html); integration infrastructure uses PostgreSQL 17. The design below is a repository-specific choice, not a claim that documentation supplies product approval.

## 2. Exact scope and approved semantics

Patient SELF → Personal → **ยาของฉัน** → own ACTIVE PersonalMedication → manage zero or more DAILY local clock times → view times in ACTIVE detail → preserve read-only times in STOPPED detail/history.

Each MedicationSchedule is one daily local clock time in **Asia/Bangkok**, such as `08:00`, `13:30`, `20:00`. DAILY and Asia/Bangkok are implicit bounded domain semantics, not configurable columns or client authority. A clock time is not a UTC timestamp, dose, prescription, reminder guarantee or evidence of medication intake.

Q30–Q53 remain **CLOSED / OWNER APPROVED**, without reopening: MED-01 is Patient-maintained, non-clinical personal tracking; SELF reads/writes only; ACTIVE/terminal STOPPED; no routine hard-delete; immutable STOPPED history; medication-name duplicates still allowed; Medication and Goal Plan independent. Q36 approves future 0..N daily times; Q37 bounds Asia/Bangkok semantics; Q44 defers adherence to 17G.3; Q45 separates 17G source from 17J delivery; Q51 approves PersonalMedication 1→N MedicationSchedule. These decisions do not grant MED-02 or delegated authority.

### Newly resolved owner decisions — distinct from technical choices

The owner explicitly approved both recommended options through the interactive questions in this contract task. These are product input semantics, **not** inferred technical invariants or reinterpretations of Q30–Q53.

| ID | Decision requiring owner authority | Bounded recommendation and approved outcome | Status |
| --- | --- | --- | --- |
| G2-OD01 | Precision of Patient-entered clock times | Minute-only `HH:mm`; reject seconds and fractions, including `08:00:00`; no rounding | CLOSED / OWNER APPROVED in this session |
| G2-OD02 | Multiple rows with identical time for one medication | One occurrence of each clock time per medication; reject duplicates, without silent deduplication | CLOSED / OWNER APPROVED in this session |

The first owner answer was “อนุมัติระดับนาทีเท่านั้น (แนะนำ)”; the second was “อนุมัติห้ามเวลาซ้ำ (แนะนำ)”. No newly discovered owner decision remains OPEN. Uniqueness is now an approved product rule backed by a DB invariant, not merely a mathematical-set argument. Different medications may share times; duplicate medication names remain valid. Lifecycle/history behavior below follows the already-approved terminal immutable parent history and does not introduce intake or retention policy.

## 3. Persistence contract

Proposed Prisma shape **for later implementation only**:

```prisma
model MedicationSchedule {
  id                   String   @id @default(uuid()) @db.Uuid
  personalMedicationId String   @db.Uuid
  localTime            DateTime @db.Time(6)
  createdAt            DateTime @default(now()) @db.Timestamptz(3)

  personalMedication PersonalMedication @relation(fields: [personalMedicationId], references: [id], onDelete: Restrict, onUpdate: Restrict)

  @@unique([personalMedicationId, localTime], map: "MedicationSchedule_medication_time_key")
}
```

Add only the reverse `schedules MedicationSchedule[]` relation on PersonalMedication. No new PatientProfile/User ownership field; owner is exclusively derived through the parent. No status, timezone, recurrence enum, enabled flag, next occurrence, reminder flag, dose or row-level version column.

- PostgreSQL column: **TIME(6) WITHOUT TIME ZONE NOT NULL**. Prisma maps it as DateTime because of its client type system; the database persists only the clock component. Native microsecond capacity does **not** allow Patient seconds: a CHECK enforces minute-only stored values. Prefer this over TIME(0), which could round fractional seconds before a CHECK observes them.
- `MedicationSchedule_localTime_minute_check`: `localTime >= TIME '00:00:00' AND localTime < TIME '24:00:00' AND EXTRACT(SECOND FROM localTime) = 0`. PostgreSQL accepts 24:00 natively, so reject it explicitly. Constraints concern values representable at native precision; the application rejects all seconds/fraction syntax before any database conversion.
- `MedicationSchedule_pkey`: UUID PK. `MedicationSchedule_personalMedicationId_fkey`: required parent FK, ON DELETE RESTRICT / ON UPDATE RESTRICT. No cascade erasure of historical schedules. Existing parent identity protection remains authoritative.
- Unique B-tree `(personalMedicationId, localTime)` enforces G2-OD02, supports parent lookup and ascending clock ordering; no duplicate standalone FK index or timezone/global index.
- `createdAt` is a system insertion instant; row identity, parent, clock and createdAt are immutable. No child `updatedAt`: a time correction removes one row and adds another within the collection replacement; collection version is parent.updatedAt. Retain unchanged rows and their IDs/createdAt. IDs are internal in 17G.2; do not promise future occurrence/revision semantics.

### Clock conversion boundary

API/DTO uses strict ASCII `HH:mm`, never a Date or ISO instant. For Prisma's Date carrier only, construct `new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0))` from validated integer components, and extract UTC hour/minute on reads into zero-padded `HH:mm`. The date is a discarded adapter carrier, not persisted recurrence date or UTC recurrence authority. Never subtract seven hours, construct “today at 08:00”, parse locale-dependent dates, use browser timezone getters, or serialize the carrier via toISOString to the client. Confirm this round trip with the installed Prisma client on real PostgreSQL under differing process/session timezones before shipping. If it differs, fix the focused mapping; do not substitute timestamp recurrence.

## 4. Cardinality, validation and ordering

Zero rows is valid; a newly created medication has zero schedules. Medication creation and text editing retain their existing inputs; scheduling starts after an ACTIVE item exists.

Because approved precision is minutes and approved times are unique, the domain has exactly **1,440 possible times**, `00:00` through `23:59`. Bound input to 0..1,440 entries; this is the complete representable set and a technical abuse bound, not a customer-approved clinical maximum or a limit such as four doses/day. No smaller product cap. The DB time CHECK plus uniqueness naturally enforce this ceiling without a cross-row count trigger.

Mutation business input: required `times: string[]`. Metadata: medicationId UUID and expectedUpdatedAt ISO version, matching existing medication transport conventions. Strict object rejects all other fields, including child IDs, owner, timezone, frequency, dates, status, timestamps, dose and clinical fields. `times` omission/null is invalid; explicit `[]` clears all. Each string is exactly five ASCII characters and matches `^(?:[01][0-9]|2[0-3]):[0-5][0-9]$`. No trimming, coercion, rounding, locale-digit conversion or silent duplicate removal. Reject malformed values such as `8:00`, `24:00`, `12:60`, `08:00:00`, fractions, offsets, ISO dates, whitespace, nonstrings and files. Check raw bounds before parsing/normalization/mapping.

Server Action transport carries one `times` field containing a JSON array, plus medicationId and expectedUpdatedAt. Empty set is JSON `[]`; a missing field is an error. Retain unknown keys for strict rejection as current actions do; reject duplicate named fields, File values and extra application fields. Exclude only framework `$ACTION_` fields under the incumbent convention. Bound application field count to three, UUID string to 36 code units, ISO version to 40, raw times JSON to **12,000 UTF-16 code units** before JSON.parse, and aggregate application field names/values to **16 KiB UTF-8** before parse/service work. The complete canonical 1,440-time JSON fits these bounds. Existing framework request limits still apply; do not change global config or claim field checks replace infrastructure request protection. Direct service input also checks array length/type and each raw string before conversion. Technical limits belong to one medication-domain definitions source reused by schemas/UI/tests.

Store/query/present ascending local clock time. Reject duplicate input regardless of order; accept an unsorted unique array and sort canonically. Database time order and lexicographic canonical HH:mm order agree. No user-defined order, ordinal column or clinical priority.

## 5. Lifecycle and database enforcement

Only own ACTIVE parents permit collection replacement, including adding, correcting or removing a time and clearing to zero. No standalone schedule reparenting, row-edit endpoint or hard-delete-parent action.

Stopping a medication uses the existing explicit stop action, token, audit and terminal parent trigger. It preserves **all committed schedule rows exactly as they stand**, including IDs/times/createdAt, without child rewrites or a copied snapshot table. Once STOPPED, retained rows are immutable and readable through the same SELF detail query. The last set at stop is the historical representation; not a history of every previous schedule edit, proof of intake, or claim that these were clinician-directed times. Zero rows at stop remains zero. Tracking again creates a new medication with zero schedules; no implicit copy. No reminder/adherence events or automatic notifications on stop.

Required new DB guard: `medication_schedule_guard_write` function, `MedicationSchedule_guard_write_trigger`, BEFORE INSERT OR UPDATE OR DELETE, FOR EACH ROW:

1. Reject **every UPDATE**, even no-op and ACTIVE updates. Correcting a clock is delete/add via collection replacement; this also prevents moving a row from a STOPPED parent to an ACTIVE parent or changing history IDs/timestamps.
2. For INSERT use NEW.personalMedicationId; for DELETE use OLD.personalMedicationId. Select only parent id/status with **FOR UPDATE**, require existing ACTIVE parent, otherwise fail with a content-free constraint error. Return NEW for valid insert, OLD for valid delete.
3. Hold the parent lock until transaction end. A plain status SELECT or FOR KEY SHARE is insufficient: stop changes a non-key field and must conflict with the schedule guard lock. The guard must check status after obtaining the lock; Serializable stale snapshots may instead abort, never authorize a post-stop mutation.

This adds child protection alongside the unchanged 17G.1 parent trigger. It blocks ordinary ORM/raw SQL INSERT/UPDATE/DELETE against STOPPED schedules, independent of UI. No trigger-generated audit or recursive parent version writes; successful application mutations use the service contract below. Direct administrative SQL is not an authorized application mutation API and does not provide its optimistic token/audit guarantees. DB guards enforce structural/lifecycle safety, not Patient authorization.

Do not grant application roles TRUNCATE, trigger disabling or DDL privileges on the table. Those are privileged bypasses, not ordinary row writes. Test isolation may use a tightly scoped disposable-test teardown to clear STOPPED children; never weaken production guards for cleanup. FK RESTRICT means parents with schedules cannot be deleted normally. Governance/legal deletion remains a separate privileged reviewed operation; no new Patient purge, retention duration or routine ADMIN medication access is approved.

## 6. Mutation, version, transaction and race contract

Choose **one replace-all collection mutation**: `replacePersonalMedicationSchedules(actor, { medicationId, expectedUpdatedAt, times }, dependencies)` in the existing medication service boundary; one focused Server Action within the same module. No public REST route or generic collection/versioning framework.

“Replace-all” defines desired final contents, not destructive delete/recreate of unchanged rows. Inside one existing `runSerializableTransaction` operation:

1. Apply bounded boundary checks, authenticated actor gate and strict validation; resolve current persisted SELF inside the transaction using the existing resolver.
2. Fetch by medicationId + derived patientProfileId. Foreign/missing share NotFoundError; do not inspect/disclose foreign status or version. Own STOPPED/stale token is ConflictError, without mutation/audit.
3. Compare expectedUpdatedAt to persisted parent.updatedAt. Guard parent updateMany by id + owner + ACTIVE + persisted expected timestamp; advance only updatedAt to `max(authoritative now, previous + 1ms)`; require count = 1. Parent write precedes child writes and holds the conflicting row lock. Text/status/stoppedAt/createdAt do not change.
4. Read current child set; retain identical times, delete removed rows, create added rows in ascending order, sequentially with the transaction client. Do not parallelize dependent writes. FK/unique/CHECK/guard failures roll back everything.
5. Record exactly one `personal_medication.schedule_updated` AuditEvent using that same transaction client. Return the bounded detail DTO from that transaction; publish success only after commit. Revalidate the incumbent workspace path after commit.

Use **parent PersonalMedication.updatedAt** as the single aggregate version. Schedule change intentionally invalidates old text-edit and stop tokens; those operations already invalidate old schedule tokens. No child/collection version field. An accepted identical replacement (including empty→empty or reordered same set) advances the parent version and emits one audit, consistently with accepted 17G.1 no-op edits; unchanged child rows survive. Replay of an old successful request conflicts with no extra audit. This is optimistic state replacement, not an idempotency-key API. Never automatically resend after an ambiguous network result; refresh first. Internal retries rerun only confirmed aborted transactions with the original expected token through the existing bounded helper; do not silently upgrade the token or merge another edit. Exhaustion yields a safe conflict; unexpected infrastructure failure is sanitized.

Rejected alternative: individual add/remove endpoints would need several mobile submissions, token handoffs, partial-success reconciliation and more audits for one editing session. Collection replacement provides one complete desired state, one atomic version claim and one audit. Preserving unchanged child rows avoids needless identity churn for future additive 17G.3 work without prebuilding occurrences or revisions.

| Race using the same original parent token | Required outcome |
| --- | --- |
| Replacement vs replacement | Exactly one committed winner; loser conflicts after bounded rollback retry; no last-writer-wins overwrite or union of both sets |
| Replacement vs text edit | Exactly one winner; stale other draft requires explicit reload/review |
| Replacement (including clear/remove) vs stop | Exactly one winner. If stop wins, original set becomes immutable history. If replacement wins, stop's old token conflicts and parent remains ACTIVE until a refreshed explicit stop preserves the new set |
| Subsequent stop after refreshed replacement | STOPPED parent retains precisely the replacement's committed set |
| Ordinary raw child insert/delete vs direct parent stop | Parent row lock serializes both: child change may commit before stop and be preserved, or stop commits first and child write fails; never a child change after STOPPED. Exercise ReadCommitted as well as Serializable |

No network calls, notification work or adherence work inside transactions. DB raw child operations may cause lock-order deadlocks with other direct writers; a deadlock aborts, never partially commits. Supported application writes always claim parent before children, and stay short. No generic lock infrastructure or changes to existing stop business semantics.

## 7. Authorization, query/DTO and cache contract

Reuse exact [17G.1 owner resolver](../../src/modules/medications/services/personal-medication-access-service.ts): authenticated actor with PATIENT role → persisted exact User ACTIVE with current PATIENT role bound to exact Person → exact existing PatientProfile → parent.patientProfileId. No implicit profile creation, Hospital prerequisite, client owner or work/delegated fallback. All page/detail/mutation/action boundaries reauthorize; mutations recheck current eligibility in transaction.

| Actor | Schedule read/replace |
| --- | --- |
| Eligible Patient SELF, own item | Read ACTIVE/STOPPED; replace ACTIVE with matching token |
| Another Patient | DENY; same safe foreign/missing response |
| OSM or assigned OSM | DENY |
| Hospital MEMBER or OWNER | DENY |
| Routine Platform ADMIN | DENY |
| Family caregiver or caregiver appointment grant | DENY |
| Independently eligible PATIENT + OSM/HOSPITAL/ADMIN/caregiver | Own SELF only; no other Patient access |

Child ID never grants authority. No independent child lookup accepting owner information; query children only under authorized parent. Family grants convey zero medication access, including history. No work-profile, Hospital, assigned-patient, Family-preview or caregiver DTO gains schedule data.

**Detail-only schedules.** Preserve `PersonalMedicationDto` and list pages for list/create/text-edit/stop responses. Introduce a focused detail type extending base fields with required `schedules: { localTime: string }[]`; empty is `[]`, never null/missing. Detail and schedule replacement return that detail type. No child IDs, child timestamps, ownership/PII or one-value timezone/frequency fields in the DTO. Both ACTIVE and STOPPED detail use the same sorted projection, parent version and existing lifecycle timestamps.

Detail must return parent version/status and children from a **consistent transaction snapshot**. Use the existing Serializable helper with current owner resolution, scoped parent and nested ordered child select inside the transaction; this remains coherent if Prisma executes relation retrieval as separate SQL statements. Do not rely on undocumented join/preview options or two uncoordinated ReadCommitted queries. No ordinary read audit or version change. Fetch schedules only for selected detail; no N+1 across lists. At most 1,440 detail times; no child pagination or invisible truncation. Parent cursor size/order/indexes remain unchanged (ACTIVE createdAt DESC/id DESC; STOPPED stoppedAt DESC/id DESC; 50 + lookahead), independent of schedule edits.

No shared/static/cross-user result or authorization caches, `use cache`, `unstable_cache`, shared client draft store or localStorage schedule persistence. Retain request-time connection/actor resolution and actor-specific presentation remount. After any successful parent mutation or explicit conflict reload, acquire fresh detail and replace the version-bound editor state; schedule, text and stop forms must not continue with stale captured tokens. Do not silently rebase a draft on a new token. Revalidation is UX invalidation, never authority.

## 8. Audit and privacy

Exact action: **`personal_medication.schedule_updated`**. Server actorUserId; resourceType `PersonalMedication`; resourceId parent UUID; metadata omitted (persisted null). One action for a successful replacement, regardless of additions/removals/no-op. Existing created/updated/stopped vocabulary stays unchanged; stopping emits no additional schedule audit because no schedule row changes.

Treat clock times as sensitive personal content. No medicationName, instructionText, time values, old/new arrays, child IDs, PatientProfile/Person IDs, name/contact/National ID/HN or Patient PII in metadata or diagnostic request dumps. No counters/diffs/request/DTO copying. Existing audit schema does not itself block keys such as medicationName or times: privacy must be enforced by the medication callsite and tests. Safe errors must not echo content or SQL/paths/stack traces.

Audit failure rolls back the parent version and every child write. Constraint/mutation failure leaves no success audit. Confirmed rolled-back retries leave exactly one committed audit. Ordinary detail/list/schedule reads generate **no AuditEvent**.

## 9. Mobile-first UI contract

Planning uses Impeccable in Operate mode and existing Product/Design truth. No new visual system or UI edits in this task. Keep `/app/personal/medications`, selected `?item=` detail, Personal navigation and existing PageHeader/Panel/Input/Button/Alert/StatusBadge primitives and tokens. No new top-level navigation, route or new-medication combined transaction.

- In selected ACTIVE detail, present a separate schedule section labeled **“เวลาที่ต้องการติดตามใน DEMI”**, helper **“เวลารายวันตามเวลา Asia/Bangkok ที่คุณบันทึกเอง”** and bounded context **“ส่วนนี้บันทึกเวลาเท่านั้น ยังไม่มีการแจ้งเตือน”**. Empty: **“ยังไม่ได้บันทึกเวลา”**. Avoid physician-directed or medication-advice labels, including “เวลาที่แพทย์สั่ง”.
- Use vertically stacked, individually labeled native minute time inputs (step 60) with “เพิ่มเวลา”, accessible per-row removal, and one “บันทึกเวลา” submit of the complete draft; native input constraints are UX only. Time editor does not infer meal/period labels or default suggested medication times. Add an empty local row; empty drafts are invalid until filled or removed. Removing all rows commits `[]` explicitly. No immediate save on adding/removing a draft row. Before save, changing/cancelling drafts has no server effect; cancel restores the loaded set.
- View persisted times ascending as canonical 24-hour `HH:mm`; draft entry order need not jump while typing. Do not apply browser timezone conversion. STOPPED detail shows the retained times with **“เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้”**, zero-state text and no editor/add/remove/save controls. Existing stop wording remains **“หยุดติดตามรายการนี้ใน DEMI”**; explain the saved times remain read-only history, not an instruction about intake.
- Reuse mobile stacked layout; 44px minimum targets, keyboard labels/help/error association, readable focus and text status; avoid horizontal overflow. Bound long sets with a contained vertical editor/display region without truncating or hiding saved values. Keep add/save/cancel reachable and errors associated with the offending row/collection; move focus sensibly after add/remove and to feedback after submit.
- Cover loading, empty, validation/duplicate errors with draft retention, pending/disabled submit, success, stale conflict with explicit reload, ambiguous outcome requiring refresh, inaccessible detail and STOPPED history. Block other selected-item mutation controls during a pending save in the same workspace; server concurrency remains authoritative. On success/refreshed detail, initialize all item forms from the new version; conflict/ambiguous-result drafts cannot be silently replayed. Account change clears all item drafts.
- No notification toggles, adherence controls, Hospital/OSM/caregiver controls, medication advice, reminder promise, export/share UI or clinical claim.

## 10. Forward-only migration and implementation boundary

Do not edit `20261002120000_personal_medication_foundation` or any published migration. Later implementation creates one new chronologically later `YYYYMMDDHHMMSS_daily_medication_schedules` directory after **all** migrations present at coding start (not only after the medication migration). No migration is generated now.

Ordering: create table/PK/time CHECK → parent FK + unique index → new child guard function/trigger → verify constraints/permissions. Existing parent enum, status CHECK, trigger and list indexes remain unchanged. Reverse Prisma relation is additive. No backfill: every existing ACTIVE/STOPPED medication initially has zero rows; never infer times from instruction text. Existing STOPPED parents must remain unmodified.

Before coding, reread current AGENTS/source and installed `node_modules/next/dist/docs/` guides for touched Server Action/cache/security behavior. Keep domain constants/schemas in current medication module; services own rules; transport handles bounded serialization; UI calls transport, never DB. Do not create empty layers, recurrence abstractions, generic versioning, new dependencies, flags/envs or grants. Likely impact: Prisma schema/new migration, existing medication definitions/schemas/services/transport and focused tests, incumbent Personal medication page/workspace/controls and tests, real PostgreSQL integration tests, implementation handoff/current-status documentation. Shared auth/audit/transaction modules remain reused without unrelated refactors.

Real PostgreSQL verification is mandatory: clean full migration history and forward upgrade from current history containing ACTIVE/STOPPED data; retained existing rows; actual time types/CHECK/FK/unique/trigger; ordinary raw writes and parent races. Test cleanup must respect STOPPED guards using an isolated disposable test mechanism. No migration deployment/production deletion authorization is inferred from this contract.

## 11. Explicit non-goals and future ownership

17G.2 does **not** implement:

- Reminder occurrence generation, push/email/LINE/SMS, notification preferences, opt-in, quiet hours, delivery retries/status, channel/recipient/consent integration or reminder delivery.
- Taken/missed medication, adherence, compliance scoring, escalation, clinician alerts or caregiver alerts.
- Dose/strength/unit, route, dosage form, prescription/provider approval, reconciliation, Hospital medication authority, OSM access, Family sharing, drug catalog or interactions/allergy checks.
- Goal Plan linkage, recurrence beyond DAILY local clock time, weekdays, every-N-hours, date-specific schedules, date ranges/start/end dates, PRN/as-needed, meal timing or morning/noon/evening/night authority, timezone settings, global/Patient timezone policy, multi-timezone semantics, schedule import/export/share.

**17G.3 remains the future reminder/adherence decision boundary**, including occurrence identity, edits versus already-materialized occurrences and any adherence semantics. No prediction of those rules or retroactive occurrence generation is approved now. **17J remains delivery owner. MED-02 remains REQUIREMENT-GATED.** Medication and Goal Plan remain independent. No Hospital/OSM/Family/routine ADMIN access or clinical authority is added.

## 12. Numbered implementation acceptance criteria

1. Current authenticated ACTIVE User with persisted PATIENT role and exact User↔Person↔PatientProfile binding only; missing/inconsistent/inactive/removed-role identity fails closed.
2. Every page/action/query/mutation derives owner server-side; mutation rechecks it inside transaction; reject client authority/unknown fields.
3. Patient A cannot read/replace Patient B schedules; foreign and missing return identical safe not-found.
4. Actual OSM and assigned OSM actors denied for reads/replacements.
5. Actual Hospital MEMBER and OWNER denied for reads/replacements.
6. Routine Platform ADMIN has no bypass.
7. Family relationship and appointment caregiver grant convey zero schedule authority, including STOPPED history.
8. Independently eligible multi-role Patient/Patient ADMIN/Patient caregiver gets own SELF only.
9. Newly created/existing migrated medications have zero schedules; ACTIVE zero-set replacement is valid.
10. Atomic replacement can add, correct, remove and clear times without changing medication text/lifecycle.
11. Unchanged times retain child IDs/createdAt; changed times remove/add immutable rows, without row UPDATE API.
12. Asia/Bangkok daily local semantics persist `08:00` unchanged across differing process/database/browser timezones; no stored recurrence date/UTC instant.
13. Strict canonical HH:mm including `00:00`/`23:59`; reject malformed hours/minutes, 24:00, whitespace, locale digits, dates, offsets, nonstrings and files.
14. Reject all seconds/fractions syntax, including zero seconds; do not round/coerce input.
15. Raw field/JSON/byte/array bounds apply before parse/mapping; exact full 1,440-value set accepted; excess rejected safely; no smaller clinical cap.
16. Missing/null times invalid; explicit [] clears; duplicate/extra form fields and authority fields rejected.
17. Same-parent identical times rejected without deduplication; different-parent identical times allowed; medication-name duplicates unchanged.
18. Unsorted unique input accepted; persisted/returned/displayed times deterministic ascending clock order.
19. Own STOPPED collection replacement denied with no version/child/audit change, including empty/no-op requests.
20. Stop preserves complete last committed child rows; retained ACTIVE/STOPPED detail remains SELF-readable; zero-at-stop stays zero.
21. STOPPED history shows immutable saved times, with no editor and no reactivation/automatic copy to retracked items.
22. Real PostgreSQL validates native TIME WITHOUT TIME ZONE mapping and minute/range CHECK, not only application mocks.
23. Real PostgreSQL rejects orphan FK, duplicate same-parent time and parent delete/update violating RESTRICT/identity rules.
24. Real PostgreSQL rejects ordinary INSERT/DELETE on STOPPED children and every child UPDATE, including no-op/reparent/timestamp edits.
25. Trigger obtains a conflicting parent lock before status authorization; raw insert/delete vs raw stop exercised at ReadCommitted and Serializable, with no post-stop write.
26. Schedule version uses parent expectedUpdatedAt and owner/ACTIVE/version predicate; accepted replacement advances at least 1ms even with identical contents/constant clock.
27. Stale/replayed tokens conflict without extra mutation/audit; no silent merge or token upgrade.
28. Real PostgreSQL concurrent replacements with same token have exactly one committed winner and no mixed set.
29. Real PostgreSQL schedule replacement vs parent text edit has exactly one winner for same token.
30. Real PostgreSQL replacement/clear/remove vs stop exercises both winner orders; stop-first preserves old set, replacement-first conflicts old stop until explicit refreshed stop preserves new set.
31. Failed parent claim, invalid child/constraint failure and injected audit failure roll back version and every child write; no orphan success audit.
32. One schedule_updated audit per committed replacement including no-op; bounded rollback retries leave exactly one committed audit.
33. Audit actor/resource is server-derived; metadata absent; no medication/instruction/times/child IDs/Patient PII in audit or unsafe logs/errors.
34. Reads create no AuditEvent or version mutation; stop creates only existing stopped audit.
35. Detail has only base fields plus required sorted schedules/localTime; no child/owner IDs, child timestamps or clinical fields; [] for zero.
36. Parent version/status and children returned from one consistent detail snapshot under concurrent replacement/stop.
37. Lists retain existing size/order/owner-scoped cursors and minimal DTO; no schedule preload/N+1 or schedule-driven pagination change; older STOPPED history reachable.
38. Request-time authorization and actor-specific presentation remain; no shared/cross-user cache, persisted schedule draft or account-switch stale data.
39. Mobile editor stays within existing Personal route, uses current tokens/primitives, native minute inputs, accessible labels/errors/focus/status and touch targets; full large set reachable without overflow/truncation.
40. Draft add/remove/cancel does not mutate until one save; empty rows invalid; zero clear explicit; validation retains draft; pending blocks local duplicate/conflicting submits.
41. Success/reload refreshes all version-bound item forms; conflict/ambiguous outcome requires explicit refresh, never automatic resubmit or silent draft rebase.
42. Thai copy conveys personal DEMI times, Asia/Bangkok and no delivery; STOPPED copy conveys historical tracking, without clinical wording or advice.
43. No notification/adherence/provider/work/delegated controls, top-level nav or new route; existing name/instruction and stop behavior remains correct.
44. No reminder/adherence/delivery artifacts, Goal coupling or other non-goal fields/events/jobs introduced.
45. New forward migration passes on empty disposable PostgreSQL and current-history upgrade with existing ACTIVE/STOPPED rows; published migration bytes unchanged; no inferred-time backfill.
46. Focused schema/service/transport/query/UI unit checks and real PostgreSQL authorization/invariant/race tests execute successfully with recorded evidence; mocks alone insufficient.
47. Final lint/typecheck, direct architecture/privacy/diff review and stable broad unit/integration checks recorded honestly; build evidence only when justified as described below; no false device-UAT/deployment PASS.
48. Final scoped diff/paths/UTF-8 review and git diff --check pass; no unrelated edits, unused abstractions, placeholders or temporary/debug artifacts.

**Acceptance criteria count: 48.** These are requirements for later implementation, not executed tests in this documentation task.

## 13. Later implementation verification plan — not executed now

Use repository commands: `npx prisma validate`, `npm run prisma:generate`; verified disposable PostgreSQL migration workflows; explicit-path `npm run test -- <affected medication/UI test paths>`; targeted `npx vitest run --config vitest.integration.config.mts tests/integration/personal-medication.integration.test.ts` (or a focused schedule test file in that directory).

Load validated disposable integration environment without printing credentials: DATABASE_URL = DIRECT_URL = DEMI_TEST_DATABASE_URL, nonproduction local test DB. Inspect integration runner before invoking it: currently it does not forward test paths, so `npm run test:integration -- <path>` is not targeted. Generate/migrate once as needed, not after every edit. Never reset shared/real data.

After focused checks, run `npm run lint` and `npm run typecheck`. Current package has no lint:strict or architecture:check scripts; review module direction explicitly unless scripts exist at coding start. Review final stable diff/SQL/authorization/audit/privacy/Thai before broad verification. New schema/guards/aggregate concurrency justify one final `npm run test` and one final `npm run test:integration`; isolate any failing/resource-sensitive tests before further broad runs.

Record build evidence proportionally: schema/security changes alone do not prove a production build is needed. Run one `npm run build` if changes to generated-client/Server Action/detail DTO integration create deployment/runtime compatibility uncertainty that cheaper checks cannot cover, or routing/config/build-time behavior changes make it necessary. Otherwise record **NOT RUN** and the focused/static checks covering compatibility; never inherit 17G.1 build evidence as proof for new code. Browser/mobile UAT evidence remains separate and must not be inferred from static/unit results.

## 14. ADR assessment and exact closeout

**No ADR required or created.** This is a bounded additive child of approved MED-01, reusing identity/SELF authority, parent lifecycle, transaction/audit and Personal workspace boundaries. It does not change notification architecture or create clinical ownership. Native time storage, a focused child guard and collection replacement belong in this implementation contract; no new global architecture decision is necessary.

This task performed documentation/source/diff/path/UTF-8 review and git diff --check/status only. No Prisma validation/generation/migration, unit/integration suite, lint/typecheck, build or dev server was run; no runtime or DB invariant PASS is claimed. Historical 17G.0/17G.0B/17G.1 evidence is preserved. No commit or push.

- **Phase 17G.2A contract: CLEARED FOR IMPLEMENTATION.** G2-OD01/G2-OD02 explicitly owner-approved in this session; no new owner decision remains required.
- **Phase 17G.2 runtime: NOT IMPLEMENTED.** Clearance is permission for a later implementation task, not implementation in this task.
- **17G.1 IMPLEMENTED / CLOSED; Q30–Q53 CLOSED / OWNER APPROVED; MED-02 REQUIREMENT-GATED; 17G.3 NOT IMPLEMENTED; 17J future.** P17F-L04 and Q5 gates unchanged; no UAT/governance/deployment closeout inferred.
