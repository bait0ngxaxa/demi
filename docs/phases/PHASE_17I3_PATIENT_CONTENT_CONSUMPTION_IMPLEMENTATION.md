# Phase 17I.3 — Patient Content Consumption Implementation

Date: 2026-10-05 (Asia/Bangkok)
Repository: bait0ngxaxa/demi
Branch: main
Starting HEAD: 2356950be89e9ad3b6d8cebcad0af481aadcbce8

**CONTENT-01 — IMPLEMENTED. Phase 17I.3 — IMPLEMENTED / CLOSED.**

Implemented against the [binding Patient contract](./PHASE_17I3_PATIENT_CONTENT_CONSUMPTION_IMPLEMENTATION_CONTRACT.md), [owner closeout](./PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md), and completed [Publisher implementation](./PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION.md). Q84–Q111 remain CLOSED / OWNER APPROVED. Phase 17I.4A is PLANNED / NOT STARTED. Whole Phase 17I is NOT COMPLETE.

## Delivered files and module boundaries

The HospitalContent bounded module owns Patient authorization, query orchestration, parsing, cursor and projections:

- src/modules/hospital-content/policies/hospital-content-policy.ts and its tests: explicit Patient read scope; Publisher scope preserved.
- src/modules/hospital-content/services/hospital-content-patient-self.ts: bounded persisted SELF resolver.
- src/modules/hospital-content/services/hospital-content-patient-query-service.ts and its tests: authorized feed/detail and empty classification.
- src/modules/hospital-content/services/hospital-content-patient-cursor.ts and its tests: dedicated signed position codec.
- src/modules/hospital-content/schemas/hospital-content-patient-schemas.ts and its tests: strict feed URL/request boundary.
- src/modules/hospital-content/types/hospital-content-patient-projections.ts: dedicated minimal Patient DTOs.
- src/modules/hospital-content/transport/hospital-content-patient-page-context.ts: request actor and safe application outcomes; no Server Actions.

Personal UI:

- app/app/personal/knowledge/page.tsx and [contentId]/page.tsx: request-time feed/detail.
- patient-content-feed.tsx, patient-content-detail.tsx, patient-content-presentation.tsx, patient-content-link.tsx, patient-content-private-boundary.tsx and loading.tsx under that route.
- page.test.tsx, patient-content-views.test.tsx and patient-content-private-boundary.test.tsx under that route.
- src/components/app-shell/application-navigation.ts, navigation-types.ts and navigation-list.tsx: one Personal item and optional prefetch projection. application-navigation.test.ts and new navigation-list.test.tsx cover separation and defaults.
- tests/integration/hospital-content-patient.integration.test.ts: real PostgreSQL tests with disposable fixtures and deterministic committed-revocation barriers.
- Current status updates: docs/CONTEXT.md, PHASE_17_UAT_BACKLOG.md, the Patient contract and owner closeout; historical clearance/decision evidence retained.

**No Prisma/schema/enum/index/migration/config/dependency change.** Existing HospitalContent publication checks and prepared Patient indexes are used unchanged. No Patient-content join table, receipts, view counter, snapshot, bookmark or cache persistence. Hospital Contact runtime and Publisher services/cursor/routes/projections/lifecycle/audits are unchanged.

## Policy and persisted authorization

Pure policy allows only hospital-content:read + PATIENT_SELF_RELATIONSHIP for an authenticated identity with Role.PATIENT. It never allows manage through that scope. DIRECT_HOSPITAL_OWNER keeps existing Publisher read/manage behavior. Capability alone grants nothing.

Every operation freshly resolves persisted Patient SELF through top-level PatientProfile:

- exact Person.id == actor.personId;
- that Person's User.id == actor.userId and User.personId == actor.personId;
- User ACTIVE with persisted PATIENT UserRole;
- exact PatientProfile exists.

The resolver first selects only the current Profile ID, then uses a top-level PatientHospitalRelationship.findFirst selecting only id. That relationship statement binds the exact resolved Profile ID and re-proves the complete current Person/User/ACTIVE/PATIENT predicate together with Hospital ACTIVE. It does not depend on nested relation loading. If no relationship is returned, a final fresh top-level Profile SELF query distinguishes authority loss (Forbidden) from valid SELF with no eligible Hospital (false), returning the current rechecked Profile ID if replaced. The resolver returns only internal patientProfileId and the bounded eligible-Hospital boolean. No Profile/relationship IDs reach Patient DTOs or URLs. Missing SELF is Forbidden; persistence failure is InfrastructureError.

Every feed/detail/existence Content SELECT is top-level HospitalContent with the complete predicate:

