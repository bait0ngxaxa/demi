# Phase 17F.0 — Family / Caregiver Relationship & Delegated Access Contract

วันที่: 2026-10-01

สถานะ: **DOCUMENTATION CONTRACT COMPLETE; IMPLEMENTATION REQUIREMENT-GATED**

Inspected HEAD: `f0fd8e2373386acf108b80d28332093d2031400a` — `fix(phase-17e3): close patient onboarding lookup gap`; working tree was clean before this documentation change.

## 1. Disposition

Documentation / requirement / domain / authorization contract only. No product implementation, permissions, Prisma schema, migration, route, Server Action, UI page, invitation token, or QR generation is added. Family/Caregiver is **not implemented**.

FAM-01 is converted into a bounded competent-adult delegated-access contract. Its authority and lifecycle invariants are settled below, but the explicit pre-17F.1 decisions in section 18C remain gates. This is not unconditional implementation readiness. FAM-02 depends on FAM-01 and only transports an invitation. Phase 17E.3 Patient Core remains closed for its current bounded UAT contract; Phase 17E.2 general consent remains parked.

The owner-approved direction in the governing task governs future 17F slices. Caregiver-initiated withdrawal from an ACTIVE relationship remains an OPEN DECISION under P17F-G08; the instruction to determine whether it should be supported is not approval. No contract decision grants access in current runtime.

## 2. Source Evidence

### CUSTOMER FLOW EVIDENCE

The customer whiteboard intent supplied in this task contains “ครอบครัวของฉัน”, “ผู้ที่คุณดูแล”, “ผู้ที่ดูแลคุณ”, “เพิ่มผู้ดูแล”, member selection, people/family linking, possible QR linking, and navigation toward health/care information, health plan, appointments, and medication. [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) records the earlier supplied flow evidence and FAM-01/FAM-02. No independent whiteboard image was inspected for 17F.0.

This establishes an intended workflow, not kinship proof, guardianship, medical consent, data-controller rules, clinical authority, final permissions, or legal eligibility. The owner-approved adult delegation direction is a confirmed requirement, distinct from what the whiteboard proves. Caregiver-initiated ACTIVE relationship withdrawal is not an approved requirement; see P17F-G08.

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

### OPEN REQUIREMENT

The decision register in section 18 is authoritative for what remains unresolved. Whiteboard labels, current read projections, and activation TTLs cannot close these requirements.

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

“Family” and “Caregiver” are not guaranteed identical. A non-relative could be a delegate if product requirements allow it; kinship eligibility is still an explicit gate, never an inferred authorization test. Existing “caregiver”, “ชื่อผู้ดูแล”, “ชื่อผู้ดูแล (อสม.)”, and “coach” in roster/work contexts mean OSM assignment where those sources map them to `osmCaregiverName`; they must not be reinterpreted as Family authority.

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
6. **Person-wide versus relationship scope:** Person names/identity reference and shared PatientProfile (including DOB and legacy contact fields) are Person/Patient-wide; classification/history is PatientProfile-wide. HN and PatientHospitalProfile are exact Hospital-relationship data. Screening, Baseline, Program, Goal Plan, Follow-up, Final, Evidence, Appointment and PatientServiceRequest belong to exact PatientHospitalRelationship; Program children additionally belong to the exact Program. Relationship acceptance must not silently share every Hospital, existing history, or future Hospital relationship. The granularity choice is a pre-17F.1 gate.
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

Do not maintain mirrored relationship records for the two screens. If Patient A cares for Patient B, that does not make B a caregiver for A. Reciprocal delegation, if separately requested and authorized, is a different directional delegation; acceptance never implies reciprocity. Exact cardinality/duplicate/re-invitation rules remain section 18C decisions.

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

Pending invitation can be rejected by the verified intended invitee, revoked by the initiating Patient, or expire at its server-defined deadline. Accepted/consumed, rejected, revoked or expired invitation cannot newly activate authority. Expiry is enforced at use time even if no background process has recorded an expired event. Reissue/rejection behavior and evidence requirements need the section 18C decisions; the persistence and expiry-event recording mechanism are subsequent engineering choices within that approved behavior.

### B. Accepted caregiver relationship

Only a server-verified acceptance establishes ACTIVE relationship authority. ACTIVE is necessary, not sufficient: the capability allowlist may be empty in the foundation slice, and resource scope/eligibility must also pass policy.

Patient revocation is approved: it ends that relationship's delegated authority immediately after commit, requires audit attribution, and must deny subsequent server decisions despite stale browser/session state. Caregiver-initiated termination of an ACTIVE relationship remains **REQUIREMENT-GATED / DECISION PENDING** under P17F-G08. No default support, scope, timing, UI state, audit evidence or reinvitation behavior is chosen. Rejecting a pending invitation is a separate operation before acceptance; it does not terminate an ACTIVE relationship.

