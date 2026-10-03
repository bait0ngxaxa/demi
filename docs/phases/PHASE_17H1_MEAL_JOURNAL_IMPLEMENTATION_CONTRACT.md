# Phase 17H.1 — Meal Journal Implementation Contract

## CURRENT status — 2026-10-03 (Asia/Bangkok)

**WELL-01 CLEARED FOR IMPLEMENTATION. Phase 17H.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** Authority: [17H.0B owner closeout](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md), Q54–Q83 **CLOSED / OWNER APPROVED — Option A** in the [corrected pack](./PHASE_17H0_WELLNESS_DECISION_PACK.md). This is documentation only, not delivered Meal runtime or UAT evidence.

## 1. Baseline and source fit

Actual starting HEAD `f34d4aa41548aef7b3c53d9ed746d59bb7e2fd62`; clean tree, expected HEAD unchanged. Read AGENTS.md, CONTEXT, UAT backlog, 17A, corrected 17H.0, 17G closeout/implementation contracts and current source before choosing the following narrow implementation mechanics.

| Current evidence | Reuse boundary |
| --- | --- |
| [SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [SELF query](../../src/modules/patient-self/services/patient-self-query-service.ts), [schema](../../prisma/schema.prisma) | Persisted User/Person/PatientProfile identity; existing SELF care capabilities do not grant Meal mutations. User.personId and PatientProfile.personId are unique; ownership must resolve through the authenticated persisted chain. |
| [Medication owner resolution](../../src/modules/medications/services/personal-medication-access-service.ts), [service](../../src/modules/medications/services/personal-medication-service.ts), [query](../../src/modules/medications/services/personal-medication-query-service.ts) | ACTIVE + persisted PATIENT exact binding, transaction/audit/version guard, bounded DTO/history infrastructure only. No medication policy, ACTIVE/STOPPED business state, schedule or occurrence semantics imported. Medication create is not a sufficient Meal replay strategy. |
| [Appointment create](../../src/modules/appointments/services/appointment-service.ts) | Persisted submissionNonce and retry readback establish a per-operation pattern; its content creationRequestHash must **not** be copied to Meal. Physical Meal deletion needs payload-free surviving retry memory. |
| [Serializable helper](../../src/lib/db/serializable-transaction.ts), [audit](../../src/modules/audit/services/audit-service.ts), [errors](../../src/shared/errors/application-error.ts) | Serializable mutation + transactional audit; safe Validation/Forbidden/NotFound/Conflict/Infrastructure outcomes. Helper currently retries P2002/P2034 twice immediately; section 6 deliberately disables its implicit retry for this slice. |
| [Medication validation](../../src/modules/medications/schemas/personal-medication-schemas.ts), [form boundary](../../src/modules/medications/transport/server-actions.ts), [bounded schedule form](../../src/modules/medications/transport/schedule-form.ts) | Strict allowlist, raw limits, duplicate/File rejection, optional trimmed text→null, UTF-16 length convention, safe Thai errors. Use bounded parsing for Meal, not unbounded generic form dumping. |
| [Authenticated cursor reference](../../src/modules/medications/services/medication-reminder-occurrence-cursor.ts) | Domain-separated actor-bound HMAC with current server secret; reuse technique only, not medication codec/source payload. No new secret/env or generic cursor framework. |
| [UI foundation](../ui/DEMI_UI_FOUNDATION.md), PRODUCT.md / DESIGN.md | Impeccable planning in Operate mode, current Personal shell/primitives/tokens; no UI edits in this task. |

No dedicated Meal model/module/route exists at baseline. No live DB, runtime framework/library API claims or new dependency are needed to close this document. Later implementer must inspect then-current source/scripts and installed `node_modules/next/dist/docs/` guides before writing Next.js code; verify external APIs through official documentation/Context7.

## 2. Approved event and fields

One entry = **one Patient-reported consumed meal/snack occasion**. Personal self-tracking, Patient-reported, not clinician verified, not a clinical fact, not proof of complete dietary intake, not Goal Plan adherence, not nutrition assessment. Multiple entries on the same date and in the same category are legal; **no unique(date, category)**, content deduplication or daily aggregate.

| Product field | Contract |
| --- | --- |
| category | Required; exactly BREAKFAST — มื้อเช้า, LUNCH — มื้อกลางวัน, DINNER — มื้อเย็น, SNACK — ของว่าง. No OTHER. Patient selects; never derive from clock time. |
| occurredOn | Required Gregorian civil date `YYYY-MM-DD`; valid calendar day, year 0001..9999; Asia/Bangkok interpretation; section 3. |
| description | OPTIONAL single plain-text field; normalized maximum **1,000 UTF-16 code units**, matching current repository character-count convention. No HTML/Markdown execution. |

Description normalization: raw maximum 2,000 UTF-16 code units before trim; trim leading/trailing whitespace, preserve meaningful interior whitespace/newlines/Thai/script/case; omitted/null/normalized-empty → null on create and full-field edit. Do not invent food syntax, Unicode transliteration or tags. Reject oversize rather than truncate. Render as escaped text; entered markup is literal text, never executable markup.

No portion, quantity/unit, structured foods, calories, macros, tags, location, photo, nutritional score, clinical note, Goal Plan item ID, Hospital ID, Program ID, copied Patient name/National ID/HN. Technical metadata is only for ownership, persistence, audit, retry and concurrency below.

## 3. Occurrence civil date

Patient explicitly selects/reviews occurredOn; today and past dates allowed, future dates denied on **create and edit** against authoritative current Asia/Bangkok civil date. Do not add meal time, infer category time, use browser timezone as authority or let Thai Buddhist-calendar presentation silently change persisted Gregorian truth.

Persist as PostgreSQL **DATE**, not an occurrence TIMESTAMPTZ/fake midnight UTC instant. A Prisma Date carrier may be necessary for a DATE adapter, as in existing date-only models; its artificial carrier time is never a domain instant, DTO field or UI meal time. Parse/round-trip calendar components strictly (including leap days), avoid timezone shifts, return date-only strings. createdAt/updatedAt are system persistence instants and never consumption time. Use one authoritative server evaluation date per transaction attempt; re-evaluate on a fresh retry, including Bangkok midnight. An already-consumed create receipt is replay, not a newly dated event.

## 4. Exact ownership and authorization

Every entry has exactly one PatientProfile owner, immutable and server-derived:

**authenticated ACTIVE User → persisted PATIENT role → exact Person → exact PatientProfile**.

Wellness owns a dedicated Meal SELF policy/access/service boundary. Do not call medication policy as Wellness authority or add Meal to existing care-read grants. Every list/detail/create/edit/delete/receipt replay/cursor continuation resolves current persisted eligibility; writes do so inside the transaction. UI/navigation checks are presentation only.

Fail closed on inactive/suspended account, removed PATIENT role, invalid User↔Person binding, absent PatientProfile, stale actor context or another Patient's resource. Resource ID/cursor/submission nonce is a locator, never authority. Reject browser patientProfileId/personId/userId/Hospital relationship/role-choice authority fields, including unexpected fields rather than silently ignoring them.

Hospital MEMBER/OWNER, assigned OSM, Family/caregiver, family appointment grant and routine Platform ADMIN have zero Meal authority. Eligible PATIENT + Work role can operate only own SELF records; no union with Work scope. Same safe not-found outcome for well-formed foreign and missing entry IDs, without status/version/owner disclosure. Ineligible actor gets safe denial before resource lookup. No owner transfer, provider counterpart query or delegated projection.

## 5. Dedicated persistence boundary (conceptual; not schema changes now)

Use **PersonalMealEntry**, consistent with current PersonalMedication + PatientProfile naming; dedicated Wellness/Meal domain, not PatientGoalPlan/PatientGoalItem/PatientBaseline/PatientFollowup, generic records or WellnessEntry/EAV.

| Minimum persisted field | Meaning |
| --- | --- |
| id | Server-generated opaque UUID; never reused after deletion. |
| patientProfileId | Exact owner FK; immutable; Restrict relationship semantics consistent with current personal model, no new account purge workflow. |
| category | Four-value closed vocabulary above. |
| occurredOn | Gregorian PostgreSQL DATE. |
| description | Nullable bounded plain text; no retained revisions. |
| createdAt | Authoritative system persistence instant, immutable. |
| updatedAt | Millisecond system instant + optimistic token; monotonically advanced on actual edit. |

Minimal narrowly scoped **PersonalMealCreateReceipt**: exact patientProfileId owner FK, opaque submissionNonce UUID, server-generated mealEntryId locator, system createdAt. Unique **(patientProfileId, submissionNonce)** and one receipt per mealEntryId. The receipt contains **no category/date/description/payload hash**. mealEntryId remains an opaque scalar locator after deletion, not a restrictive/cascading entry FK that retains payload or removes replay memory. The receipt is technical consumed-operation memory, not a deleted Meal row, revision or soft-delete payload.

Later implementation must enforce owner FK, nonce uniqueness and category/date/text structural invariants in its forward migration/service as appropriate, and index owner + occurredOn DESC + createdAt DESC + id DESC for history. No Patient-level journal uniqueness. Do not add actor snapshots where existing audit actor identity suffices. No schema/migration is implemented here.

## 6. Create retry / idempotency

Choose **owner-bound opaque submissionNonce + payload-free persistent create receipt**. This follows repository operation-token persistence without the Appointment content hash. An entry-only nonce would be lost on physical delete and could recreate a deleted meal; a narrow receipt prevents that. No global generic idempotency subsystem or content deduplication.

1. Form creates a random UUID nonce once per intended create operation; keep the same nonce and submitted draft through pending/ambiguous network retry. Disable duplicate pending submission for UX only. After confirmed outcome, a deliberate second entry starts a **new** nonce even if date/category/content are identical. No journal/nonce draft in durable browser storage.
2. Authenticate, bound/parse strict create envelope, resolve exact SELF in Serializable transaction, then look up receipt by **derived owner + nonce**. Never globally query a nonce as authority. Well-formed reuse by another owner is an independent owner namespace, not a disclosure.
3. If receipt exists and its own entry survives: return current owner-scoped persisted DTO with an explicit **REPLAY / already processed** result, ignoring replacement product values; do not overwrite, compare/hash original content or claim submitted replacement values were saved. After later edit, replay returns current record, not reconstructed original content. UI shows readback and explains that new changes require edit/new operation.
4. If receipt exists but entry was deleted: safe consumed-operation conflict, no payload, recreation or success-create audit. User may deliberately initiate a genuinely new entry with a new nonce; old replay must not resurrect it.
5. If no receipt: validate product fields/current non-future date, create entry + receipt + minimized create audit in the **same transaction**. Commit all or none. Failed validation/rollback does not consume nonce. No content hash or sensitive description in receipt/logs/errors.
6. For transport ambiguity, resend the **same nonce**; never automatically replace it or blindly create a new operation. Changed data under a consumed nonce is not a second save; UI must read the existing result and require explicit edit/new intent. Structural malformed input can safely fail even when a nonce was consumed.

Use existing Serializable helper with **retryLimit = 0** for this slice: no new automatic DB retry loop or immediate helper retries. A recognized rollback/serialization/nonce-unique race returns safe retryable conflict; retry with the same nonce in a fresh request rechecks persisted authority and resolves the winning receipt. A losing concurrent request may conflict first; it must never commit a second entry/audit. An ambiguous response reports unconfirmed outcome, not fake failure/success, and same-nonce replay resolves it. Do not retry authorization/validation/business conflicts automatically. Any later automatic retry mechanism must be separately justified, bounded with backoff/jitter, and preserve this operation identity.

Receipts survive active Meal deletion with no payload, and have **no automatic TTL/pruning in 17H.1**: pruning would make old replays valid creates again. Retain consumed identifiers for the owner namespace while it exists; operational account-erasure/backup policy must address their disposal. They are internal technical identifiers, never Meal history, user export, or read authority. No legal retention duration is asserted.

## 7. Edit / delete / concurrent operations

Lifecycle: **CREATE → editable current record → physical delete**. No lifecycle status enum, immutable content revisions, archive, soft-delete payload retention, restore UI or clinical amendment workflow. Edit full replacement of own category/occurredOn/optional description only; occurrence still not future. Ownership/id/createdAt immutable; no upsert.

Choose current repository **expectedUpdatedAt** convention instead of adding a new version column. Require valid bounded timestamp token on edit/delete; fetch exact owner-scoped row, compare exact persisted millisecond token, then conditional updateMany/deleteMany predicate **id + derived patientProfileId + expected updatedAt**; affected count must equal one. Successful actual edit sets updatedAt to **max(authoritative now, prior updatedAt + 1ms)**. Token is a version expectation, never client authority/time. All steps and audit share one Serializable transaction.

An edit with identical normalized fields and matching version is **NOOP**, returns current readback, no version advance/audit. Version/authority must still be checked; stale identical content is a conflict, not permission to ignore newer state. Physical delete commits payload removal and one minimal audit, preserving only section 6 technical receipt. No successful deleted-record readback; return opaque deleted ID/result and refresh surviving list.

| Race / retry | Required result |
| --- | --- |
| Edit/edit | At most one actual winner for old token; stale loser conflicts; no silent overwrite. |
| Edit/delete | Winning edit makes old delete stale; winning delete prevents stale edit from resurrecting entry. |
| Delete/delete | One deletion/audit; later missing result safely equivalent to foreign/missing, no duplicate audit. |
| Replay create after edit/delete | Read current own entry without mutation / consumed conflict after delete. |
| Audit/receipt/business failure | Full rollback; no orphan success audit or consumed nonce without committed entry. |

Conflict requires reload/review before a new mutation; do not automatically apply edits to a refreshed version. Foreign/missing remain safe not-found, not a distinguishable foreign-version conflict. Actual PostgreSQL concurrency evidence is required later, not just mocked Prisma calls.

## 8. Mutation audit

Use current recordAuditEvent with the **transaction client**, not root client. Suggested exact namespace: `personal_meal.created`, `personal_meal.updated`, `personal_meal.deleted`; resourceType `PersonalMealEntry`, opaque resourceId, server actorUserId, system audit createdAt. Default metadata omitted; minimal technical version/result only if demonstrably needed.

Never audit description, category, occurrence date, full Meal payload, Patient name, National ID, HN, sensitive derived content or payload hashes. No audit-based payload recovery/revision browser. Successful actual mutations each produce one committed audit; replay/NOOP/failure produces no misleading duplicate business audit. No ordinary durable per-read audit. Audit access/retention remains operationally governed, not an invented legal duration.

## 9. Read / current surviving history

Capabilities: list own Meal history, read own exact entry, create, edit, delete. History = current surviving meal events, **not revision history**. Explicit minimal DTO selects only id/category/occurredOn/description/createdAt/updatedAt; owner and receipt details stay internal.

Deterministic order **occurredOn DESC → createdAt DESC → id DESC**. Fixed page size **50**, fetch at most **51** for hasMore; no unbounded list or permanent truncation. First slice has no category/date filter controls; future filters need a bound query contract. History is a live list, not a snapshot/export guarantee; concurrent edits may change order and require refresh.

Choose a Meal-specific authenticated cursor, following existing actor-bound HMAC convention: canonical versioned payload containing exact owner ID and last occurredOn/createdAt/id/updatedAt anchor; MAC binds current actor userId/personId, owner, Meal domain/version, fixed sort/page size and no-filter scope. Reuse existing configured secret through a domain-separated codec, **not the medication codec**, no new env. Strict canonical encoding/schema, max **2,048 cursor characters / 1,024 decoded payload bytes**, constant-time tag comparison. It is authenticated position metadata, not encrypted content or authority; no description/category in token or telemetry.

Every continuation freshly resolves persisted SELF, validates actor/owner/query binding, fetches anchor **within exact owner scope**, verifies unchanged anchor/version, then lexicographically seeks older tuples with the owner predicate still present. Missing/foreign anchor gets equivalent safe not-found/restart response; changed own anchor gets safe conflict/restart. Tampered/malformed or cross-actor tokens fail safely without unscoped existence lookup. No continuation or cursor automatically grants access. Keep cursors in private action/state transport; no sensitive Meal payload in URL/query strings.

## 10. Bounded route and UX

Approved `/app/personal/wellness`, **Personal → Wellness → อาหาร**, implementing Meal capability only. Use an inline bounded list/create/edit/readback workspace under that destination; separate detail route is not required. Eventual Exercise/Weight Goal sections are approved directions, not implemented navigation/actions in 17H.1. Prefer only live Meal functionality; no fake/dead Exercise or Weight Goal primary action.

Impeccable Operate planning follows existing DEMI UI foundation: Personal shell, PageHeader, Panel only where needed, Button/Input/Select/Alert and current tokens/form conventions. No new design system/components framework or arbitrary visual values. Mobile single-column form and readable event list, accessible labels/optional indicator, keyboard/focus flow, associated field errors, status announcements, confirmation focus restoration; do not rely only on color.

| State | Required behavior |
| --- | --- |
| Empty | “ยังไม่มีบันทึกมื้ออาหาร” + working create action; no inference that Patient did not eat. |
| Loading | Neutral loading, no previous actor payload. |
| Create | Patient chooses/reviews category and civil date, description visibly optional; no time-derived category or hidden factual default. |
| Edit | Load exact own current values/version; preserve in-memory draft on validation failure. |
| Delete confirmation | Explain removal of this current record from DEMI; cancel closes confirmation, not a domain status. |
| Saving | Pending label/disabled duplicate action; never declare success before confirmed commit. |
| Success/readback | Display authoritative persisted result; distinguish create replay/NOOP from newly saved replacement values. |
| Validation error | Safe Thai field feedback, focus error/summary, preserve current actor draft only in memory. |
| Stale/conflict | Reload latest record/list and require review; no silent overwrite or recovery of deleted payload. |
| Denied/not-found | Safe generic inaccessible/missing state; no other owner/existence disclosure or mutation controls. |

Source copy: **“ข้อมูลที่คุณบันทึก”**. Avoid healthy/unhealthy, compliant/non-compliant, clinician-approved, prescribed diet or complete daily intake wording. No score, streak, Goal adherence badges or nutrition advice. Browser/mobile/device usability is later UAT, not a documentation PASS.

## 11. Architecture, boundary validation and errors

**Client/UI → Server Action / Route boundary → Application Service → Wellness/Meal Authorization Policy → Prisma → PostgreSQL**. Separate input schema, SELF actor/resource resolution, policy, service, query, persistence and UI. Query functions belong under services/ per current modules; no empty speculative abstraction. Reuse utilities only when responsibility/semantics match; lower layers never import UI.

Server boundary sequence: bounded request/abuse protection → fresh authentication → strict parsing/schema → resource authorization → business date/version/replay rules → transactional mutation/receipt/audit → scoped invalidation/readback → sanitized response. Direct service callers must receive equivalent validation/authorization, not trust transport prevalidation.

Create allowlist: submissionNonce/category/occurredOn/description. Edit: entryId/expectedUpdatedAt/category/occurredOn/description. Delete: entryId/expectedUpdatedAt. List: optional cursor only. UUIDs canonicalized/validated, timestamps bounded to 40 characters, date exactly 10 characters, raw category bounded to 9; max **16 KiB** user form payload before parsing, description raw bound above. Reject duplicate keys, File values, unknown owner/clinical fields; ignore only framework-owned action metadata under current transport convention. Raw parsed input remains unknown until schema validation; do not log validation payloads.

Safe existing ApplicationError categories and Thai messages only; no stack/SQL/internal path/Prisma error or submitted text in client response/telemetry. Unexpected infrastructure failure must report unconfirmed save outcome and allow same-nonce reconciliation. Atomic audit failure rolls back. No external HTTP/public API added merely to implement this Personal feature.

## 12. Privacy, cache and deletion boundary

Description may contain sensitive health/lifestyle information. Private authenticated request-time reads, no public/static generation, shared result cache or cross-actor authorization/payload reuse. No description in URLs/query strings, structured logs/errors/telemetry. No durable localStorage/IndexedDB journal/draft cache by default; reuse of DB connection objects is not result caching.

Reauthorize fresh reads/actions/continuations after logout/account/context change; clear/replace actor-specific in-memory form/list/nonce state. Implement private/no-store response behavior with then-current installed framework guidance. Revalidation is UX freshness, never permission. Later manual UAT must cover logout/login account switch, browser back/forward/BFCache, delayed responses and stale drafts; do not claim device memory can be cryptographically erased or every browser snapshot recalled.

Successful delete means removal from **active application persistence/read paths after commit**; payload does not survive as a soft-delete row, receipt or audit snapshot. It does not promise instantaneous deletion from infrastructure backups/media/device caches. No invented legal retention duration or regulatory compliance claim. Operational follow-up: backup retention/restore handling, accountable account-erasure policy including receipts, audit access/retention and deployment privacy controls where no authoritative policy exists. Existing Phase 17A treats these as production-hardening decisions; this follow-up does **not** silently block synthetic/demo implementation. No account-erasure runtime is authorized by this contract.

## 13. Non-goals and future sequence

17H.1 must not implement Exercise Journal, Weight Goal runtime, Personal Weight Observation, Goal Plan synchronization/care completion, nutrition calculations/calories/macros, photos, Hospital/OSM/Family access, export/share/external API, reporting/dashboard/cohort analytics, notification/reminder source or delivery, BMI, scoring/advice or generic Wellness framework. Meal never feeds PatientGoalPlan completion, PatientFollowup activity completion, PatientBaseline, Final Assessment, Program reporting, adherence, Family projections or notifications without a **new explicit contract**.

Approved sequence: 17H.0 decision analysis COMPLETE / decisions CLOSED → 17H.0B CLOSED / contract COMPLETE → **17H.1 Meal CLEARED / NOT IMPLEMENTED** → 17H.2 Exercise (decisions closed, duration OPTIONAL, separate technical contract before implementation) → 17H.3 Personal Weight Goal (decisions closed, target-only, separate technical contract) → 17H.4A automated authorization/security/DB/privacy re-audit + UAT readiness. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE, never automatic in 17H.3; separate explicit contract required if requested.

17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE and all Family/Q5/parked Consent/MED-02/17J gates remain unchanged. 17J remains future notification delivery/system-authority boundary. This contract adds no notification authority or clinical meaning.

## 14. Later implementation acceptance / verification (not executed now)

Later implementation must inspect current scripts and use focused checks first; stable diff before justified broad checks. Required behavioral evidence:

1. Four categories, optional/null description, 1,000 normalized/2,000 raw limits, Thai/Unicode/plain-text safe rendering, strict unknown/duplicate/File rejection and request bounds.
2. Real Gregorian date/leap-day handling, past/today allowed, future denied on create/edit; Bangkok midnight/process-timezone/Thai-calendar round trip; no meal time or timestamp meaning.
3. Multiple intentional same-date/category/content entries with different nonces; same-nonce network/concurrent retry has one committed entry/receipt/audit, replay after edit reads current result, replay after delete never recreates payload; rollback leaves no consumed nonce/orphan audit. Reuse of nonce under different owner reveals nothing.
4. Exact SELF allow/deny matrix including stale sessions, removed roles, suspended user, mismatched binding/missing profile, Patient A/B IDOR, Hospital MEMBER/OWNER, assigned OSM, routine ADMIN, caregiver/appointment grant and eligible multi-role own-only.
5. Actual PostgreSQL edit/edit, edit/delete, delete/delete, create/delete-replay and receipt-unique races; monotonic expectedUpdatedAt, guarded affected count, NOOP without audit, audit failure injection and sanitized conflicts.
6. Bounded 50-row deterministic history, older records reachable, actor/owner/query-bound cursor tampering, missing/deleted/changed anchors, fresh eligibility each continuation, minimal DTO and no sensitive audit/log/receipt contents.
7. Mobile accessible required UX states and authoritative readback, no dead future actions, private/no cross-actor cache, logout/account/context changes; separate later manual browser/BFCache/device UAT.
8. Forward migration/client/schema checks and targeted unit/integration checks belong to actual runtime task; no published migration edits, production resets or unrelated changes. Reinspect scripts before choosing commands; do not blindly copy historical build/full-suite requirements.

This task executed documentation-focused HEAD/tree/content/disposition/Q71/scope/link/UTF-8/diff validation only. **No runtime/schema/migrations/tests/env/config changes; no unit/integration/Prisma/lint/typecheck/build/dev server run; no commit/push.** Runtime/database/UAT evidence remains future work.