~~~text
PUBLISHED + non-null firstPublishedAt/latestPublishedAt
AND owning Hospital ACTIVE
AND Hospital.patientRelationships SOME
  PatientProfile.id == freshly resolved Profile
  AND PatientProfile.person.id == actor.personId
  AND Person.user.id == actor.userId
  AND User.personId == actor.personId
  AND User ACTIVE
  AND User.roles SOME PATIENT
~~~

The extra exact Profile binding accompanies the full current persisted identity predicate; it does not replace it. No earlier hospitalIds array, parent authorization followed by an unrestricted query, cursor authorization, payload-first lookup, table locks, read transaction or audit transaction is used. The existence query carries the same predicate. Real committed-revocation tests prove the statement itself fails closed.

The feed is a single globally ordered union of all currently eligible own relationships to ACTIVE Hospitals. Each Content row independently proves its own Hospital path. No Hospital chooser/filter, hierarchy, network or geographic expansion. Work/Admin/OSM/Family/caregiver authority never widens Patient SELF, including multi-role actors. PatientHospitalRelationship has no status field.

## Visibility, projections and chronology

Only current PUBLISHED rows with both publication timestamps are consumable. Withdrawal to DRAFT and archive hide content on subsequent authoritative reads. Republish makes it visible at its original chronology position.

List DTO exact fields:

~~~text
id, hospital { hospitalCode, name }, title, category, latestPublishedAt
~~~

Detail adds only body and sourceText. No body excerpt/summary/source in list; no status, hospitalId, submissionNonce, updatedAt, firstPublishedAt, actor/Profile/relationship identifiers, publisher/reviewer or revision/audit fields in either Patient projection. firstPublishedAt is selected internally only to generate continuation positions.

Order is firstPublishedAt DESC, id DESC globally across own Hospitals. latestPublishedAt is displayed as เผยแพร่ล่าสุด using th-TH, dateStyle medium, timeStyle short, Asia/Bangkok. It never ranks rows. Republish/updatedAt do not promote old content. Delivered bytes cannot be recalled by a later withdrawal; the next feed/detail request must hide it. Detail always queries current authorized content independently, with no list/historical fallback.

## Request, category and cursor

Feed accepts only category and cursor. Absent category is valid/all. Present category must be exactly NCD, FOOD, EXERCISE or OTHER. Empty/unknown/duplicate/array/other representations and unknown URL keys fail ValidationError. No ALL machine value. Existing HOSPITAL_CONTENT_CATEGORY_LABELS supplies Thai labels. GET category buttons restart first page without cursor; the all/reset link truly omits both category and cursor.

Page size 25, fetch 26, no count/offset/unbounded accumulation. Only an authorized 26th row creates nextCursor. Seek is firstPublishedAt less than position OR equal firstPublishedAt and id less than position.

Dedicated hcontentpatientcur_v1_ uses HMAC-SHA256 with server-only IDENTITY_HASH_SECRET and timingSafeEqual. Canonical payload keys/order are version, category, firstPublishedAt, id; UTC millisecond ISO and lowercase UUID. Limits: 1,024 decoded bytes / 2,048 encoded characters. Reject malformed/oversized/noncanonical payload/base64url, unknown/reordered keys, invalid version/timestamp/UUID/category, MAC and scope mismatch.

MAC domain binds userId, personId, fresh PatientProfile identity, category/all, page size 25, firstPublishedAt-id-desc ordering and all-current-own-ACTIVE-Hospitals scope. Payload contains no Profile/Hospital/relationship identity or content text. No relationship snapshot binding.

Cursor is a position tuple, never an anchor resource. Decoding makes no database call and feed continuation never loads cursor.id. Withdrawal/archive/missing anchor, Hospital suspension, relationship addition/removal and new leading publications preserve valid cursor structure/signature. Rows obey fresh scope and direct seek values; this is not a snapshot. โหลดรายการล่าสุด restarts unfiltered page 1.

## Empty and error classification

Zero Content rows trigger a fresh persisted SELF/eligible-Hospital check:

- EMPTY_A: ยังไม่มีโรงพยาบาลที่พร้อมแสดงข่าวสารและความรู้
- EMPTY_B: ยังไม่มีข่าวสารและความรู้จากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ
- EMPTY_C: ยังไม่มีข่าวสารและความรู้ในหมวดหมู่นี้, with ดูทุกหมวดหมู่

Selected-category emptiness runs a bounded all-category authorized Content existence query. If it returns zero, another fresh SELF/eligible-Hospital check prevents concurrent loss from being reported as legitimate B/C. Invalid SELF is Forbidden, never empty. Infrastructure propagates to existing Personal error.tsx, never ยังไม่มีข่าวสาร.

