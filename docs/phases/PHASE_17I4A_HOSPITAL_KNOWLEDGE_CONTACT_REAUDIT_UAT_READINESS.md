# Phase 17I.4A — Hospital Knowledge / Contact Integrated Re-audit & UAT Readiness

Audit date: 2026-10-06 (Asia/Bangkok). Repository: `bait0ngxaxa/demi`.

## Disposition

**Phase 17I.4A — PASS / AUTOMATED RE-AUDIT COMPLETE.** No unresolved BLOCKER or MAJOR correctness, authorization, persistence, concurrency, or privacy defect was found. The only implementation addition is a focused PostgreSQL integration regression file; no runtime, Prisma schema, or migration change was needed.

**CONTENT-02 — IMPLEMENTED / AUTOMATED RE-AUDIT PASS.**
**CONTENT-01 — IMPLEMENTED / AUTOMATED RE-AUDIT PASS.**
**Phase 17I — IMPLEMENTED / AUTOMATED RE-AUDIT COMPLETE.**

Manual browser/mobile/device/BFCache UAT — **NOT EXECUTED / TRACK SEPARATELY.** Production deployment — **NOT EXECUTED.** This disposition is not customer acceptance, production certification, penetration-test certification, legal/privacy governance approval, or manual UAT PASS.

## 1. Baseline and HEAD

| Item | Value |
| --- | --- |
| Repository | `bait0ngxaxa/demi` |
| Branch | `main` |
| Expected starting HEAD | `81e48f8aba0fba5bfba001e2752fbe032e5e5dd7` |
| Reviewed HEAD | `81e48f8aba0fba5bfba001e2752fbe032e5e5dd7` |
| Initial worktree | Clean |
| Scope | Phase 17I.1 Contact, 17I.2 Content Publisher, 17I.3 Patient Content, and their integrated PostgreSQL behavior |

Q84–Q111 and the approved 17I.0 / 17I.0B decisions remain closed and unchanged. This audit did not reopen product behavior or start Phase 17J.

## 2. Authoritative source inventory

The audit treated the following as the accepted product and technical contract:

- `PRODUCT.md`, `DESIGN.md`, `docs/CONTEXT.md`, and `docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`.
- Accepted architecture decisions: `docs/adr/0001-person-and-user-identity.md`, `0002-role-capability-scope-authorization.md`, `0003-hospital-led-onboarding.md`, `0005-server-side-application-boundary.md`, `0006-transactional-business-operations.md`, `0007-client-transport-and-mobile-ready-architecture.md`, and `0008-workforce-provisioning-and-activation.md`.
- `docs/phases/PHASE_17_UAT_BACKLOG.md`, `docs/phases/PHASE_17I0_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_PACK.md`, and `docs/phases/PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md`.
- 17I.1: `docs/phases/PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION_CONTRACT.md` and `docs/phases/PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION.md`.
- 17I.2: `docs/phases/PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION_CONTRACT.md` and `docs/phases/PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION.md`.
- 17I.3: `docs/phases/PHASE_17I3_PATIENT_CONTENT_CONSUMPTION_IMPLEMENTATION_CONTRACT.md` and `docs/phases/PHASE_17I3_PATIENT_CONTENT_CONSUMPTION_IMPLEMENTATION.md`.
- Comparable automated readiness reports: `docs/phases/PHASE_17H4A_WELLNESS_REAUDIT_UAT_READINESS.md` and `docs/phases/PHASE_17G4A_MEDICATION_REAUDIT_UAT_READINESS.md`.

These contracts remained authoritative for direct ownership, Patient SELF scope, data separation, lifecycle, timestamps, audit minimization, and the manual-UAT boundary.

## 3. Source and runtime inventory

