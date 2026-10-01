# Phase 17F.0 — Family / Caregiver Relationship & Delegated Access Contract

วันที่: 2026-10-01

สถานะ: **CLOSED — G01..G08 CLOSED / OWNER APPROVED; 17F.1 CLEARED / READY FOR IMPLEMENTATION, NOT IMPLEMENTED**

Original contract inspected HEAD: `f0fd8e2373386acf108b80d28332093d2031400a` — `fix(phase-17e3): close patient onboarding lookup gap`; working tree was clean before this documentation change.

## Current-status addendum — Phase 17F.2B (2026-10-01)

Original G01..G08 foundation closeout below remains historical and unchanged. Phase 17F.1 is now IMPLEMENTED / CLOSED. [17F.2B implementation contract](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md) records Q1–Q17 owner approvals: **L01/L02/L06 CLOSED / OWNER APPROVED** only for bounded adult voluntary designated trusted-caregiver appointment reads. Relatives/non-relatives permitted; no kinship type/verification. **17F.2 CLEARED FOR IMPLEMENTATION (synthetic/demo only), NOT IMPLEMENTED; runtime Patient-resource delegated allowlist EMPTY.** Real-data delegated deployment/UAT remains externally governance-blocked pending Q5 controller/privacy evidence, not a synthetic implementation blocker.

Separate immutable family-appointment-read-v1 data grant to exact ACTIVE relationship/Patient/caregiver/one Patient-selected PHR; explicit proposal + caregiver acceptance. Exactly hospitalName/type/scheduledAt/durationMinutes/locationType/status; rolling upcoming 90-day SCHEDULED/CANCELLED ongoing same-PHR feed; NO independent automatic expiry. Existing family-delegation-v1 acceptance remains ZERO-data. Terminal exact-grant revoke or parent revoke/withdraw immediately denies after commit; temporary Hospital/account ineligibility may resume unchanged authority. No future-PHR/replacement-parent inheritance, mutations/export/other Patient resources. Expansion requires new immutable grant/version + acceptance. Lifecycle audit only, no ordinary durable per-read AuditEvent. L03 QR OPEN / 17F.3; L04 re-audit/UAT OPEN; L05 expiry/renewal OPEN / FUTURE; minors/legal representation deferred, medication 17G, 17E.2 parked. Earlier candidate/OPEN discussion below is historical and superseded only to this exact extent.

## 1. Disposition

Documentation / requirement / domain / authorization contract only. No product implementation, permissions, Prisma schema, migration, route, Server Action, UI page, invitation token, or QR generation is added. Family/Caregiver is **not implemented**.

FAM-01 foundation requirements are cleared by the explicit owner-approved decision closeout on 2026-10-01, reviewed at HEAD `7494490d4d4f2fab034dd78bf2a3764c7f020626`. P17F-G01..G08 are CLOSED; Phase 17F.1 — Family / Caregiver Relationship Security Foundation is CLEARED / READY FOR IMPLEMENTATION, not implemented. Its delegated Patient-resource capability allowlist is EMPTY. Later reads and scope changes remain gated by P17F-L01/L02. FAM-02 depends on FAM-01 and only transports an invitation. Phase 17E.3 Patient Core remains closed for its current bounded UAT contract; Phase 17E.2 general consent remains parked.

The owner-approved direction in the governing task governs future 17F slices. The current governing closeout task explicitly approves G01..G08, including ACTIVE caregiver withdrawal under G08. This approval is new evidence; it does not validate the retired erroneous C07 attribution. No contract decision grants access in current runtime.

## 2. Source Evidence

### CUSTOMER FLOW EVIDENCE

The customer whiteboard intent supplied in this task contains “ครอบครัวของฉัน”, “ผู้ที่คุณดูแล”, “ผู้ที่ดูแลคุณ”, “เพิ่มผู้ดูแล”, member selection, people/family linking, possible QR linking, and navigation toward health/care information, health plan, appointments, and medication. [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) records the earlier supplied flow evidence and FAM-01/FAM-02. No independent whiteboard image was inspected for 17F.0.

This establishes an intended workflow, not kinship proof, guardianship, medical consent, data-controller rules, clinical authority, final permissions, or legal eligibility. The owner-approved adult delegation direction is a confirmed requirement, distinct from what the whiteboard proves. The current owner decision closeout explicitly approves caregiver-initiated ACTIVE relationship withdrawal under P17F-G08, independently of whiteboard evidence.

### CURRENT IMPLEMENTATION EVIDENCE

All implementation statements below refer to the inspected HEAD, not proposed Family behavior:

