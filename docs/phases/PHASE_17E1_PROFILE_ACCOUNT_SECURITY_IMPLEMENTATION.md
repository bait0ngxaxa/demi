# Phase 17E.1 — Hospital-Scoped Patient Profile & Account Security

สถานะ: **IMPLEMENTED / VERIFIED — 2026-09-30** for the owner-approved Phase 17E.1 contract. Phase 17E.2 consent is not implemented.

Baseline: `4b86d9bba61b7d749684c6c67e8f4b386b0bf3ad` (`docs(phase-17e): align source and retention gates`). Phases 17B, 17C, 17D.0, and 17D.1 remain closed.

## Approved scope

[Phase 17E.0](./PHASE_17E0_PROFILE_ACCOUNT_CONSENT_CONTRACT.md) records P17E-PROFILE-01..04 and P17E-ACCOUNT-01..02 as **OWNER-APPROVED / RESOLVED — 2026-09-30**. This implementation covers:

- Patient SELF view/edit of `gender`, `phoneNumber`, `addressText` (current contact address), `emergencyContactName`, `emergencyContactPhone`, `occupation`, and `educationLevel`, scoped to the exact Patient–Hospital relationship.
- Read-only name and family name on that profile detail. DOB is not exposed by this new editor. No National ID is displayed or reconstructed.
- Authenticated account-level password change after current-password verification.
- Hospital-assisted active Patient account recovery, with the Patient choosing the new password.

Patient SELF cannot change given/family name, DOB, National ID or identity binding, authentication identity, roles, Hospital relationships, HN, or clinical facts. Hospital staff and OSM retain their authorized reads but receive no mutation path for these new profile values. Platform ADMIN receives no routine profile mutation or recovery override. Work/Personal context is presentation only; services re-resolve authority on the server.

There is no generic Settings page, preference persistence, account deletion, self-suspension, profile history, identity-correction workflow, or profile-change audit. Emergency contact remains contact information only. Profile phone is not a verified recovery destination. Activation remains separate from recovery.

## Schema and migration

The additive migration `prisma/migrations/20260930120000_patient_hospital_profile_account_recovery/migration.sql` adds:

- `PatientHospitalProfile`, unique per `PatientHospitalRelationship`, with the seven bounded nullable strings, monotonic `version` (default 1), and timestamps. Relationship deletion cascades to the local profile.
- `AccountRecovery` with the minimum issue/claim/completion/revocation/reconciliation fields, unique token digest, target User, exact Patient–Hospital relationship, issuer User, channel, expiry, and timestamps. Target/relationship deletion cascades; issuer deletion is restricted.
- An `ASSISTED`-only `AccountRecoveryDeliveryChannel` enum.
- A partial unique index for one unfinished recovery per target User (`completedAt IS NULL AND revokedAt IS NULL`). Prisma schema cannot express this partial unique constraint; the migration comment records the reason.

No existing `PatientProfile` column is removed or altered. The migration does not backfill relationships or move/copy legacy profile data. `npx prisma validate --schema prisma/schema.prisma` and `npm run prisma:generate` passed.

## Hospital-local profile semantics

For an exact relationship, `PatientHospitalProfile` is authoritative when present. If absent, reads use the existing shared `PatientProfile` general values as a clearly identified **legacy fallback**. The first successful edit creates one complete local row from the effective displayed values, applies the allowlisted patch, and starts local version 1. After that, local null is a real local value; no field falls back independently. No other Hospital row is created or changed, and SELF never writes shared `PatientProfile`.

Personal profile overview is relationship navigation only; it does not return contact PII for all Hospitals. The exact Personal detail, authorized Hospital detail, and exact-assigned OSM detail apply the same local-then-legacy resolution. Directory/list projections remain unchanged and do not gain profile contact fields.

### Mutation authority and concurrency

The narrow `patient:profile:update` / SELF policy is paired with an explicit Zod strict-object field allowlist. Every read/write re-resolves the authenticated active User, persisted PATIENT role, same Person, own PatientProfile, and exact relationship. Browser input cannot select a Person, profile, Hospital, role, scope, or owner. HOSPITAL-only, OSM-only, ADMIN-only actors are denied; a multi-role actor succeeds only through PATIENT SELF ownership.

The action accepts a bounded `expectedVersion`; legacy fallback is version 0. For an existing local row, an update matches both relationship ID and expected version and increments once. The first edit is a serializable insert guarded by the unique relationship key. Stale or concurrent writers receive Conflict; the UI asks the Patient to reload/review. Empty optional input clears to null. No raw request or profile PII is logged.

## Password change