| Surface | Inspected implementation |
| --- | --- |
| Persistence | `prisma/schema.prisma`; `20261005100000_hospital_contact`; `20261005120000_hospital_content_publishing` |
| Master seed | `scripts/seed-hospital-master.mjs` |
| Contact domain | `src/modules/hospital-contact/{domain,schemas,policies,services,transport,types}` |
| Content Publisher domain | `src/modules/hospital-content/{domain,schemas,policies,services,transport,types}` |
| Patient SELF and actor resolution | `src/modules/auth`, `src/modules/patient-self`, `src/modules/hospital-content/services/hospital-content-patient-self.ts` |
| Audit and authority neighbors | `src/modules/audit`, `src/modules/hospital-governance`, `src/modules/workforce` |
| Owner routes | `app/app/hospitals/contact`, `app/app/hospitals/knowledge` |
| Patient routes | `app/app/personal`, `app/app/personal/knowledge` |
| Navigation | `src/components/app-shell` |
| Existing PostgreSQL evidence | `tests/integration/hospital-contact.integration.test.ts`, `hospital-content.integration.test.ts`, `hospital-content-patient.integration.test.ts` |
| Local test infrastructure | `scripts/integration.mjs`, `compose.integration.yaml`, `vitest.integration.config.mts`, and package scripts in `package.json` |

`npm` scripts contain no `architecture:check`; architecture boundaries were source-reviewed. No dev server or browser was started.

## 4. Audit matrix

| Area | Result | Evidence |
| --- | --- | --- |
| 17I owner decisions and scope | PASS | The accepted 17I.0B closeout and 17I.1–17I.3 contracts remain the binding behavior. |
| Contact Owner authorization | PASS | Direct active OWNER query and locked mutation recheck; Contact PostgreSQL authority and revocation tests. |
| Patient Contact scope | PASS | Persisted Patient SELF relationship query; missing/foreign relation and non-ACTIVE Hospital tests. |
| Publisher authorization | PASS | Exact direct active OWNER selector, list, detail, reconciliation, and mutation predicates; PostgreSQL denial and revocation-race tests. |
| Patient Content authorization | PASS | Every content-producing SELECT includes Patient SELF and active-Hospital predicates; Patient PostgreSQL suite. |
| Multi-role isolation | PASS | Dedicated 17I.4A A/B split test plus existing Patient+Owner navigation and persisted-role tests. |
| Hierarchy isolation | PASS | Parent/child owner and Patient relationships are tested in both directions across Contact and Content. |
| Cross-slice integration | PASS | New real-PostgreSQL file, 7 tests; Contact, Publisher, and Patient reads are exercised together. |
| Contact database invariants | PASS | Prisma + migration + actual catalog shape, UUID/FK/unique behavior, null/clear retention, and seed checks. |
| Content database invariants | PASS | Actual catalog enums, columns and timestamp precision; nonce/check/FK/index assertions in Content integration. |
| Migration integrity | PASS | Clean disposable PostgreSQL applied all 38 current migrations; populated 37→38 workflow passed. |
| Master seed separation | PASS | Seed rerun preserved a real Contact and PUBLISHED Content row and created/deleted neither. |
| Contact concurrency | PASS | Expected version precedes equality; Hospital singleton lock and real PostgreSQL conflict/authority races. |
| Content nonce/idempotency | PASS | Unique Hospital+nonce, create/replay, race winner, rollback winner, and no replay write/audit. |
| Content lifecycle | PASS | DRAFT/PUBLISHED/ARCHIVED transition tests, terminal archive, withdraw-before-edit, and no physical-delete application operation. |
| Publication chronology | PASS | First/latest publication event tests, same-ms republish, backward-clock rollback, and independent `updatedAt`. |
| Mutation audit | PASS | Exact Contact and Content actions/resource metadata, audit rollback tests, plus integrated domain-specific assertions. |
| Patient read/no-audit | PASS | Patient Content feed/detail do not mutate or audit; integrated count assertion remains unchanged across reads. |
| Publisher cursor | PASS | Bounded signed `hcontentcur_v1_` actor/Hospital/order scope and 25-row keyset tests. |
| Patient cursor/live view | PASS | Separate `hcontentpatientcur_v1_` binding, live-view anchor behavior, relationship changes, category scope, and no anchor lookup. |
| URL/log/privacy minimization | PASS | Source search and DTO/UI tests show only approved locators; no content/contact payload in logs, URLs, audit, or recovery storage. |
| Request/cache/BFCache code readiness | PASS | Request-time pages, fresh actor resolution, `prefetch={false}`, private boundary and lifecycle unit tests. Browser behavior remains untested. |
| Navigation/workspace separation | PASS | Work owner items and Personal Patient knowledge placement are unit-tested; routes independently authorize. |
| Mobile/accessibility code readiness | PASS | Semantic controls, labels, state/error announcements, focus styles, wrapping, and UI tests; no device or viewport UAT was run. |
| Manual browser/mobile/BFCache UAT | NOT EXECUTED | Separate checklist below; no manual PASS is claimed. |

