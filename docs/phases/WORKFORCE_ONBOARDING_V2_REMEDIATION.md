# Workforce onboarding v2 — remediation and review handoff

Reviewed baseline: `e61cd8638ca6be450cdc017fd2405475f059fc74`, branch
`feat/workforce-onboarding-v2`, comparison `main`. The remediation was verified locally before commit/push, subsequently requested by the user.
No merge, deployment, production data or production provider operation was performed.
Historical decisions remain in [ADR-0008](../adr/0008-workforce-provisioning-and-activation.md).
The original remediation below records the pre-REC-1 security posture. For current reset behavior,
REC-1 in [ADR-0012](../adr/0012-global-credential-recovery-proof.md) supersedes the blanket
recovery-disable and terminal-takeover statements while preserving the legacy entry-point guards.

## ขั้นตอนปัจจุบัน: REC-1 รีเซ็ตรหัสผ่าน / คืนบัญชี

ใช้ flow นี้เท่านั้นสำหรับการเปลี่ยนรหัสผ่านที่ผู้ใช้ลืมและการปลดล็อกบัญชีที่สงสัยว่าถูกยึด
ผู้ดำเนินการต้องตรวจตัวตนก่อนออก capability และเลือกวิธีที่ทำจริงจากรายการคงที่:
ตรวจบัตรต่อหน้า (`IN_PERSON_ID_CARD`), วิดีโอคอลเห็นใบหน้าและบัตร
(`VIDEO_CALL_FACE_AND_ID_CARD`) หรือโทรกลับเบอร์ที่โรงพยาบาลมีอยู่ก่อนแล้ว
(`CALLBACK_PHONE_ON_HOSPITAL_RECORD`) ห้ามใช้เบอร์ที่ผู้ร้องขอแจ้งมา ไม่มีการเก็บภาพหรือเลขบัตร

- OWNER ที่ใช้งานอยู่ของ Hospital ACTIVE ทำได้เฉพาะผู้ใช้อื่นซึ่งไม่ใช่ OWNER/ADMIN และความสัมพันธ์
  ทุกแถว (รวมแถวที่สิ้นสุดแล้ว) กับ HospitalMembership, OsmHospitalRelationship และ
  PatientHospitalRelationship อยู่ Hospital เดียวกัน ผู้มี caregiver relationship หรือ grant
  ต้องให้ platform ADMIN ทำรายการ
- platform ADMIN ใช้เครื่องมือค้นหาเลขบัตรแบบตรงตัวผ่าน HMAC lookup และทำได้กับเป้าหมายที่อยู่นอก
  scope OWNER รวมถึง OWNER/ADMIN แต่ห้ามรีเซ็ตบัญชีตนเอง ทุกครั้งต้องเลือก Hospital ACTIVE และระบบ
  ตรวจ issuer, Hospital, target และความสัมพันธ์ซ้ำเมื่อเจ้าของบัญชีส่งแบบฟอร์ม
- `IN_PERSON` หมดอายุ 15 นาที: ส่งมอบเครื่องให้เจ้าของบัญชีกรอกเลขบัตรของตนเองและตั้งรหัสผ่าน
  `ONLINE` หมดอายุ 24 ชั่วโมง: ผู้ดำเนินการส่ง QR/ลิงก์ให้เปิดบนเครื่องของเจ้าของบัญชี ลิงก์ใช้ครั้งเดียว
  ผิด 5 ครั้งแล้ว capability ถูกเพิกถอน
- งานบุคลากร/อสม./บัญชีหลายบทบาทใช้ `WorkforceActivation` purpose `RESET`; ผู้ป่วยอย่างเดียวใช้
  `AccountRecovery` พร้อม Hospital scope ที่บันทึกไว้ การเรียก provider ต้องอยู่นอก DB transaction
  การ claim ต่อ User ชนะได้ครั้งเดียว ลำดับทำงานคือสร้าง identity ใหม่ → เปลี่ยน canonical
  `User.authSubject` → ลบ identity เก่า → finalize หากผล provider/ฐานข้อมูลกำกวม ให้คง claim และ
  `RECONCILIATION_REQUIRED` ไว้ ห้ามแก้ด้วย ADMIN attestation
