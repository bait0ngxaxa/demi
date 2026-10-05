# Phase 17I.3 — Patient Content Consumption Implementation Contract

Date: 2026-10-05 (Asia/Bangkok)
Repository: bait0ngxaxa/demi
Branch: main
Expected starting HEAD: 215e475b2fe0d0b6ad40f7f1dbd0b311ab930928

## Disposition

**Phase 17I.3 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.**

This document closes the implementation contract for the Patient read-only Hospital Content slice. It does not implement runtime behavior. CONTENT-01 already has the 17I.2 Publisher runtime; its Patient-consumption portion remains pending until a later implementation task.

Q84–Q111 remain CLOSED / OWNER APPROVED. They are recorded below as binding inputs, not reopened questions. Phase 17I.2 remains IMPLEMENTED / CLOSED. Whole Phase 17I remains NOT COMPLETE. Manual browser/mobile/device UAT and production migration/deployment remain NOT EXECUTED.

## 1. Reviewed evidence and implementation baseline

The implementation agent must use the current repository source and the following accepted decisions as the baseline:

- [AGENTS.md](../../AGENTS.md), [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md), [project context](../CONTEXT.md), and the [DEMI architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md).
- Accepted [ADR-0001 Person/User identity](../adr/0001-person-and-user-identity.md), [ADR-0002 authorization](../adr/0002-role-capability-scope-authorization.md), [ADR-0005 server-side application boundary](../adr/0005-server-side-application-boundary.md), [ADR-0006 transactional operations](../adr/0006-transactional-business-operations.md), and [ADR-0007 client transport/mobile-ready architecture](../adr/0007-client-transport-and-mobile-ready-architecture.md).
- [Phase 17A canonical customer flow and UAT contract](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [Phase 17 backlog](./PHASE_17_UAT_BACKLOG.md), [17I.0 decision pack](./PHASE_17I0_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_PACK.md), [17I.0B decision closeout](./PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md), [17I.2 publishing contract](./PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION_CONTRACT.md), and [17I.2 implementation handoff](./PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION.md).
- Current source inspected: prisma/schema.prisma; src/modules/hospital-content; src/modules/patient-self; src/modules/auth; src/components/app-shell/application-navigation.ts and application-workspace-context.ts; app/app/personal including appointments, medications and wellness; the existing Patient SELF meal/exercise cursor and query services; Family delegated-read and Wellness private-lifecycle patterns; tests/integration/hospital-content.integration.test.ts; package.json; next.config.ts; scripts/integration.mjs; and vitest.integration.config.mts.

Repository findings relevant to implementation:

- HospitalContent already contains hospitalId, title, body, category, sourceText, status, firstPublishedAt, latestPublishedAt, createdAt, updatedAt, and the publisher submissionNonce. Its existing patient-order indexes are HospitalContent_patient_order_idx and HospitalContent_patient_category_order_idx.
- PatientHospitalRelationship relates PatientProfile to Hospital and has no lifecycle status field. The contract must not introduce one.
- Person.user, Person.patientProfile, PatientProfile.person, Hospital.patientRelationships, and HospitalContent.hospital are the current Prisma relation names relevant to the Patient SELF predicate.
- The existing Hospital Content policy exposes hospital-content:read and hospital-content:manage with DIRECT_HOSPITAL_OWNER only. The Patient contract adds an explicit Patient scope to the existing read capability; Publisher authority remains unchanged.
- Personal navigation currently places สุขภาพ immediately before นัดหมาย. The exact new position is immediately after สุขภาพ and before นัดหมาย.
- Existing Personal pages call await connection() before request-specific actor/query work. Personal private reads use request-time actor resolution. Wellness clears in-memory private state on pagehide and reloads on a persisted pageshow; Family delegated reads refresh when focus/visibility returns and on persisted pageshow. Existing protected Family links use prefetch={false}.
- The installed Next.js version is 16.3.0. Its installed official docs say connection() waits for an incoming request, and Link prefetching can load route data before a click unless disabled. The implementation must use connection() for these request-time pages, disable protected-link prefetch, and apply the explicit private lifecycle below. connection() by itself is not a private-data cache guarantee.
- The current next.config.ts does not enable Cache Components. Regardless, the Patient DTO must not be put in any shared or persistent cache.
- scripts/integration.mjs restricts the existing integration workflow to local disposable PostgreSQL; vitest.integration.config.mts targets tests/integration. The current Hospital Content PostgreSQL test file provides the real-database and revocation-barrier precedent.

Inspected installed Next.js documentation:

- node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md
- node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md
- node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md
- node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md

No concrete blocking persistence deficiency was found. The prepared 17I.2 model and indexes support this contract. Therefore Phase 17I.3 requires no Prisma model change, enum, migration, Patient-content join table, read receipt, or view-tracking table.

## 2. Scope and binding owner decisions

This is a read-only Patient consumer of the Hospital-owned informational knowledge/news already published by 17I.2. The publishing Hospital is responsible for content correctness. DEMI does not represent this content as diagnosis, prescription, clinical truth, medical review, government verification, or AI medical advice.

The already-approved content contract remains:

- Each HospitalContent record belongs to exactly one Hospital. There is no global, parent, child, network, or geographic ownership.
- Exactly one category is stored: NCD, FOOD, EXERCISE, or OTHER. Patient labels are NCD, อาหาร, การออกกำลังกาย, and อื่น ๆ.
- Content consists of title, body, category, and optional source/reference. There is no summary field.
- All fields render as plain text. There is no HTML, WYSIWYG, media, image, PDF, embedded content, rich-text, or Markdown interpretation.
- Patients are the approved read audience. Staff, OSM, generic Hospital employees, Family, and caregivers receive no feed through this slice.
- Only currently PUBLISHED content is consumable. There is no schedule or expiry.
- Withdrawal changes PUBLISHED to DRAFT; the item disappears on the next authoritative read. Republished content is visible again.
- Patient attribution is Hospital identity plus latest successful publication/republication time shown in Asia/Bangkok as เผยแพร่ล่าสุด, and optional publisher-provided source/reference. Do not show human author/reviewer identity by default.
- Discovery is category filter plus original/first publication chronology, newest first. No text search, Hospital filter, pinning, sort chooser, or personalized ranking.
- Read-only access creates no AuditEvent. Current content only is shown; no revision, prior body, publisher-history, or audit-history UI exists.

Do not reopen or reinterpret Q84–Q111. Do not change Phase 17I.2 Publisher semantics: HospitalContent persistence, categories, statuses, publication timestamps, submissionNonce, direct OWNER policy, create/replay, withdraw-before-edit, terminal archive, audits, Publisher cursor/list, Work routes, migration/indexes, or provider privilege hardening.

## 3. Persistence and module boundary

Extend the existing bounded src/modules/hospital-content domain. Do not create a CMS/news/feed/recommendation domain.

The future read path is:

~~~text
Personal route Server Component
→ request-time protected actor resolution
→ Hospital Content Patient query service
→ explicit Patient SELF scope policy
→ query-bound Prisma predicate
→ PostgreSQL
~~~

Expected focused additions may include a Patient query service, dedicated Patient cursor, Patient projection types, and a route page context only if existing transport conventions justify it. No Prisma query belongs in a React component. No ordinary feed/detail fetch Server Action or public REST/API route is needed. Future mobile/API transport is separate.

No transaction or row lock is required for ordinary reads. Do not cargo-cult mutation locking, SERIALIZABLE isolation, FOR UPDATE, or Hospital locks into this slice. Every content-producing statement must bind current persisted authorization in its own predicate. If a short transaction is proposed for empty-state classification, it must be justified without weakening the fresh statement-level revocation requirement; a snapshot from before a committed revocation must never authorize a later Content statement.

## 4. Routes and Personal navigation

The only Patient routes are:

- Feed: /app/personal/knowledge
- Current detail: /app/personal/knowledge/[contentId]

Do not add /app/knowledge, public article routes, a Hospital Work route for Patient use, an API endpoint, generic CMS routes, or Patient edit routes.

Add the dedicated navigation item ข่าวสารและความรู้ to the existing Personal navigation immediately after สุขภาพ and before นัดหมาย. Keep it distinct from Wellness journaling. Show it only as part of the existing Personal workspace projection for PATIENT actors. Do not run Hospital Owner checks, reuse Publisher navigation capability, or add it to Work navigation. Navigation is not authority; direct route access independently resolves and verifies current Patient SELF.

Personal query URLs are limited to:

- /app/personal/knowledge
- /app/personal/knowledge?category=FOOD
- /app/personal/knowledge?category=FOOD&cursor=<opaque>

The detail URL contains only the content UUID locator: /app/personal/knowledge/<contentId>. Do not put Patient IDs, PatientProfile IDs, relationship IDs, Hospital IDs/names, or article text in query parameters or fragments. The cursor is opaque and signed; it is not a snapshot or authorization grant.

## 5. Patient SELF authority and policy

Every feed page and detail read must freshly resolve the authenticated actor and verify persisted Patient SELF authority:

1. Authenticated session resolves to the current User.
2. User remains ACTIVE.
3. User.personId equals the exact authenticated ActorContext personId.
4. That exact User has the PATIENT UserRole.
5. That exact Person has the exact PatientProfile.
6. The PatientProfile has its own persisted PatientHospitalRelationship to the exact Hospital that owns each returned Content row.
7. That Hospital is ACTIVE.
8. Each returned HospitalContent belongs to that exact Hospital, is PUBLISHED, and has non-null firstPublishedAt and latestPublishedAt.

PatientHospitalRelationship has no status. Do not add, query, or describe relationship.status or an “active relationship.” Eligibility is established by the existence of the PatientProfile-to-Hospital row and ACTIVE Hospital.

Only the Patient’s own Person/Profile path grants the Patient scope. Do not derive authority from HOSPITAL, OWNER/MEMBER membership, OSM role or assignment, ADMIN, profession, Family/caregiver relationships, or Hospital hierarchy. A PATIENT who also has Work/Admin/OSM roles still reads exclusively through this actor’s own Patient SELF relationships.

Extend the existing hospital-content:read capability with explicit scope PATIENT_SELF_RELATIONSHIP, while retaining DIRECT_HOSPITAL_OWNER for Publisher reads. Keep hospital-content:manage Publisher-only. Do not create decorative duplicate capabilities. The capability string alone grants nothing; persisted scope remains authoritative. Policy unit tests must show a valid PATIENT SELF decision and deny capability-only, non-Patient role, OSM, ADMIN-only, Owner-only, Family/caregiver, and unrelated Work scope. Multi-role PATIENT+OWNER stays SELF-only for Patient routes.

## 6. Content-producing authorization predicate — mandatory

Do not authorize a Hospital first and issue a later unscoped Content query. Do not rely only on ActorContext, a PatientProfile ID loaded in an earlier statement, a previous relationship list, navigation state, or another page request.

Every Prisma/SQL statement that selects any HospitalContent row or HospitalContent projection—including feed rows, exact detail, and an existence query used to classify an empty state—must itself include the complete current persisted Patient SELF predicate. The exact detail adds id == parsed contentId to the same predicate. The category feed adds category == selected category to the same predicate.

Using the relation names currently in prisma/schema.prisma, the top-level HospitalContent predicate must be equivalent to:

~~~ts
{
  status: HospitalContentStatus.PUBLISHED,
  firstPublishedAt: { not: null },
  latestPublishedAt: { not: null },
  hospital: {
    is: {
      status: HospitalStatus.ACTIVE,
      patientRelationships: {
        some: {
          patientProfile: {
            is: {
              person: {
                is: {
                  id: actor.personId,
                  user: {
                    is: {
                      id: actor.userId,
                      personId: actor.personId,
                      status: UserStatus.ACTIVE,
                      roles: { some: { role: Role.PATIENT } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
~~~

This existential predicate binds each Content row’s owning Hospital to a Hospital reached through the current actor’s own persisted PatientProfile relationship. It naturally forms the explicit union of the Patient’s eligible Hospitals without widening to parent/child/network scope. Prisma syntax may be adapted to the generated client, but all listed conditions must remain in the Content-producing SQL statement.

If generated Prisma relation syntax cannot express this safely, use the smallest parameterized SQL statement that returns only the required projection and carries the same complete predicate. Do not fetch Content payload and authorize it afterward. Do not add broad locks.

### Empty result and authority loss

A zero-row page is not itself proof that the Patient remains authorized. After an empty content-producing page query, perform a fresh bounded persisted SELF check. It must revalidate exact ACTIVE User, exact User↔Person binding, PATIENT role, and exact PatientProfile. If that check fails, return the repository’s Forbidden/Unauthenticated outcome; never render a legitimate empty feed.

When the actor remains a valid Patient SELF actor, classify the empty result without exposing Hospital IDs/names:

1. No own relationship to an ACTIVE Hospital: state A.
2. At least one eligible ACTIVE Hospital but no current PUBLISHED content across all categories: state B.
3. A category is selected, and eligible PUBLISHED content exists in other categories but none in the selected category: state C.

The relationship eligibility check must be bounded and must not return Hospital identity for ineligible rows. For state C, any HospitalContent existence query must use the same complete top-level Patient authorization predicate and publication timestamp/status conditions, omitting only the category condition. Do not require a total count.

These are request-time live reads. If authority, relationship, or lifecycle changes during empty-state classification, later bounded statements may observe newer state; they must continue to fail closed and must not return a row without its own full authorization predicate.

For detail, a missing row may mean absent, foreign, DRAFT, ARCHIVED, withdrawn, suspended Hospital, removed relationship, or lost Patient SELF. If no Content row is returned, use a fresh bounded SELF check where needed to preserve the repository’s Forbidden-versus-NotFound behavior. Use the same safe unavailable presentation for hidden/foreign Content; never reveal which predicate failed or whether the ID exists.

## 7. Feed scope, lifecycle, query shape, and ordering

The feed is an explicit union across every Hospital for which the current Patient has an own persisted PatientHospitalRelationship and the Hospital is ACTIVE. It is not a global feed. Do not require choosing one Hospital. Do not add a Hospital filter. Each row independently proves that its owning Hospital belongs to the current Patient’s relationship scope.

The base feed predicate is:

- HospitalContent.status == PUBLISHED.
- firstPublishedAt is non-null.
- latestPublishedAt is non-null.
- The exact current Patient SELF/Hospital predicate in §6.

The one-category feed adds exactly category == selected machine value. The all-category feed omits category. Use the existing HospitalContent patient indexes prepared in 17I.2. No new search index or persistence is required.

Order globally across the union, not Hospital-by-Hospital concatenation:

1. firstPublishedAt DESC.
2. id DESC as a deterministic tie-break.

firstPublishedAt is the immutable first successful publication instant. Never order by latestPublishedAt, updatedAt, title, category, Hospital name/code, or republication time.

Only PUBLISHED rows are visible. DRAFT and ARCHIVED rows are never returned. A withdrawn item becomes DRAFT and disappears on the next authoritative request. An archived item disappears on the next authoritative request. A corrected/re-published item reappears at its original firstPublishedAt position.

The feed is a live view, not a snapshot/export:

- A new publication may appear ahead of an existing cursor.
- Relationship addition/removal changes eligible rows on later requests.
- Withdrawal/archive removes an item from later requests/pages.
- firstPublishedAt never changes after first publication.
- Republish updates latestPublishedAt but does not move the row.
- “โหลดรายการล่าสุด” returns to the unfiltered first page.

## 8. Patient projections

Do not return raw Prisma rows.

Feed item is exactly the minimal Patient display projection:

~~~ts
{
  id,
  hospital: { hospitalCode, name },
  title,
  category,
  latestPublishedAt
}
~~~

Do not return body in a feed item. Do not invent a summary, body excerpt, generated abstract, or truncated medical summary. Do not expose hospitalId, submissionNonce, status, firstPublishedAt as display metadata, updatedAt, createdAt, actor IDs, membership IDs, Patient IDs, audit fields, publisher/reviewer identity, or revision history.

Detail projection is:

~~~ts
{
  id,
  hospital: { hospitalCode, name },
  title,
  body,
  category,
  sourceText,
  latestPublishedAt
}
~~~

No raw Prisma record. Do not expose firstPublishedAt as a second Patient timestamp, updatedAt, createdAt, submissionNonce, Hospital hierarchy, audit, publisher identity, or revision metadata.

Hospital name and hospitalCode are visible on every feed card and detail page so multi-Hospital origin stays clear. The category label must reuse the existing Hospital Content category mapping. latestPublishedAt is displayed with the label เผยแพร่ล่าสุด in Asia/Bangkok. firstPublishedAt is ordering data only.

## 9. Category filter and GET navigation

Category is the only feed filter.

| Query state | Meaning |
| --- | --- |
| category parameter absent | Valid; all categories |
| category=NCD | NCD only |
| category=FOOD | FOOD only |
| category=EXERCISE | EXERCISE only |
| category=OTHER | OTHER only |

Thai labels are NCD, อาหาร, การออกกำลังกาย, and อื่น ๆ. Do not expose an ALL machine value; all categories is represented by omitting category. An absent category parameter is valid and never produces ValidationError.

Use a native GET form for category selection, pagination, reset, and “โหลดรายการล่าสุด”. The category form submits only category and deliberately drops cursor. Reset omits category and cursor, restarting page one. Do not preserve an old cursor after category change.

When category is present, exactly one value is required and it must be exactly NCD, FOOD, EXERCISE, or OTHER. Reject empty or malformed values, unknown values, duplicate category query parameters, array/multi-value input, duplicate cursor parameters, malformed cursor input, and unapproved filter parameters using the current safe ValidationError/route conventions. Only an absent category means all categories; never silently coerce an invalid present value to all. Do not echo the submitted cursor or invalid filter value in an error.

Do not add Hospital filter, search text, tags, pinning, sort choice, clinical priority, personalized ranking, or any additional query filter.

## 10. Bounded keyset pagination

Fixed page size is 25; query a lookahead of 26. Do not use offset pagination, unbounded accumulation, or a total count.

Continue in the same global order:

~~~text
firstPublishedAt < cursor.firstPublishedAt
OR
firstPublishedAt == cursor.firstPublishedAt AND id < cursor.id
~~~

Fetch 26 authorized rows, return at most the first 25, and emit a next cursor only when the lookahead proves another row exists. The cursor position contains only firstPublishedAt and id. latestPublishedAt and updatedAt are not continuation anchors.

An article withdrawn or archived between pages is filtered out by the next query. An article republished between pages keeps its position because firstPublishedAt is unchanged. Relationship changes are allowed between pages; the cursor does not freeze the Hospital set. Withdrawing or archiving the anchor, adding or removing a relationship, a Hospital becoming non-ACTIVE, new publications appearing before the cursor, and other changes to current feed rows do not invalidate a structurally valid, correctly signed cursor. The cursor is a position tuple, not a foreign key: do not load its anchor HospitalContent row to validate it, and do not reject it because the anchor is absent from the current visible result set. After cursor validation, apply its seek values directly in the next Content query together with the fresh current Patient SELF authorization predicate. New eligible rows are governed by the normal seek boundary; use the first-page restart to see current leading content. If the changed live scope yields zero rows, use the normal fresh authority and empty-result classification; do not report a cursor error.

## 11. Dedicated Patient cursor

Create a separate cursor module for Patient consumption. Do not reuse hcontentcur_v1_ Publisher cursor.

Close the exact prefix as hcontentpatientcur_v1_. Use server-only IDENTITY_HASH_SECRET with explicit Patient Content domain separation and HMAC-SHA256. Keep the existing maximum of 1,024 decoded payload bytes and 2,048 encoded characters.

Canonical JSON payload has only bounded position/filter metadata, in this exact key order:

~~~json
{"version":1,"category":null,"firstPublishedAt":"2026-10-05T03:00:00.000Z","id":"00000000-0000-4000-8000-000000000001"}
~~~

category is null for all categories or one HospitalContentCategory value. The timestamp is a valid canonical UTC ISO instant with millisecond precision. UUID is canonical lowercase. Do not add unknown JSON keys or include Hospital relationship sets/names/IDs, article title/body/source, Patient name, Patient ID, or other medical data in the payload.

HMAC context must bind all of:

- Patient Content cursor domain and version.
- Actor userId and personId.
- Exact current PatientProfile identity, freshly resolved from persisted Patient SELF.
- Selected category (including the all-categories null scope).
- Page size 25.
- firstPublishedAt-id-desc order.
- All-current-own-ACTIVE-Hospitals union semantics.

The same scope/filter must be checked against the request while decoding. A valid signed cursor is never authorization; every page request resolves fresh persisted Patient SELF and the content query carries its own predicate. Cursor validation is limited to its bounded structure, signature, and request scope and must not load or require existence/visibility of the HospitalContent row identified by firstPublishedAt + id. The decoded position values go directly into the current authorized query's seek predicate. Changes to the anchor row's publication lifecycle, current Hospital visibility, own relationship set, or rows before the cursor do not invalidate the cursor and do not turn this live view into a snapshot.

Strictly reject oversized input, wrong prefix/version, malformed segment count, noncanonical base64url, wrong signature length, invalid MAC, invalid timestamp/UUID/category, duplicate or unknown JSON keys, noncanonical/reordered JSON bytes, wrong actor, wrong person, wrong PatientProfile, category mismatch, page-size/order/scope mismatch, or any malformed cursor. Compare fixed-length MACs with timingSafeEqual. All cursor failures are bounded safe ValidationError outcomes.

Cursor binding does not bind a frozen relationship list. A legitimate relationship change can change rows on a later page; restarting at page one is the way to see current leading content.

## 12. Publication time and rendering

latestPublishedAt is an absolute persisted instant from the most recent successful publish/republication. Display it using deterministic Thai locale/timezone formatting equivalent to:

~~~ts
new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok"
})
~~~

Place the value after เผยแพร่ล่าสุด. Never persist localized strings. Never show firstPublishedAt, updatedAt, or createdAt to the Patient.

Render body and sourceText as escaped plain text. Preserve body LF using normal whitespace-preserving text layout; wrap long Thai and long URL-looking text. Do not use dangerouslySetInnerHTML, Markdown renderers, or HTML interpretation.

sourceText is optional. If present, show it as plain text under the content; do not create an anchor, open an external tab, fetch metadata, validate reputation, or mark it verified.

Show this informational trust copy:

- ข่าวสารและความรู้นี้จัดทำโดยโรงพยาบาล
- โรงพยาบาลผู้เผยแพร่รับผิดชอบความถูกต้องของเนื้อหา

Keep Hospital identity visible. Do not claim DEMI verification, medical certification, government approval, or personalized medical advice. Do not add treatment recommendations, diagnosis, medication advice, or clinical recommendation badges.

## 13. Empty, unavailable, and authority states

Use distinct outcomes and truthful Thai copy:

| State | Exact safe presentation |
| --- | --- |
| A. Valid Patient SELF, but no own relationship to an ACTIVE Hospital | “ยังไม่มีโรงพยาบาลที่พร้อมแสดงข่าวสารและความรู้” |
| B. At least one eligible ACTIVE Hospital, but no current PUBLISHED content in any category | “ยังไม่มีข่าวสารและความรู้จากโรงพยาบาลที่เชื่อมโยงกับบัญชีของคุณ” |
| C. Selected category has no matches, while other eligible PUBLISHED content exists | “ยังไม่มีข่าวสารและความรู้ในหมวดหมู่นี้” with a “ดูทุกหมวดหมู่” GET reset |
| D. Database/infrastructure/load failure | Use the existing Personal error boundary, which shows “ยังไม่สามารถแสดงข้อมูลได้” with retry and Personal navigation. Never render an empty-feed message. |
| E. Session or persisted Patient SELF authority is invalid | Do not render any empty state. Follow current protected-page outcomes: unauthenticated redirects to /login; application access denied/Forbidden follows the existing safe /app outcome. |

For an inaccessible, missing, foreign, DRAFT, ARCHIVED, withdrawn, suspended-Hospital, or relationship-removed detail locator, use the existing Personal not-found presentation: “ระบบไม่สามารถแสดงข้อมูลรายการนี้ได้”; “ข้อมูลอาจไม่มีอยู่ หรือไม่พร้อมแสดงในพื้นที่ส่วนตัวของคุณ”. Do not reveal whether the UUID exists or which protected predicate failed.

An invalid category/cursor is a bounded ValidationError handled through the current safe route convention with a first-page reload option. Do not echo protected values. Infrastructure/Prisma details stay server-side and article body/source text must not be copied into errors or logs.

## 14. Detail and lifecycle races

The feed is a request-time live view:

- A row that is PUBLISHED and authorized at the content-producing statement may appear in that response.
- A withdrawal/archive committed after that statement cannot recall bytes already rendered.
- The next authoritative request must hide it.

Opening a feed item always performs a new exact detail query. Never reuse the feed item as detail authority. If withdrawn to DRAFT, archived, foreign, removed from the Patient’s current Hospital relationship scope, or owned by a now non-ACTIVE Hospital before detail query, return the same safe unavailable/not-found outcome. Do not show a historical/stale article or fall back to list payload.

## 15. Request-time, caching, browser history, and BFCache

Hospital Content is relationship-scoped private application data.

- Feed and detail pages are request-time Server Component routes. Follow current Next.js 16.3.0 page conventions, call await connection() before actor/query work, and await params/searchParams as required by the current route signature.
- Resolve the authenticated actor for each request and recheck persisted Patient SELF on every feed page and detail read.
- Do not use use-cache, use-cache: private, unstable_cache, a shared React cache, fetch cache, module-level result map, ISR, or any shared Patient DTO/result cache.
- Do not persist article payload in localStorage, sessionStorage, IndexedDB, service-worker storage, URL state, or recovery markers.
- URL may contain only category, opaque cursor, and the detail content UUID locator.
- Protected Next Link destinations must set prefetch={false}. This is required because the installed Next.js Link API prefetches route data in production by default unless disabled. Native GET forms remain preferred for filter/page/reset.
- Prefetch disabling does not replace fresh route authorization or browser-history handling.
- The default read-only Server Component view has no client-held state, so it needs no account render key. If a Client Component later retains a private DTO or state across account changes, use an opaque actor-scoped presentation key consistent with the existing Personal medication page and keep raw actor IDs out of rendered markup/URLs.

Implement a route-local private-view lifecycle that fits the existing Personal patterns; do not build a generic security framework:

1. On pagehide, invalidate any in-memory response/render generation and clear any client-held Patient projection.
2. On a persisted pageshow/BFCache restore, do not trust or continue navigating from the restored projection. Force a fresh authoritative request before enabling the view; follow the existing Wellness full-reload pattern or an equally strong route-local implementation.
3. Browser Back/Forward into a protected feed/detail view must likewise cause a fresh authoritative request before the restored page is trusted. If client-side route caching is used, gate/hide the restored DTO while a route-local refresh is pending; do not allow a delayed response from a prior account/generation to repopulate another context.
4. Logout, account change, PATIENT role removal, profile loss, relationship removal, or Hospital suspension must fail closed on the next protected request. Clear client-held data on known account/session transitions. No stale response can grant continued authority.

Previously rendered bytes cannot be cryptographically recalled from browser memory. The guarantee is that a fresh protected request after authority loss fails closed. Code-level lifecycle checks do not constitute browser/mobile/BFCache certification.

## 16. Errors and privacy outcomes

| Condition | Application outcome |
| --- | --- |
| Category parameter absent | Valid request for all categories; no ValidationError |
| Present category is empty, malformed, unknown, duplicated, or multi-value/array input | Safe ValidationError; bounded error state and restart at first page |
| Cursor is malformed, oversized, noncanonical, tampered, or bound to a different actor/profile/filter/page-size/order/domain scope | Safe ValidationError; bounded error state and restart at first page |
| Structurally valid cursor after anchor withdrawal/archive, relationship/Hospital change, or live-feed row changes | Still valid; apply its position tuple to the fresh authorized live-view query |
| Invalid content UUID | NotFound |
| Missing, foreign, DRAFT, ARCHIVED, withdrawn, suspended-Hospital, or no-longer-related detail | Same safe NotFound/unavailable outcome |
| Missing session | Existing Unauthenticated outcome and login redirect |
| Persisted actor/Profile authority lost | Existing Forbidden outcome; never an empty feed |
| Prisma/database/network failure | Safe infrastructure/load error through the Personal error boundary |

Do not expose lifecycle status, foreign Hospital identity, whether content ID exists, relationship details, SQL/Prisma errors, stack traces, internal paths, or article text in an error. No Patient mutation means no Conflict outcome is needed.

## 17. Read-only behavior and audit

The Patient slice only reads. Do not add like, bookmark, acknowledge, mark-read, share-record, comment, feedback, save-for-later, subscribe, follow-Hospital, report, or dismiss behavior.

No read receipt, view counter, AuditEvent, or HospitalContent.updatedAt write:

- Feed read → no AuditEvent.
- Detail read → no AuditEvent.
- Category filter → no AuditEvent.
- Page continuation → no AuditEvent.

Existing Publisher mutation audits remain unchanged.

## 18. Future verification contract

These are required implementation checks, not results of this documentation task.

### Unit tests

- Patient policy: the explicit PATIENT actor + Patient scope/capability input is the only policy allow; capability-only does not allow; HOSPITAL Owner without Patient SELF, OSM, ADMIN-only, Family/caregiver, and non-Patient Work actors deny; PATIENT+OWNER remains SELF-only. Persisted ACTIVE User/Profile/relationship/Hospital facts are proved by real PostgreSQL tests, not mocked into the pure policy test.
- Category parsing: absent is valid and means all; when present exactly one value must be NCD/FOOD/EXERCISE/OTHER; empty, unknown, malformed, duplicate, and array/multi-value inputs fail; changing category drops cursor.
- Cursor round trip for null and every category; actor, person, PatientProfile, domain, page-size/order, category, and all-current-own-Hospitals scope binding; tamper/MAC failure and wrong scope return ValidationError; malformed timestamp/UUID; unknown key; reordered/noncanonical JSON; noncanonical base64url; oversize; no relationship/Hospital/article text payload. Decoding does not require anchor-row existence.
- Projection: list excludes body/source/internal IDs/status/version; detail contains only approved current content; firstPublishedAt is not a display field; latestPublishedAt and Hospital attribution are present; no human author/reviewer.
- Presentation: category labels, Bangkok timestamp, escaped plain text, LF preservation, source not linked, safe copy, distinct empty/error states.

### Real disposable PostgreSQL integration tests

Use the repository’s real disposable PostgreSQL integration harness, not policy mocks as a substitute for query authorization.

- Authorization: exact ACTIVE User + PATIENT role + exact Person/User binding + PatientProfile succeeds; exact own PatientHospitalRelationship and ACTIVE Hospital succeeds; another Patient, missing profile, mismatched binding, suspended User, removed PATIENT role, ADMIN-only, HOSPITAL OWNER-only, MEMBER-only, OSM-only, assigned OSM, and caregiver/family grant do not widen access.
- Multi-role/scope: PATIENT+Work reads only current own SELF Hospital relationships; one Hospital and multiple Hospitals work; foreign Hospital excluded; no parent/child inheritance or hierarchy/network expansion; removing a relationship or suspending a Hospital removes its Content on the next query. Assert the schema/query does not invent PatientHospitalRelationship status.
- Lifecycle: PUBLISHED visible; DRAFT/ARCHIVED hidden; withdraw to DRAFT disappears; republish becomes visible again; archive removes the row.
- Ordering: global cross-Hospital firstPublishedAt DESC, UUID id DESC tie-break; latestPublishedAt and updatedAt do not rank; republishing an old row does not promote it.
- Category: exact fixed values, all-category behavior, and no category filter ever widens Hospital scope.
- Pagination: fixed 25/fetch 26, multiple pages, equal timestamp tie behavior, and new items ahead of the cursor. After page 1, withdrawing or archiving the cursor anchor leaves the cursor valid; page 2 applies the saved seek tuple and returns currently eligible rows after that boundary without loading the anchor. Removing a relationship between pages leaves the cursor valid and excludes that Hospital's rows; adding a relationship leaves it valid and newly eligible rows follow normal live-view seek semantics. Tampered or wrong actor/person/Profile/filter/page-size/order/domain scope cursors return bounded ValidationError. These cases prove the feed is a live view, not a snapshot.
- Detail: own PUBLISHED succeeds; foreign, missing, DRAFT, ARCHIVED, withdrawn, suspended-Hospital, and relationship-removed cases have indistinguishable safe NotFound presentation.
- Empty results: valid SELF with no eligible Hospital is distinct from eligible Hospital with no PUBLISHED content and selected category with no matches; role/Profile authority loss is never classified as empty.
- Audit: feed/detail/filter/continuation produce no AuditEvent and do not update HospitalContent.updatedAt.
- Revocation barriers: use explicit PostgreSQL barriers proving PATIENT role removal, own relationship removal, and Hospital ACTIVE revocation committed before the Content-producing SQL statement yield no Content projection. Also prove actor User/profile loss is rechecked. Testing only a mocked policy is insufficient.

### UI/route tests

- Navigation: PATIENT sees Personal ข่าวสารและความรู้ after สุขภาพ; Work-only users do not gain Patient route authority; multi-role workspaces remain separated; direct routes authorize independently.
- Feed: no-relationship, no-content, and empty-category states differ; load error is not empty; one/multiple Hospitals, attribution, categories, page continuation/reset/latest restart, long Thai title, no body excerpt, and latest publication time render correctly.
- Detail: title/body/LF/Hospital/category/latest time; absent/present optional source; source is not clickable; HTML is escaped; Markdown is not interpreted; long Thai and URL-looking text wrap; withdrawn/archived current detail is unavailable.
- Mobile/accessibility: 320px and 375px without horizontal overflow; semantic heading hierarchy; accessible category control; keyboard/focus-visible; category/state not communicated by color alone; distinct loading/error/empty states; touch-friendly controls.

### Cache and BFCache code-level checks

- Protected paths render at request time and have no shared result cache.
- Protected content links disable prefetch.
- Persisted pageshow and protected browser-history restoration request fresh authority before the view is trusted.
- pagehide/account/session invalidation clears client-held projections.
- Delayed stale responses cannot restore another actor/account context.
- Logout/account change cannot continue to treat old content as authorized.

These automated checks do not certify a real browser BFCache implementation or mobile device.

## 19. Manual UAT boundary

Manual browser/mobile/device UAT remains future evidence and is NOT EXECUTED by this contract. After runtime implementation, verify at minimum:

- 320px and 375px mobile widths; Android Chrome; desktop Chrome and Edge.
- Browser Back/Forward and BFCache restore.
- Logout then Back; account change; Patient role removal.
- Relationship removal in another session followed by Back/refresh.
- Hospital suspension in another session.
- Withdrawal while the feed is open; archive while detail is open; republish after correction.
- Patient related to multiple Hospitals; one combined global chronology; category change and pagination.
- Long Thai title/body and long URL-looking source text.
- Keyboard operation, visible focus, and accessible control/state announcements.

Do not claim manual UAT, browser certification, or production acceptance from unit/integration tests.

## 20. Phase boundary and next step

After the eventual 17I.3 runtime implementation, the next technical step is:

**Phase 17I.4A — Hospital Knowledge / Contact integrated re-audit and UAT readiness.**

17I.4A must re-audit at minimum 17I.1 Contact, 17I.2 Publisher, 17I.3 Patient Consumption, cross-role isolation, migrations/indexes, publication lifecycle, content privacy/cache/BFCache, mobile/accessibility, and manual-UAT readiness.

Do not implement 17I.4A in the 17I.3 implementation task. Do not declare whole Phase 17I complete automatically after 17I.3. Production migration/deployment and manual UAT remain separate evidence gates.

## 21. Final status

| Item | Current disposition |
| --- | --- |
| Phase 17I.0 | CLOSED / OWNER DECISIONS CLOSED |
| Phase 17I.0B | CLOSED / DOCUMENTATION CONTRACT COMPLETE |
| Q84–Q111 | CLOSED / OWNER APPROVED |
| CONTENT-02 | IMPLEMENTED |
| Phase 17I.1 | IMPLEMENTED / CLOSED |
| CONTENT-01 | IMPLEMENTED PUBLISHER / 17I.3 CLEARED FOR PATIENT CONSUMPTION IMPLEMENTATION |
| Phase 17I.2 | IMPLEMENTED / CLOSED |
| Phase 17I.3 | CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED |
| Phase 17I.4A | PLANNED / NOT STARTED |
| Whole Phase 17I | NOT COMPLETE |

Phase 17H.4A automated PASS / separate manual UAT, 17G.4A, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02, and 17J notification delivery/system authority are unchanged.

## 22. Documentation-only validation boundary

This task changes documentation only. No unit/integration tests, Prisma generate/validate, migrations, build, or dev server were run.

Initial contract authoring validation was completed at db1c086:

- The original final diff covered the contract, docs/CONTEXT.md, and docs/phases/PHASE_17_UAT_BACKLOG.md; the Q84–Q111 closeout was not modified in that task. No runtime, test, Prisma schema, migration, route, navigation source, or configuration file changed.
- git diff --check passed; 188 local Markdown file targets and heading anchors across those three touched documents were verified.
- Those touched Markdown files strictly decoded as UTF-8. The new contract had no BOM. No U+FFFD or detected mojibake was found. Existing Thai decision text was not rewritten; the new Thai UI copy was visually reviewed.
- Route topology, navigation placement, multi-Hospital own-relationship union, query-bound persisted authorization, lifecycle visibility, projection, category/order/cursor, cache/BFCache, no-read-audit, and Phase 17I.4A boundaries were checked against the original requested contract.

Final documentation review correction validation (2026-10-05):

- Complete correction diff reviewed: only this contract and docs/phases/PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md changed. No runtime, test, Prisma schema, migration, route, navigation source, or configuration file changed.
- git diff --check passed; local Markdown links in the two corrected documents were verified; both files strictly decoded as UTF-8 with no U+FFFD or detected Thai mojibake.
- Category absence is valid and means all categories; only an invalid/duplicate/multi-value present category is a ValidationError. Cursor validation does not require anchor-row existence; lifecycle/relationship changes retain live-view cursor validity. The 17I.0B document has one current 17I.3 status addendum and labels the prior 17I.2 status addendum historical.
- Phase 17I.3 remains NOT IMPLEMENTED; Phase 17I.4A remains NOT STARTED. Runtime tests, Prisma commands, build, and dev server were not run, as required. Manual browser/mobile/device UAT and production migration/deployment remain NOT EXECUTED.