## 5. Authorization matrix

| Operation | Persisted authority required | Re-audit result |
| --- | --- | --- |
| Contact eligible-Hospital list, owner read, update | ACTIVE User + HOSPITAL role + exact direct ACTIVE OWNER membership + exact ACTIVE Hospital | PASS. List/read queries are scoped to this actor and Hospital. Updates lock/recheck User, role, Hospital, and membership before reading/writing Contact. |
| Patient Contact list/read | ACTIVE User + PATIENT role + exact User↔Person + PatientProfile + own `PatientHospitalRelationship` + exact ACTIVE Hospital | PASS. The service selects only the Patient’s relationship. A non-ACTIVE Hospital returns `UNAVAILABLE` without Contact values. |
| Publisher selector/list/detail/reconciliation/create/edit/publish/withdraw/archive | ACTIVE User + HOSPITAL role + exact direct ACTIVE OWNER membership + exact ACTIVE Hospital | PASS. Page visibility is not authority; service reads and mutations recheck persisted authority. |
| Patient Content feed/continuation/category/detail | ACTIVE User + PATIENT role + exact User↔Person + current PatientProfile + own relationship + ACTIVE Hospital + PUBLISHED Content | PASS. The full persisted predicate is included in each Content SELECT and detail lookup. |

No ADMIN-only, MEMBER, OSM/assigned OSM, profession, Family/caregiver, parent, child, or network association grants Contact or Publisher authority. Patient access is SELF and relationship-bound. No relationship `status` field or inferred relationship status was introduced.

## 6. Cross-role and hierarchy matrix

| Actor / relationship | Work Contact / Publisher | Personal Patient Contact / Content | Evidence |
| --- | --- | --- | --- |
| PATIENT + OWNER of A, Patient relationship only to B | A only | B only; A is absent from Patient feed/detail | New 17I.4A multi-role PostgreSQL test. |
| PATIENT + OSM / assigned OSM | No Publisher/Contact authority from OSM assignment | SELF relationships only | Existing Publisher and Patient integration denial tests. |
| ADMIN only | No routine Contact/Publisher authority | No Patient access without PATIENT SELF | Existing Contact/Publisher role matrix tests. |
| ADMIN + valid OWNER | Exact direct OWNER scope only | Patient SELF only if independently eligible | Existing Contact and Publisher integration tests. |
| Parent Owner → child; child Owner → parent | No inherited authority | No relationship-based parent/child fallback | New cross-slice hierarchy test and existing per-slice tests. |
| Patient relationship to parent or child | Not applicable | Only the exact related Hospital’s Contact and PUBLISHED Content | New cross-slice hierarchy test. |

Navigation stays separated: Work exposes `ข้อมูลติดต่อโรงพยาบาล` and `ข่าวสารและความรู้` for eligible Owners. Personal Patient navigation places `ข่าวสารและความรู้` between `สุขภาพ` and `นัดหมาย`; Patient Contact remains in the existing Hospital relationship presentation.

## 7. Cross-slice integration matrix

| Case | Result | Regression evidence |
| --- | --- | --- |
| A — same Hospital, independent Contact and Content | PASS | Contact update leaves the Content row byte-for-byte equal; Content publish/archive leaves Contact values/version unchanged; audits stay on their own resource type with `{ hospitalId }` metadata. |
| B — Patient own relationship | PASS | Patient sees own Contact and PUBLISHED Content; DRAFT is absent and archived detail/feed is absent. |
| C — relationship removal | PASS | Patient Contact disappears and Patient Content feed/detail fail closed; direct Owner selector/read/list remains independently available. |
| D — Hospital suspension | PASS | Owner selector and mutations fail; Patient Contact is `UNAVAILABLE` without values and Patient Content is absent. |
| E — OWNER demotion | PASS | Contact and Publisher writes are denied after persisted membership demotion; Patient SELF Contact/Content remains available while its own Hospital relationship and Hospital status remain eligible. |
| F — PATIENT + OWNER | PASS | Work A functions remain scoped to A; Patient reads remain scoped to B; no union between the two authorities. |
| G — hierarchy | PASS | Both parent and child Owners, and Patients related to each, remain limited to the exact Hospital for both domains. |