No automatic reactivation from an old invite or retained browser state. Future re-delegation must obtain a new valid explicit authorization/acceptance; record reuse/history rules remain gated. Acceptance racing revocation/expiry, retries, and concurrent duplicate acceptance must not create multiple grants or resurrect authority; future persistence must enforce the chosen invariants atomically.

**Invitation expiry is required; exact duration open. Relationship auto-expiry is separate and unresolved.** No arbitrary relationship duration or indefinite-legal-consent claim is introduced. Unresolved expiry/eligibility behavior cannot default to broad access. Account suspension/unmapped authentication denies access even if relationship state is ACTIVE; whether recovery of account eligibility resumes delegation or requires renewal is a pre-17F.1 lifecycle decision.

## 7. Identity Resolution and Linking

The caregiver must authenticate through the existing account boundary. The server resolves ACTIVE User and linked Person; never trust browser-submitted identity, role or account ownership. Reuse existing Person/User, including non-PATIENT accounts. A Person without a usable account cannot accept via token possession alone.

The invitation must target the intended authenticated person. Before 17F.1, confirm the recipient-binding/proof mechanism and how the Patient selects/confirms that person without disclosing a searchable Patient/account directory. Name, surname, phone similarity, National ID knowledge, shared Hospital and token possession are insufficient individually. Matching a locator is not identity proof. Forwarding an invitation must not transfer the intended recipient binding.

Do not create Person/User duplicates or auto-provision a PATIENT account to make the flow work. Caregiver-only/new-account onboarding remains a separate requirement; a bounded existing-ACTIVE-account-only first slice is an engineering recommendation requiring the decision in section 18C, not an already implemented/approved registration route.

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

**No Patient-resource read capability is approved by 17F.0.** Candidate means eligible for a later explicit disclosure decision, not authorization. 17F.1 may expose only approved minimal relationship/invitation management metadata after its gates; it must grant no broad Patient data access.

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
| Invite another caregiver | “เพิ่มผู้ดูแล” Patient-side intent | No Family service | APPROVED DIRECTION for eligible Patient initiating own delegation; caregiver subdelegation DENIED | Yes | Foundation recipient/eligibility/scope gates |
| Revoke caregiver relationship / pending invitation | Owner-approved direction | No Family service | APPROVED DIRECTION for initiating/recipient Patient only | Yes | Foundation lifecycle and audit design |
| Reject own pending invitation | Conceptual invitation lifecycle before acceptance | No Family service | Conceptual invitation operation; not ACTIVE relationship withdrawal | Yes | Foundation identity binding and transitions under G04/G06 |
| Caregiver-initiated ACTIVE relationship withdrawal / self-removal | Unresolved governing-task question | No Family service | REQUIREMENT-GATED / DECISION PENDING | Yes, if approved | P17F-G08; no default behavior selected |

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
| Display names and minimal relationship labels/status | Minimal management metadata still needs a pre-17F.1 allowlist; no kinship/health inference |

PatientProfile legacy fallback must not inadvertently reveal another Hospital's contact values. Hospital-local data is not made Person-wide by a Family view. Delegated history depth, future records, downloads and retention/disclosure rules are separate approvals, not an “all Patient permissions” shortcut.

## 11. Consent / Acceptance

The competent adult Patient initiates an explicit proposal for their own delegation; the intended authenticated caregiver explicitly accepts that exact proposal. Both must be shown the recipient, defined scope (including an empty Patient-resource allowlist for a foundation-only slice if approved), when authority starts, how approved Patient revocation works, how pending-invitation rejection differs from ACTIVE relationship withdrawal, and what evidence is recorded. Any ACTIVE caregiver withdrawal wording or behavior is conditional on the explicit P17F-G08 decision.

Record attributable Patient initiation and caregiver acceptance, server timestamps and an identifiable scope/acceptance-text version sufficient to prove what was agreed. No scope may expand silently after acceptance. Any later data capability requires an approved change/re-acceptance contract; 17F.1 must not pre-grant unknown 17F.2 reads. Exact text, versions, evidence retention and change mechanics are explicit gates.

This is **delegated-access consent/acceptance**, not a determination of legal health-processing basis. It does not replace Terms acceptance, Privacy acknowledgement, health-processing consent, marketing consent or consent signing by a legal representative. It **does not close Phase 17E.2** or P17E-CONSENT-01..03. If controller/legal approval is necessary for a proposed data disclosure, that disclosure remains gated independently of a successfully accepted relationship.