Malformed detail UUID is NotFound. For no detail row, recheck SELF: lost SELF is Forbidden; valid SELF receives the same NotFound for missing/foreign/DRAFT/ARCHIVED/withdrawn/suspended-Hospital/removed-relationship locators. Existing Personal not-found presentation reveals no protected existence/lifecycle/Hospital facts. Missing session redirects /login; Forbidden redirects /app. Validation UI is bounded and offers first-page restart without echoing values. No Content payload logging or database-error exposure.

## Routes, UI and private lifetime

Exact routes: /app/personal/knowledge and /app/personal/knowledge/[contentId]. Both await connection() before request-specific actor/query work. No API/public/Work/preview/edit route and no read Server Action.

Personal navigation: สุขภาพ → ข่าวสารและความรู้ → นัดหมาย; href /app/personal/knowledge, prefix match, prefetch false. Optional navigation prefetch is passed through only for this item; existing defaults remain. Work Publisher stays separate. All internal protected Next Links use prefetch false. The route-local Link additionally uses onNavigate to make ordinary content transitions authoritative document GETs; native GET category forms work without JavaScript.

Plain React-escaped text; body preserves LF and wraps long Thai. Optional source is plain text, never autolinked/fetched/verified. Trust copy is ข่าวสารและความรู้นี้จัดทำโดยโรงพยาบาล and โรงพยาบาลผู้เผยแพร่รับผิดชอบความถูกต้องของเนื้อหา. No medical/DEMI verification claims. PageHeader/Alert/shared compact secondary button styles and existing tokens are reused. Code-level heading, label, selected text/aria state, focus, 44px controls and wrapping checks support small-width readiness; they do not certify actual 320/375px/device behavior.

No use-cache/unstable_cache/shared DTO cache/module result map/ISR or client persistent payload storage. No Patient IDs in DOM keys or navigation state. Each response gets an opaque random request-generation ID independent of account identity.

Route-local boundary synchronously hides and inerts the DOM and removes rendered children on pagehide; persisted pageshow, popstate and return to visible force reload before continued trust. Real unmount/Next cache suspension retires the request generation; later reactivation of that generation reloads before paint. Strict Mode immediate effect replay does not retire a fresh view. Bounded module metadata holds only up to 64 retired opaque request IDs; saturation requires reload instead of forgetting a retired ID. No article payload/account identifiers or delayed client query responses are stored in this metadata. A new request/account mounts a new keyed boundary. There is no asynchronous client read whose old response can repopulate local Content state.

This supports fail-closed fresh requests after logout/account/role/Profile/relationship/Hospital changes. Previously rendered bytes in browser memory cannot be cryptographically erased. Real browser/Next-history/BFCache acceptance remains manual UAT evidence.

## Read-only behavior

Feed, detail, category and continuation create no AuditEvent and do not change HospitalContent.updatedAt or other domain state. No Patient mutation, receipt, view tracking, notifications, search, tags, pinning, bookmarks or sharing records. Publisher mutation audits remain intact.

## Executed automated evidence

- Focused unit/UI/navigation/Publisher policy+cursor+transport regressions: **11 files / 106 tests PASS**. A final shared-button/touch-target-only UI adjustment was covered by **1 file / 8 tests PASS** plus final targeted ESLint; it does not change authorization/query behavior.
- Patient Content real disposable PostgreSQL: **1 file / 47 tests PASS** after the exact Profile predicate and final security test additions.
- Publisher real disposable PostgreSQL regressions: **1 file / 18 tests PASS**. No Publisher service changed afterward.
- npm run typecheck: **PASS** on stable runtime/query/test state.
- Targeted ESLint over every touched/new TS/TSX/test file with --max-warnings 0: **PASS**.
- npm run build: **PASS, executed once** on the stable runtime. Next.js 16.3.0 marks both new routes dynamic; Server/Client/route TypeScript checks passed.
- Impeccable mechanical detector: **no findings**. Bounded independent source review found no material UI/lifecycle defect; source documenter confirmed incumbent tokens/primitives, then shared buttonClassName was reused. No screenshots/device claims.
- git diff --check, final diff review, strict UTF-8/Thai integrity and touched local Markdown links: **PASS**.

Patient tests cover exact SELF/non-Patient denial, Family grant and assigned-OSM isolation, multi-role/hierarchy isolation, multi-Hospital order, fixed categories, lifecycle through actual Publisher operations, deterministic equal-time UUID ties, 25/26 pagination, new leading publications, withdrawn/archived anchor, relationship removal/addition and Hospital suspension, scope/MAC/Profile replacement failures, absent anchor validity, A/B/C classifications and no read writes. Unit/UI tests cover parsing, codec canonicalization/bounds/domain/scope, exact projections, route error mapping, safe escaped text/source, GET controls, prefetch, private invalidation/history and Strict Mode cleanup.