The new file also asserts actual PostgreSQL catalog column/type/precision/enums/FK actions. It adds 7 targeted real-PostgreSQL tests without duplicating the existing slice suites.

## 8. Domain separation and persistence invariants

Hospital Master remains identity/hierarchy data. Its seed upserts Hospital name and parent only; it does not write Contact or Content. HospitalContact and HospitalContent remain separate relations and services with no derived values or shared CMS abstraction. Contact authority does not grant Content authority, and a Patient Contact DTO does not grant Patient Content authority.

| Domain | Re-audited persisted shape and behavior | Result |
| --- | --- | --- |
| HospitalContact | UUID `id`; unique UUID `hospitalId`; nullable `addressText VARCHAR(500)` and `phoneNumber VARCHAR(32)`; `createdAt`/`updatedAt TIMESTAMP(3)`; FK `ON DELETE RESTRICT ON UPDATE CASCADE`; no extra field/history/revision table. Zero row is legal; a cleared existing row remains. | PASS |
| HospitalContent | Exact status enum DRAFT/PUBLISHED/ARCHIVED; category enum NCD/FOOD/EXERCISE/OTHER; UUID identity/Hospital/nonce; title VARCHAR(200), body TEXT, nullable source VARCHAR(1000); `TIMESTAMPTZ(3)` lifecycle and record timestamps. | PASS |
| Content constraints | `HospitalContent_hospital_nonce_key`; publication-pair and published-time checks; publisher, patient, and category patient ordering indexes; restrictive Hospital FK. Historical DRAFT/ARCHIVED publication timestamps remain legal. | PASS |
| Deletion/backfill | Both migrations are additive and forward-only, create no canonical rows, and add no revision/media/search/pinning/soft-delete fields. No application physical-delete or archive-restore operation exists. | PASS |

The Content migration conditionally revokes direct table privileges from `anon`, `authenticated`, and `service_role` when those roles exist; it does not add RLS. The integration test creates those roles in disposable PostgreSQL and verifies SELECT/INSERT/UPDATE/DELETE are false after the block. Ordinary Prisma server access remains the application data path.

## 9. Input normalization, transactions, and concurrency

Contact DTOs require exactly all four keys, including nullable address and phone; raw combined contact values are capped at 16 KiB. Address normalization preserves line breaks, maps CRLF/CR to LF and TAB to U+0020, applies the approved trim/line rules, rejects prohibited characters and unpaired surrogates, and enforces 500 UTF-16 units. Phone rejects controls before trim, collapses U+0020 runs, accepts the contract’s letters/marks/decimal digits/punctuation, requires a Unicode decimal digit when non-null, and enforces 32 units. Values are never truncated or inferred as E.164.

Content requests use strict per-command keys and a bounded raw request budget. Titles are single-line and at most 200 normalized units; body maps CRLF/CR to LF and TAB to U+0020, retains interior line breaks, and is at most 20,000 units; blank source becomes null and source is single-line up to 1,000 units. Neither schema Unicode-normalizes Thai, truncates, nor interprets HTML/Markdown.

Contact checks `expectedUpdatedAt` before equality/NOOP. Absence and existing-row cases remain distinct, stale equality conflicts, and successful existing writes advance monotonically. A short ReadCommitted transaction locks the exact Hospital `FOR UPDATE` between authority locks, serializing the singleton without locking unrelated Hospitals. Mutation and minimized audit commit atomically.

Publisher uses short ReadCommitted transactions, locks and rechecks User/role/Hospital/membership authority, then locks only the exact Content row `FOR UPDATE`. Independent Content rows do not take an exclusive Hospital/content-wide lock. `P2034` and confirmed `40P01` alone receive bounded retries; stale, forbidden, lifecycle, audit, publication-clock, and ambiguous outcomes are not retried. Existing-record `updatedAt` advances monotonically even within one millisecond.

CREATE uses unique `(hospitalId, submissionNonce)` and `INSERT ... ON CONFLICT DO NOTHING`, followed by a current-row `FOR SHARE` replay read. A same-nonce retry returns the current row without mutation or second audit, regardless of repeated payload; concurrent and rolled-back winner cases are covered. There is no upsert-update, payload hash, automatic nonce replacement, or generic idempotency layer.

