# ADR-0012 — Global credential recovery requires independent owner proof

Status: Accepted security restriction for the workforce v2 remediation; recovery product decision pending.
Supersedes: ADR-0008 D3 credential-replacement trust and Phase 17E.1 assisted-recovery ownership assumptions.

## Context

One User credential authorizes all persisted roles and Hospital memberships. An issuer who sees
an assisted bearer token and knows the National ID can complete the same ceremony as the target.
Staff attestation, ADMIN/OWNER authority and issuer sign-out do not independently prove account
ownership. Existing verified current-password change provides user-controlled proof but cannot
serve a user who has forgotten that password. No approved universal recovery proof exists.

## Decision

Distinguish Hospital authority to request recovery, authority to supervise/approve assistance,
actual independent account-owner proof, and permission to replace the global credential. The first
two never imply the latter two. Disable workforce RESET and Patient assisted recovery at all
service entry points, including Patient-only, ADMIN and cross-scope targets. Remove the reachable
replacement execution paths. Preserve normal login, authenticated current-password change and
first-time activation; do not split identities or add messaging/external providers.

Forward-only migrations revoke outstanding unsupported capabilities while retaining hashes,
claims and consumed history. Unfinished claimed recovery quarantines auth-owned application
access even after revocation/expiry, because provider effects cannot be assumed rolled back.
Controlled reconciliation must preserve evidence and may not clear claims solely on ADMIN
attestation. See the [operation runbook](../phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md).

## Consequences and pending decision

Thai UI explains the unavailable workflow and directs operational escalation without collecting
additional PII or passwords. Users who cannot supply their current password have no supported
replacement path until product/security owners approve independent proof and reconciliation
for users without universal email, phone, smartphone, OTP or external identity. Future recovery
must bind exact immutable authorization context, reauthorize at completion, serialize per User
and durably distinguish ambiguous provider effects from local commits. The unavailable feature
is SECURITY_GATED, never VERIFIED_COMPLETE. Historical decisions/tests remain historical evidence.


## Addendum — first credential of an unactivated PATIENT identity

The same ownership argument applies to **initial** credentials: a workforce activation token and
the national ID typed by its issuer do not prove ownership of the global credential of a User that
already owns the Patient domain and has not activated it. The workforce activation flow therefore
refuses such Users at issuance and at every activation step (see ADR-0008 amendment
"identity ownership and single-Hospital pending scope"). No recovery or replacement path is added
and no restriction in this ADR is weakened.


Addendum (review `6a68463`): the same rule applies in both directions. Neither a Patient activation token
nor a workforce activation token, nor staff attestation or the national ID, establishes ownership of a
global credential for authority the other domain already holds. Patient activation is now refused for
`PROVISIONED` Users with pending workforce authority. Patient-only activation still has no independent
owner proof and remains an undecided SECURITY_GATED item. No recovery path is added.