| Source | Verified responsibility |
| --- | --- |
| [Current Prisma schema](../../prisma/schema.prisma) | Person, User, four roles, PatientProfile, PatientHospitalRelationship, PatientHospitalProfile, PatientOsmAssignment, purpose-specific activation/recovery, AuditEvent; no Family domain |
| [Actor resolution](../../src/modules/auth/services/actor-context-service.ts), [protected application access](../../src/modules/auth/services/application-access-service.ts) | Provider-authenticated subject maps to persisted ACTIVE User and Person; roles/memberships loaded from persistence |
| [Patient SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [SELF query](../../src/modules/patient-self/services/patient-self-query-service.ts) | PATIENT prerequisite plus server-owned identity/relationship resolution; no caregiver path |
| [SELF care query](../../src/modules/patient-self/services/patient-self-care-query-service.ts) | Bounded care and appointment projections under exact own PatientHospitalRelationship |
| [Hospital profile service](../../src/modules/patient-hospital-profile/services/patient-hospital-profile-service.ts), [effective profile values](../../src/modules/patient-hospital-profile/domain/patient-hospital-profile-values.ts) | Hospital-local profile with whole-profile legacy fallback only when local profile is absent; SELF edits do not update shared PatientProfile |
| [Directory query](../../src/modules/patient-directory/services/patient-directory-query-service.ts), [Program access](../../src/modules/patient-program/services/patient-program-access-service.ts) | Direct Hospital or exact current OSM assignment read/access predicates, separate from SELF |
| [Appointment policy](../../src/modules/appointments/policies/appointment-policy.ts), [Goal policy](../../src/modules/goals/policies/goal-policy.ts), [Follow-up policy](../../src/modules/followups/policies/followup-policy.ts) | Existing action-specific operator authority; no Family delegation |
| [Patient activation service](../../src/modules/patient-activation/services/patient-activation-service.ts), [activation token service](../../src/modules/patient-activation/services/activation-token-service.ts), [recovery service](../../src/modules/account-security/services/account-recovery-service.ts) | Purpose-bound issuance, hashed tokens, expiry/revocation, conditional claim/consume, concurrency and reconciliation patterns; not Family invitations |
| [Audit service](../../src/modules/audit/services/audit-service.ts), [audit schema](../../src/modules/audit/schemas/audit-schemas.ts) | Validated bounded audit metadata; accepts transaction client |
| [Phase 17E.3](./PHASE_17E3_PATIENT_CORE_FLOW_GAP_CLOSURE.md), [17E.0](./PHASE_17E0_PROFILE_ACCOUNT_CONSENT_CONTRACT.md), [17E.1](./PHASE_17E1_PROFILE_ACCOUNT_SECURITY_IMPLEMENTATION.md) | Current bounded onboarding/service-request/profile/account contracts; emergency contact and OSM preference grant no Family authority; broader consent open |

### ACCEPTED ARCHITECTURE

[Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), [ADR-0001 identity](../adr/0001-person-and-user-identity.md), [ADR-0002 authorization](../adr/0002-role-capability-scope-authorization.md), [ADR-0004 Patient provisioning/activation](../adr/0004-patient-provisioning-and-activation.md), [ADR-0005 application boundary](../adr/0005-server-side-application-boundary.md), [ADR-0006 transactions](../adr/0006-transactional-business-operations.md), and [ADR-0008 workforce activation](../adr/0008-workforce-provisioning-and-activation.md) establish identity reuse, capability plus resource scope, fail-closed server decisions, purpose separation, and atomic consistency-critical operations. They do not pre-approve Family capability or legal semantics.

### LEGACY / HISTORICAL BEHAVIORAL EVIDENCE

[Phase 5A provisioning](./PHASE_5A_PATIENT_PROVISIONING.md), [Phase 6A assignment](./PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md), and [Phase 10A profile analysis](./PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md) document legacy coach/contact behavior only. No external legacy source was newly fetched; this phase uses the repository's historical analysis, never legacy authentication/authorization.

[Phase 16A import contract](./PHASE_16A_CANONICAL_PATIENT_IMPORT_CONTRACT.md), [16D.2 persistence](./PHASE_16D2_INITIAL_BASELINE_ROSTER_IMPORT_PERSISTENCE.md), [16D.4A template](./PHASE_16D4A_CANONICAL_PATIENT_IMPORT_TEMPLATE.md), and the 16D.4 assignment section in [Context](../CONTEXT.md) distinguish `osmCaregiverName` / “ชื่อผู้ดูแล (อสม.)” from emergency-contact fields. Import contact-relationship wording does not establish an accepted Family relationship. Earlier profile/import deferrals are historical; 17E.1 subsequently implemented the bounded Hospital-local profile contract.

### OWNER-APPROVED REQUIREMENT CLOSEOUT

The current governing task explicitly closes P17F-G01..G08 for bounded UAT on 2026-10-01; section 18C records the approved decisions. This source is distinct from customer-flow and implementation evidence.

### OPEN REQUIREMENT

P17F-L01..L06, legal representation, new caregiver onboarding and general consent remain separate future gates. Whiteboard labels and existing read projections do not approve disclosures.

## 3. Terminology

| Term | Contract meaning |
| --- | --- |
| Patient | Person with PatientProfile; interactive SELF authority additionally requires the authenticated ACTIVE User and persisted PATIENT role. A record is not an account. |
| Family member | Product/social description of a relative; no authority follows from this label. |
| Caregiver | Broad human description; must be qualified as delegated caregiver or OSM caregiver in authority discussions. |
| Delegated caregiver | Authenticated person/account receiving only explicit scope from a competent adult Patient through accepted authoritative delegation. PATIENT role and PatientProfile are not required on the caregiver side. |
| Care recipient / Patient being cared for | Explicit Patient participant whose approved resources are the target of delegation. |
| Emergency contact | Name/phone contact information only; not account, relationship, consent giver, delegate, or legal representative. |
| OSM caregiver / PatientOsmAssignment | Operational assignment of an OSM User to an exact PatientHospitalRelationship. Separate domain and policy from Family. |
| Invite | Revocable, expiring proposal to an intended person to accept defined delegation; no Patient data authority. |
| Accepted relationship | Authoritative directional relationship after server-verified acceptance; only currently ACTIVE state and approved capabilities can authorize data access. |
| Legal representative | Person whose authority derives from a separately verified legal basis, not automatically from voluntary delegation or kinship. Deferred. |

“Family” and “Caregiver” are not guaranteed identical. Whether a caregiver must be a relative/family member or may be any Patient-designated trusted caregiver remains an OPEN product requirement under P17F-L06; G02 closes only account population, identity locator/binding and privacy decisions. 17F.1 implements no family-tree or legal kinship verification and may use known intended caregiver UAT test participants. Absence of verification does not establish non-relative eligibility. Kinship, surname, shared Hospital and emergency-contact information never independently grant authority. Existing “caregiver”, “ชื่อผู้ดูแล”, “ชื่อผู้ดูแล (อสม.)”, and “coach” in roster/work contexts mean OSM assignment where those sources map them to `osmCaregiverName`; they must not be reinterpreted as Family authority.

## 4. Domain Boundary

Conceptual responsibilities only; not final Prisma entities, column types, constraints, or enums:

| Boundary | Owns | Does not own |
| --- | --- | --- |
| Caregiver Relationship | Patient and caregiver participants, explicit direction, accepted delegation evidence, current authority lifecycle | Patient identity, User credentials, legal guardianship, OSM assignment, clinical records, mirrored UI state |
| Caregiver Invitation | Patient initiation, intended recipient binding/proof, proposed scope, bounded acceptance opportunity, terminal outcomes | Active permission, account activation/recovery, Patient registration, role assignment |
| Delegated Access Policy / Scope | Specific allowed action, Patient target and resource context, current-state decision, field projection limits | Generic act-as-Patient, all SELF capabilities, Hospital/OSM operational authority |
| Audit Events | Attribution and evidence of transitions/authority changes | Raw invite secrets, National ID, clinical contents, second relationship source of truth |

Do not reuse PatientOsmAssignment, emergency-contact fields, PatientActivation, WorkforceActivation, or AccountRecovery as Family relationship/invitation persistence. Reuse verified security patterns where responsibilities match; no generic delegation/token framework is approved.

### Repository analysis and reuse limits

1. **Caregiver identity:** existing Person plus User can represent a caregiver. `User.personId` is unique; Person has optional User and optional PatientProfile. UserRole is separate. Reuse the same identity/account for multiple roles and hospitals.
2. **Non-PATIENT authenticated User:** already exists for HOSPITAL/OSM actors. Actor resolution requires ACTIVE mapped User, not PATIENT role, and can represent an empty role list structurally. This does not prove a supported public caregiver-only provisioning/activation or navigation flow. That onboarding question stays gated; invitation acceptance never creates a Patient role to bypass it.
3. **SELF resolution:** provider subject → User.authSubject → ACTIVE User → same Person → PatientProfile → exact PatientHospitalRelationship. `ownPatientWhere` rechecks User ID, Person ID, persisted ACTIVE status and PATIENT role. A browser relationship ID only locates an owned relationship. Missing profile/ownership fails closed. PatientHospitalRelationship currently has no active/closed lifecycle status field: do not invent one from “active relationship” shorthand. SELF navigation includes Hospital status; future delegated policies must specify resource eligibility explicitly.
4. **Read candidates:** selected basic context, appointments, and selected care/Goal Plan projections are plausible because existing SELF reads are bounded and the customer flow mentions these areas. None is confirmed safe for caregiver disclosure without a field/resource decision. Raw clinical rounds, notes and contact data are not automatically candidates for full sharing.
5. **Not blind reuse:** `assertPatientSelfReadPolicy`, `resolveOwnPatientContext`, `resolveOwnPatientRelationshipContext`, all own care queries, Hospital-profile SELF updates, Patient service-request policies, and appointment SELF mutations encode ownership. Never fabricate the Patient ActorContext or substitute Patient userId/personId for caregiver. Operator access resolvers likewise require their own direct Hospital/exact OSM authority. A reviewed projection helper may be reused later only after independent delegated authorization and disclosure approval.
6. **Person-wide versus relationship scope:** Person names/identity reference and shared PatientProfile (including DOB and legacy contact fields) are Person/Patient-wide; classification/history is PatientProfile-wide. HN and PatientHospitalProfile are exact Hospital-relationship data. Screening, Baseline, Program, Goal Plan, Follow-up, Final, Evidence, Appointment and PatientServiceRequest belong to exact PatientHospitalRelationship; Program children additionally belong to the exact Program. Relationship acceptance must not silently share every Hospital, existing history, or future Hospital relationship. G03 closes foundation granularity: person-level relationship, EMPTY Patient-resource allowlist; exact delegated resource/Hospital scopes remain L01/L02 decisions.
7. **Operator-only authority:** current `goal:plan`, `followup:record`, `program:manage` are direct Hospital/exact-assigned OSM operations; `appointment:manage` is direct Hospital-only, while `appointment:create` includes exact OSM. `patient:assign-osm` is direct Hospital OWNER authority. None becomes delegated Family authority. Existing SELF appointment acknowledgement/cancellation requests are also not granted to a caregiver.
8. **OSM care visibility:** the directory's `buildOsmAssignedPatientRelationshipWhere` checks ACTIVE OSM User/role, ACTIVE exact OSM-Hospital relationship, ACTIVE Hospital and assignment `endedAt: null`. Care access resolvers use exact assignment context. Appointment OSM-at-creation is a historical display snapshot, not current authority. Family acceptance neither creates nor ends any assignment; 17E.3 OSM preference is also not assignment.
9. **Emergency contacts:** `PatientProfile.emergencyContactName/Phone` are legacy shared profile fields; `PatientHospitalProfile` has exact-relationship equivalents. Effective profile uses local values when the local row exists, otherwise legacy values; cleared local fields do not fall back individually. Import “ความสัมพันธ์” contact data is not a Family authority record. Contact presence creates no account, access, representation, consent or accepted relationship.
10. **Invitation/activation patterns:** current Patient activation generates cryptographic random token, stores SHA-256 digest, checks expiry/revoke/use and target state, supports conditional claims and reconciliation; issuance writes audit with the transaction client. Workforce and recovery have separate purpose-bound lifecycles. These are security pattern evidence, not proof that bearer activation meets Family recipient identity verification. Do not copy their issuer authority, TTL or credential/provider side effects.
11. **Audit:** AuditEvent already stores actorUserId, action, resourceType/resourceId, bounded metadata and createdAt. `recordAuditEvent` validates metadata and can participate in a transaction. Its sensitive-key filter is not a guarantee that arbitrary metadata values are safe; future Family events must use an explicit safe allowlist.
12. **Lifecycle conventions:** explicit state/timestamps, actor attribution, terminal outcomes, narrow allowed transitions, conditional concurrent writes, and idempotent retry outcomes are existing patterns (17E.3 requests, activation, assignment). Family may reuse these concepts without copying another domain's enums or TTL.
13. **ADR threshold:** a new legal representation model, a new core role, cross-Hospital authority inheritance, changed identity linking, or broad impersonation would require architecture reconsideration and potentially an ADR after requirements are approved. Choosing final Family schema and bounded projections is not itself such a decision.
14. **ADR assessment:** no accepted ADR directly contradicts this adult scoped-delegation direction. ADR-0002 already makes relationship-dependent Scope first-class and requires confirmed capability assignments. Actor roles remain input/context but neither PATIENT nor a new CAREGIVER role supplies delegated authority. This adds a future concrete scope policy, not a replacement for Role + Capability + Scope. ADR-0001/0004/0005/0006 remain intact. No ADR is created or amended in 17F.0; a future proposal that materially changes these invariants must reopen the ADR assessment.

## 5. Relationship Direction

One authoritative relationship represents **Patient being cared for → delegated caregiver**, with explicit participants and direction. UI projections use the same state:

- “ผู้ที่คุณดูแล”: authenticated actor is the caregiver; list the Patient recipients of that actor's accepted relationships.
- “ผู้ที่ดูแลคุณ”: authenticated actor is the Patient; list that Patient's caregivers.

Do not maintain mirrored relationship records for the two screens. If Patient A cares for Patient B, that does not make B a caregiver for A. Reciprocal delegation, if separately requested and authorized, is a different directional delegation; acceptance never implies reciprocity. G04 approves many-to-many semantics, at most one ACTIVE relationship and one actionable PENDING invitation per pair; self-delegation is denied. Terminal relationships never reactivate; re-establishment requires a new invitation, acceptance and relationship lifecycle. No arbitrary business maximum is introduced.

## 6. Lifecycle

Names below describe business meaning, not final enum spellings.

### A. Invitation

```text
Eligible competent adult Patient explicitly proposes defined delegation
→ server validates initiator's own identity/target and creates pending invitation
→ intended invitee authenticates
→ server verifies recipient binding, current invitation and proposed scope
→ invitee explicitly accepts
→ server atomically consumes invitation and activates authoritative relationship
→ delegated policy may allow only approved capabilities
```

Creation, preview, opening a link, scanning QR, authentication alone and pending invitation grant no Patient-resource access. Acceptance must not be a GET/navigation side effect. An authenticated wrong person must not be able to accept. Initiator authorization, recipient binding and eligibility must still hold at acceptance; invalid/ambiguous inputs deny activation.

Pending invitation can be rejected by the verified intended invitee, revoked by the initiating Patient, or expire at its server-defined deadline. Accepted/consumed, rejected, revoked or expired invitation cannot newly activate authority. Expiry is enforced at use time even if no background process has recorded an expired event. G04 permits a NEW invitation after expiry/rejection/revocation, subject to pair invariants; an existing ACTIVE relationship or actionable pending invitation prevents duplicate issuance. Outstanding invitations must not later duplicate or resurrect authority after activation/termination. G05 fixes expiry at issuedAt + 24 hours; enforcement is server-side at use/acceptance, not cleanup-job dependent. Persistence and expiry-event recording remain engineering choices.

### B. Accepted caregiver relationship

Only server-verified explicit acceptance establishes an ACTIVE relationship. In 17F.1 it grants ZERO Patient-resource capabilities: the allowlist is EMPTY.

Patient revocation is approved and audited: authority ends immediately after commit; stale browser/session state cannot retain it. G08 also approves an authenticated caregiver terminating only THEIR OWN ACTIVE relationship, using “หยุดการเป็นผู้ดูแล” with explicit confirmation and server participant verification. Withdrawal is terminal and audited; authority ends immediately after commit. It cannot revoke another caregiver, transfer authority, create a caregiver, or change Patient data/account, PatientHospitalRelationship, PatientOsmAssignment or Hospital membership. Pending-invitation rejection is a separate pre-acceptance operation and audit semantic.

No REVOKED → ACTIVE or WITHDRAWN → ACTIVE shortcut is allowed. Re-establishment requires a new invitation, explicit acceptance and new relationship lifecycle/evidence. Concurrent acceptance, revocation, expiry and retries must preserve pair invariants without duplicate grants or resurrection.

**Invitation TTL: exactly 24 hours from issuance. ACTIVE relationship: no automatic expiry in 17F.1.** It continues until Patient revocation or caregiver withdrawal. Current eligibility still applies: caregiver User must remain ACTIVE; Patient SELF operations require valid authenticated Patient authority; future reads must recheck exact resource/scope eligibility. Temporary account suspension/inactivity DENIES access but does not permanently revoke the relationship. When the same account becomes valid again, an unrevoked ACTIVE relationship may become usable again.

## 7. Identity Resolution and Linking

17F.1 supports only an existing ACTIVE User mapped to an existing Person. Caregiver PATIENT role/PatientProfile is unnecessary. Reuse Person/User; create no account, Person duplicate or CAREGIVER role through Family. New-user/caregiver-only onboarding stays deferred.

Authenticated Patient SELF enters National ID as a server-side recipient LOCATOR. The server uses the established canonical identity pipeline and canonical identity hash → Person.identityKeyHash lookup → exactly one existing Person + ACTIVE User, then binds the invitation to that intended User/Person. See [identity service](../../src/modules/identity/services/identity-service.ts). Knowledge of National ID is neither authorization nor acceptance proof; names, surname, phone similarity, shared Hospital and token possession are also insufficient. A searchable account/Patient directory is prohibited.

Raw National ID must not be persisted in Family, invitation URLs/QR, audit, relationship metadata or intentionally emitted domain logs/errors. Lookup failures must not distinguish missing Person, no User, inactive User, unsupported account or other internal state: use “ไม่สามารถสร้างคำเชิญสำหรับข้อมูลนี้ได้”.

Before preview/acceptance, authenticate and require current User to equal the intended invitation User; server-derived Person/account binding must match. Forwarding a token never transfers recipient identity. Browser identity/role claims cannot establish linkage.

## 8. Authorization Model

```text
Authenticated ACTIVE actor
+ accepted ACTIVE caregiver relationship for that actor
+ explicitly approved delegated capability
+ exact target Patient
+ resource context and current eligibility
→ server-side policy decision (default DENY)
```

The server loads current relationship participants, lifecycle and scope. It verifies that the requested Patient resource belongs to that recipient and, for Hospital data, the approved exact Hospital relationship; Program/Appointment identifiers must remain within that scope. Missing, expired where applicable, revoked, mismatched, unapproved or unresolved context denies access. Invitation state is never a grant.

PATIENT role grants no access to another Patient. The caregiver's own PatientProfile is unrelated to the recipient scope. Browser-selected Patient ID, relationshipId, workspace, QR or cached capability flags are locators/UI hints only. No self-service ownership rewrite or Patient ActorContext impersonation is permitted.

Delegated reads use a separate server-side authorization path and approved projections. No operational-role fallback may widen a Family response. A dual-role actor can independently use an existing Work path only if its unchanged Work policy permits it. Platform ADMIN is not a routine delegation issuer, accepter on behalf of others, or Patient-data bypass. Server-authoritative checks apply to every future read/mutation and cache/download path; stale cached data must not authorize a fresh response after revocation. Previously seen information cannot be technically recalled; this limitation does not permit continued server access.

## 9. Initial Delegated Capability Candidates

**No Patient-resource read capability is approved by 17F.0.** Candidate means eligible for a later explicit disclosure decision, not authorization. 17F.1 exposes only bounded relationship/invitation management metadata and grants ZERO Patient-resource access; its capability allowlist is EMPTY.

| Capability / Resource | Customer evidence | Current implementation source | Proposed UAT disposition | Mutation? | Open decision / gate |
| --- | --- | --- | --- | --- | --- |
| View Patient basic profile subset | Member selection; health context | SELF query; Hospital profile service | Candidate for 17F.2; DENY pending allowlist | No | Exact fields, minimal identity display, source/Hospital scope |
| View appointments | Family context leads to appointments | SELF care appointment projection; 17D.1 | Candidate for 17F.2; DENY pending approval | No | List/detail/history, dates/location/staff and acknowledgement visibility |
| View selected care journey information | Health/care navigation | SELF care query: Screening timestamp, Baseline, Program, Follow-up/Final | Candidate subset for 17F.2; DENY pending approval | No | Which facts, rounds/history, notes, units and clinical sensitivity |
| View health plan / Goal Plan projection | Health-plan wording | PatientGoalPlan / SELF Goal detail; CARE-06 gate | Candidate only for explicitly approved existing Goal projection | No | Goal Plan is not final Health Plan semantics; fields and prototype meaning |
| Medication | “ยา” navigation | No medication domain; MED-01/02 | DEFERRED to 17G; DENY | Read/write outside 17F | Medication requirement and separate future sharing approval |
| Edit Patient profile | No confirmed delegated edit | 17E.1 SELF Hospital profile policy | DENIED | Yes | Later explicit requirement only |
| Acknowledge/cancel-request/reschedule appointment | Navigation does not approve action | 17D.1 SELF/exact OSM interactions; Hospital manage | DENIED, including respond/reschedule | Yes | Later explicit requirement only; cannot copy SELF interactions |
| Create clinical data / clinical plan mutation | No approved authority | Screening/Goal/Follow-up/Program operator services | DENIED | Yes | Separate clinical authority contract |
| Credential/password changes | None | Account security; existing auth boundary | DENIED | Yes | No Patient credential delegation |
| Account recovery | None | Assisted recovery, separate verified operator flow | DENIED | Yes | Caregiver relationship supplies no recovery proof |
| Hospital affiliation / HN / identity changes | None | Patient provisioning/relationship domain | DENIED | Yes | No delegated Hospital relationship authority |
| Consent signing / Patient impersonation | None | 17E.2 consent unresolved; no proxy account | DENIED | Yes | Legal representation and consent are separate gates |
| Submit Patient service request | No delegated submission evidence | 17E.3 PatientServiceRequest SELF | DENIED | Yes | Later explicit requirement only |
| Invite another caregiver | “เพิ่มผู้ดูแล” Patient-side intent | No Family service | APPROVED DIRECTION for eligible Patient initiating own delegation; caregiver subdelegation DENIED | Yes | G01..G03 CLOSED; existing ACTIVE recipient; EMPTY resource allowlist |
| Revoke caregiver relationship / pending invitation | Owner-approved direction | No Family service | APPROVED DIRECTION for initiating/recipient Patient only | Yes | G04/G06 CLOSED; future lifecycle/audit implementation |
| Reject own pending invitation | Owner-approved G04/G06 | No Family service | APPROVED for intended authenticated invitee before acceptance; not ACTIVE withdrawal | Yes | G04/G06 CLOSED; future implementation |
| Caregiver-initiated ACTIVE relationship withdrawal / self-removal | Explicit current owner decision G08 | No Family service | APPROVED: own ACTIVE relationship only; explicit confirmation, terminal, immediate authority loss after commit, audited | Yes | P17F-G08 CLOSED; new invitation/acceptance required for re-establishment |

These are contract descriptions, not new permission strings or role-to-capability assignments in product code. Relationship management authority does not imply permission to invite on behalf of the Patient or delegate onwards.

## 10. Privacy / Field Projection

Do not serialize entire Patient, Person, User, Hospital-profile or clinical models. Delegated reads must use explicit allowlisted projections narrower than or separately reviewed from SELF. Data visibility remains denied until resource/field decisions are approved; even a field visible to Patient SELF is not automatically shareable.

| Field group | Required boundary |
| --- | --- |
| National ID / identityKeyHash | Excluded from caregiver discovery, invite preview, delegated response and audit metadata; knowledge never proves authority |
| Password, provider subject/alias, auth/session/security credentials | No delegated disclosure or management |
| HN / Hospital-local identifiers, relationship navigation | Explicit scope/disclosure decision; no all-Hospital list from acceptance alone |
| Clinical records, measurements, Screening responses/results, notes, classifications, artifacts | Explicit resource/field approval; no whole-care-history export or clinical meaning inferred from UI labels |
| Emergency contact name/phone/relationship description | Third-party information; contact-only; explicit disclosure decision, no Family identity resolution |
| Patient/caregiver phone/email/address/DOB | Explicit necessity and visibility decision; not a lookup proof or automatically shared contact directory |
| Audit/security metadata/internal IDs | Keep internal unless a specific safe management projection is approved; no provider or secret references |
| Display names and minimal relationship labels/status | Bounded management/preview only: Patient display name, invitation state/expiry, acceptance explanation/version; no kinship/health inference or Patient-resource projection |

PatientProfile legacy fallback must not inadvertently reveal another Hospital's contact values. Hospital-local data is not made Person-wide by a Family view. Delegated history depth, future records, downloads and retention/disclosure rules are separate approvals, not an “all Patient permissions” shortcut.

## 11. Consent / Acceptance

Authenticated Patient SELF initiates voluntarily in competent-adult UAT scenarios; intended authenticated caregiver explicitly accepts that exact invitation. Runtime does not determine legal adulthood/capacity from DOB or any heuristic. Acceptance contract/version is `family-delegation-v1`, with meaning equivalent to:

> ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแลของบุคคลนี้
> การยอมรับนี้ยังไม่ทำให้คุณมีสิทธิ์เข้าถึงข้อมูลสุขภาพใด ๆ
> นอกเหนือจากสิทธิ์ที่ระบบอนุญาตอย่างชัดเจน

Evidence conceptually identifies Patient initiator, caregiver accepter, Patient target, invitation, authoritative relationship, acceptance contract/version, creation/acceptance timestamps and terminal timestamp where applicable. Both parties must understand EMPTY resource scope, start, Patient revocation, own ACTIVE withdrawal and separate pending rejection. These are conceptual requirements, not final schema fields. No later scope expansion without L01/L02 approval; acceptance does not grant unknown capabilities.

This is **delegated-access consent/acceptance**, not a determination of legal health-processing basis. It does not replace Terms acceptance, Privacy acknowledgement, health-processing consent, marketing consent or consent signing by a legal representative. It **does not close Phase 17E.2** or P17E-CONSENT-01..03. If controller/legal approval is necessary for a proposed data disclosure, that disclosure remains gated independently of a successfully accepted relationship.

## 12. Revocation and Audit

Required distinguishable conceptual events include `caregiver_invitation.created`, `.accepted`, `.rejected`, `.revoked`, and `caregiver_relationship.activated`, `.revoked`, `.withdrawn`. Effective invitation expiry and its evidence must align without relying on a job for enforcement. Exact code constants may follow repository conventions; semantics must stay distinct. Later scope-change events require separate approval.

Patient revocation and G08 own-caregiver withdrawal end authority immediately after commit; all subsequent server decisions must reject stale grants/browser/session state. Withdrawal affects only the actor's own relationship; pending rejection does not terminate an ACTIVE relationship. In-flight race/cache behavior must be verified; no winning revoke/expiry can be bypassed by retry.

Use existing audit infrastructure and coordinate successful transition evidence with persistence per ADR-0006. Acceptance/consumption/activation must succeed together or fail; revocation/withdrawal and their required audit must not report partial success. Audit failure cannot leave a falsely successful operation. No-op retries must not duplicate grants or fabricate transitions.

No raw secrets, token digests, raw National ID, unnecessary identity hash, passwords, provider/session data, unnecessary names/contact data or clinical content in audit metadata. Exact event names and safe metadata fields are implementation details; this closeout does not approve new audit disclosure/retention policies; expansions need explicit later approval. Revocation removes Family authority, not independently valid Work/SELF authority, and does not erase care records or account credentials.

## 13. QR Contract

FAM-02 depends on the secure FAM-01 mechanism. QR is invitation transport only, equivalent in authority to opening the secure invite link. **QR is not authority.**

Future QR wraps an opaque high-entropy bounded-use invitation reference/token. It must not encode Patient ownership, Patient role, permission payload, arbitrary patientId authority, Hospital authority or clinical authority. No raw Patient identity/clinical data is encoded. Recipient must authenticate, be verified as intended recipient, and explicitly accept; the server alone creates the scoped relationship.

Purpose binding, expiry, revocation, replay/concurrency protection, safe preview and secret leakage controls are required for the underlying invitation before QR. A forwarded/stolen QR cannot retarget the invite. No credential activation or Patient impersonation is triggered by scan. Crypto/token format and delivery details remain engineering/later transport decisions; the invitation deadline is fixed by G05 at 24 hours; activation TTL/claim semantics are not automatically inherited. **No QR is implemented in 17F.0.**

## 14. Minor / Legal Representative Gate

**REQUIREMENT-GATED and excluded from the first implementation contract:** minors, parental authority over minors, court-appointed guardian, legally incapacitated Patient, power of attorney, statutory/legal representative and proxy created solely by Hospital staff without Patient authorization.

Adult voluntary delegation cannot establish these authorities: who may initiate/accept, capacity, legal evidence, verification owner, jurisdiction, competing representatives, permissible acts, expiry/review and loss of authority need a distinct legal-authority contract. A parent's/guardian's account, contact entry, shared surname or QR does not resolve those questions. Delegated caregiver is not automatically legal representative. Do not derive a legal adult/capacity conclusion solely from current DOB/age presentation; G01 supports competent-adult voluntary UAT actors/test data, not runtime legal-capacity verification or guardianship verification.

## 15. Multi-Role / Multi-Hospital Effects

| Example | Required result |
| --- | --- |
| Patient A is caregiver for Patient B | Same Person/User; A's SELF covers A only. B's scope comes solely from B's accepted delegation. |
| OSM A cares for a family member | Work assignment and Family relationship remain independent. Ending either does not mutate the other; Family response cannot use OSM rights as fallback. |
| Hospital staff A is also Patient and caregiver | Existing roles/memberships persist. SELF, Work and delegation authorize independently for each resource/action. |
| Caregiver belongs to another Hospital | Their membership grants no Family access and creates no Patient Hospital relationship. Only explicitly approved recipient resource scope may be used; cross-Hospital disclosure rules remain gated. |
| Caregiver has no PATIENT role | Valid authenticated existing HOSPITAL/OSM User may be a delegate; no extra PatientProfile or PATIENT role needed. Caregiver-only account onboarding/navigation is not assumed implemented. |
| Platform ADMIN | No default Patient data, routine proxy issuance, or operational Hospital bypass through Family. A person's own independently valid delegation would still be bounded by the same approved policy. |

Hospital membership, common Hospital, parent/child hierarchy and same surname never imply Family access. Accepting a relationship must not expose all current or future recipient Hospitals. G03/G05 settle EMPTY foundation resource scope and temporary-account ineligibility; future data reads still require L01/L02 exact Hospital/resource eligibility decisions.

## 16. Threat Model / Abuse Cases

| Abuse case | Required invariant / future mitigation |
| --- | --- |
| Stolen QR / invitation URL | No access from possession; authenticate and verify intended recipient; expiry/revoke; safe limited preview. |
| Invite forwarded | Recipient binding remains unchanged; no transfer to first authenticated scanner. |
| Wrong authenticated person accepts | Server compares verified target identity and denies mismatch/ambiguity; G02 requires exact intended User binding after canonical/hash locator resolution. |
| Client changes Patient/resource/relationship ID | Server binds actor → ACTIVE delegation → exact recipient → exact approved resource context; deny cross-target lookup. |
| Revoked relationship with stale browser state | Fresh server policy denies after revoke commit; no cached positive grant or old token reactivation. |
| More resources than delegated | Capability and field allowlists plus exact Hospital/Program/resource scope; no all-history/all-Hospital/Work fallback. |
| Emergency contact treated as caregiver | Contact fields never grant permission, create accounts or relationship acceptance. |
| OSM assignment confused with Family | Separate domain/access path; no conversion or inference from assignment/preference/snapshot. |
| Caregiver invites another caregiver | Deny subdelegation; Patient initiation only for own authorized delegation. |
| Duplicate Person/User | Reuse authoritative identity; unresolved linkage fails closed; no automatic duplicate onboarding via invite. |
| Invitation replay/concurrent acceptance | Bounded-use conditional consumption and atomic activation; retries cannot create duplicate authority or revive terminal states. |
| Account/Patient enumeration | Bounded discovery/proof and non-disclosing errors/preview; no public identity/account directory, names or Patient existence inferred from status responses. |
| Patient revoke races accept / scope change | Current-state validation and atomic ordering; winning revocation/expiry defeats acceptance, no silent scope expansion. |
| Token in logs/referrers/history/analytics | Secret transport/presentation reviewed; no raw secret in audit/errors/Patient links; eventual QR shares the same safeguards. |
| Compromised/suspended account or invalid eligibility | Authentication alone insufficient; current account and scope eligibility checked; temporary suspension denies without permanent revocation; valid same-account resumption permitted under G05. |
| Invitation spam / coercive delegation | Abuse controls, explicit voluntary acceptance, pending-invitation rejection and Patient revocation; G07 bounded UAT controls apply; production shared/distributed abuse protection remains a hardening gate. G08 approves explicit own ACTIVE withdrawal. No consent presumed from silence. |

These are future acceptance requirements, not claims that controls were implemented or tested by this documentation phase.

## 17. Explicit Non-Goals

- No CAREGIVER Role enum; top-level roles remain ADMIN, HOSPITAL, OSM, PATIENT.
- No Patient impersonation, act-as-Patient or full proxy account.
- No medication implementation (Phase 17G remains separate).
- No minor/legal guardian/legal representative implementation.
- No QR implementation in 17F.0.
- No family-tree/social graph or legal kinship verification in 17F.1; kinship alone grants no authority. Product relationship eligibility remains P17F-L06.
- No emergency-contact permission, account creation, implied consent or representation.
- No OSM reassignment or operational care-visibility behavior change.
- No broad consent implementation or Phase 17E.2 closure.
- No Patient clinical write delegation, appointment mutation, profile edit, consent signing, credential/recovery or Hospital affiliation delegation.
- No schema/migration, route, action, product permission or UI implementation in 17F.0.
- No generic delegated-access framework, redesign of SELF, weakened exact Hospital/OSM scope, or widened Platform ADMIN operation.

## 18. Decision Register

Each gate needs an explicit recorded owner/product decision; privacy/legal owners decide legal bases and retention where relevant. Engineering choices must demonstrate the approved invariant and cannot silently close product/legal gates.

### A. Decisions CLOSED by 17F.0

| ID | Decision | Basis |
| --- | --- | --- |
| P17F-C01 | Competent adult Patient voluntary delegation first; Patient initiates, intended authenticated caregiver accepts | Owner-approved direction |
| P17F-C02 | Reuse Person/User; caregiver need not have PATIENT role/profile; no CAREGIVER role | Owner direction; ADR-0001/0002 |
| P17F-C03 | One directional authoritative relationship, two UI projections; no mirrored state | Owner direction |
| P17F-C04 | Invitation/QR possession never grants access; verified explicit acceptance required | Owner direction; Phase 17A |
| P17F-C05 | Current ACTIVE relationship plus explicit capability, recipient and resource scope; separate server path; default DENY | Owner direction; ADR-0002/0005 |
| P17F-C06 | Patient can revoke; subsequent decisions deny immediately; transition audited | Owner direction |
| P17F-C08 | Invitation expiry required; relationship expiry is a separate decision | Owner direction |
| P17F-C09 | Narrow approved reads only later; no approved Patient-data reads in 17F.0; writes/subdelegation/impersonation denied | Owner direction; insufficient disclosure evidence |
| P17F-C10 | OSM assignment and emergency contact are separate, non-Family authority sources | Current domain evidence; owner direction |
| P17F-C11 | Delegation acceptance is separate from general/legal consent; minors/legal authority excluded | Owner direction; 17E.2 remains parked |
| P17F-C12 | QR after FAM-01; no ADR replacement or generic delegation framework needed for this bounded contract | ADR assessment in section 4 |

P17F-C07 is retired as **ERRONEOUS / NOT A DECISION**. It confers no accepted business requirement; caregiver-initiated ACTIVE relationship withdrawal is approved only by the new explicit current decision P17F-G08. Other closed decision IDs remain unchanged.

### B. Decisions intentionally DEFERRED

| ID | Deferred topic | Boundary |
| --- | --- | --- |
| P17F-D01 | Minor/guardian/incapacity/power-of-attorney/legal representation | Distinct future legal-authority contract; not a blocker to the G01-approved bounded adult voluntary UAT foundation |
| P17F-D02 | Clinical/profile/appointment writes, credential/recovery/affiliation, consent signing, subdelegation | Denied; only reopen with later explicit requirement |
| P17F-D03 | Medication and its possible future sharing | Phase 17G plus separate delegation decision |
| P17F-D04 | Family tree/social graph; broad proxy account | Outside approved Family scope |
| P17F-D05 | General consent/controller semantics | Phase 17E.2; proposed disclosures separately require any applicable legal approval |
| P17F-D06 | New caregiver-only/new-account onboarding | Separate requirement; G02 approves existing ACTIVE mapped accounts only for 17F.1 |

### C. Pre-17F.1 decisions CLOSED / OWNER APPROVED (2026-10-01)

All G01..G08 are closed by the explicit current governing task. Phase 17F.1 is CLEARED / READY FOR IMPLEMENTATION, NOT IMPLEMENTED. The earlier correction remains valid: C07 was erroneous; G08 supplies new approval, not retroactive validation.

| ID | Status | Approved bounded decision |
| --- | --- | --- |
| P17F-G01 | CLOSED / OWNER APPROVED | Authenticated Patient SELF voluntary delegation to authenticated caregiver; competent-adult UAT actors/test data only. Runtime establishes no legal adulthood/capacity from DOB/heuristics; no guardianship verification. |
| P17F-G02 | CLOSED / OWNER APPROVED | Existing ACTIVE User + existing Person only; no PATIENT/profile requirement or new account. National ID is canonical server-side hash locator through Person.identityKeyHash, not authority/proof; exact intended User acceptance binding, non-enumerating failures, no raw identity persistence/disclosure in Family. |
| P17F-G03 | CLOSED / OWNER APPROVED | Person-level Patient/PatientProfile ↔ caregiver User/Person delegation, not Hospital membership. 17F.1 Patient-resource allowlist EMPTY; future capability + exact Patient + exact PatientHospitalRelationship/resource + eligibility needed. No all-Hospital/history/future-Hospital/SELF inheritance. |
| P17F-G04 | CLOSED / OWNER APPROVED | Many-to-many, no arbitrary maximum; max one ACTIVE relationship and one actionable PENDING invitation per pair; deny same Person/User self-delegation. Duplicate pending/ACTIVE prevents new issuance. New invite allowed after terminal invitation; terminal relationships never reactivate. New invitation + explicit acceptance + new lifecycle/evidence required; old outstanding invitations cannot duplicate/resurrect authority. |
| P17F-G05 | CLOSED / OWNER APPROVED | Invitation expiresAt = issuedAt + 24 hours, enforced server-side at use/acceptance. No automatic ACTIVE relationship expiry in 17F.1. Patient revoke/own caregiver withdrawal terminate. Current eligibility required; temporary account ineligibility denies but does not permanently revoke; valid same-account resumption allowed if relationship still ACTIVE. |
| P17F-G06 | CLOSED / OWNER APPROVED | Explicit Patient initiation + intended authenticated acceptance of exact invite; family-delegation-v1 meaning and conceptual participant/invite/relationship/version/timestamp evidence in section 11. Distinct creation/accept/reject/revoke/activate/withdraw audits, safe metadata, transactional successful-transition evidence; no general consent/legal representation claim. |
| P17F-G07 | CLOSED / OWNER APPROVED | Authenticated Patient SELF-only creation; no public creation endpoint. Server-only hashed locator, generic error, exact authenticated recipient preview/acceptance. Preview only Patient display name, invite state/expiry and acceptance explanation/version; no ID/HN/health/Hospital-history/contact/security metadata. Bounded UAT controls below; broader production abuse protection deferred. |
| P17F-G08 | CLOSED / OWNER APPROVED | Accepted caregiver explicitly confirms “หยุดการเป็นผู้ดูแล”; server verifies own ACTIVE participation. Terminal withdrawal affects own relationship only, authority ends immediately after commit and audited. No other participant/data/account/OSM/Hospital mutation or transfer; no WITHDRAWN → ACTIVE. Reinvite + new acceptance/lifecycle only; pending rejection separately represented/audited. |

Invitation creation is authenticated Patient SELF only, with no public Family creation endpoint. Preview requires authentication and exact intended-account match before sensitive context is shown. Preview must exclude National ID, HN, health data, Hospital history, unnecessary contact information and internal auth/security metadata.

G07 baseline: authenticated Patient-only issuance, existing ACTIVE intended recipient, exact binding, one actionable pending invitation per pair, server validation, generic non-enumerating lookup error, 24-hour TTL, bounded preview and server lifecycle enforcement. Do not claim an in-process rate limiter is adequate production protection. Distributed/shared abuse protection and rate limiting for broader production exposure remain a deployment hardening gate, consistent with public onboarding.

Engineering still chooses/reviews purpose-specific schema/indexes, secure high-entropy token storage/transport, conditional transitions, concurrency/idempotency, transactional audit and focused verification. These implementation choices cannot add Patient-resource capabilities or invent legal semantics. No Prisma design is finalized by this closeout.

### D. Later-slice gates — current 17F.2B disposition

| ID | Gate | Required answer |
| --- | --- | --- |
| P17F-L01 | CLOSED / OWNER APPROVED (bounded 17F.2 only) | Appointment-only exact six-field B1, rolling 90-day SCHEDULED/CANCELLED, no past/export/mutation. Synthetic/demo cleared; real-data Q5 controller/privacy gate remains. See [17F.2B](./PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md). |
| P17F-L02 | CLOSED / OWNER APPROVED (bounded 17F.2 only) | One exact PHR per separate immutable accepted family-appointment-read-v1 grant; no inherited future PHR/parent, new acceptance for expansion, terminal revoke, temporary eligibility deny/resume, no independent expiry; Q3A ongoing rolling feed explicitly approved. |
| P17F-L03 | OPEN — Before 17F.3 QR | Confirm final secure-link wrapping, QR presentation/leakage/preview controls and mobile handoff; no new authority. Underlying token/proof mechanism already required in 17F.1. |
| P17F-L04 | OPEN — Before 17F.4 closure | Confirm UAT actors/data, supported mobile flows, concurrency/stale-cache/revocation scenarios and audit evidence for delivered capabilities. |
| P17F-L05 | OPEN / FUTURE — later auto-expiry/renewal expansion | First data grant has explicitly approved NO independent expiry (Q17), not inherited from G05. Any later expiry/renewal/periodic reacceptance/notification needs duration, expiry boundary and acceptance/notification semantics approved before implementation. |
| P17F-L06 | CLOSED / OWNER APPROVED (adult voluntary slice) | Patient-designated trusted caregiver, relatives and non-relatives permitted; no relationship-type field or kinship verification. No verified-relative/legal-representative/minor authority. |

## 19. Recommended Execution Plan and Handoff

| Slice | Exact future scope | Exit boundary |
| --- | --- | --- |
| 17F.0 — this task | Contract and explicit G01..G08 owner decision closeout | CLOSED; 17F.1 cleared, no feature implemented |
| 17F.1 — Family / Caregiver Relationship Security Foundation | CLEARED: purpose-specific persistence, server lifecycle/policies, secure invitation, existing ACTIVE recipient National-ID canonical/hash locator, intended-account binding, 24-hour expiry, explicit authenticated accept, pending reject, Patient revoke, own ACTIVE caregiver withdrawal, audit, concurrency/idempotency, minimal relationship/invitation-management UI and two relationship-management projections only | EMPTY Patient-resource capability allowlist; no profile/appointment/care/Goal/medication/clinical/service-request reads or writes, impersonation, recovery, consent signing, legal guardian, new-account onboarding or QR; focused atomic/cross-role lifecycle verification |
| 17F.2 — Family UI + Approved Delegated Reads | “ผู้ที่คุณดูแล” / “ผู้ที่ดูแลคุณ”, relationship-aware navigation; only L01-approved projections and L02-approved scope acceptance | Exact recipient/Hospital/resource authorization and data-minimization tests; no act-as-Patient |
| 17F.3 — QR Invitation Transport | Wrap the existing secure invitation mechanism after L03 | Same auth/proof/accept/revoke/expiry decisions as secure link; no permission payload |
| 17F.4 — Re-audit / UAT Closure | Cross-role and cross-Hospital isolation, lifecycle races, stale/revoked access, mobile flow, audit, minimization, regressions for delivered scope | Evidence-backed closure only for implemented approved adult delegation |

Do not collapse contract, permission projection and QR into one implementation slice. G01..G08 are closed and clear only the exact security foundation. L01/L02 block Patient-resource reads/scope expansion; L03 blocks QR transport until the secure foundation exists; minors/legal representation, broader consent and medication remain separate. Accepted ADR-0001 identity reuse (including canonical identity hashing), ADR-0002 resource-derived scope, ADR-0005 server fail-closed boundary and ADR-0006 transactional evidence were re-reviewed: no contradiction or new ADR is required. These bounded phase business rules introduce no role, identity replacement, inherited cross-Hospital authority or impersonation architecture.

## 20. Documentation Validation Boundary

17F.0 verification is documentation-only: review complete diff, changed-file scope, local Markdown targets, UTF-8/Thai preservation, `git diff --check`, and consistency with Context, backlog, Phase 17A/17E.3, baseline and ADRs. Product tests, build and dev server are not warranted and are not executed for this phase. This contract records future verification requirements; it does not claim runtime Family security or UAT tests passed.