`changeAuthenticatedUserPassword` accepts current password, new password, and confirmation under the existing `userOwnedPasswordSchema` policy (minimum 12 characters). The service uses only the authenticated ActorContext; there is no target User ID, provider alias, or `authSubject` in the client input. It works for a User with additional roles because the password is account-level.

The server-only Supabase adapter first confirms the current cookie-backed session, then authenticates the supplied current password on an isolated, non-cookie, non-persisted anon-key client with `auth.signInWithPassword({ email: internalAlias, password: currentPassword })`. It verifies the returned provider subject matches the current authenticated session, calls `auth.updateUser` from that freshly authenticated isolated client, and locally signs out the temporary session. The installed `@supabase/supabase-js` 2.112.3 API call is:

```ts
auth.updateUser({ password: newPassword, current_password: currentPassword })
```

The independent provider sign-in means verification does not depend on a Supabase project toggle, and the fresh session avoids relying on the age of the original session for Supabase's optional recent-sign-in check. The `current_password` update attribute provides the provider's additional check when its “Require current password when changing password” setting is enabled; the code does not treat that setting as the only verification. DEMI does not load or compare password hashes. Provider errors return a safe generic message. Passwords are not logged or persisted. A bounded `ACCOUNT_PASSWORD_CHANGED` event is written without credentials; a confirmed provider success is not reported as failure solely because audit persistence then fails. No extra application global-session policy is added to normal password change. The temporary verification session is closed with `auth.signOut({ scope: "local" })` after the password update; the client never writes its session to application cookies or browser storage.

## Assisted recovery authority and lifecycle

Issuance is limited to an authenticated active `HOSPITAL` User with an exact active direct `OWNER` membership in the exact active Hospital containing the selected Patient relationship. The service checks this boundary before identity lookup and again inside a serializable transaction. The issuer must explicitly attest to the assisted identity check. A National ID is validated/resolved through the identity service and must resolve to the same Person as the relationship. Raw National ID is neither persisted nor audited.

The target must be an existing ACTIVE User with persisted PATIENT role, existing `authSubject`, and same Person as the exact relationship. PROVISIONED/SUSPENDED/non-Patient/unmapped targets are denied. Recovery does not activate or restore a User, repair identity links, create or merge identities, or change profile/domain/role/membership/assignment/clinical data.

The core generates an opaque cryptographic one-time token and stores only SHA-256 digest. It expires exactly 15 minutes after issuance; expiry/channel are not client-controlled. Invalid, expired, revoked, claimed, completed, and reconciliation-held tokens use the same public failure. Claiming is atomic and serializable, so only one concurrent claimant can proceed. Reissue revokes an earlier unclaimed capability in the same transaction before inserting the new valid capability; a capability already claimed or held for reconciliation blocks reissue. A bounded server-side limit allows at most five issuances per target in a rolling hour. Database uniqueness prevents more than one unfinished capability per target User.

Provider work occurs outside PostgreSQL transactions. Completion is recorded only after password replacement and global sign-out both report success. An ambiguous provider or completion outcome leaves the capability claimed, stores a minimal reconciliation marker, records bounded security evidence, and prevents replay/reissue; no password is persisted for retry. Successful issue/revoke/completion and bounded reconciliation events contain opaque record IDs/action/channel/timestamp/reason only, never token, token digest, password, National ID, phone, or other profile PII.

## Delivery boundary

`AccountRecoveryDeliveryAdapter` separates capability issuance from transport. The only registered/current channel is `ASSISTED`: the exact authorized Hospital Owner receives a one-time handoff URL to present/send to the identity-verified Patient outside DEMI delivery. No EMAIL, SMS, or LINE adapter, preference, notification infrastructure, or usable UI option is implemented. Future channels must add an independent verified-destination contract. Profile/legacy phone and provider internal email alias are not trusted destinations.

The link carries the token in the URL fragment so it is not sent in the initial HTTP request. The public claimant removes the fragment from browser history after reading it, checks availability, and lets the Patient enter/confirm a new password. Operator UI never displays password, provider alias, `authSubject`, token digest, or raw National ID after the request; the ID field is masked.

## Supabase provider behavior and session limit

The exact installed server-side APIs are:

