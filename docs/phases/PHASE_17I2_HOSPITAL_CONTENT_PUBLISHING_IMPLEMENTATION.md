# Phase 17I.2 — Hospital Content Publishing Implementation

Date: 2026-10-05 (Asia/Bangkok). Repository: bait0ngxaxa/demi; branch: main. Starting HEAD: 0a5b1708b2c15856c5f1e293a8f6c26cff01533c.

## Disposition

**CONTENT-01 — IMPLEMENTED. Phase 17I.2 — IMPLEMENTED / CLOSED.** The implementation follows the binding [17I.2 technical contract](./PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION_CONTRACT.md) and [17I.0B owner closeout](./PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md). Q84–Q111 were not reopened. **Phase 17I.3 — PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED.** Whole Phase 17I is not complete.

Manual browser/mobile/device UAT was **NOT EXECUTED**. No production migration, deployment, or customer acceptance is claimed.

## Persistence and migration

Prisma now defines HospitalContentStatus (DRAFT, PUBLISHED, ARCHIVED), HospitalContentCategory (NCD, FOOD, EXERCISE, OTHER), Hospital.contents, and the dedicated HospitalContent model. The model contains only the approved identity, Hospital/nonce, title/body/category/source, lifecycle timestamps and created/updated timestamps. It has no author, reviewer, revision, media, global owner, or delete/restore fields.

The model fields are id, hospitalId, submissionNonce, title, body, category, sourceText, status, firstPublishedAt, latestPublishedAt, createdAt and updatedAt. CREATE and the existing-record services control immutable identity/Hospital/nonce and server-managed timestamps.

The forward-only additive migration is prisma/migrations/20261005120000_hospital_content_publishing/migration.sql. It adds:

- HospitalContent_hospital_nonce_key — UNIQUE (hospitalId, submissionNonce).
- HospitalContent_publication_pair_check — both publication timestamps null, or both nonnull with first no later than latest.
- HospitalContent_published_time_check — PUBLISHED requires both timestamps.
- HospitalContent_publisher_order_idx — (hospitalId, updatedAt DESC, id DESC).
- HospitalContent_patient_order_idx — (hospitalId, status, firstPublishedAt DESC, id DESC).
- HospitalContent_patient_category_order_idx — (hospitalId, status, category, firstPublishedAt DESC, id DESC).
- HospitalContent_hospitalId_fkey — Hospital FK with ON DELETE RESTRICT and ON UPDATE RESTRICT.

The migration has no backfill. A conditional PostgreSQL block revokes table privileges from anon, authenticated, and service_role when those roles exist. It does not add an RLS framework. scripts/seed-hospital-master.mjs is unchanged and creates no Content.

## Input and domain rules

src/modules/hospital-content/schemas/hospital-content-schemas.ts is the one strict schema/normalization path used by services and Server Actions. It bounds each unnormalized DTO to 131,072 UTF-8 bytes; rejects unknown/missing keys, wrong types, duplicate form entries, malformed UUID/date values, unpaired UTF-16 surrogates, C0 controls (except body CR/LF/TAB before normalization), DEL/C1, Cf, the contract's invisible-code-point ranges, and U+2028/U+2029. It does not Unicode-normalize Thai or truncate.

Titles trim whole-string edges, stay single-line, and allow at most 200 UTF-16 code units (raw cap 1,000). Bodies normalize CRLF/CR to LF and TAB to a space, trim only the whole value, retain internal whitespace/blank lines, and allow 20,000 normalized units (raw cap 24,000). Source is one nullable bounded string, blank becomes null, multiline input is rejected, and the limit is 1,000 normalized units (raw cap 2,000). Literal HTML and Markdown remain plain text.

Category labels are owned by the domain: NCD → NCD, FOOD → อาหาร, EXERCISE → การออกกำลังกาย, OTHER → อื่น ๆ.

## Policy and exact Hospital authority

The dedicated capabilities are hospital-content:read and hospital-content:manage, scoped to DIRECT_HOSPITAL_OWNER. Persisted authorization requires an ACTIVE User whose User↔Person binding matches the authenticated actor, a persisted HOSPITAL role, the exact direct ACTIVE OWNER membership, and the exact ACTIVE Hospital. Every page read and mutation rechecks persisted authority. ADMIN has no bypass; an ADMIN with a valid direct OWNER acts only through that membership. MEMBER, OSM/assigned OSM, PATIENT, parent/child hierarchy and Contact/governance capabilities grant no authority.

Pages and components use minimized projections; they do not query Prisma. Selector order is name, hospitalCode, id. Lists return all lifecycle states, at most 25 items plus a 26th lookahead, and never return body/source/nonce. Detail/current preview returns only the approved current record fields and canonical Hospital identity.

## Create identity, lifecycle and concurrency