## 10. Lifecycle and publication chronology

| Contract point | Result |
| --- | --- |
| CREATE starts DRAFT; DRAFT edit/publish/archive | PASS |
| PUBLISHED is field-read-only; withdraw to DRAFT before correction; archive is allowed | PASS |
| ARCHIVED is terminal; no restore or physical-delete route | PASS |
| Stale identical edit conflicts before equality; NOOP/REPLAY emit no success audit | PASS |
| `firstPublishedAt` is first successful publication and Patient feed order | PASS |
| `latestPublishedAt` is latest real publish/republication event and displayed time | PASS |
| `updatedAt` is an independent mutation/concurrency version | PASS |
| Same-millisecond republish is legal; backward publication clock fails atomically without synthesizing +1 ms | PASS |
| Republish does not promote an old article in the Patient feed; archive/withdraw removes it on the next authoritative read | PASS |

## 11. Patient query scope, projections, and cursors

`hospitalContentPatientWhere` embeds PUBLISHED, non-null publication times, ACTIVE Hospital, the current `patientProfileId`, and the exact User↔Person ACTIVE PATIENT predicate through the Patient’s own Hospital relationship. Feed, detail, and supplemental existence reads all use that predicate. The SELF resolver performs a top-level Profile lookup, a separate relationship-eligibility query that re-proves SELF and ACTIVE Hospital, and a final SELF recheck when no eligible relationship exists. It does not rely on an earlier profile result or nested-relation TOCTOU.

The feed is one global union across all own ACTIVE Hospitals ordered by `firstPublishedAt DESC, id DESC`; only category can filter it. List DTOs omit body, source, internal Hospital ID, first publication time, `updatedAt`, and Patient identifiers. Detail returns only current authorized PUBLISHED content. The continuation is a live-view position and does not query for anchor existence; relationship removal/addition and Hospital suspension do not invalidate its signature by themselves.

Publisher uses a separate bounded signed canonical HMAC cursor (`hcontentcur_v1_`) scoped to actor, Hospital, order, page size, and lifecycle set. Patient uses `hcontentpatientcur_v1_`, bound to actor, current Profile, category/all, page size, and feed order. Neither cursor carries Content payload or grants authority; cross-domain/tamper/scope rejection is tested.

## 12. Audit, URL, log, and private-data review

Contact emits only `hospital_contact.created` and `.updated` for changed rows, with `resourceType=HospitalContact`, immutable Contact ID, and `{ hospitalId }`. Content emits only the five approved create/update/publish/withdraw/archive actions with `resourceType=HospitalContent`, Content ID, and exactly `{ hospitalId }`. No values, title/body/source, old values, nonce, hash, Hospital name, or Patient data enter audit metadata. Audit failure rolls back the mutation. NOOP, REPLAY, read, conflict, forbidden, validation, reconciliation, and rolled-back retry emit no success audit. Patient reads make no durable read audit or Patient write.

Source search and projection tests found no Contact/Content payload in `console.*`, logger calls, thrown client errors, URLs, cursor payloads, `localStorage`, IndexedDB, or analytics. Approved locators remain Publisher `hospitalId`, Content UUID, Patient category, and opaque cursor. Patient IDs/Profile/relationship IDs are absent from Patient Content URLs. Create recovery stores only Hospital ID and submission nonce in account-bound `sessionStorage`; article text stays in memory.

## 13. Request-time, cache, BFCache, and Personal Contact placement

Installed Next.js 16.3 documentation at `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md` states that `connection()` waits for a real request before rendering continues. Contact, Work Knowledge, Personal Knowledge feed/detail, and Personal home routes call it before their protected reads. Patient Content routes resolve a fresh actor and page context, define no `use cache`/`unstable_cache` or shared DTO cache, and use links with `prefetch={false}` plus an authoritative document navigation.

The route-local Patient Content boundary removes private children and disables the DOM on `pagehide`; restored/history/visible lifecycle events force reload; a bounded request-generation retirement guard prevents an old generation from being trusted. These are code-level safeguards only. No real browser Back/Forward or BFCache behavior is claimed.

Patient Contact remains inside the approved relationship presentation. Personal home is request-time and obtains Contact through a second fresh persisted SELF query, then joins only by the returned relationship ID. If the relationship is removed before that query, no Contact value joins. This does not claim that an already-started response or a browser-restored page is instantly erased after a later revocation; actual browser/session behavior remains manual UAT.

