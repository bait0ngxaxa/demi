# Workforce onboarding v2 — remediation and review handoff

Reviewed baseline: `e61cd8638ca6be450cdc017fd2405475f059fc74`, branch
`feat/workforce-onboarding-v2`, comparison `main`. The remediation was verified locally before commit/push, subsequently requested by the user.
No merge, deployment, production data or production provider operation was performed.
Historical decisions remain in [ADR-0008](../adr/0008-workforce-provisioning-and-activation.md).

## Findings and implemented boundaries

| Finding | Root cause | Remediation |
|---|---|---|
| P0 global recovery | Hospital-local target classification authorized replacement of a global User password; issuer knew the bearer token and National ID. | Disable workforce RESET and Patient assisted recovery issuance, preview and completion on the server, including ADMIN. Remove its provider replacement/retry sink. Thai UI explains that independent owner proof is unavailable. Normal authenticated current-password change remains. |
| P1 token context | Completion accepted any active workforce relationship instead of the originally authorized one. | No RESET capability can complete. ACTIVATION now persists exact Hospital, relationship ID/kind, User, creator, purpose and expiry; current issuer/target authority is checked before claim/provider start/finalization. Cross-Hospital pending activation and privileged first-time targets fail closed. |
| P1 provider/database consistency | Provider effects could survive local failure while the reset claim was released for a different password retry. | Remove the unsupported reset execution path; quarantine ambiguous legacy RESETs at global auth reads. Existing initial activation now has durable operation states, conservative ambiguous-outcome handling, verified lost-response handling and guarded compensation only for a newly created identity. |
| P2 directory | Unbounded staff/OSM reads and activation projection. | Default 25, maximum 50 rows per kind; `(createdAt, id)` keyset cursor, per-page server name/status/Hospital filters, current-page-only ACTIVATION projection, no staff query or staff cursors for MEMBER. |
| P2 bulk | Individual committed rows had no submission-level receipt; retries reclassified created rows as existing. | Actor-scoped submission key and keyed normalized fingerprint; success/receipt/audit commit together per row. Concurrent/repeated requests return stable original results, partial success survives, transient rows have three attempts maximum. |
| Activation slips | Request origin/forwarded Host could influence a credential-bearing QR destination. | Use validated canonical `DEMI_LINE_PUBLIC_ORIGIN`, require matching Origin and compatible Sec-Fetch-Site, enforce a 32 KiB actual-body limit, preserve local QR rendering, HTML escaping, no-store/noindex/CSP/referrer protections. |

Person/User reuse, four roles, direct Hospital scope, OWNER governance, OSM association and
ACTIVE identity reuse are preserved. MEMBER retains OSM provisioning/read/activation issuance,
without staff read/provision, lifecycle mutations, general revocation or OWNER governance.
PATIENT + HOSPITAL/OSM/ADMIN accounts cannot use Patient recovery as a workforce reset bypass.
Adding workforce authority is blocked while a Patient recovery or legacy global RESET is unresolved.
Patient-only assisted recovery is also SECURITY_GATED by [ADR-0012](../adr/0012-global-credential-recovery-proof.md).
The Phase 17E.1 historical implementation record is preserved; its assisted ownership assumption
is superseded. No issuer-visible recovery credential can reach a replacement provider operation.

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
   inferred from a DB rollback and a claim cannot be cleared solely on ADMIN authority. Credential
   replacement/restoration needs the pending independently verified owner-proof decision.
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

No live Supabase password replacement or session-revocation operation was performed. Provider faults
are tested through the existing adapter/service seams; PostgreSQL persistence/concurrency tests are
real. Workforce RESET fault paths are unreachable by design rather than advertised as a working
distributed reset workflow. Global sign-out invalidates refresh sessions; already-issued access JWTs
may remain valid until expiry ([Supabase sessions](https://supabase.com/docs/guides/auth/sessions)).
Issuer sign-out is not target ownership proof or shared-browser history sanitization. Use a clean
target browser/profile/device for assisted activation; prior issuer application history must not be
handed to the target.

Pending decisions: independent global recovery proof and controlled recovery process; cross-Hospital
pending initial-activation trust semantics. These restrictions are SECURITY_GATED and are not
VERIFIED_COMPLETE. Deferred: universal messaging/OTP/ThaID integrations, background jobs and
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
explicitly unavailable assisted-recovery and cross-Hospital pending activation workflows retained.
The candidate security review identified revoked initial claims being skipped by reissuance; a
failing PostgreSQL reproduction was added and the shared initial-credential guard now blocks it
across regeneration, printable slips and repeated provisioning. All final relevant tests pass.

This is not a production-readiness certification. Rollout must separately approve the restrictions,
quiesce old recovery traffic, evaluate historical ambiguous/consumed operations, configure the
trusted public origin, validate actual Supabase/deployment behavior and complete browser/mobile
UAT. Existing unrelated database drift remains unchanged. No unsupported recovery path is labeled
VERIFIED_COMPLETE and no operator is authorized by this report to weaken account-owner proof.
