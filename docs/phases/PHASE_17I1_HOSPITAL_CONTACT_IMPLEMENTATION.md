# Phase 17I.1 — Hospital Contact Implementation Handoff

Date: 2026-10-05 (Asia/Bangkok). Repository: `bait0ngxaxa/demi`, branch `main`. Starting HEAD: `182173cbb4125d5afcfce3ef1e41c2c38c95322f`.

## Disposition

**Phase 17I.1 — IMPLEMENTED / CLOSED. CONTENT-02 — IMPLEMENTED.** The runtime follows the binding [17I.1 technical contract](./PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION_CONTRACT.md) and the [17I.0B owner closeout](./PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md). Q84–Q111 remain CLOSED / OWNER APPROVED. This implementation does not clear or implement 17I.2 or 17I.3.

## Runtime delivered

Prisma now models `HospitalContact` as an optional one-to-one relation from `Hospital`. The model has a UUID primary key, unique required `hospitalId`, nullable `addressText VARCHAR(500)` and `phoneNumber VARCHAR(32)`, `createdAt TIMESTAMP(3)`, and `updatedAt TIMESTAMP(3)`. Its Hospital foreign key uses `ON DELETE RESTRICT ON UPDATE CASCADE`. No contact history, hierarchy, verification, editor, or generic settings fields were added.

Forward-only migration: `prisma/migrations/20261005100000_hospital_contact/migration.sql`. It creates only the table, unique index, and foreign key; it contains no backfill. Existing Hospitals remain valid and have no Contact row until a first non-empty desired state is saved. Clearing a materialized Contact retains its row and version.

The bounded module is `src/modules/hospital-contact/`: strict schemas and normalization, dedicated policy, mutation decision logic, minimized projection types, application services, server actions/page context, and focused tests. New UI is the Owner Work page at `/app/hospitals/contact`, route-level loading/error states, and a Contact section on the existing `/app/personal` Hospital relationship cards. Work navigation is projected only for a direct ACTIVE OWNER of an ACTIVE Hospital. The Patient profile subpage and top-level Personal navigation were not expanded.

## Authorization and projections

The dedicated capabilities are `hospital-contact:read` and `hospital-contact:update`. Direct Owner scope permits directory/read/update only after persisted ACTIVE User, persisted HOSPITAL role, exact direct ACTIVE OWNER membership, and exact ACTIVE Hospital predicates. The mutation repeats those checks while locking the authority rows. Parent/child relationships, MEMBER, OSM, Patient, and ADMIN-only status grant no editor access; an ADMIN with a legitimate direct Owner membership acts only through that Owner authority.

Patient reads require the persisted active User, PATIENT role, exact User-to-Person binding, PatientProfile, exact own `PatientHospitalRelationship`, and exact ACTIVE Hospital. Hospital Contact is withheld for non-ACTIVE Hospitals. Missing or foreign relationships fail closed. The Personal Home contact projection is bound to existing relationship IDs and returns only Hospital name/code and nullable address/phone; no Contact row ID, timestamps, actor data, audit data, or concurrency token reaches the Patient UI. No parent or other source is used as fallback.

## Normalization and concurrency

Mutation input is strict desired state with exactly `hospitalId`, `expectedUpdatedAt`, `addressText`, and `phoneNumber`; both contact keys are required and nullable. The combined unnormalized fields are bounded to 16 KiB UTF-8. Address normalization follows the contract for line endings, tabs, ECMAScript edge trim, trailing per-line U+0020 removal, blank-to-null, forbidden controls/invisibles, surrogate validity, and the 500 UTF-16 code-unit limit. Phone normalization rejects prohibited controls before trimming, folds U+0020 runs, enforces the 32-code-unit bound and the approved Unicode/punctuation set, and requires a Unicode decimal digit. Values are never truncated, Unicode-normalized, interpreted as HTML, or echoed in validation errors.

Updates use a short interactive ReadCommitted transaction and the approved lock order: User `FOR SHARE`, exact HOSPITAL UserRole `FOR SHARE`, target Hospital `FOR UPDATE`, then exact membership `FOR SHARE`; predicates are rechecked before reading Contact. The Hospital lock serializes creation, update, and lifecycle races without changing `Hospital.updatedAt`. Existing-row writes guard on Contact ID, Hospital ID, and exact prior `updatedAt`, require one affected row, and use `max(serverNowMs, previousUpdatedAtMs + 1)`.

Expected absence plus empty desired values is a NOOP without row or audit. A first non-empty state creates the row. Existing-row equality is NOOP only after the expected version matches; stale equality conflicts. Clear retains the row. Only P2034 and confirmed PostgreSQL deadlock 40P01 are retried, up to three total attempts, with 25 ms and 50 ms caps and full jitter outside each transaction. Unexpected P2002 maps to a safe conflict. Other errors are not retried; ambiguous transaction outcomes return an unconfirmed state that requires authorized reload and review.

## Audit

Creation emits one `hospital_contact.created` event; each changed update or clear emits one `hospital_contact.updated` event. Resource type is `HospitalContact`, resource ID is the immutable Contact ID, actor is resolved server-side, and metadata contains only `{ hospitalId }`. The event is written through the same transaction client. NOOP, denied, and conflict operations emit no success event. A real PostgreSQL audit failure test confirms Contact create/update rolls back atomically.

## Safety and verification evidence

The Hospital Master seed was left unchanged and identity-only. The focused PostgreSQL integration test runs the actual seed twice around a real Contact row and checks row identity, address, phone, and `updatedAt` remain unchanged. Migration verification on the disposable PostgreSQL harness confirmed both a clean database applying all 37 migrations and a populated pre-Contact database retaining its Hospital with no Contact backfill. Real PostgreSQL tests cover the Contact FK/UNIQUE, persistence, authorization, Patient SELF scope, concurrency, lock-order authority races, rollback, and audit behavior.

| Check | Result |
| --- | --- |
| `npm run prisma:generate` | PASS |
| `npx prisma validate` | PASS |
| Focused unit/UI/transport tests | 14 files / 152 tests PASS |
| Focused Hospital Contact PostgreSQL integration | 1 file / 25 tests PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | Exit 0; three unused-symbol warnings were then removed and ESLint on every touched TS/TSX file passed with no warnings |
| `npm run test` | 226 files / 1,925 tests PASS |
| `npm run test:integration` | 32 files / 472 tests PASS; Prisma reported 37 migrations and no pending migrations |
| Impeccable detector on affected UI routes/components | PASS; no findings |
| Clean and populated migration checks | PASS on disposable PostgreSQL |
| Master seed rerun preservation check | PASS on real HospitalContact row |

After the broad unit and PostgreSQL runs above, final review added explicit Owner-form interaction, exact Hospital-scope/constraint assertions, and an isolated Personal Home fail-closed adjustment for a PatientProfile disappearing before the scoped Contact read. Follow-up focused unit/UI/transport (14 files / 152 tests), focused PostgreSQL (1 file / 25 tests), typecheck, and targeted ESLint passed. The broad suites were not repeated: the only runtime adjustment was confined to the existing Personal Home route context and the remaining changes were tests/docs; broad counts above are the earlier baseline.

## Limits and next phase

Manual browser/mobile/device UAT was **NOT EXECUTED**. No production migration or deployment was performed. The completed automated checks do not claim customer acceptance or whole Phase 17I completion. CONTENT-01 remains OWNER DECISIONS CLOSED / 17I.2 TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED; Phase 17I.2 remains PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED; Phase 17I.3 remains PLANNED / NOT IMPLEMENTED. Phase 17H.4A manual UAT tracking, 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02, and 17J delivery/system authority remain unchanged.