## 14. UI and accessibility code readiness

The inspected Work and Personal components use semantic headings/sections, associated field labels, `aria-invalid`/`aria-describedby`, live messages for mutation/recovery states, visible focus rings, and 44px-or-larger relevant controls. Status/error/empty/loading states use text as well as style. Thai address/body retains line breaks; long values use wrapping, and long source-like text uses `break-all` where it is previewed. React renders Content/source as plain text; tests verify script/Markdown-looking samples are not interpreted and source is not autolinked. No `dangerouslySetInnerHTML` or Markdown renderer is used by these slices.

The Impeccable detector ran once over the Contact, Publisher, Patient Knowledge, Personal Contact presentation, and Personal home targets and returned `[]`. UI code-level readiness is PASS. No viewport, keyboard, physical mobile, Android Chrome, desktop Chrome/Edge, or visual-device PASS is claimed.

## 15. Automated verification evidence

All database commands below used the repository’s tracked `.env.integration` target, `demi_test` at `127.0.0.1:55432`, with no ambient database URL override and `NODE_ENV` not set to production.

### Focused unit/UI

`npm test -- <focused 17I paths>` — **29 files / 302 tests PASS**. Files:

- Contact: `src/modules/hospital-contact/domain/hospital-contact-mutation.test.ts`, `policies/hospital-contact-policy.test.ts`, `schemas/hospital-contact-schemas.test.ts`, `services/hospital-contact-service.test.ts`, `transport/server-actions.test.ts`, `transport/hospital-contact-page-context.test.ts`.
- Contact UI/Personal: `app/app/hospitals/contact/page.test.tsx`, `hospital-contact-workspace.test.tsx`, `hospital-contact-workspace-interactions.test.tsx`, `hospital-contact-page-scope.test.tsx`, `app/app/personal/patient-hospital-contact-card.test.tsx`, `personal-pages.test.ts`.
- Content/Patient domain: `src/modules/hospital-content/domain/hospital-content-mutation.test.ts`, `policies/hospital-content-policy.test.ts`, `schemas/hospital-content-schemas.test.ts`, `schemas/hospital-content-patient-schemas.test.ts`, `services/hospital-content-cursor.test.ts`, `services/hospital-content-patient-cursor.test.ts`, `services/hospital-content-patient-self.test.ts`, `services/hospital-content-patient-query-service.test.ts`, `transport/server-actions.test.ts`, `transport/create-recovery-storage.test.ts`.
- Content/Patient UI: `app/app/hospitals/knowledge/hospital-content-ui.test.tsx`, `app/app/personal/knowledge/page.test.tsx`, `patient-content-views.test.tsx`, `patient-content-private-boundary.test.tsx`.
- Workspace/navigation: `src/components/app-shell/application-navigation.test.ts`, `application-workspace.test.ts`, `navigation-list.test.tsx`.

No standalone `hospital-content-service.test.ts` exists; Publisher service behavior is covered by its real PostgreSQL integration suite.

### Focused real PostgreSQL

| File / command | Result |
| --- | --- |
| `tests/integration/hospital-contact.integration.test.ts` via `npm run test:integration:focused -- tests/integration/hospital-contact.integration.test.ts` | 1 file / 25 tests PASS |
| `tests/integration/hospital-content.integration.test.ts` via `npm run test:integration:focused -- tests/integration/hospital-content.integration.test.ts` | 1 file / 18 tests PASS |
| `tests/integration/hospital-content-patient.integration.test.ts` via `npm run test:integration:focused -- tests/integration/hospital-content-patient.integration.test.ts` | 1 file / 50 tests PASS |
| `tests/integration/hospital-knowledge-contact-reaudit.integration.test.ts` via `npm run test:integration:focused -- tests/integration/hospital-knowledge-contact-reaudit.integration.test.ts` | 1 file / 7 tests PASS |

Focused PostgreSQL total: **4 files / 100 tests PASS**. The focused run applied the current 38 migrations from an empty disposable database.

### Populated migration and one broad pass each