CREATE accepts the exact complete DTO and explicitly writes DRAFT. A browser-generated UUID submissionNonce identifies one intended create. In a ReadCommitted transaction, parameterized INSERT … ON CONFLICT (hospitalId, submissionNonce) DO NOTHING RETURNING id creates one row and one hospital_content.created audit. A losing request selects the current exact row FOR SHARE in a later statement after the unique-key wait, then returns REPLAY without a write, version change, or audit, even when valid repeated fields differ or the current record was subsequently edited, published, withdrawn, or archived. Reconciliation is an exact-authorized Hospital+nonce read; ABSENT is not treated as proof that a concurrent request cannot still commit.

The lifecycle is DRAFT → DRAFT edit / PUBLISHED / ARCHIVED; PUBLISHED → DRAFT by withdraw or ARCHIVED; ARCHIVED is terminal. Direct PUBLISHED edits, DRAFT withdraw, repeated publish, and every ARCHIVED mutation conflict. There is no physical delete or restore path.

Existing mutations lock the exact Content row FOR UPDATE; expectedUpdatedAt is checked before lifecycle and equality. A fresh identical DRAFT edit is NOOP; stale equality conflicts. Successful state changes use max(serverNowMs, previousUpdatedAtMs + 1) for updatedAt; NOOP/REPLAY do not advance it.

Publication timestamps use the sampled authoritative server event time independently from updatedAt. First publish sets first/latest to that same instant. Republish preserves first and assigns latest the real event instant, including legal same-millisecond equality. A backward publication clock fails atomically; it is not clamped, synthesized, or retried. Withdraw and archive preserve publication history.

## Transactions, authority races and retries

Short Prisma interactive transactions use ReadCommitted. CREATE and existing mutations acquire authority locks in the approved order: actor User FOR SHARE → exact HOSPITAL UserRole FOR SHARE → exact Hospital FOR SHARE → exact actor/target HospitalMembership FOR SHARE. Existing-record mutation then locks only its exact HospitalContent row FOR UPDATE, rechecks authority and ownership, checks the expected version/lifecycle, writes, and audits before commit. There is no exclusive Hospital/content-wide lock.

Only confirmed rolled-back PostgreSQL 40P01 and Prisma P2034 conflicts retry, up to three total attempts with full jitter under 25 ms and 50 ms caps outside the transaction. Each retry uses the original nonce/version/payload and obtains fresh authority/locks. Validation, authorization, stale/lifecycle conflict, audit failure, publication clock regression, and ambiguous commit/response are not retried. Ambiguous results return UNCONFIRMED.

## Audit

Exactly one same-transaction audit is emitted for each successful state change: hospital_content.created, .updated, .published, .withdrawn, or .archived. resourceType is HospitalContent, resourceId is the immutable content id, and metadata is exactly { hospitalId }; the actor is resolved server-side. No article text, category, nonce, URL, payload hash, old values, or Hospital name is written to audit. NOOP, REPLAY, reads, validation, forbidden, conflict and rollback produce no success audit. A real PostgreSQL trigger test verifies audit failure rolls back every mutation type.

## Publisher cursor and routes

The dedicated publisher cursor uses prefix hcontentcur_v1_, canonical bounded JSON, HMAC-SHA256 with domain separation and existing IDENTITY_HASH_SECRET. Its signature binds actor userId/personId, exact Hospital, and the fixed updatedAt-id-desc:25:all-statuses:no-filter contract; decoding uses canonical base64url, strict schema checks and timingSafeEqual. Every page freshly authorizes. Keyset order is updatedAt DESC, id DESC, fetches 26 and returns 25. Current-record movement can move an edited row ahead of a continuation; the list has an explicit first-page restart.

Protected Work routes are:

- /app/hospitals/knowledge — publisher list.
- /app/hospitals/knowledge/new — complete create form.
- /app/hospitals/knowledge/[contentId] — current detail, DRAFT edit, preview and lifecycle actions.

The ข่าวสารและความรู้ item is inside the existing Work โรงพยาบาล group beside Hospital Contact. Visibility is projected from eligible direct ACTIVE Owners; every route independently authorizes. There is no /preview, /edit, Patient route, Personal knowledge navigation, Patient query/action, or Patient cursor.

## Publisher UX and recovery

The create form has required title/body/category and optional source, explicit category choice, local unsaved plain-text preview, and “บันทึกฉบับร่าง”; CREATE never publishes. It keeps article text in memory only. The session recovery marker stores only Hospital ID + nonce under an account-bound session key, never text; explicit retry reuses the same nonce. It is cleared on confirmed reconciliation/discard and the login landing page clears these domain markers after successful logout redirect. Confirmed CREATED opens detail. REPLAY explains that repeated submitted fields were not saved. UNCONFIRMED requires explicit reconciliation and never allocates another nonce.

DRAFT detail supports edit/save/NOOP/preview/publish/archive. Publish carries only content ID and expected version and is blocked while local edits are dirty. PUBLISHED is read-only with withdraw/archive. ARCHIVED is read-only and terminal. Preview labels lifecycle or unsaved local data, preserves body line breaks, and renders escaped plain text without HTML/Markdown parsing or clickable source text. Status and informational copy do not imply DEMI/medical/government verification.

