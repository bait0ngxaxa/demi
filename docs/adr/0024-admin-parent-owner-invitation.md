# ADR-0024: Platform ADMIN Invites the First OWNER of a Parent Hospital

- Status: Accepted (Product Owner, 2026-10-31)
- Date: 2026-10-31
- Amends: [ADR-0018](./0018-parent-led-child-onboarding.md) O-D1 ("Parent onboarding is unchanged: public application → ADMIN review → first OWNER") and O-D2 (the public path guards). Reopens and closes WB-PD-12. Builds on [ADR-0003](./0003-hospital-led-onboarding.md), [ADR-0008](./0008-workforce-provisioning-and-activation.md), [ADR-0012](./0012-global-credential-recovery-proof.md) and [ADR-0017](./0017-retire-hospital-master.md).

## Context

After ADR-0018 a Parent Hospital gets its first OWNER only through the public "choose a Hospital and apply" page and ADMIN approval. ADMIN already registers every Parent and often knows who should run it, and the public list lets anyone claim an unclaimed Parent. A Parent OWNER can already invite the first OWNER of a Child through the workforce activation capability (`CHILD_OWNER_ONBOARDING`). The customer wants ADMIN to do the same for a Parent, without removing the public path.

## Decision

A Hospital with network role PARENT becomes ACTIVE in one of two ways:

- **A. Public application** at `/hospital/onboarding` and platform ADMIN approval (ADR-0003/ADR-0018), unchanged apart from the guards below.
- **B. ADMIN invitation:** an ACTIVE platform ADMIN issues an OWNER invitation for that Hospital from `/app/admin/hospitals/[hospitalId]`, exactly as an ACTIVE Parent OWNER does for a Child.

Child onboarding is unchanged.

- **Q1 Conflict.** ADMIN cannot invite while the Hospital has a PENDING onboarding application; ADMIN decides it first (the page links the review). While an OWNER invitation is open (`PROVISIONED` or `INVITED`), the Hospital is hidden from the public list and code lookup, and `submitHospitalOnboarding` and `approveHospitalOnboarding` refuse it inside their serializable transactions.
- **Q2 Decided applications.** A REJECTED (or any decided) application keeps blocking the public path as before; the ADMIN invitation is the way forward.
- **Q3 Replacement.** ADMIN may also invite an OWNER for an ACTIVE Parent that has no ACTIVE OWNER (mirror of O-D4/O-D5).
- **Q4 Identity and delivery** are those of a Child OWNER invitation: national ID with given and family name, `resolveWorkforceGrantee`, `assertWorkforceRelationshipsCompatible(…, "HOSPITAL")`, REMOTE link/QR 24 h or ASSISTED 15 min, 5 failed national-ID checks revoke the link, a hash-only single-use token shown once. Outcomes: `ACTIVATION_LINK` (new or reusable PROVISIONED account), `AWAITING_ACCEPTANCE` (an ACTIVE account accepts or declines on its own work home), `ADMIN_RESET_REQUIRED` (a caregiver-claimed account is held `PROVISIONED` behind the REC-1 takeover lock, FIX-1b). A replayed submission nonce answers `ALREADY_ISSUED`.
- **Q5 Authority.** Only an ACTIVE platform ADMIN (`assertPlatformAdminInDatabase`) may issue, regenerate, revoke or change the invitee; a Hospital OWNER never manages this invitation, including the assisted-handoff revoke.

### Rules

- The invitable Hospital is role PARENT, never the Child of any area (active or ended), and `PENDING_VERIFICATION`, or ACTIVE without an ACTIVE OWNER. RETIRED and SUSPENDED Parents and every Child are refused.
- The invitation is an OWNER `HospitalMembership` with `invitedByUserId` = the ADMIN, `invitedViaServiceAreaId` = NULL and the submission `invitationNonce`. Changing the invitee ends the open invitation (link revoked, membership ENDED) in the same transaction; regenerating rebinds `invitedByUserId` to the issuing ADMIN.
- New activation purpose `PARENT_OWNER_ONBOARDING`, context kind `PARENT_OWNER` (SQL CHECK). Completion and acceptance re-check, in the same transaction: the membership is still the ADMIN invitation in the expected status, the account is not caregiver-claimed or behind an unresolved takeover lock, the Hospital is still an invitable Parent (pending, or ACTIVE without an ACTIVE OWNER) with no PENDING application, and the inviting/issuing ADMIN is still an ACTIVE ADMIN. Success makes the OWNER membership and, for a first OWNER, the Hospital ACTIVE. Every failure is the same generic conflict.
- REC-1 (ADR-0012): the held-OWNER exception for a non-ACTIVE Hospital covers a held Parent invitation under the same rules as a held Child invitation; reset completion returns it to `INVITED` only when its context is still valid, and the invitee accepts in their own session. ADMIN retire of a pending Hospital ends its open OWNER invitations and revokes their links, and refuses while one is held for an ADMIN reset (`HELD_OWNER_INVITATION`).
- Data integrity: at most one open OWNER invitation per Hospital, on every path, is a partial unique index (`HospitalMembership_open_owner_invitation_key`).
- Audit: `hospital.parent_owner_invited`, `hospital.parent_owner_link_issued`, `hospital.parent_owner_link_revoked`, `hospital.parent_owner_invitee_changed`, `hospital.parent_onboarded` (`via: "ADMIN_INVITATION"`), `hospital.parent_owner_replaced`, `hospital.parent_owner_invitation_accepted` / `_declined`, `hospital.owner_invitation_ended` (retire). Metadata never holds a national ID or a token.

## Consequences

- Migrations `20261201100000_workforce_activation_parent_owner_purpose` (enum value) and `20261201110000_admin_parent_owner_invitation` (owner-invitation CHECK allowing an inviter without an area, `invitationNonce`, the open-invitation partial unique index, and the `WorkforceActivation_context_check` rebuilt from `20261121100000` with the `PARENT_OWNER` branch). Existing rows keep NULL; no backfill.
- The invitee write (grantee resolution, role, membership, takeover lock, outcome) is shared by Child and Parent invitations; the Child keeps its area binding and Parent OWNER authority.
- The ADMIN directory shows which path is open per Parent (มีคำขอรออนุมัติ / มีคำเชิญเปิดอยู่). The activation page and the home invitation inbox name the Hospital and say the invitation is from ผู้ดูแลระบบ DEMI.
- Residual risks: an invitation link can be intercepted (national-ID check, 5-failure revoke, expiry); a mistyped invitee is corrected by changing the invitee. While an invitation is open the public path stays closed until the invitee activates, accepts or declines, or ADMIN changes the invitee or retires the pending Hospital; revoking only the link keeps the invitation open.