| Check | Result |
| --- | --- |
| `npm run test:db:migrate:populated` | PASS once. Applied 37 migrations, seeded 78 Hospitals, persisted a real HospitalContact, applied migration 38 (`20261005120000_hospital_content_publishing`), and confirmed Hospital/Contact unchanged with no Content backfill. |
| `npm test` | PASS once: **243 files / 2,087 tests**. |
| `node scripts/integration.mjs verify` | PASS once: clean disposable database, **38 migrations**, **35 files / 547 tests**. Container, volume, and network cleanup completed. A following `db:status` returned no running container. |

### Schema, type, lint, UI detector, and build boundary

| Check | Result |
| --- | --- |
| `npm run prisma:generate` | PASS (Prisma Client 6.19.3). |
| `npx prisma validate` | PASS. |
| `npm run typecheck` | PASS after narrowing the new integration assertions by Contact availability. |
| `npm run lint` | PASS. |
| `impeccable.cmd detect --json` on the scoped UI targets | PASS; returned `[]`. |
| `npm run build` | NOT RERUN. This audit changed only tests and documentation; the latest 17I.3 runtime build evidence remains applicable. |
| `npm run dev` / browser UAT | NOT RUN, as scoped. |

The initial typecheck exposed a missing discriminant narrowing in the new test; it was corrected, then the focused PostgreSQL test and typecheck passed. The first post-populated seed regression targeted KANG, which the populated workflow had already given a Contact row; the fixture was changed to seeded KHON, the focused test passed, and the later full clean PostgreSQL suite passed. Neither issue was a product/runtime defect.

## 16. Findings and residual limitations

| Severity | Count | Finding |
| --- | ---: | --- |
| BLOCKER | 0 | None unresolved. |
| MAJOR | 0 | None unresolved. |
| MINOR | 0 | No bounded code-level UX/accessibility defect remained after source review and detector scan. |
| INFO | 3 | Manual browser/mobile/device/BFCache behavior remains untested; production/provider deployment configuration was not inspected; the local role simulation does not certify live provider-role inheritance/default privileges. |

No implementation change was justified. Local integration evidence is not production certification. Real-browser stale-page erasure, device layout/keyboard behavior, deployed PostgreSQL provider grants, operational credentials, and legal/privacy approvals remain outside this automated re-audit.

## 17. Manual UAT readiness checklist — all NOT EXECUTED

Use representative synthetic accounts and record outcomes separately. Every item below is pending; none is marked PASS.

**Contact Owner:** 0/1/multiple owned Hospitals; switch Hospital; Thai address and phone; clear one or both values; validation and first-invalid focus; stale-version conflict; OWNER removal in another session; Hospital suspension; 320/375px widths; keyboard navigation and focus.

**Patient Contact:** own Hospital Contact; empty Contact; relationship removal in another session; Hospital suspension; long Thai address/phone; confirm no parent/Master fallback.

**Publisher:** create DRAFT; validation; multi-Hospital selector; duplicate/retry CREATE; REPLAY messaging; edit DRAFT; publish; withdraw; correction; republish; archive; stale conflict; UNCONFIRMED recovery; dirty-form navigation; long Thai body/source; mobile keyboard and focus.

**Patient Content:** no relationship; no published content; empty category; multiple Hospitals; global own-scope chronology; category filter; pagination; withdrawn item after feed open; archived detail; republished chronology; plain-text source; long Thai and URL-looking source; Back/Forward; BFCache; logout then Back; PATIENT role removal in another session; relationship removal in another session; Hospital suspension; Android Chrome; desktop Chrome/Edge; 320/375px widths; keyboard/focus.

**Multi-role:** PATIENT + OWNER; PATIENT + OSM; ADMIN + OWNER. Confirm Personal SELF and Work direct-owner scope remain independent.

## 18. Final disposition

**Phase 17I.4A — PASS / AUTOMATED RE-AUDIT COMPLETE.**
**CONTENT-02 — IMPLEMENTED / AUTOMATED RE-AUDIT PASS.**
**CONTENT-01 — IMPLEMENTED / AUTOMATED RE-AUDIT PASS.**
**Phase 17I — IMPLEMENTED / AUTOMATED RE-AUDIT COMPLETE.**

Manual browser/mobile/device/BFCache UAT — **NOT EXECUTED / TRACK SEPARATELY.**
Production deployment — **NOT EXECUTED.**
Phase 17J — **NOT STARTED.**