## 12. Revocation and Audit

Required conceptual events: invitation created; accepted; rejected; expired; revoked (as applicable); relationship activated; Patient revocation; delegated authority changed if a later slice supports it. Caregiver-initiated ACTIVE relationship withdrawal events and their evidence remain conditional on P17F-G08; they are not required foundation behavior until that decision is made. Record actual transition, actor, opaque invitation/relationship resource reference, server timestamp and bounded approved scope/version/outcome metadata. For automatic expiry, establish how effective expiry and its recorded evidence align; a missing expiry job must never keep an expired invite usable.

Approved Patient revocation takes effect immediately after commit. After Patient revocation, every subsequent server decision must observe absence of that delegated authority; cached browser/session state, previously accepted token and cached API/query results cannot override it. Caregiver-initiated ACTIVE relationship withdrawal remains unresolved under P17F-G08; its effects are not specified here. In-flight race semantics and cache invalidation must be tested, with no successful acceptance after a winning revoke/expiry or resurrection via retry.

Use existing audit infrastructure and coordinate successful transition evidence with persistence per ADR-0006. Acceptance/consumption/activation must succeed together or fail; revocation and its required audit must not report partial success. Audit failure cannot leave a falsely successful operation. No-op retries must not duplicate grants or fabricate transitions.

No raw secrets, token digests, raw National ID, identity hash, passwords, provider/session data, unnecessary names/contact data or clinical content in audit metadata. Exact event names and safe metadata fields are implementation details; retention/read access requires the decision register. Revocation removes Family authority, not independently valid Work/SELF authority, and does not erase care records or account credentials.

## 13. QR Contract

FAM-02 depends on the secure FAM-01 mechanism. QR is invitation transport only, equivalent in authority to opening the secure invite link. **QR is not authority.**

Future QR wraps an opaque high-entropy bounded-use invitation reference/token. It must not encode Patient ownership, Patient role, permission payload, arbitrary patientId authority, Hospital authority or clinical authority. No raw Patient identity/clinical data is encoded. Recipient must authenticate, be verified as intended recipient, and explicitly accept; the server alone creates the scoped relationship.

Purpose binding, expiry, revocation, replay/concurrency protection, safe preview and secret leakage controls are required for the underlying invitation before QR. A forwarded/stolen QR cannot retarget the invite. No credential activation or Patient impersonation is triggered by scan. Crypto/token format, deadline and delivery details remain appropriate future decisions; activation TTL/claim semantics are not automatically inherited. **No QR is implemented in 17F.0.**

## 14. Minor / Legal Representative Gate

**REQUIREMENT-GATED and excluded from the first implementation contract:** minors, parental authority over minors, court-appointed guardian, legally incapacitated Patient, power of attorney, statutory/legal representative and proxy created solely by Hospital staff without Patient authorization.

Adult voluntary delegation cannot establish these authorities: who may initiate/accept, capacity, legal evidence, verification owner, jurisdiction, competing representatives, permissible acts, expiry/review and loss of authority need a distinct legal-authority contract. A parent's/guardian's account, contact entry, shared surname or QR does not resolve those questions. Delegated caregiver is not automatically legal representative. Do not derive a legal adult/capacity conclusion solely from current DOB/age presentation; the adult eligibility process itself must be approved before 17F.1.

## 15. Multi-Role / Multi-Hospital Effects

| Example | Required result |
| --- | --- |
| Patient A is caregiver for Patient B | Same Person/User; A's SELF covers A only. B's scope comes solely from B's accepted delegation. |
| OSM A cares for a family member | Work assignment and Family relationship remain independent. Ending either does not mutate the other; Family response cannot use OSM rights as fallback. |
| Hospital staff A is also Patient and caregiver | Existing roles/memberships persist. SELF, Work and delegation authorize independently for each resource/action. |
| Caregiver belongs to another Hospital | Their membership grants no Family access and creates no Patient Hospital relationship. Only explicitly approved recipient resource scope may be used; cross-Hospital disclosure rules remain gated. |
| Caregiver has no PATIENT role | Valid authenticated existing HOSPITAL/OSM User may be a delegate; no extra PatientProfile or PATIENT role needed. Caregiver-only account onboarding/navigation is not assumed implemented. |
| Platform ADMIN | No default Patient data, routine proxy issuance, or operational Hospital bypass through Family. A person's own independently valid delegation would still be bounded by the same approved policy. |

Hospital membership, common Hospital, parent/child hierarchy and same surname never imply Family access. Accepting a relationship must not expose all current or future recipient Hospitals. Scope and inactive-Hospital/account effects must be settled before implementation, with future data reads retaining exact resource eligibility.