- เมื่อสำเร็จ User กลับเป็น ACTIVE และ takeover lock เปลี่ยนเป็น `RESOLVED`; คืนเฉพาะ staff/OSM
  relationship ID ที่ lock ระงับไว้ LINE ที่เชื่อมหลัง lock คงสถานะ unlink; ถ้ายังมี binding ที่ใช้งาน
  ส่งข้อความแจ้งเปลี่ยนรหัสผ่านตาม ADR-0012

การเรียก Supabase ที่ใช้คือ Admin `createUser` เพื่อสร้าง credential ใหม่, Admin `deleteUser` เพื่อลบ
subject เก่า, Admin `updateUserById` สำหรับ provider ban ขณะล็อก และ Auth `getUser` สำหรับตรวจ session
เอกสารทางการ: [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid),
[getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[session semantics](https://supabase.com/docs/guides/auth/sessions). JWT เดิมอาจยังใช้ได้จนหมดอายุที่
Supabase แต่ DEMI ปฏิเสธ session เมื่อ subject เก่าไม่ตรงกับ User mapping ปัจจุบัน โปรดห้ามสรุปว่า
การลบ identity ทำให้ JWT หมดอายุทันที

## Findings and implemented boundaries

| Finding | Root cause | Remediation |
|---|---|---|
| P0 global recovery | Hospital-local target classification authorized replacement of a global User password; issuer knew the bearer token and National ID. | Legacy RESET and Patient assisted recovery endpoints remain disabled. REC-1 adds only the dated OWNER/ADMIN-mediated ceremony with explicit verification, owner-entered National ID, exact scope reauthorization and provider quarantine. Normal authenticated current-password change remains. |
| P1 token context | Completion accepted any active workforce relationship instead of the originally authorized one. | Legacy RESET capabilities remain unable to complete. REC-1 persists Hospital, relationship ID/kind (or platform ADMIN target), User, issuer, purpose, verification method and expiry; current issuer/target authority is checked before claim/provider start/finalization. Cross-Hospital pending activation and privileged first-time targets fail closed. |
| P1 provider/database consistency | Provider effects could survive local failure while the reset claim was released for a different password retry. | Ambiguous legacy RESETs remain quarantined. REC-1 uses durable claim/provider/finalize states and quarantines ambiguous outcomes. Existing initial activation keeps guarded compensation only for a newly created identity. |
| P2 directory | Unbounded staff/OSM reads and activation projection. | Default 25, maximum 50 rows per kind; `(createdAt, id)` keyset cursor, per-page server name/status/Hospital filters, current-page-only ACTIVATION projection, no staff query or staff cursors for MEMBER. |
| P2 bulk | Individual committed rows had no submission-level receipt; retries reclassified created rows as existing. | Actor-scoped submission key and keyed normalized fingerprint; success/receipt/audit commit together per row. Concurrent/repeated requests return stable original results, partial success survives, transient rows have three attempts maximum. |
| Activation slips | Request origin/forwarded Host could influence a credential-bearing QR destination. | Use validated canonical `DEMI_LINE_PUBLIC_ORIGIN`, require matching Origin and compatible Sec-Fetch-Site, enforce a 32 KiB actual-body limit, preserve local QR rendering, HTML escaping, no-store/noindex/CSP/referrer protections. |

Person/User reuse, four roles, direct Hospital scope, OWNER governance, OSM association and
ACTIVE identity reuse are preserved. MEMBER retains OSM provisioning/read/activation issuance,
without staff read/provision, lifecycle mutations, general revocation or OWNER governance.
PATIENT + HOSPITAL/OSM/ADMIN accounts cannot use Patient recovery as a workforce reset bypass.
Adding workforce authority is blocked while a Patient recovery or legacy global RESET is unresolved.
Patient-only recovery outside REC-1 remains disabled by [ADR-0012](../adr/0012-global-credential-recovery-proof.md).
The Phase 17E.1 historical implementation record is preserved; its assisted ownership assumption
is superseded. Only the new mediated reset can reach a replacement provider operation.

## Persistence and compatibility

Forward-only migrations:

- `20261015100000_workforce_remediation`: revoke outstanding RESETs, preserve claims/hashes/history;
  create `WorkforceBulkSubmission` and `WorkforceBulkRowReceipt`; add Hospital/createdAt/id indexes.
- `20261015110000_workforce_activation_context`: exact activation context and reconciliation marker;
  revoke all outstanding pre-context activation credentials and retain claimed ambiguity.
- `20261015120000_workforce_activation_operation_state`: durable enum/state; derive consumed rows as
  FINALIZED, claimed legacy rows as RECONCILIATION_REQUIRED, unclaimed rows as NOT_STARTED.
- `20261015130000_workforce_state_constraints`: reject partial context under PostgreSQL NULL semantics
  and enforce claim/completion/reconciliation state consistency.

- `20261015140000_global_assisted_recovery_gate`: revoke all unfinished Patient recovery credentials,
  retain claims/hashes, mark claimed outcomes for reconciliation. Auth boundaries quarantine these
  claims even after revocation or expiry.
- `20261107100000_rec1_mediated_account_recovery`: persist verification method, failed-ID count,
  reset provider subjects/login alias, takeover relationship snapshot, online delivery mode and
  `RESOLVED` provider state. This timestamp follows the repository's latest migration on 2026-11-06
  per the REC-1 decision.

The reviewed `20261014100000_workforce_activation_purpose` migration is unchanged. No reset,
truncate, destructive recreation, secret persistence or rollback of historical token hashes occurs.
Migrations applied during this task target only the guarded local integration database.

An unclaimed old activation needs reissuance by a currently authorized direct provisioner.
An old claimed RESET remains revoked and quarantines application access, even with ACTIVE User
status or valid provider JWT. A revoked token does not prove its provider password change was undone.
Do not silently trust/reissue old RESETs or clear their claims to unblock login.

## Durable operation and reconciliation runbook

| State | Meaning | Permitted automatic behavior |
|---|---|---|
| NOT_STARTED | No provider operation claimed; credential can still be expired/revoked. | Validate full context, expiry and national-ID cue, then claim once. |
| CLAIMED | One completion won the DB claim. | Reauthorize before durably marking provider start. |
| PROVIDER_STARTED | Provider operation may have been applied; response/storage may be ambiguous. | No password replay or new token. A definitive no-effect provider rejection can release the claim. |
| PROVIDER_CONFIRMED | Initial provider identity/mapping confirmed; local completion remains. | Reauthorize and finalize. If finalization fails, check committed outcome before guarded initial-identity compensation. |
| FINALIZED | User/eligible relationships, consumed token and audit committed. | A lost response can be recognized only by verifying committed state and exact User/subject. Stale token replay cannot replace credentials. |
| RECONCILIATION_REQUIRED | Ambiguous outcome, failed compensation or legacy claimed operation. | Retain claim, deny replay, record one reconciliation audit. Escalate to controlled operator investigation. |

If reconciliation marker persistence fails, the previously stored claim/PROVIDER_STARTED state
still blocks retries; a sanitized log records the marker failure. No password/token is logged.
Initial activation releases only after a definitive rejection or confirmed compensation of a
new initial identity. It never deletes an existing ACTIVE Auth identity to compensate a reset.

Before deployment, quiesce all old assisted-recovery and workforce credential issuance/completion traffic and review all
unused claimed credentials. This is an operational instruction, not an action executed here.
The trusted operator should:

1. Record the incident with activation/User IDs and current DB operation state; keep it out of
   browser-visible output. Never copy tokens, passwords or National IDs into tickets/logs.
2. Read provider administrative/audit facts and application audit/mapping facts. If a mapping was
   detached before failed cleanup, the existing server-generated User login alias can locate the
   initial provisioning operation; alias possession is not ownership proof or permission to delete.
3. For a newly created initial identity only, verify operation ownership, PROVISIONED status,
   expected subject, original issuer/relationship/Hospital authority and lack of completed use.
   Any doubt requires escalation. Do not invent compensation for a global password replacement.
4. For an ambiguous legacy RESET or AccountRecovery, keep application access quarantined. Provider success cannot be
   inferred from a DB rollback and a claim cannot be cleared solely on ADMIN authority. New REC-1
   resets also stay quarantined until the full create/switch/delete/finalize sequence is verified;
   credential replacement/restoration must use the REC-1 identity-verification ceremony.
5. Record reviewed evidence/outcome through controlled maintenance/audit procedures. No public
   reconciliation endpoint or browser checkbox can unlock a credential. Restore/reissue initial
   activation only after absence/cleanup of the provider effect and local invariants are verified.

Already-consumed historical RESETs are not automatically reversed. Their audit history must be
reviewed by incident operators where compromise is suspected; this task did not inspect production.
Automatic reconciliation of ambiguous password changes is deliberately unavailable without proof.

## Directory and bulk behavior

Staff and OSM have independent next-page cursors. Every request revalidates direct Hospital authority;
cursors include Hospital/kind/search/status context and cannot move the query into another scope.
Duplicate/missing names do not affect order. UI uses server navigation without appending asynchronous
client result buffers; Hospital changes remount its workspace, and pending-slip selection remounts
when the displayed identities change. Search starts at page one. Loading, no results, retry, end-of-list
and return-to-first-page states use the current design system. Selection/detail links retain the
relationship locator; no National ID or bearer token is part of directory DTOs.

Bulk keys are `issued-time.random-UUID`, scoped server-side to actor, Hospital, kind, normalized rows
and visible row mapping. The fingerprint is a domain-separated HMAC with the existing identity secret;
it is never returned to the client. Receipts persist only minimal outcome/relationship locators.
Terminal created/existing/invalid/conflict outcomes stay stable. UNAVAILABLE outcomes can resume up to
three attempts, including the first. A request that cannot persist its failure reports unavailability
and must be retried with the same key/payload; atomic successful receipts resolve lost DB responses.

UI retains entered values in component memory for retry. Only the nonsensitive submission key is
stored in tab-scoped sessionStorage, never PII or credentials. Reload requires re-entering the same
rows; a browser without sessionStorage retains retry capability only while that page remains open.
Editing a submitted payload requires explicitly starting a new submission. Do not rotate the existing
identity HMAC secret during receipt lifetime without a migration/replay strategy.

Keys expire after 30 days; their embedded timestamp is checked even after metadata deletion. Each new
batch removes at most 50 expired submissions/receipts. Pruning is traffic-driven, not a background
worker; no further storage grows while traffic is absent. Successful domain data/audits outlive receipts.
Keyset indexes support exact Hospital ordering. Name search remains bounded by Hospital; no speculative
trigram extension/index is introduced without measured need. Keyset navigation is not a frozen snapshot
of subsequent insertions/deletions.

## Verification and restrictions

Focused regression covers malicious OWNER/ADMIN issuers, multi-Hospital/multi-role targets,
legacy reset quarantine, exact-context revocation/reassignment, first-time activation, five failed
identity attempts, token-purpose separation, definitive and ambiguous provider outcomes, failed local
finalization, lost responses, reconciliation failure, bulk 1/25/50-row replay, 20/50-row disconnect,
concurrent keys/identities, revocation during processing, mixed outcomes, bounded retries, and
200 staff/300 OSM pagination with duplicate/missing names. Migration verification uses session-local
populated legacy tables; existing application tables are not reset. Actual SQL query counts and
EXPLAIN ANALYZE are checked against the local fixture.

No live Supabase password replacement or session-revocation operation was performed. REC-1 provider
calls are tested through the adapter and fake-provider seams; its PostgreSQL persistence/concurrency
tests are real. Supabase access JWTs may remain valid until expiry after provider identity deletion;
DEMI rejects the old subject because it no longer maps to the canonical User, and every exact-session
request checks the provider with `getUser` ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[getUser](https://supabase.com/docs/reference/javascript/auth-getuser)).
Issuer sign-out is not target ownership proof or shared-browser history sanitization. Use a clean
target browser/profile/device for assisted activation; prior issuer application history must not be
handed to the target.

Pending decisions: cross-Hospital pending initial-activation trust semantics. The global mediated
recovery decision is accepted only within REC-1's scope; other recovery remains disabled. Deferred:
universal messaging/OTP/ThaID integrations, background jobs and
snapshot directory semantics. Production rollout, live provider verification, browser/mobile UAT
and a new independent code review remain separate from local automated evidence.


## Executed verification ledger

| Check | Actual result |
|---|---|
| Focused unit/transport/auth/account-security/workforce | 28 files, 260 tests passed. |
| PostgreSQL workforce v2 | 60 passed. |
| PostgreSQL original workforce | 16 passed. |
| PostgreSQL Patient profile/account-security restrictions | 6 passed. |
| PostgreSQL Patient activation regression | 24 passed. |
| Populated legacy migration verification | 2 passed. |
| Local forward migration deploy/client generation | 52 migrations applied, no pending migration; Prisma Client 6.19.3 generated. |
| Prisma schema validation | Passed. |
| Database-to-schema drift check | Nonzero: 17 pre-existing non-workforce table differences (constraint/index names and Caregiver composite FK); read-only comparison against reviewed commit confirms the same differences. No new workforce drift reported. |
| Diff whitespace and UTF-8 check | Passed; 51 changed text files decoded successfully, no replacement characters. |
| `npm run lint -- --max-warnings=0` | Passed, zero errors/warnings. |
| `npm run typecheck` | Passed. |
| Final `npm run test` (one broad run after stable diff) | 329 files, 2,973 tests passed; zero failed; 59.41 seconds. |

All 108 PostgreSQL tests above use the existing guarded local database. Provider outcomes are
fault-injected, not actual Supabase provider emulation. No live provider or production operation,
full integration suite, browser/mobile E2E/UAT, dev server or production build was run. Live provider
verification and operational reconciliation sign-off remain rollout prerequisites. Architecture
check/lint:strict scripts do not exist; use the repository's lint/typecheck scripts.

## Changed-file inventory

Verified implementation baseline: `e61cd8638ca6be450cdc017fd2405475f059fc74`.
The user subsequently requested commit/push to `feat/workforce-onboarding-v2`; the resulting
remediation SHA is available in Git history. The following files form the reviewable patch:

- `app/app/admin/hospitals/[hospitalId]/page.tsx`
- `app/app/patients/[relationshipId]/account-recovery-panel.tsx`
- `app/app/workforce/[kind]/[relationshipId]/page.tsx`
- `app/app/workforce/error.tsx`
- `app/app/workforce/page.tsx`
- `app/app/workforce/slips/route.test.ts`
- `app/app/workforce/slips/route.ts`
- `app/app/workforce/workforce-password-reset-control.test.tsx`
- `app/app/workforce/workforce-password-reset-control.tsx`
- `app/app/workforce/workforce-workspace.test.tsx`
- `app/app/workforce/workforce-workspace.tsx`
- `app/recover/page.tsx`
- `app/recover/public-account-recovery-form.tsx`
- `docs/CONTEXT.md`
- `docs/adr/0008-workforce-provisioning-and-activation.md`
- `docs/adr/0012-global-credential-recovery-proof.md`
- `docs/adr/README.md`
- `docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`
- `docs/phases/PHASE_17E1_PROFILE_ACCOUNT_SECURITY_IMPLEMENTATION.md`
- `docs/phases/PHASE_4B_WORKFORCE_PROVISIONING.md`
- `docs/phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md`
- `docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md`
- `prisma/migrations/20261015100000_workforce_remediation/migration.sql`
- `prisma/migrations/20261015110000_workforce_activation_context/migration.sql`
- `prisma/migrations/20261015120000_workforce_activation_operation_state/migration.sql`
- `prisma/migrations/20261015130000_workforce_state_constraints/migration.sql`
- `prisma/migrations/20261015140000_global_assisted_recovery_gate/migration.sql`
- `prisma/schema.prisma`
- `src/lib/env/server.ts`
- `src/modules/account-security/adapters/supabase-account-security-provider.test.ts`
- `src/modules/account-security/adapters/supabase-account-security-provider.ts`
- `src/modules/account-security/services/account-recovery-service.test.ts`
- `src/modules/account-security/services/account-recovery-service.ts`
- `src/modules/account-security/transport/account-security-forms.test.tsx`
- `src/modules/auth/services/actor-context-service.test.ts`
- `src/modules/auth/services/actor-context-service.ts`
- `src/modules/auth/services/credential-recovery-state.ts`
- `src/modules/auth/services/exact-session-service.ts`
- `src/modules/workforce/policies/workforce-password-reset-policy.test.ts`
- `src/modules/workforce/policies/workforce-password-reset-policy.ts`
- `src/modules/workforce/policies/workforce-recovery-restriction.test.ts`
- `src/modules/workforce/schemas/workforce-schemas.ts`
- `src/modules/workforce/services/workforce-bulk-submission.ts`
- `src/modules/workforce/services/workforce-directory-cursor.ts`
- `src/modules/workforce/services/workforce-service.ts`
- `src/modules/workforce/transport/server-actions.test.ts`
- `src/modules/workforce/transport/server-actions.ts`
- `tests/integration/patient-profile-account-security.integration.test.ts`
- `tests/integration/workforce-onboarding-v2.integration.test.ts`
- `tests/integration/workforce-remediation-migration.integration.test.ts`
- `tests/integration/workforce.integration.test.ts`


## Final review assessment

Confirmed findings have an implemented fail-closed remediation and local automated regression
evidence. The branch remediation patch is ready for a new independent code review, with the
pre-REC-1 assisted-recovery disable and cross-Hospital pending activation workflows retained at that time.
The candidate security review identified revoked initial claims being skipped by reissuance; a
failing PostgreSQL reproduction was added and the shared initial-credential guard now blocks it
across regeneration, printable slips and repeated provisioning. All final relevant tests pass.

This is not a production-readiness certification. Rollout must separately approve the restrictions,
quiesce old recovery traffic, evaluate historical ambiguous/consumed operations, configure the
trusted public origin, validate actual Supabase/deployment behavior and complete browser/mobile
UAT. Existing unrelated database drift remains unchanged. No unsupported recovery path is labeled
VERIFIED_COMPLETE and no operator is authorized by this report to weaken account-owner proof.


## Final identity and cross-Hospital remediation (review `ff33a3871d24ae6b5a9221ff7dd5997860ea8ba9`)

### P0 — unactivated PATIENT identity versus workforce activation

**Reproduced (pre-fix, PostgreSQL).** A `PROVISIONED` User with the `PATIENT` role, a `PatientProfile`
and a Patient/Hospital relationship, and no `authSubject`, could be provisioned as OSM or Hospital
member by an OWNER (or an OSM by a MEMBER). `isInitialWorkforceScopeEligible` rejected ADMIN and
OWNER but not PATIENT, so the issuer — who holds the activation token and typed the national ID —
could call `completeWorkforceActivation`, which invoked the provider create-user call with an
issuer-chosen password and finalized the User to `ACTIVE` with that `authSubject`. Actor resolution
(`actor-context-service`) loads **all** `UserRole` rows for an `ACTIVE` mapped User, so the same
credential then resolved the `PATIENT` role and its Patient relationships. The failing tests
"rejects a PATIENT role added between issuance and provider start…" etc. failed on `ff33a38`
(the provider was called) and pass now.

**Invariant.** The first password is global to the User, not scoped to a role. National ID,
Hospital role assignment and possession of an activation token are not account-owner proof. A User
that is not yet `ACTIVE` with a provider mapping and owns the patient domain (`PATIENT` role **or**
a `PatientProfile`) therefore never receives a first credential through the workforce flow.

**Enforcement (all in `workforce-service.ts`, all inside the existing Serializable transactions).**

| Boundary | Check |
| --- | --- |
| Provisioning (single, bulk, repeat) — `createOrReuseWorkforceIdentity` | `assertNoUnactivatedPatientIdentity` for a reused `PROVISIONED` User, before any role/relationship/token is written |
| Regeneration, printable slips, assisted activation — `regenerateActivationInTransaction` | same DB assertion before the previous token is revoked |
| Preview, claim, provider-start transition, finalization | `isInitialWorkforceScopeEligible` now rejects `PATIENT` role and `patientProfile` using the row loaded in that transaction |

The rejection is a `ConflictError` with a Thai message directing the Patient to activate their own
account first. It happens before the provider is called; a role added after provider confirmation
is caught at finalization, which compensates only the newly created initial identity (existing
mechanism). Patient business data is never modified. An `ACTIVE` mapped PATIENT continues to be
reused for OSM/Hospital relationships with no credential change; a fresh workforce-only User keeps
the approved activation flow.

Product decision still required (SECURITY_GATED): activating a workforce role for an unactivated
Patient requires an approved independent ownership proof (for example the Patient first activating
through the Patient activation flow). No weaker workaround is provided.

### P1 — cross-Hospital pending scope

**Reproduced (pre-fix).** Hospital A provisions an OSM (pending relationship + token). Hospital B
provisions the same Person: the User gained a second `PROVISIONED` relationship, but
`isInitialWorkforceScopeEligible` refuses any initial activation when pending relationships exist in
another Hospital, so neither Hospital's link could ever complete.

**Invariant.** Until cross-Hospital first-time trust semantics are approved, a `PROVISIONED` User
may hold pending workforce state in **one** Hospital only (any number of roles inside it, e.g.
MEMBER + OSM). `assertSingleHospitalPendingScope` rejects, with a Thai conflict message, any
provisioning or regeneration for Hospital H when the User has a `PROVISIONED` membership/OSM
relationship in another Hospital, or an unresolved (unused, unrevoked) `ACTIVATION` row whose
`hospitalId` is another Hospital or null. It runs inside the same Serializable transaction as the
write, so two concurrent Hospitals cannot both commit (one retries, then conflicts). A rejected
call rolls back entirely: Hospital A's relationship, token and audit history are untouched. Bulk
provisioning surfaces the conflict as that row's `CONFLICT` receipt while valid rows succeed, and
replays return the original receipt. `ACTIVE` Users are not restricted and may join any number of
Hospitals. No general one-Hospital-per-User rule and no schema change.

### Already-stranded records (operator procedure)

No automatic mutation is performed. Existing stranded Users remain blocked (provisioning,
regeneration, slips and activation all conflict) and nothing is deleted or demoted. Identify them
read-only (verified by the integration test "keeps historical cross-Hospital pending records
blocked, unchanged and identifiable"):

```sql
SELECT u."id" AS "userId",
       COUNT(DISTINCT p."hospitalId") AS "hospitalCount",
       ARRAY_AGG(DISTINCT p."hospitalId") AS "hospitalIds"
FROM "User" u
JOIN (
  SELECT "userId", "hospitalId" FROM "HospitalMembership" WHERE "status" = 'PROVISIONED'
  UNION SELECT "userId", "hospitalId" FROM "OsmHospitalRelationship" WHERE "status" = 'PROVISIONED'
) p ON p."userId" = u."id"
WHERE u."status" = 'PROVISIONED' AND u."authSubject" IS NULL
GROUP BY u."id" HAVING COUNT(DISTINCT p."hospitalId") > 1;
```

Before any resolution an authorized operator must verify: the affected Person identity and which
Hospital's issuer legitimately onboarded them; no `WorkforceActivation` row is claimed, in
`PROVIDER_STARTED`/`PROVIDER_CONFIRMED`/`RECONCILIATION_REQUIRED` or used (those require the
provider reconciliation runbook first); no provider identity exists for the User; the audit trail
(`*.provisioned`, `workforce_activation.*`) is preserved. Choosing which Hospital proceeds, or
enabling multi-Hospital first activation, is an explicit product/security decision that is **not**
made here; relationships are never deleted or activated automatically.

### Verification executed for this remediation

- Pre-fix: new PostgreSQL tests against `ff33a38` logic — 11 failed / 66 passed (reproduction).
- Post-fix: `workforce-onboarding-v2.integration.test.ts` 77/77; `workforce` 16/16;
  `patient-activation` 24/24; `patient-provisioning` 15/15; `workforce-remediation-migration` 2/2.
- Unit: workforce/auth/patient-activation/patient-provisioning modules 460/460; `tsc --noEmit` and
  ESLint on touched files clean. No Prisma schema or migration changed. Full-suite run not repeated
  (change confined to `workforce-service.ts` guards).
- Not performed: live Supabase calls, production data operations, browser/mobile UAT.


## Cross-domain identity hardening (review `6a68463a8cf461bc881b9624fbb2caa2af263562`)

### Defects and root causes

1. **PatientProfile without User.** `createOrReuseWorkforceIdentity` called
   `assertNoUnactivatedPatientIdentity` only when `reusedExistingUser`. A Person that already owned a
   `PatientProfile` but had no `User` got a fresh `PROVISIONED` User, a workforce relationship and a
   token, and provisioning reported success; every later activation step then refused the account
   (`isInitialWorkforceScopeEligible` rejects `patientProfile`). The check now runs for every
   `PROVISIONED` User, including one created in the same Serializable transaction, and resolves
   ownership from the canonical Person (`PATIENT` role **or** `PatientProfile`). A rejection rolls
   back the User, roles, relationship, token, audit and any Person-name update.
2. **Patient provisioning after pending workforce provisioning.** `provisionPatientInTransaction`
   added the `PATIENT` role, `PatientProfile` and relationship to a `PROVISIONED` workforce User and
   succeeded, silently invalidating the workforce token (reproduced) and making a Patient
   activation token issuable for the same global account. It now refuses, inside the same
   transaction, when the reused `PROVISIONED` User has pending workforce authority
   (`PatientProvisioningConflictError` `RECONCILIATION_REQUIRED`, Thai message). Nothing is revoked,
   created or audited; the workforce token stays usable. `ACTIVE` workforce Users still gain
   PATIENT authority and a profile with no credential change.
3. **Reverse Patient activation boundary (confirmed).** Patient activation verified only
   PATIENT role/profile/relationship. A `PROVISIONED` User that also had an OSM/Hospital
   relationship (or ADMIN, or an unfinished workforce activation) could therefore receive its first
   global credential through a Patient token, which would also authorize the workforce authority.
   `findPatientActivationTarget`/details now compute `hasWorkforceAuthority` and reject at issuance
   (Thai conflict), details/preview, claim and local finalization (generic link error). The provider
   call happens between claim and finalization, so authority added during that window is rejected at
   finalization and the existing compensation deletes the newly created provider identity.

`hasWorkforceAuthority` (`src/modules/identity/services/workforce-authority.ts`) is true for the ADMIN
role, any `HospitalMembership`/`OsmHospitalRelationship` row (any status), or any `WorkforceActivation`
with `usedAt IS NULL` (including claimed/ambiguous operations). A bare OSM/HOSPITAL role without a
relationship grants no scope and keeps the existing Patient activation behavior (covered by
`patient-activation.integration.test.ts`). `ACTIVE` Users are never blocked by these gates.

### Credential ownership rules (both directions)

| State | Workforce provision / activate | Patient provision / activate |
| --- | --- | --- |
| Fresh Person | allowed | allowed |
| `PROVISIONED`, Patient-owned (role or profile) | rejected | allowed (Patient-only) |
| `PROVISIONED`, pending workforce authority | allowed (single Hospital) | rejected (provision and activation) |
| `ACTIVE` mapped User, any roles | relationships added, no new credential | role/profile added, no new credential |
| Legacy mixed `PROVISIONED` identity | blocked at every step, data unchanged | blocked at every step, data unchanged |

### Evidence

- Pre-fix run against `6a68463` logic: 11 new PostgreSQL tests failed (two of those eleven failed on
  fixture mistakes that were corrected; the rest reproduce defects 1-3).
- Post-fix: `workforce-onboarding-v2` 92/92 (includes concurrency: Workforce vs Patient provisioning
  of one new Person ends with exactly one Person/User and one domain); `patient-activation` 24/24;
  `patient-provisioning` 15/15; `workforce` 16/16; roster import suites 33/33; unit suite 2973/2973;
  full PostgreSQL integration run 796/796 (one earlier full run showed a single non-reproducible
  failure in `workforce.integration.test.ts` that passed alone twice and in the next full run);
  `tsc --noEmit` and ESLint clean. No schema or migration change; no live Supabase calls.

### Still SECURITY_GATED / undecided

- Patient activation (Patient-only) relies on an issuer-delivered token with **no** national-ID or
  other independent owner proof. That pre-existing concern is not resolved here and is not declared
  secure.
- Activating workforce authority on an unactivated Patient and cross-Hospital first activation
  remain undecided. REC-1 accepts global recovery only through its OWNER/ADMIN-mediated ceremony.
  Mixed legacy identities are blocked, never
  auto-reconciled; resolution needs the controlled reconciliation procedure above plus an explicit
  product/security decision.

### P2 — Patient activation candidate lookup (review `537100d`)

`findPatientActivationCandidates` did not apply the workforce-authority gate, so a `PROVISIONED` Patient
with pending workforce authority showed "NOT_ISSUED" with an issue button that the service then refused
with a generic error. The lookup now evaluates the same predicate (`workforceAuthorityUserWhere`) in
one batched query per page (no per-candidate lookups) and projects `RECONCILIATION_REQUIRED` with
`activationMayBeIssued: false`; the existing handoff UI already renders that state without an issue
button. Backend enforcement was already in place, so this was a UX/state-consistency defect only.
Verified by a PostgreSQL test (plain, OSM, staff, unfinished-operation and ACTIVE multi-role
candidates; one gate query; service rejects what the lookup withholds) and a unit test.