Conflict retains local fields and presents a separately loaded authoritative record; there is no automatic overwrite, merge, force save, or resubmit. Existing UNCONFIRMED retains local fields and the original version for explicit reload. Dirty owned navigation/selection uses confirmation and supported beforeunload; response generations scope in-flight work. Access loss blocks actions and hides the persisted projection. The UI uses existing DEMI tokens/primitives, Thai labels, semantic controls, error associations, focus-first-invalid behavior, live announcements, wrapping and touch-sized controls.

## Verification

| Check | Result |
| --- | --- |
| Prisma client generation and npx prisma validate | PASS |
| Focused unit/domain/policy/cursor/transport/UI/navigation | PASS; 7 files / 70 tests before the final isolated create-view key change and added UI assertion |
| Final focused domain/schema/cursor/UI/login/recovery checks | PASS; 6 files / 50 tests after final changes |
| Real PostgreSQL tests/integration/hospital-content.integration.test.ts | PASS; 1 file / 16 tests after final REPLAY row-lock change |
| Empty disposable PostgreSQL | PASS; all 38 migrations applied, including 17I.2; plain PostgreSQL migration without provider roles succeeds |
| Populated migration | PASS; all 37 prior migrations, 78 seeded Hospitals and a real HospitalContact retained unchanged; migration 38 created no Content backfill |
| Conditional Data API grants | PASS; when test roles exist, the integration test verifies direct grants are absent; privileged server Prisma operations pass |
| Master seed regression | PASS; real Content and HospitalContact remain unchanged after rerunning the seed |
| npm run typecheck | PASS after final service and app changes |
| npm run lint | Full lint PASS before final isolated service change; targeted ESLint on final changed source/test files PASS afterward |
| npm run test | PASS; 234 files / 2,003 tests before the isolated create-view key change and added UI assertion |
| git diff --check and changed-file strict UTF-8/U+FFFD scan | PASS |
| Architecture check | NOT RUN; this repository has no architecture:check script |
| Browser-driven interaction / manual mobile-device UAT | NOT RUN |
| Production migration/deployment | NOT RUN |

The full unit suite ran before the isolated actor-scoped create-view key, final UI assertion, logout-marker cleanup and REPLAY row lock. The final focused 6-file/50-test run, 16-test PostgreSQL file, typecheck and targeted ESLint passed afterward; the full suite was not repeated for these bounded changes. UI tests verify rendered list/detail projections and escaped output, while transport tests exercise action boundaries. They are not browser interaction tests; no DOM/browser interaction test dependency is installed in this repository. No dev server or production build was started. Remaining pagination limitation is current-record movement across pages, documented in the UI; recovery on reload preserves attempt identity only, never article text.

## Final runtime review correction — 2026-10-05

This follow-up preserves the verification history above and records the bounded corrections requested after the initial implementation handoff:

- The publisher Hospital selector remains a Server Component and now uses a native GET form with an explicit “เปลี่ยนโรงพยาบาล” submit button. Its focused render test verifies the route, `hospitalId` field, selected Hospital, submit control, and that no cursor/hidden authority state is carried.
- Publisher list rows now come from a top-level `HospitalContent.findMany` whose own predicate checks ACTIVE User, exact person binding, HOSPITAL role, direct ACTIVE OWNER membership, and exact ACTIVE Hospital. If the result is empty, a fresh exact Hospital check prevents revoked authority from appearing as a valid empty list.
- Create reconciliation now queries `HospitalContent` directly with the same persisted authority predicate. A missing row is reported as ABSENT only after a fresh exact Hospital authorization check; authority loss fails closed.
- The PostgreSQL revocation-barrier regressions first reproduced both disclosures against the original nested-relation implementation, then passed after correction. Final focused PostgreSQL integration: **1 file / 18 tests PASS**. Hospital Content UI render test: **1 file / 4 tests PASS**. Typecheck and targeted ESLint PASS; `git diff --check` and strict UTF-8/Thai integrity checks PASS.
- The earlier “no production build” statement describes the initial implementation pass. After this Server/Client boundary correction, the required single `npm run build` completed **PASS** on Next.js 16.3.0, including TypeScript and route generation. No development server was started.
- Manual browser/mobile/device UAT remains **NOT EXECUTED**. Phase 17I.3 remains **PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED**.

## Final status

| Item | Disposition |
| --- | --- |
| Phase 17I.0 | CLOSED / OWNER DECISIONS CLOSED |
| Phase 17I.0B | CLOSED / DOCUMENTATION CONTRACT COMPLETE |
| Q84–Q111 | CLOSED / OWNER APPROVED |
| CONTENT-02 | IMPLEMENTED |
| Phase 17I.1 | IMPLEMENTED / CLOSED |
| CONTENT-01 | IMPLEMENTED |
| Phase 17I.2 | IMPLEMENTED / CLOSED |
| Phase 17I.3 | PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED |

Phase 17H.4A, 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02, and 17J notification delivery/system authority are unchanged.