## 16. Threat Model / Abuse Cases

| Abuse case | Required invariant / future mitigation |
| --- | --- |
| Stolen QR / invitation URL | No access from possession; authenticate and verify intended recipient; expiry/revoke; safe limited preview. |
| Invite forwarded | Recipient binding remains unchanged; no transfer to first authenticated scanner. |
| Wrong authenticated person accepts | Server compares verified target identity and denies mismatch/ambiguity; proof mechanism must be approved before 17F.1. |
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
| Compromised/suspended account or invalid eligibility | Authentication alone insufficient; current account and scope eligibility checked; suspension/renewal behavior explicitly settled. |
| Invitation spam / coercive delegation | Abuse controls, explicit voluntary acceptance, pending-invitation rejection and Patient revocation; deployment-specific limits and eligibility process must be defined. ACTIVE caregiver withdrawal remains gated by P17F-G08. No consent presumed from silence. |

These are future acceptance requirements, not claims that controls were implemented or tested by this documentation phase.

## 17. Explicit Non-Goals

- No CAREGIVER Role enum; top-level roles remain ADMIN, HOSPITAL, OSM, PATIENT.
- No Patient impersonation, act-as-Patient or full proxy account.
- No medication implementation (Phase 17G remains separate).
- No minor/legal guardian/legal representative implementation.
- No QR implementation in 17F.0.
- No family-tree/social graph or kinship-based authorization.
- No emergency-contact permission, account creation, implied consent or representation.
- No OSM reassignment or operational care-visibility behavior change.
- No broad consent implementation or Phase 17E.2 closure.
- No Patient clinical write delegation, appointment mutation, profile edit, consent signing, credential/recovery or Hospital affiliation delegation.
- No schema/migration, route, action, product permission or UI implementation in 17F.0.
- No generic delegated-access framework, redesign of SELF, weakened exact Hospital/OSM scope, or widened Platform ADMIN operation.

## 18. Open Decisions

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

P17F-C07 is retired as **ERRONEOUS / NOT A DECISION**. It confers no accepted business requirement; caregiver-initiated ACTIVE relationship withdrawal is tracked only as OPEN P17F-G08. Other closed decision IDs remain unchanged.

### B. Decisions intentionally DEFERRED

| ID | Deferred topic | Boundary |
| --- | --- | --- |
| P17F-D01 | Minor/guardian/incapacity/power-of-attorney/legal representation | Distinct future legal-authority contract; not a blocker to eligible adult-only scope once eligibility gate closes |
| P17F-D02 | Clinical/profile/appointment writes, credential/recovery/affiliation, consent signing, subdelegation | Denied; only reopen with later explicit requirement |
| P17F-D03 | Medication and its possible future sharing | Phase 17G plus separate delegation decision |
| P17F-D04 | Family tree/social graph; broad proxy account | Outside approved Family scope |
| P17F-D05 | General consent/controller semantics | Phase 17E.2; proposed disclosures separately require any applicable legal approval |
| P17F-D06 | New caregiver-only/new-account onboarding | Separate requirement; first-slice existing-account limitation must be explicitly approved under G02 |

### C. Decisions required BEFORE 17F.1

**OPEN — 17F.1 is not cleared to implement until these decisions are recorded.**

| ID | Decision to close | Required answer / recommended bounded direction |
| --- | --- | --- |
| P17F-G01 | Adult voluntary delegation eligibility | Who/how verifies competent adult eligibility; age/capacity evidence and handling unknown/ineligible state. No legal age/capacity assumption from DOB alone. |
| P17F-G02 | Intended recipient proof and eligible account population | Confirm secure selection/binding/verification method and whether first slice accepts existing ACTIVE mapped accounts only (recommended). Resolve kinship eligibility/non-relative allowance without heuristic matching or forced PATIENT role. |
| P17F-G03 | Relationship/scope granularity | Decide how Patient-level participant relationship associates with exact Hospital/resource scopes; no implicit all-Hospital/future-Hospital grant. Confirm foundation Patient-resource allowlist is empty and minimal management metadata fields. This does not finalize Prisma schema. |
| P17F-G04 | Lifecycle/cardinality rules | Number of caregivers/recipients, self-delegation, duplicate pending/active proposals, reissue/reinvite after terminal state, and revoke scope over outstanding invitations. Must prevent unintended reactivation. |
| P17F-G05 | Invitation deadline and lifecycle eligibility | Exact invite duration/reissue behavior; explicitly decide relationship auto-expiry or no auto-expiry for bounded UAT, plus account/Patient-role/Hospital eligibility loss and resumption. No duration is invented here. |
| P17F-G06 | Acceptance and audit contract | Approve foundation acceptance wording/version, initiation/acceptance evidence, Patient-revocation and pending-rejection UX meaning, safe management/audit metadata and retention/access. No generic health-consent assertion. |
| P17F-G07 | Abuse/privacy boundary for foundation | Approved discovery/preview/error disclosures and rate/abuse controls for target UAT deployment; no account/Patient enumeration. Confirm any required controller approval for relationship metadata itself. |
| P17F-G08 | Caregiver-initiated ACTIVE relationship withdrawal | OPEN / DECISION PENDING before 17F.1: Can an accepted delegated caregiver terminate their own participation? If yes, does termination immediately end only that caregiver relationship? What UI wording/state and audit evidence are required? What happens to pending invitations versus ACTIVE relationships? Is later reinvitation permitted, and under which lifecycle rules? No answers or default behavior are selected; pending-invitation rejection remains separate. |