Deterministic real PostgreSQL barriers pause BEFORE the actual Content-producing Prisma call. Another transaction revokes and COMMITs before release. Both feed and detail return zero Content payload for PATIENT role removal, own relationship deletion, Hospital suspension, User suspension, Profile deletion and Person binding change (12 race cases). Additional category-existence barriers prove relationship/role removal is freshly classified A/Forbidden instead of B/C. Pure policy mocks are not the security evidence.

Integration invocation used the existing .env.integration target and vitest.integration.config.mts directly with the focused file. The npm integration wrapper always generates/migrates; this slice intentionally bypassed those unnecessary steps. No Prisma command/migration or dev server was run. npm run architecture:check was attempted but **UNAVAILABLE: no such script in package.json**; module imports were source-reviewed instead. No full unit/integration suite was run.

## Final SELF classification review correction — 2026-10-05

The supplemental SELF resolver no longer selects nested hospitalRelationships. Each eligibility-producing statement carries persisted SELF authority; no relationJoins, transaction, locks or persistence changes were added. Content-producing predicates, cursor codec/Profile binding, routes, UI/private lifecycle, Publisher and Contact remain unchanged. Existing Profile-replacement cursor rejection remains covered.

A deterministic PostgreSQL barrier pauses before the top-level eligible relationship SELECT, after the initial Profile SELECT completes. Another transaction commits PATIENT role removal before release: the relationship SELECT returns null and the final Profile recheck throws Forbidden, never EMPTY_A/B. Two controls commit relationship deletion or Hospital suspension at the same boundary: SELF remains valid and the list legitimately returns EMPTY_A. Existing Content-query and category-existence revocation barriers continue to pass.

Focused correction validation:

- SELF/query unit files: **2 files / 12 tests PASS**, including exact scalar-only Profile selection, complete top-level relationship predicate, final recheck/Forbidden and current replacement Profile identity.
- Real disposable PostgreSQL Patient Content file: **1 file / 50 tests PASS**, including all three new relationship-statement barriers and existing Profile-replacement/security/lifecycle/pagination tests.
- npm run typecheck and targeted ESLint (--max-warnings 0) on the four touched/new TypeScript/test files: **PASS**.
- Complete final diff review, git diff --check and strict UTF-8/Thai integrity: **PASS**.
- No Publisher regression rerun: shared policy/Publisher code did not change. No build rerun: only service/tests/documentation changed. No full suite, dev server or Prisma command.

## Remaining evidence and phase boundary

Manual browser/mobile/device/BFCache UAT — **NOT EXECUTED**. Use the contract's later checklist: 320/375 widths, Android Chrome, desktop Chrome/Edge, Back/Forward/BFCache, logout/account/role changes, relationship removal and Hospital suspension in another session, withdrawal/archive/republish while open, multiple Hospitals, categories/pagination, long Thai/source, keyboard/focus. No browser certification or customer acceptance is claimed.

Production migration/deployment — **NOT EXECUTED**. No new migration is required by 17I.3; existing production deployment remains a separate operational gate. Commit/push is a separately authorized delivery step.

Next phase: **17I.4A Hospital Knowledge / Contact integrated re-audit and UAT readiness — PLANNED / NOT STARTED**. This task did not execute that cross-slice re-audit. It later covers Contact/Publisher/Patient, cross-role isolation, lifecycle/query privacy, database/index behavior, cache/BFCache, mobile/accessibility and manual-UAT readiness. Whole Phase 17I remains NOT COMPLETE. Unrelated 17H.4A, 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2, MED-02 and 17J gates are unchanged.

## Current disposition

| Item | Status |
| --- | --- |
| Phase 17I.0 | CLOSED / OWNER DECISIONS CLOSED |
| Phase 17I.0B | CLOSED / DOCUMENTATION CONTRACT COMPLETE |
| Q84–Q111 | CLOSED / OWNER APPROVED |
| CONTENT-02 | IMPLEMENTED |
| Phase 17I.1 | IMPLEMENTED / CLOSED |
| CONTENT-01 | IMPLEMENTED |
| Phase 17I.2 | IMPLEMENTED / CLOSED |
| Phase 17I.3 | IMPLEMENTED / CLOSED |
| Phase 17I.4A | PLANNED / NOT STARTED |
| Whole Phase 17I | NOT COMPLETE |