- Authenticated change: verify the current cookie session with `auth.getUser()`, sign in an isolated client with `auth.signInWithPassword({ email: internalAlias, password: currentPassword })`, then call authenticated `auth.updateUser({ password, current_password })` on that fresh session and close it with `auth.signOut({ scope: "local" })`. The installed API includes `current_password`; Supabase documents it for supabase-js v2.102.0+. Supabase documents that the update attribute checks the current password when its corresponding Auth setting is enabled; independent password sign-in is the required verification here.
- Recovery password replacement: Admin client `auth.admin.updateUserById(authSubject, { password })`.
- Recovery global refresh-session revocation: a fresh, isolated, non-cookie, non-persisted anon-key client authenticates the target using the internal provider login alias and submitted new password, then the server Admin API calls `auth.admin.signOut(accessToken, "global")` with that isolated sign-in's access token. The temporary client disables persistence, auto-refresh, and URL session detection; its session is never written to application cookies/browser storage. The installed SDK type/implementation exposes this exact Admin method; no unsupported `revokeAllSessions(userId)` API is used.

The guarantee is bounded to Supabase's documented global sign-out behavior: affected refresh tokens/sessions are revoked globally. An already-issued access JWT is not revoked immediately and can remain valid until its expiry. This implementation does not claim instantaneous revocation of every in-flight access JWT. If password update, isolated sign-in, global sign-out, or local completion becomes ambiguous, the claimant receives a generic failure and the one-time capability is held for reconciliation.

Verified official provider references (checked against the current docs and installed 2.112.3 types): [password-based Auth and current-password verification](https://supabase.com/docs/guides/auth/passwords), [signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [signOut scopes and refresh-token/access-JWT semantics](https://supabase.com/docs/reference/javascript/auth-signout), [Admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [Admin signOut](https://supabase.com/docs/reference/javascript/auth-admin-signout), and [User sessions](https://supabase.com/docs/guides/auth/sessions).

## UAT and verification evidence

- Thai-first Personal Hospital-local profile detail/edit, authenticated password change, Hospital Owner assisted recovery, and public Patient recovery forms were added using existing panels, tokens, and responsive patterns. Long names/text wrap; controls are full-width on narrow screens and have visible pending/success/error states. The Personal relationship overview links each Hospital separately and labels the local scope.
- Impeccable static UI detector: no findings on the new/changed profile, password, recovery, relationship-list, and Patient Detail components.
- Browser at 390 × 844: public `/recover` invalid/unavailable-link state displayed Thai copy without clipping; document and body widths were both 390 px (no horizontal overflow). The browser had no authenticated UAT Patient/Owner actor, so dynamic 390 px Personal editor, password action, and Owner issuance were not submitted in-browser. Their component presentation tests and real-PostgreSQL service integration tests were used instead; no real credential or Patient identity was entered into the browser.
- Focused profile/account unit and presentation tests: 15 files, 115 tests passed before the final authenticated-password provider hardening; afterward its focused provider/service tests passed again (2 files, 10 tests).
- PostgreSQL integration suite: 24 files, 208 tests passed, including exact Hospital A/B fallback/materialization/clear/isolation, Work and assigned OSM reads, concurrent optimistic update, assisted reissue/token hash/15-minute expiry/claim/completion/domain isolation. The local guarded `demi_test` database applied the additive migration.
- Typecheck: `npm run typecheck` passed.
- Lint: `npm run lint` passed.
- Normal Vitest suite: `npm run test` passed once (158 files, 1,145 tests) before the final localized authenticated-password provider hardening. The full suite was not repeated; the affected provider/service tests, typecheck, and lint passed afterward.
- Prisma validation/client generation: passed.
- Final source-level privacy/security review confirmed no Patient SELF writes to shared `PatientProfile`, no sensitive values in generic profile audit, no raw National ID/password/recovery token/token hash/provider alias/authSubject in browser output or application logs/audit metadata, no Hospital MEMBER/OSM/ADMIN recovery bypass, no unverified contact-channel use, and no consent model or feature. The review's initial concern that `current_password` enforcement depends on provider settings was removed from the final implementation by independent server-side password sign-in plus provider-subject matching; the final provider boundary tests pass.
- Production build and deployment were not run; no Vercel deployment status was available in the local repository/session.

## Remaining gates

- P17E-CONSENT-01, P17E-CONSENT-02, and P17E-CONSENT-03 remain **DECISION PENDING** and gate Phase 17E.2. No Terms acceptance, Privacy acknowledgement, health-processing consent, marketing consent, consent storage, or consent UI was added.
- Broader Hospital/Owner governance recovery, non-Patient account recovery, long-term activation proofing, identity-correction/reconciliation, automated EMAIL/SMS/LINE delivery, and unrelated account settings remain outside this Patient UAT decision.
- Before production/UAT rollout, configure and validate deployment/auth callback environments and provide dedicated non-production actors for authenticated 390 px browser flow verification.

Phase 17E.1 does not start or approve Phase 17E.2.