After these gates, engineering must choose and review purpose-bound token storage/transport, conditional transitions, concurrency/idempotency constraints, audit transaction consistency and focused tests before delivery. Those implementation decisions do not authorize new reads. No unapproved TTL, recipient proof or legal process may be chosen merely to unblock coding.

### D. Decisions required only BEFORE later 17F.x slices

| ID | Gate | Required answer |
| --- | --- | --- |
| P17F-L01 | Before 17F.2 reads | Approve each capability, exact field allowlist/source, Hospital context, history depth and future records; confirm necessary controller/privacy basis. Unapproved reads stay DENY. |
| P17F-L02 | Before 17F.2 scope changes | Decide Patient scope selection/change, caregiver re-acceptance evidence, shrink/revoke effect, expiry changes; no automatic upgrade of foundation relationships. Revoke-and-new-delegation may be preferred if sufficient. |
| P17F-L03 | Before 17F.3 QR | Confirm final secure-link wrapping, QR presentation/leakage/preview controls and mobile handoff; no new authority. Underlying token/proof mechanism already required in 17F.1. |
| P17F-L04 | Before 17F.4 closure | Confirm UAT actors/data, supported mobile flows, concurrency/stale-cache/revocation scenarios and audit evidence for delivered capabilities. |
| P17F-L05 | Before any later auto-expiry/renewal expansion | Review duration/renewal/notifications and changed acceptance semantics separately; G05 must already settle first-slice behavior. |

## 19. Recommended Execution Plan and Handoff

| Slice | Exact future scope | Exit boundary |
| --- | --- | --- |
| 17F.0 — this task | Domain, requirement and authorization contract; glossary/backlog/navigation alignment | Documentation complete; implementation gates visible; no feature claimed |
| 17F.1 — Relationship + Invitation + Accept + Revoke Foundation | After G01..G08 close: purpose-specific persistence, server policies, secure Patient invitation, intended-account verification, explicit accept/reject, activation, Patient revocation, audit, minimal approved relationship-management UI. ACTIVE caregiver withdrawal is conditional on explicit approval under G08; it is not guaranteed scope | Atomic/concurrent lifecycle and cross-role identity tests; zero broad Patient-data access; no QR or unknown capability grants |
| 17F.2 — Family UI + Approved Delegated Reads | “ผู้ที่คุณดูแล” / “ผู้ที่ดูแลคุณ”, relationship-aware navigation; only L01-approved projections and L02-approved scope acceptance | Exact recipient/Hospital/resource authorization and data-minimization tests; no act-as-Patient |
| 17F.3 — QR Invitation Transport | Wrap the existing secure invitation mechanism after L03 | Same auth/proof/accept/revoke/expiry decisions as secure link; no permission payload |
| 17F.4 — Re-audit / UAT Closure | Cross-role and cross-Hospital isolation, lifecycle races, stale/revoked access, mobile flow, audit, minimization, regressions for delivered scope | Evidence-backed closure only for implemented approved adult delegation |

Do not collapse contract, permission projection and QR into one implementation slice. Pre-17F.1 gates are real blockers to foundation implementation; general minors/legal representation and medication decisions remain separate. No architectural contradiction was found; the unresolved business/proof/eligibility/disclosure decisions above are the handoff limitations.

## 20. Documentation Validation Boundary

17F.0 verification is documentation-only: review complete diff, changed-file scope, local Markdown targets, UTF-8/Thai preservation, `git diff --check`, and consistency with Context, backlog, Phase 17A/17E.3, baseline and ADRs. Product tests, build and dev server are not warranted and are not executed for this phase. This contract records future verification requirements; it does not claim runtime Family security or UAT tests passed.
