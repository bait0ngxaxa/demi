# Phase 17E.0 — Patient Profile, Account Settings & Consent Contract Consolidation

- **Status:** PROFILE/ACCOUNT DECISIONS OWNER-APPROVED / RESOLVED — 2026-09-30; CONSENT DECISIONS PENDING
- **Phase type:** requirement and domain-contract analysis only
- **Implementation status:** no production behavior, schema, or migration change
- **Related requirements:** PAT-04, ACCOUNT-01, ACCOUNT-02
- **Current phase boundary:** Phase 17D.1 is closed. The approved profile/account decisions authorize Phase 17E.1 only. Phase 17E.2 remains separately gated by consent decisions.

## 1. Objective

Prepare a small, implementation-ready Patient self-service slice by recording current persistence and read behavior, customer-flow intent, existing architecture constraints, field ownership, possible mutation authority, verification and correction needs, credential/recovery boundaries, and consent/legal-controller decisions.

This is not product approval. A database field, imported spreadsheet value, customer label, existing read, or recommendation does not grant a Patient or Hospital permission to change that value.

No profile mutation, identity correction, credential operation, preference, consent record, consent UI, schema change, or migration is delivered in Phase 17E.0.

## 2. Source hierarchy

Phase 17E.0 inherits the canonical source/decision hierarchy defined by [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) and does not establish a competing hierarchy. Apply that same order:

1. **Confirmed current customer/product intent.** The latest clearly confirmed owner/customer product decision may supersede older prototype product behavior.
2. **Accepted security, privacy, data-integrity, and architecture invariants.** These continue to constrain how product intent is implemented; customer intent does not implicitly change identity, authorization, trust, credential-ownership, or transaction boundaries.
3. **Current runtime, Prisma schema, routes, services, policies, and tests as implementation evidence.** They show what currently works and what is enforced, not what the customer has approved as final product semantics.
4. **Accepted ADRs and accepted phase contracts.** They remain binding within their scope until explicitly superseded by a confirmed decision.
5. **Customer artifacts as supporting evidence only.** Use them only for the intent the artifact actually demonstrates.
6. **Legacy DEMI as behavior and terminology discovery only.** Legacy code/artifacts do not grant authorization or mutation semantics by themselves.
7. **Engineering proposals and assumptions last.** Mark them explicitly as non-approved; they do not become product decisions through implementation or documentation.

[AGENTS.md](../../AGENTS.md) governs engineering execution discipline, not product/business authority. The [Phase 17 backlog](./PHASE_17_UAT_BACKLOG.md) tracks requirement status and gates. Current runtime/schema/tests serve only the implementation-evidence role above. The closed Phase 17B–17D contracts bind within their accepted scope. The ADRs below, [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), and [Project Context](../CONTEXT.md) record accepted architecture/security boundaries and accepted or unresolved domain statements; they do not reorder the Phase 17A hierarchy.

### Closure rule for the next phases

For choices currently marked pending, the owner-approved answers recorded against the nine IDs in §28–29 become the product contract for 17E.1 or 17E.2. For 17E.1, PROFILE-01, PROFILE-03, and PROFILE-04 answers are complete only when their listed sub-decisions are answered for every selected field; PROFILE-02 must separately resolve any approved identity correction. A blank, “ยังไม่ทราบ”, “ตามมาตรฐาน” without naming the approved policy, or “อื่น ๆ” without the chosen meaning is still pending. Do not reopen an answered sub-decision as a new workshop question during implementation. Engineering may derive mechanical validation from the approved answer and current schema; a material scope change or conflict with an accepted architecture decision reopens the relevant stable ID.

This does not make an owner choice override an accepted security, identity, or data-integrity boundary. A choice that conflicts with one must first receive the required architecture decision. 17E.2 remains separately gated by its consent/controller decisions and is not approved by closing 17E.1.

Relevant accepted decisions include [ADR-0001 Person and User Identity](../adr/0001-person-and-user-identity.md), [ADR-0002 Role, Capability and Scope Authorization](../adr/0002-role-capability-scope-authorization.md), [ADR-0003 Hospital-led Onboarding](../adr/0003-hospital-led-onboarding.md), [ADR-0004 Patient Provisioning and First-time Activation](../adr/0004-patient-provisioning-and-activation.md), [ADR-0005 Server-side Application Boundary](../adr/0005-server-side-application-boundary.md), [ADR-0006 Transactional Business Operations](../adr/0006-transactional-business-operations.md), [ADR-0007 Client Transport](../adr/0007-client-transport-and-mobile-ready-architecture.md), and [ADR-0008 Workforce Provisioning and Activation](../adr/0008-workforce-provisioning-and-activation.md). The [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md) and [Project Context](../CONTEXT.md) remain authoritative for their accepted and unresolved statements.

For recovery, use [Phase 12A](./PHASE_12A_HOSPITAL_GOVERNANCE_ACCOUNT_RECOVERY_REQUIREMENTS.md) and [Phase 12C](./PHASE_12C_OWNER_GOVERNANCE_ACCOUNT_RECOVERY_CONTRACT.md). They keep first-time activation separate from active-account recovery and leave recovery proof, delivery, provider, and session consequences unresolved.

## 3. Evidence labels

- **Current fact:** directly confirmed in current schema or runtime.
- **Customer-flow intent:** phrase or journey recorded in Phase 17A; not an authorization rule.
- **Architecture constraint:** accepted boundary that a future implementation must preserve.
- **Engineering recommendation:** a candidate for owner review, not approval.
- **Owner decision pending:** an unresolved product, operational, privacy, or legal/controller choice.

No legal basis or legal interpretation is decided by this document.

## 4. Current runtime and schema facts

### 4.1 Person, User, PatientProfile, and Hospital relationship

| Record | Current persisted responsibility | Current boundary |
| --- | --- | --- |
| Person | One durable human identity; current fields include givenName, familyName, and unique identityKeyHash. | Names and the identity binding are Person-wide. identityKeyHash is a one-way National-ID-derived lookup value under the existing identity boundary; it is not the raw National ID and is not a profile field. |
| User | One application account linked to one Person; current fields include authSubject and account status. Roles are separate UserRole records. | Credentials, provider subject, session/account lifecycle, and roles do not belong in PatientProfile. One Person/User identity can have PATIENT with OSM, HOSPITAL, or ADMIN. |
| PatientProfile | One profile per Person, with nullable dateOfBirth, gender, phoneNumber, addressText, emergencyContactName, emergencyContactPhone, occupation, and educationLevel. | These fields currently live on a Patient-level profile linked to Person, with no Hospital key. The schema does not grant edit authority or settle the business meaning of a field. |
| PatientHospitalRelationship | Connects a PatientProfile to one Hospital; currently contains hospitalNumber and timestamps. | HN is Hospital-local. This model has no Patient relationship lifecycle/status field and has no Patient contact/address fields. |

The existing schema therefore gives Person-wide storage to names and the identity binding, Patient-profile-wide storage to the eight listed profile values, and Hospital-local storage to the Patient–Hospital relationship facts such as HN. Storage location is a current technical fact; domain ownership and who may correct a value still require decisions.

### 4.2 Current readers and writers

- The Personal Home and Personal profile read Person.givenName and Person.familyName. The Personal profile also reads PatientProfile.phoneNumber and addressText.
- Patient Detail reads all eight PatientProfile values through the exact PatientHospitalRelationship selected for the page. Direct active Hospital scope and exact assigned OSM scope are enforced by their existing server policies. Person names are also displayed there.
- The Personal profile projection includes every Hospital relationship’s Hospital code/name, HN, and Hospital status. It does not choose a primary Hospital, and Hospital status is not treated as relationship status.
- identityKeyHash participates in server-side identity resolution and activation/provisioning lookup. It is not in the Personal or Patient Detail projection.
- Patient provisioning resolves or creates Person through the existing identity service. Its current transaction fills givenName/familyName only when the resolved Person field is missing; a conflicting non-empty name causes a provisioning conflict rather than an overwrite.
- Patient provisioning creates PatientProfile with personId only. The current PatientProfile persistence path does not write the eight profile values. The import adapter can parse several demographic/contact columns into import data, but that parsing does not create a PatientProfile write contract.
- Patient provisioning creates or reuses the User and PATIENT role and creates or reuses the exact Hospital relationship; HN is written on that relationship under the provisioning transaction.
- No current Patient profile-edit page action, route, service, or mutation policy was found. The Patient self policy exposes read capabilities only. The profile page renders values and does not render an edit form.
- No purpose/version-based Terms, Privacy, health-processing, or marketing-consent model or lifecycle was found. No account-settings or preference model/route was found.

The current read paths are not write authority. Hospital Patient Detail and assigned OSM Patient Detail are projections, not profile editing workflows.

## 5. Customer-flow evidence

Phase 17A records PAT-04 as “Patient edits address/contact/profile” and keeps it REQUIREMENT-GATED. It explicitly says not to enable fields merely because columns exist; field ownership, Patient editability, verification, correction/history, and Person-wide versus Hospital-local scope must be decided.

Phase 17A records ACCOUNT-01 as a broad profile/account/settings requirement and calls for separating profile and identity edits, credential actions, notification preferences, accessibility settings, recovery, privacy, and persistence. It does not define which operations are needed for current UAT.

Phase 17A records ACCOUNT-02 as Terms/privacy/health/marketing consent. It asks for purpose, document/version, affirmative evidence, actor, time, scope, withdrawal, re-consent, and effect. It does not identify a legal controller, legal basis, approved policy text, or document version.

Phase 17B delivered the Patient Home and a read-only “ข้อมูลของฉัน” page. The page contains name, family name, phone, address, and Hospital relationship facts. It did not approve those fields for editing. Phase 17C added factual own-care and appointment reads. Phase 17D.0/17D.1 resolved and implemented appointment interactions, while P17D-NOTIF-01 remains open and notifications remain absent.

These customer phrases establish a need to clarify desired behavior. They do not approve any specific profile mutation, password operation, preference, or consent flow.

## 6. Person, account, profile, and relationship ownership map

| Concern | Current owner | What this does not imply |
| --- | --- | --- |
| Human identity and display name | Person | Patient may freely edit identity facts, or that a Hospital can overwrite an established name. |
| National-ID binding | Person.identityKeyHash under the existing identity service | Raw National-ID storage or Patient National-ID mutation. |
| Credential/provider mapping/account status/roles | User, provider boundary, and UserRole | PatientProfile phone is a login, recovery, or notification channel; Patient may change roles or account status. |
| Patient demographic/contact values | PatientProfile, currently attached one-to-one to Person | These values are Hospital-local, verified, or Patient-editable. |
| HN and the Hospital relationship | PatientHospitalRelationship | Hospital staff may edit Person or PatientProfile facts because they can manage the relationship. |
| Workforce profession | HospitalMembership | A Patient profile field should copy workforce membership behavior without an owner decision. It is only an example that some facts are explicitly relationship-scoped. |

If business requires different Patient contact or address values for different Hospitals, a future Hospital-local model may be needed. Do not duplicate or overload PatientProfile in this phase.

## 7. Current Patient self profile projection

The current route is /app/personal/profile. Its server path resolves the protected actor, then verifies the authenticated User-to-Person link, active User status, persisted PATIENT role, and self scope before reading.

The bounded projection returns:

- Person.givenName and Person.familyName;
- PatientProfile.phoneNumber and addressText;
- for each linked Hospital relationship: hospitalCode, hospitalName, hospitalNumber, and hospitalStatus.

The projection excludes dateOfBirth, gender, emergency contact, occupation, education level, identityKeyHash, authSubject, internal IDs, and raw Prisma records. The view contains no mutation control. Patient self-service currently means these specific reads and the separately implemented care/appointment flows; it does not mean PatientProfile write access.

## 8. PAT-04 field-by-field matrix

“Canonical persistence owner” below describes the current database location. “Business owner” means who is accountable for correctness and still requires owner decision. Current PatientProfile values are visible in the authorized Patient Detail projection; none are included in the current Personal profile projection except phone and address.

| Field | Canonical persistence owner and current readers/writers | Candidate Patient / Hospital authority | Sensitivity, verification, correction, and history recommendation | Downstream, scope, and privacy |
| --- | --- | --- | --- | --- |
| Person.givenName | Person-wide. Read in Personal profile/home, scoped Patient Detail, activation/provisioning lookup, and other display/search contexts. Patient provisioning supplies it on creation or fills it only when missing; no general update flow. | Do not allow free identity edit by default. A Patient correction request may be considered. Hospital/OSM can supply a missing name during authorized provisioning; current provisioning rejects a conflict instead of changing a non-empty name. | Identity-sensitive. If a correction is allowed, define identity proof and reviewer before implementation. Recommend D: proposed correction plus verified decision/history, not an ordinary profile overwrite. | Person-wide across all Patient relationships and any other role views. Changes can alter search, display, and identity attribution. Disclose only through existing scoped projections; never log old/new name in generic audit metadata. |
| Person.familyName | Person-wide, with the same readers and provisioning behavior as givenName. Current provisioning can fill a missing value but rejects a conflicting non-empty value. | Same candidate boundary as givenName. No general Patient or Hospital edit authority exists today. | Identity-sensitive. Treat a spelling/cultural-name correction as a correction workflow whose proof/reviewer is owner-defined. Recommend D if mutation is approved. | Person-wide display/search/attribution effect; visible across authorized Hospital relationships and shared roles. Do not conflate name correction with National-ID re-binding. |
| PatientProfile.dateOfBirth | PatientProfile-wide. Read in authorized Hospital/assigned-OSM Patient Detail; omitted from Patient Personal. No current application writer was found; provisioning creates PatientProfile without this value. | No unrestricted Patient edit. A correction request may be approved after owner defines source, proof, and reviewer. No current Hospital edit operation. | Identity-sensitive and potentially consequential. No current Patient self age calculation was found. Recommend D for an approved correction; verification must not be inferred from stored date. | One current value applies to every Hospital relationship. Could affect identity matching or future clinical/eligibility behavior; current downstream use must be enumerated before approval. Restrict disclosure to an approved audience. |
| PatientProfile.gender | PatientProfile-wide. Read in authorized Patient Detail; omitted from Patient Personal. No current application writer was found. | Candidate editability is unresolved; do not infer it from the free-text column or the broad PAT-04 label. No current Hospital edit operation. | Sensitive personal/demographic information. Meaning, allowed values, and correction policy are unresolved. Identity proof is not automatically required; owner must decide. Recommend B as the smallest audit option if editable, with field-key metadata only; no immutable value history without a use case. | Global across Hospital relationships. Current code reads it for Patient Detail; no other calculation or workflow use was confirmed. Limit audience and avoid unnecessary copying. |
| PatientProfile.phoneNumber | PatientProfile-wide. Read in Personal profile and authorized Patient Detail. No current application writer was found. | A plausible Patient-maintained contact candidate only if approved. Hospital may not edit it today. If staff correction is ever required, define source authority and conflict rule separately. | Contact PII; not verified merely because it is stored. If used only as profile text, no number-ownership claim. If a verified channel is required, define a separate proof step. Recommend B; use D only if a verified/pending replacement workflow is approved. | Same value reaches each authorized Hospital/OSM detail view attached to that PatientProfile. Does not update auth identity/recovery, send notifications, verify possession, or change emergency contact. |
| PatientProfile.addressText | PatientProfile-wide. Read in Personal profile and authorized Patient Detail. No current application writer was found. | Do not expose edit until “address” meaning is confirmed. Patient edit is a candidate only if this is a self-maintained current contact address. No current Hospital edit operation. | Contact/location PII. Verification is appropriate only if the confirmed purpose needs it. Recommend B for an approved text edit; D if the value is verified or a pending correction must be retained. No structured normalization requirement is evidenced. | Same address across Hospital relationships. Meaning could instead be legal/registered address, care address, or field-visit address; each has different ownership/disclosure consequences. Current column is free text, not a normalized address. |
| PatientProfile.emergencyContactName | PatientProfile-wide. Read in authorized Patient Detail; omitted from Patient Personal. No current application writer was found. | Patient or Hospital editability is unresolved. Require a defined purpose and permission before enabling either actor. | Third-party personal data. The model has no relationship type or contact-person consent/notice evidence. Recommend B if an approved mutation needs accountability; D only if a pending/verified correction contract is approved. | Same contact name across Hospitals. Identify permitted viewers and whether free text meets UAT. Emergency contact does not grant caregiver access, proxy authority, or consent authority. |
| PatientProfile.emergencyContactPhone | PatientProfile-wide. Read in authorized Patient Detail; omitted from Patient Personal. No current application writer was found. | No current Patient/Hospital edit operation. Potential edit requires the same decision as the emergency-contact name plus a separate phone/channel boundary. | Third-party contact PII. Stored value is not verified; the contact person’s awareness, lawful handling, verification, and correction route need owner/privacy decisions. Recommend B or D only as above; do not copy the number to notification or authentication flows. | Same value is exposed through each authorized relationship’s Patient Detail. Does not establish caregiver authority, channel opt-in, or ownership of the number. |
| PatientProfile.occupation | PatientProfile-wide. Read in authorized Patient Detail; omitted from Patient Personal. No current application writer was found. | Patient edit is a possible low-risk candidate only after owner confirms purpose and audience. Hospital editing remains unsupported today. | Personal information; no identity proof is implied. If changed, a correction can use the same edit semantics unless a downstream consumer requires review. Recommend B metadata-only audit if an edit is implemented; no full old/new history is justified by current evidence. | Shared across Hospital relationships. No specific current downstream rule was found. Avoid using it for eligibility or clinical inference without a separate contract. |
| PatientProfile.educationLevel | PatientProfile-wide. Read in authorized Patient Detail; omitted from Patient Personal. No current application writer was found. | Patient edit is a possible candidate only after owner confirms meaning, allowed values, and purpose. Hospital editing remains unsupported today. | Personal information; no identity proof is implied. Recommend B metadata-only audit if editable; no immutable value history absent an identified downstream or compliance need. | Shared across Hospital relationships. No current derived behavior was found. Keep disclosure purpose-bound and do not infer clinical status from it. |

Across all rows, there is no present Hospital profile edit capability. A Patient edit candidate is not approved until the matching owner decision is recorded. The free-text storage format does not settle value vocabulary, validation, verification, or who may correct it.

### Whether a field should ever be Hospital-specific

Current storage is global for the fields below; the following is a design question, not an approved schema direction:

| Field | Hospital-specific direction to evaluate |
| --- | --- |
| Person.givenName | Keep canonical name Person-wide. If a Hospital needs a local display alias, define it as a separate concept and field. |
| Person.familyName | Keep canonical name Person-wide. A local alias, if required, is separate from identity name. |
| PatientProfile.dateOfBirth | No Hospital-specific value is supported by current evidence. Any local clinical date fact needs a separate purpose and source contract. |
| PatientProfile.gender | No Hospital-specific value is supported by current evidence. If contextual values are required, define a separate field and meaning. |
| PatientProfile.phoneNumber | A Hospital-specific contact value may be needed, but only as a separately named, owned, disclosed, and verified-as-needed local contact. |
| PatientProfile.addressText | A care or field-visit address may be local; if required, represent it separately from any shared current/legal/contact address. |
| PatientProfile.emergencyContactName | A different care-context contact may be local; define purpose, relationship, audience, and third-party handling first. |
| PatientProfile.emergencyContactPhone | Same scope question as the contact name, with separate number verification and channel boundaries. |
| PatientProfile.occupation | No Hospital-specific value is evidenced. A local record needs a specific Hospital purpose and access rule. |
| PatientProfile.educationLevel | No Hospital-specific value is evidenced. A local record needs a specific Hospital purpose and access rule. |

Any future Hospital-specific value requires a distinct owner, field meaning, reader/update/correction policy, and a decision on whether history, audit, or correction records are persisted. Define retention only for records selected by that model. Do not overload the current global PatientProfile field.

## 9. Identity-sensitive correction boundary

Names and date of birth are profile/display facts that may also participate in identity correction. Changing a displayed value is not the same as proving that a person owns the account or should be rebound to another identity.

Person.identityKeyHash is the existing canonical National-ID-derived identity binding. Keep raw National ID and identity binding under the existing server-side identity-resolution boundary. Phase 17E must not add a National-ID field, edit action, browser/provider reset, or direct identityKeyHash update.

If a name or date-of-birth discrepancy is reported, record a correction request only after owners define accepted evidence, reviewer, status/notification behavior, allowed impact, and which request/audit/evidence records persist; define readers and retention for those records. If a National-ID binding is wrong, it is an identity reconciliation problem, not profile editing or account recovery.

## 10. Contact-channel separation

Keep the following concepts distinct:

| Concept | Current state | Must not be inferred from PatientProfile.phoneNumber |
| --- | --- | --- |
| Patient profile phone | Nullable PatientProfile display/contact value; readable by the Patient and authorized Work detail. | Number ownership or verification. |
| Authentication/recovery channel | No accepted Patient recovery channel or active-account recovery workflow. Login uses its established identity/password boundary; activation is separate. | Password recovery, authSubject change, or credential proof. |
| Notification destination | No notification delivery or preference contract; P17D-NOTIF-01 / NOTIF-01 remains open. | SMS/LINE/push/email consent or opt-in. |
| Emergency contact phone | Separate nullable PatientProfile field for a third party. | Caregiver authority, patient proxy, notification recipient, or authentication destination. |

Changing the profile phone must not change login identity, password recovery, authSubject, notification preference, delivery, emergency contact, verified status, or proof of number control unless separate owner-approved contracts explicitly connect those concerns.

## 11. Address meaning

Current evidence shows only a free-text PatientProfile.addressText value. It does not establish whether the value means the Patient’s current contact address, registered/legal address, Hospital-entered care address, field-visit address, or another address.

The owner must choose the meaning, owner, intended readers, and whether the address is shared across Hospitals before an edit is offered. Do not add structured address normalization, geocoding, proof-of-residence, or multiple address types without a requirement.

## 12. Emergency-contact meaning

The current model has only emergencyContactName and emergencyContactPhone. It does not persist relationship type, separate contact consent/notice, verified status, or delegated authority.

Before enabling changes, decide who may add/change the values, whether relationship type is required, whether the contact person must be informed or provide evidence, which staff/OSM roles may see them, and whether the current free-text shape meets UAT. Do not let emergency-contact presence grant caregiver/family permissions or represent a patient’s legal representative.

## 13. Person-wide versus Hospital-local behavior

PatientProfile is one-to-one with Person, while one PatientProfile can have multiple PatientHospitalRelationship rows. Therefore current phone, address, and other PatientProfile values are shared by all of that Patient’s Hospital relationships. Current Patient Detail resolves a specific relationship for authorization, then reads the same parent PatientProfile values.

For a Patient linked to Hospitals A and B, an approved change to a PatientProfile field would change the value subsequently read under both relationships. Current direct Hospital and exact assigned OSM policies still constrain which actor may read each relationship. The schema has no per-Hospital phone/address/contact copy and no primary Hospital.

This is an explicit owner decision. If Hospitals require independent values or edits, define a Hospital-local data owner, readers, conflict contract, and any history/audit/correction records; set retention only for records the approved model persists. Then design a separate relationship-scoped model in a later approved phase. Do not duplicate fields into PatientHospitalRelationship in Phase 17E.0.

## 14. Patient and Hospital mutation authority

### Current authority

- Patient SELF can read the approved own projection. The policy checks the server-resolved actor, own User-to-Person link, active User, and persisted PATIENT role.
- Direct Hospital staff can read and operate Patient workflows only under existing direct Hospital policies. This does not grant arbitrary Person or PatientProfile write access.
- An OSM reads Patient Detail only through the existing exact active assignment and Hospital relationship path. Assignment does not grant PatientProfile edit authority.
- Authorized patient provisioning creates/reuses identity, account, profile, role, and Hospital relationship under its own flow. It is not a general profile editor.
- No generic patient:update capability exists for profile facts. Platform ADMIN-only or workspace selection does not create clinical/profile mutation authority.

### Future mutation policy if approved

Any future Patient self mutation must derive authority on the server from authenticated User → same Person → persisted PATIENT role → that Person’s own PatientProfile → a field-specific approved operation. The browser may submit field values but cannot establish personId, profileId, relationshipId ownership, roles, verification, or Personal/Work authority.

Hospital mutation, if approved at all, needs an explicit actor/action/field/scope rule. Existing patient read, provisioning, and Patient Detail entry points must not be widened implicitly.

## 15. Conflict and concurrency considerations

If Patient and Hospital are both allowed to change a value, the contract needs a source-of-truth and stale-write rule before implementation:

- Patient changes a value while staff has an older Patient Detail open: the old page cannot silently overwrite the newer value.
- Hospital records a correction after a Patient edit: define whether the staff correction is authoritative, requires review, or becomes a pending proposal.
- Patient edits after a value was verified: define whether verification is invalidated, retained only for the old value, or must be repeated.
- Two Patient requests race: one must not silently replace another without an approved conflict result.
- A profile field is shared across multiple Hospital relationships: resolve conflicts at the PatientProfile scope, not using the Hospital relationship ID supplied by the browser.

Do not silently choose last-write-wins. A future implementation should use a server-checked expected version/current value or equivalent conditional write, with explicit conflict feedback and transaction behavior. updatedAt alone is not an accepted conflict policy. Any verification marker must be bound to the exact value/version and invalidated or replaced according to the approved rule.

## 16. Correction and history options

No model is selected or implemented. Consider only these bounded options:

| Option | Meaning | Appropriate when |
| --- | --- | --- |
| A. Current value only | Replace the current value; no retained field-change history. | Low-consequence profile value with no audit or dispute need. |
| B. Current value plus bounded audit event | Keep current value and record actor, field key, target resource, operation, time, and verification transition; omit old/new PII from generic metadata. | Accountability is needed, but reconstructing every prior value is not. |
| C. Immutable field-change history | Store each prior and new value as a domain record with access and retention controls. | Approved clinical/operational, legal, or dispute requirements need historical values. |
| D. Verified value plus pending proposal | A proposed correction is distinct from the current approved value; accept/reject is attributed and the verified state belongs to an exact value/version. | Identity-sensitive corrections or values that require review before becoming canonical. |

Current engineering recommendation by field: D for any approved name or DOB correction; B as the smallest candidate for future gender/contact/emergency-contact/occupation/education edits when change accountability is required; D instead of B when a phone/address/contact value must be verified or reviewed before replacing the current value. There is no current evidence justifying C for every profile field or generic event sourcing. A remains viable for a field with no audit or downstream need if the owner explicitly accepts it.

## 17. ACCOUNT-01 decomposition

“Account Settings” must not become one undifferentiated feature.

| Domain | Current evidence | Current UAT treatment |
| --- | --- | --- |
| Patient profile | Read-only Personal profile exists; PAT-04 remains gated. | A bounded profile slice may be considered after profile decisions. |
| Identity facts | Names and National-ID binding have different correction risk. | Keep identity correction separate from ordinary profile editing. |
| Credential/password operations | First-time activation allows the target Patient to establish their credential. No authenticated password-change flow was found. | Owner must say whether password change is required now; activation is not password change. |
| Account recovery | Phase 12A/12C leave active-account recovery without accepted proof, delivery, provider, or session contract. | Not part of 17E.1 by default; separate requirement and security contract needed. |
| Notification preferences | No preference model or delivery system; P17D-NOTIF-01 / NOTIF-01 is open. | Do not add channel toggles, quiet hours, or reminder frequency. |
| Accessibility/UI preferences | No customer evidence identifies account-persisted theme, font size, language, or accessibility settings. Existing sidebar expansion preference is browser-local UI state. | Do not add server persistence or an empty settings page. |
| Consent/privacy controls | No purpose/version-based consent lifecycle exists. | Analyze separately under ACCOUNT-02; keep out of profile mutation. |
| Account/session/security controls | User status, roles, credential/provider mapping, and sign-out have separate ownership. No Patient self-disable/delete contract exists. | Do not add self-deactivation, deletion, role editing, or generic account security controls. |

ACCOUNT-01 is therefore a discovery label, not an implementation scope. Do not create a generic settings page until owners identify a real current-UAT operation.

## 18. Credential, password change, and recovery boundary

Patient provisioning creates or reuses the account separately from credentials. The target User uses a one-time first-activation flow to establish their own password. That flow is not forgotten-password recovery, authenticated password change, or replacement of an active credential.

No current customer evidence in Phase 17A specifies either authenticated password change or forgotten-password recovery. The owner should answer them separately. If neither is required for current UAT, leave both out. If authenticated change is required, define reauthentication/provider interaction, result, audit, and session behavior in its own contract. If recovery is required, Phase 12C blockers remain: trusted identity/control proof, channel, provider ownership, expiry/replay/rate limits, escalation, and session consequences.

Do not implement forgot password, password reset, Hospital-admin reset, staff-set Patient passwords, predictable temporary passwords, DOB/National-ID/default passwords, arbitrary profile-phone recovery, or browser-side provider reset. Reissuing an unclaimed first-time activation under its existing scoped rules is still activation, not recovery.

## 19. Account status and deletion

User.status, UserRole, PatientProfile, PatientHospitalRelationship, and provider credentials represent separate lifecycles. A multi-role User has one shared account. A Patient’s Hospital relationship is not the account, and profile removal is not credential removal.

No customer requirement establishes Patient self-disable, account deletion, Person deletion, or User deletion. Keep those outside Phase 17E planning. Do not design destructive Person/User deletion or cascade into relationships, clinical history, credentials, or other roles.

## 20. Notification and accessibility preference boundary

P17D-NOTIF-01 and NOTIF-01 remain open. Appointment interactions in Phase 17D.1 do not imply delivery. PatientProfile.phoneNumber does not define channel, verified destination, recipient choice, or consent.

No account-owned persistence is justified for email, LINE, push, SMS, quiet hours, reminder frequency, theme, font size, language, or accessibility choices by the inspected current customer evidence. The current browser-local sidebar expansion state is a presentation preference, not a User or PatientProfile setting.

## 21. ACCOUNT-02 purpose separation

Do not reduce the following to accepted=true or consent=true:

| Item | Contract question |
| --- | --- |
| Terms acceptance | Which DEMI terms apply, which document/version was presented, who must affirm, and whether/how acceptance gates account use? |
| Privacy notice acknowledgement | Is the event acknowledgement of a notice rather than consent? Which controller notice and version was shown, and what evidence is needed? |
| Health-data processing authorization/consent | Which purpose and controller, if any, legally require consent? Which processing is covered? Do not have engineering decide lawful basis. |
| Marketing consent | Which controller, purpose, communication types, and channels are optional? Keep it distinct from service messages and notification preferences. |
| Optional communication consent | Does a separately approved purpose require an affirmative choice? Do not infer it from a phone number or an appointment flow. |
| Other purpose-specific items | Add only when a controller/product owner confirms the purpose and required evidence. |

The responsible product, privacy, and legal/controller owners must identify the lawful basis for each processing purpose and say whether it requires consent, acknowledgement, contract acceptance, or another mechanism. Engineering records and enforces the approved contract; it does not supply legal wording or decide the basis.

## 22. Consent evidence, versioning, and gating questions

For every approved acceptance or consent record, owners must decide whether evidence needs:

- stable purpose key and controller identity;
- document/policy key and immutable version;
- version actually presented to the Patient, including language where relevant;
- acting User and applicable Person/Patient scope;
- Hospital/controller scope where applicable;
- affirmative action and captured timestamp;
- source/context, such as authenticated web flow or supported assisted flow;
- withdrawal event and current state, if withdrawal applies;
- re-consent trigger for a changed document or purpose;
- effect on the relevant processing, continued access, login, Patient Personal, or other feature;
- evidence and audit requirements, including retention period and permitted readers;
- immutable prior acceptance evidence where retention is approved.

Terms/privacy text, controller names, effective dates, purpose IDs, version identifiers, and legal wording must come from an approved source. Never store only a boolean when version evidence is required. Do not gate login, Personal, or unrelated care processing until the responsible owner has defined the exact gate and consequence.

## 23. Withdrawal and re-consent

Withdrawal is not one universal operation:

- Terms acceptance is a contract/access question; its withdrawal and continued-access effect require owner/legal direction.
- Privacy notice acknowledgement is not automatically a consent that can be withdrawn. Owners must clarify any acknowledgement correction and the current notice record.
- Marketing consent is purpose-specific and must have an owner-defined withdrawal method, effective time, and effect on future marketing.
- Health-processing consent applies only if the controller determines consent is the lawful basis. Owners must define how withdrawal affects that processing, care access, other legal bases, and historical records.
- Optional communication consent, if approved, is distinct from notification delivery preference and must define its own withdrawal behavior.

For each item, decide whether a new document version requires fresh affirmative action, what prior evidence remains, whether processing stops immediately or after a defined step, what remains retained, and who resolves an exceptional case. Engineering must not infer these legal effects.

## 24. Multi-Hospital Patient

A Patient may have relationships with multiple Hospitals while keeping one Person and User.

- Person identity and current PatientProfile fields are global across those relationships under the current schema.
- PatientHospitalRelationship and HN are Hospital-local.
- A profile edit to the current PatientProfile affects the value read in every authorized Hospital relationship.
- DEMI platform terms/privacy and each Hospital’s controller notices or purposes may have different owners and versions; no current source resolves controller roles.
- Health-data disclosure/processing permissions may need separate records per Hospital/controller and purpose. A global boolean must not silently authorize every Hospital.
- Marketing consent belongs to a named controller and purpose; one Hospital’s withdrawal must not silently alter another controller’s record.
- If Hospital A withdrawal should affect Hospital B, define that cross-controller rule explicitly.

## 25. Multi-role User

One Person and one User remain shared when that human is PATIENT + OSM, PATIENT + HOSPITAL, or PATIENT + ADMIN. Do not provision another Patient login or separate profile credentials for the second role.

A setting belongs to its actual owner: User/account, Person identity, PatientProfile, HospitalMembership, OsmHospitalRelationship, or PatientHospitalRelationship. Selecting Personal or Work changes presentation only and never changes ownership or authority. Any Patient self-edit must use the PATIENT self path even when the same User has a Work role; any Work mutation must independently pass its existing scope policy.

Changing a Person-wide name affects every role view. Changing a PatientProfile field affects the same Patient profile in every Hospital relationship. Account, identity, Patient profile, and Hospital membership changes must not cascade into one another unless a separate approved rule requires it.

## 26. Authorization, privacy, and audit requirements

Future profile mutation requires server-side authentication, validated input, same User-to-Person ownership, persisted PATIENT role, own PatientProfile, and an explicit field-level allowlist/action policy. Do not trust relationshipId, personId, profileId, client-supplied role, or Personal/Work state. No generic patient:update capability may authorize every PatientProfile field.

Before approval, define actor and target for every field: Patient, direct Hospital staff, assigned OSM, identity reviewer, or no editor. A relationship-scoped read does not grant a Person-wide write. If Hospital staff can change a global PatientProfile field, the owner must approve cross-Hospital consequences and stale-write arbitration.

For any later audit event, prefer field key, actor, bounded target profile/resource ID, operation, timestamp, and verification-state transition. Do not copy full address, phone number, emergency-contact data, National ID, identity hash, or health details into generic audit metadata. If old/new PII must be retained, use an explicitly approved domain history record with access and retention controls.

## 27. Engineering recommendation — not yet product-approved

- Limit a first Patient self-edit slice to fields owners confirm are genuinely Patient-maintained. Phone, current contact address, occupation, or education may be evaluated; none is approved by this recommendation.
- Treat names, date of birth, and National-ID binding as identity/correction concerns. Do not add unrestricted edit controls; National-ID mutation remains outside this phase.
- Resolve whether PatientProfile is intentionally global across Hospitals before changing it. Do not make a global field Hospital-local implicitly.
- Keep Patient profile phone separate from authentication, account recovery, notification destination, verification, and emergency-contact phone.
- Keep emergency contact separate from caregiver authority and define third-party disclosure.
- If both Patient and Hospital may edit a field, require a source-of-truth, stale-write, correction, and verification-invalidation contract before implementation.
- If history is required, start with bounded audit metadata; use pending verified correction for identity-sensitive fields. Do not introduce generic event sourcing or broad immutable histories without evidence.
- Keep account recovery outside 17E.1 unless it receives its own approved security contract. Current evidence does not require either password change or recovery for UAT.
- Wait for NOTIF-01 before notification preferences or delivery. Keep browser-local UI state separate from account persistence.
- Keep purpose/version-based consent work separate from profile editing. Do not begin 17E.2 until the controller/legal/product inputs are approved.
- Keep 17E.1 small: implement only the specifically approved Patient profile fields and their required correction/audit behavior.

## 28. Owner decision register

Every item below is **DECISION PENDING**. Record the decision maker, selected option, date, rationale, and supporting customer or legal evidence before changing status. The engineering recommendation above is not approval.

| ID | Business decision | Decision needed | Phase gate |
| --- | --- | --- | --- |
| P17E-PROFILE-01 | Patient-editable profile fields and field rules | **OWNER-APPROVED / RESOLVED — 2026-09-30.** Patient may directly edit gender, phone number, current contact address, emergency contact name and phone, occupation, and education level. These are optional bounded strings under current schema limits (64, 32, 500, 200, 32, 200, 200); blank clears to null. Gender remains a bounded string, not an enum. No verification ceremony is required. Address means current contact address only; emergency contact is contact information and grants no caregiver, proxy, consent, or Patient access authority. | Closed for the listed general fields; identity-sensitive fields remain excluded under PROFILE-02. |
| P17E-PROFILE-02 | Identity-sensitive correction | **OWNER-APPROVED / RESOLVED — 2026-09-30.** Patient may not edit given name, family name, date of birth, or National-ID identity binding. No name/DOB correction flow is implemented in 17E.1; a future identity-correction/reconciliation flow must handle incorrect values. National-ID mutation is forbidden. | Closed; no identity correction or National-ID mutation in 17E.1. |
| P17E-PROFILE-03 | Global versus Hospital-local profile data and readers | **OWNER-APPROVED / RESOLVED — 2026-09-30.** The seven approved general fields are Hospital-scoped to the exact PatientHospitalRelationship. SELF ownership is re-resolved server-side for every read/write. Work detail continues to read only through its existing direct Hospital or exact assigned OSM relationship scope. The shared PatientProfile fields are legacy fallback and are never the Patient SELF write target. | Closed; use an additive relationship-scoped profile model with legacy fallback and no bulk backfill. |
| P17E-PROFILE-04 | Hospital editor, conflict, history, audit, and retention contract | **OWNER-APPROVED / RESOLVED — 2026-09-30.** Patient SELF is the only 17E.1 editor. Hospital staff, OSM, and Platform ADMIN receive no mutation authority. Stale writes fail with Conflict and require reload/review. Store current values only: no old/new history, correction workflow, profile-change audit, or profile-history retention artifact. | Closed for the listed fields and current-value-only persistence. |
| P17E-ACCOUNT-01 | Current-UAT Account Settings scope | **OWNER-APPROVED / RESOLVED — 2026-09-30.** UAT Account scope is approved Profile view/edit, authenticated password change, and forgot-password/account recovery. Do not add a generic Settings page. Notification/email/LINE/SMS preferences, quiet hours, accessibility/theme persistence, account deletion, self-suspension, and consent settings are out of scope. | Closed for this bounded UAT scope. |
| P17E-ACCOUNT-02 | Password change and forgotten-password recovery | **OWNER-APPROVED / RESOLVED — 2026-09-30.** Both authenticated password change and account recovery are required for UAT. First-time activation remains separate from recovery. | Closed for 17E.1; recovery follows the approved UAT authority, proof, provider, and session contract in this handoff. |
| P17E-CONSENT-01 | Consent purposes, controller, and approved source documents | **DECISION PENDING.** Identify each required acceptance/consent/acknowledgement, its purpose, lawful basis decision, controller, approved document/purpose/version source, and access/login gates. | Blocks 17E.2. |
| P17E-CONSENT-02 | Withdrawal, re-consent, effect, and retention | **DECISION PENDING.** Decide each item’s withdrawal ability/method, new-version rule, effect on processing/access, historical evidence, and retention. | Blocks 17E.2. |
| P17E-CONSENT-03 | Global or controller/Hospital consent scope | **DECISION PENDING.** Decide which records are DEMI-global and which are per controller, Hospital, Patient, and purpose; define cross-Hospital withdrawal effects. | Blocks 17E.2. |

### 28.1 Owner-approved profile and account details — 2026-09-30

- **Editable fields:** `gender`, `phoneNumber`, `addressText`, `emergencyContactName`, `emergencyContactPhone`, `occupation`, and `educationLevel`. Values retain the current nullable bounded-string semantics: 64, 32, 500, 200, 32, 200, and 200 characters respectively. Empty input clears to null. Gender is not an enum. No verification ceremony is required.
- **Address meaning:** current contact address only; it does not represent legal domicile, registered address, field-visit address, or clinical service address.
- **Emergency contact:** contact information only. It grants no caregiver, proxy, consent, or Patient access authority.
- **Identity-sensitive fields:** `givenName`, `familyName`, `dateOfBirth`, National ID, and identity binding are not Patient-editable. No name/DOB correction workflow is part of 17E.1. National-ID mutation remains forbidden.
- **Scope and authority:** each approved general value belongs to the exact Patient–Hospital relationship. Patient SELF is the only editor. Hospital staff and OSM retain their existing authorized reads only; Platform ADMIN gets no routine mutation authority. Every SELF read/write re-resolves the authenticated active PATIENT User, same Person, own PatientProfile, and exact relationship on the server.
- **Compatibility:** absent relationship-local data reads the legacy shared PatientProfile general values as fallback. The first successful edit materializes all seven local fields from the effective values and applies the submitted changes. Once materialized, local null is authoritative and does not fall back field-by-field. No bulk backfill or shared PatientProfile mutation is allowed.
- **Concurrency and retention:** use a monotonic integer version. Stale submissions return Conflict and ask the Patient to reload/review. Keep current values only; add no old/new profile history, correction workflow, or generic profile-change audit.
- **Account scope:** UAT includes approved profile view/edit, authenticated password change, and account recovery. Do not add generic Settings or unsupported preferences, deletion, self-suspension, or consent controls. First-time activation remains separate from recovery.
- **Decision authority:** OWNER-APPROVED for this UAT contract on 2026-09-30. These decisions do not approve consent or legal/controller requirements.

## 29. Owner workshop questions

คำถาม P17E-PROFILE-01..04 และ P17E-ACCOUNT-01..02 ด้านล่างเป็นบันทึกคำถาม workshop ที่ได้รับคำตอบแล้ว และถูกแทนที่ด้วยรายการ **OWNER-APPROVED / RESOLVED — 2026-09-30** ใน §28.1; ห้ามเปิดคำถามชุดเดิมซ้ำระหว่าง 17E.1 ส่วน P17E-CONSENT-01..03 ยัง **DECISION PENDING** และต้องใช้ข้อมูลจาก owner/controller/legal ก่อนเริ่ม 17E.2.

1. **P17E-PROFILE-01 — ผู้ป่วยควรแก้ไขข้อมูลใดได้ด้วยตนเอง?**
   - เลือกแยกแต่ละข้อ: เบอร์โทรศัพท์ในโปรไฟล์; ที่อยู่; ชื่อและ/หรือเบอร์ผู้ติดต่อฉุกเฉิน; อาชีพ; ระดับการศึกษา; เพศ; ชื่อ/นามสกุล; วันเกิด; ไม่มีข้อมูลที่แก้เองได้; หรือข้อมูลอื่น (โปรดระบุ)
   - สำหรับแต่ละฟิลด์ที่อนุมัติ ให้เลือกแก้ค่าได้ทันที ส่งคำขอให้ตรวจ/แก้ หรือไม่รองรับ ชื่อและวันเกิดให้ใช้แนวทางแก้ไขในข้อ 2 ระบุว่าต้องกรอกหรือไม่ เว้นว่าง/ลบค่าเดิมได้หรือไม่ รับค่า/รูปแบบใด และต้องตรวจยืนยันก่อนใช้หรือไม่ หากต้องตรวจ ให้ระบุวิธี หลักฐาน และผู้ตรวจ หากเลือกส่งคำขอ ให้ระบุผู้รับ/ผู้ตัดสินและหลักฐานที่ต้องใช้ รวมทั้งค่าปัจจุบันจะคงเดิมจนอนุมัติหรือไม่ และผลเมื่ออนุมัติหรือไม่อนุมัติ
   - หากเลือกที่อยู่ ให้ระบุว่าเป็นที่อยู่ติดต่อปัจจุบัน ที่อยู่ตามทะเบียน/กฎหมาย ที่อยู่เพื่อการดูแล ที่อยู่สำหรับลงพื้นที่ หรือความหมายอื่น
   - หากเลือกผู้ติดต่อฉุกเฉิน ให้ระบุวัตถุประสงค์ ความจำเป็นและชุดค่าของประเภทความสัมพันธ์ และต้องแจ้งหรือขอความยินยอมจากบุคคลนั้นตามที่ผู้รับผิดชอบ Privacy/Legal กำหนดหรือไม่ ผู้เห็นข้อมูลในแต่ละขอบเขตให้ตอบในข้อ 3
   - ค่าเริ่มต้นทางวิศวกรรมที่เสนอให้รับหรือแก้เป็นรายฟิลด์คือคงชนิดข้อมูล ความไม่บังคับกรอก และขนาดสูงสุดตาม schema ปัจจุบัน: ชื่อ/นามสกุล 120 ตัวอักษร, วันเกิดเป็นวันที่, เพศ 64, เบอร์โทรศัพท์ 32, ที่อยู่ 500, ชื่อผู้ติดต่อฉุกเฉิน/อาชีพ/ระดับการศึกษา 200; ไม่เพิ่ม enum, การปรับรูปแบบ หรือการตรวจยืนยันที่ยังไม่มีข้อกำหนด ให้ owner ยืนยัน baseline นี้หรือระบุข้อกำหนด/ข้อยกเว้นแยกตามฟิลด์
2. **P17E-PROFILE-02 — ถ้าชื่อหรือวันเกิดไม่ถูกต้อง ผู้ป่วยควรแก้เองทันทีหรือส่งคำขอให้ตรวจสอบ?** เลือก: แก้เองหลังยืนยันตัวตน; ส่งคำขอพร้อมหลักฐานให้ผู้รับผิดชอบตรวจ; ให้เจ้าหน้าที่แก้หลังตรวจจากแหล่งข้อมูลที่กำหนด; หรือยังไม่รองรับการแก้ไข ระบุผู้ตรวจ แหล่งข้อมูล/หลักฐานที่ยอมรับ และผลเมื่ออนุมัติหรือไม่อนุมัติ ค่าปัจจุบันจะคงเดิมจนตรวจเสร็จหรือไม่ รวมทั้งผลต่อข้อมูลหรือกระบวนการอื่นที่ใช้ชื่อ/วันเกิด สำหรับข้อมูลที่ผูกกับเลขบัตรประชาชน ให้ระบุผู้ดูแลการแก้ไขตัวตนแยกจากหน้าโปรไฟล์; ไม่ได้อนุมัติให้แก้ National ID ในโปรไฟล์
3. **P17E-PROFILE-03 — ข้อมูลแต่ละรายการที่อนุมัติให้แก้ควรใช้ร่วมกันทุกโรงพยาบาลหรือแยกตามโรงพยาบาล?**
   - ตอบแยกทุกฟิลด์ที่เลือกในข้อ 1: ใช้ค่าเดียวระดับ Person/PatientProfile ให้ทุกโรงพยาบาลที่ได้รับอนุญาตเห็นค่าเดียวกัน; เก็บคนละค่าตาม Hospital; หรือยังไม่อนุมัติจนกว่าจะกำหนดขอบเขตชัดเจน
   - ระบุผู้เห็นข้อมูลในแต่ละขอบเขต เช่น Patient, เจ้าหน้าที่ Hospital ประเภทใด และ OSM ที่ได้รับมอบหมายประเภทใด รวมถึงว่าแต่ละ Hospital เห็นค่าเดียวกันหรือเห็นเฉพาะค่าของตน
   - ชื่อ/นามสกุลเป็นข้อมูล Person-wide ตาม identity เดียว หากต้องการชื่อที่ต่างกันตาม Hospital ให้ระบุเป็นข้อมูล Hospital-local แยกต่างหาก ไม่เปลี่ยนชื่อ Person; ค่าที่ Hospital-local ต้องมี model/contract แยกและห้ามเขียนทับ PatientProfile ที่ใช้ร่วมกัน
4. **P17E-PROFILE-04 — โรงพยาบาลควรแก้ข้อมูลใดได้ และเมื่อแก้พร้อมกันต้องทำอย่างไร?**
   - ตอบแยกทุกฟิลด์: ผู้ป่วยแก้ได้ฝ่ายเดียว; เจ้าหน้าที่ Hospital ที่ระบุแก้ได้ฝ่ายเดียว; ทั้งสองฝ่ายแก้ได้โดยระบุผู้มีอำนาจตัดสินเมื่อเห็นต่าง; หรือการแก้ต้องส่งให้อีกฝ่ายตรวจ ระบุด้วยว่าการแก้ทำให้สถานะยืนยันเดิมหมดอายุหรือไม่
   - กำหนดผลเมื่อบันทึกจากหน้าข้อมูลเก่า หรือเมื่อ Hospital กับ Patient หรือคำขอจาก Patient สองรายการบันทึกพร้อมกัน เช่น ปฏิเสธรายการเก่าและให้โหลดข้อมูลใหม่ โดยไม่เขียนทับเงียบ ๆ
   - เลือกรูปแบบต่อฟิลด์: เก็บเฉพาะค่าปัจจุบันโดยไม่มี audit/history/correction evidence; ค่าปัจจุบันพร้อม audit metadata; ประวัติค่าเดิม/ใหม่แบบ immutable; หรือค่าที่ยืนยันแล้วพร้อมคำขอแก้ไขที่รอพิจารณา สำหรับฟิลด์ทั่วไป ค่าเริ่มต้นที่เสนอคือค่าปัจจุบันโดยไม่มี old/new value history
   - หากเลือกรูปแบบที่บันทึก audit ให้กำหนดขอบเขต metadata และผู้ที่เห็น โดยค่าเริ่มต้นเสนอเฉพาะรหัสฟิลด์, ผู้แก้, รหัสรายการ, ประเภทการดำเนินการ, วันเวลา และการเปลี่ยนสถานะยืนยัน ไม่บันทึกค่าข้อมูลส่วนตัวจริง เช่น ที่อยู่หรือเบอร์โทรใน audit ทั่วไป
   - หากมีการบันทึก audit, history, correction request, decision, supporting evidence หรือ verification history ให้ระบุผู้มีสิทธิ์เห็นและ retention period/นโยบายที่อนุมัติสำหรับแต่ละชนิดระเบียน รวมถึงเอกสารยืนยันตัวตนที่เก็บไว้
   - หากอนุมัติให้เก็บเฉพาะค่าปัจจุบันและไม่มี audit/history/correction/evidence record ไม่ต้องกำหนด retention เพิ่มสำหรับประวัติหรือ audit; ค่า PatientProfile ปัจจุบันใช้ lifecycle ปกติของระเบียนโดเมนนั้น
   - ปัจจุบันไม่พบระยะเวลา retention กลางสำหรับ audit/history ที่ใช้แทนคำตอบได้ หากเลือกเก็บระเบียนเหล่านี้แล้วตอบว่า “ตามมาตรฐาน” ต้องระบุชื่อนโยบายและระยะเวลาจริง
5. **P17E-ACCOUNT-01 — สำหรับ UAT นี้ “ตั้งค่าบัญชี” ต้องมีเรื่องใดบ้าง?** เลือก: ดู/แก้โปรไฟล์ที่อนุมัติ; เปลี่ยนรหัสผ่านขณะเข้าใช้งาน; กู้บัญชีเมื่อลืมรหัสผ่าน; ตั้งค่าการแจ้งเตือน; ตั้งค่าการแสดงผลหรือการช่วยการเข้าถึง; ดู/จัดการเอกสารและความยินยอม; หรือไม่ต้องมีหน้าตั้งค่ารวมใน UAT นี้
6. **P17E-ACCOUNT-02 — ต้องให้ผู้ใช้เปลี่ยนรหัสผ่านขณะเข้าใช้งานหรือกู้บัญชีเมื่อลืมรหัสผ่านใน UAT นี้หรือไม่?** ตอบแยกสองข้อ: เปลี่ยนรหัสผ่านขณะเข้าใช้งาน — ต้องมี / ยังไม่ต้องมี; กู้บัญชีที่เข้าไม่ได้ — ต้องมี / ยังไม่ต้องมี ไม่ถือว่าการเปิดใช้บัญชีครั้งแรกเป็นการกู้บัญชี และคำตอบว่าต้องมี recovery จะต้องกำหนดการพิสูจน์ตัวตนและช่องทางอย่างปลอดภัยก่อนพัฒนา
7. **P17E-CONSENT-01 — ระบบต้องเก็บหลักฐานเรื่องใดบ้าง และใครเป็นเจ้าของเอกสารที่อนุมัติแล้ว?** เลือกแยกเป็นข้อ: การยอมรับข้อกำหนดการใช้บริการ; การรับทราบประกาศความเป็นส่วนตัว; ความยินยอม/การอนุญาตประมวลผลข้อมูลสุขภาพเมื่อผู้รับผิดชอบกฎหมายระบุว่าจำเป็น; การตลาด; การสื่อสารทางเลือก; หรือวัตถุประสงค์อื่น โปรดระบุผู้ควบคุมข้อมูล วัตถุประสงค์ ฐานการประมวลผล เอกสารและเวอร์ชัน วันที่มีผล และหน้าที่ต้องใช้หลักฐาน โดยฝ่ายกฎหมาย/ผู้ควบคุมข้อมูลเป็นผู้ตัดสินฐาน ไม่ใช่วิศวกร
8. **P17E-CONSENT-02 — แต่ละรายการถอนหรือเปลี่ยนคำตอบได้หรือไม่ และมีผลอย่างไร?** โปรดตอบแยกข้อกำหนดการใช้บริการ การรับทราบประกาศความเป็นส่วนตัว ความยินยอมด้านข้อมูลสุขภาพ การตลาด และการสื่อสารทางเลือก: ถอน/แก้ได้หรือไม่; ทำอย่างไร; เมื่อไรมีผล; ต้องยอมรับเวอร์ชันใหม่เมื่อใด; การถอนหยุดการประมวลผลหรือกระทบการเข้าใช้ส่วนใด; และเก็บหลักฐานเดิมนานเท่าใด
9. **P17E-CONSENT-03 — หลักฐานความยินยอมควรเป็นของ DEMI ร่วมกันหรือแยกตามโรงพยาบาล/ผู้ควบคุมข้อมูล?** เลือก: รายการของ DEMI ใช้ร่วมกันเฉพาะวัตถุประสงค์ของ DEMI; แยกตามโรงพยาบาล/ผู้ควบคุมข้อมูลและวัตถุประสงค์; หรือใช้ทั้งสองแบบตามประเภทข้อมูล ระบุด้วยว่าการถอนที่โรงพยาบาล A มีผลต่อโรงพยาบาล B หรือไม่

## 30. Explicitly rejected unsafe assumptions

- A column, imported field, read projection, or customer label means the Patient owns it or may edit it.
- All PatientProfile values are Hospital-local, or all should be global by product intent merely because they are global in the current schema.
- Hospital Patient workflow authority grants arbitrary Person or PatientProfile edit rights.
- Name, DOB, gender, phone, or address edits prove identity or number/address ownership.
- PatientProfile.phoneNumber is auth identity, recovery channel, verified number, or notification opt-in.
- Emergency contact is a caregiver, legal representative, proxy, or consent giver.
- Free-text address has an agreed legal/contact/care meaning or needs structured normalization.
- Last-write-wins is a safe Patient/Hospital conflict rule.
- Profile mutation implies edit history, or every field needs immutable old/new PII history.
- Activation is password change or active-account recovery.
- One Account Settings label requires a settings page, password workflow, preferences, or account deletion.
- Terms, privacy acknowledgement, health processing, marketing, and optional communications are one boolean or share one controller/purpose.
- A legal basis, withdrawal effect, re-consent trigger, or consent scope can be inferred by engineering.
- One global consent flag authorizes every Hospital or withdrawal at Hospital A changes Hospital B without an approved rule.
- A multi-role User needs another identity or separate Patient credentials.
- Personal/Work selection, a client role, or a supplied resource ID is authorization.

## 31. Phase 17E.1 readiness checklist — profile/account implementation

Profile/account decisions for the bounded 17E.1 slice are recorded as owner-approved on 2026-09-30. Consent remains independently gated.

- [x] P17E-PROFILE-01 field set, bounded nullable-string semantics, address meaning, emergency-contact scope, and no-verification rule are owner-approved; see §28.1.
- [x] P17E-PROFILE-02 blocks Patient edits to names, DOB, National ID, and identity binding; no correction flow is in 17E.1.
- [x] P17E-PROFILE-03 assigns the seven fields to an exact Hospital relationship, keeps shared PatientProfile values as fallback, and preserves existing scoped Work reads.
- [x] P17E-PROFILE-04 limits mutation to Patient SELF, requires stale-write Conflict, and selects current-value-only with no profile history/audit/correction artifact.
- [x] Phone remains separate from auth, recovery, notifications, and emergency contact; profile phone is not a verified recovery destination.
- [x] Server mutation must enforce authenticated active same-Person PATIENT SELF scope and an explicit field allowlist; browser IDs do not establish authority.
- [x] Account scope is limited to approved profile view/edit, authenticated password change, and account recovery; no generic Settings page.
- [x] Phase 17E.1 implementation and focused verification are recorded in the [implementation handoff](./PHASE_17E1_PROFILE_ACCOUNT_SECURITY_IMPLEMENTATION.md); completion evidence and remaining gates are maintained there.

**Gate status:** P17E-PROFILE-01..04 and P17E-ACCOUNT-01..02 are resolved for the bounded 17E.1 UAT contract. Their implementation and verification remain in the Phase 17E.1 handoff. P17E-CONSENT-01..03 remain pending and block 17E.2 only.

## 32. Phase 17E.2 readiness checklist — consent evidence implementation

Do not begin 17E.2 automatically after 17E.1. Consent work is separately gated and may need to wait for legal/controller inputs.

- [ ] P17E-CONSENT-01 identifies each required purpose/item, whether it is consent, acknowledgement, terms, or another mechanism, the controller/legal owner, and approved source text/version/effective date.
- [ ] P17E-CONSENT-02 defines affirmative action, version change/re-consent, withdrawal, effect on each processing/access path, retained evidence, and retention period.
- [ ] P17E-CONSENT-03 defines DEMI-global versus Hospital/controller/Patient/purpose scope and cross-Hospital behavior.
- [ ] Record fields are approved for purpose/document key, immutable version/presented version, actor/User, applicable Person/Patient/controller scope, action, timestamp, source/context, withdrawal, and evidence.
- [ ] Login, Personal, clinical processing, and other gates are individually approved; no general consent boolean gates unrelated access.
- [ ] Audit/access controls protect evidence and avoid copying unnecessary health or contact data.
- [ ] Legal/privacy owner supplies final policy text, version identifiers, controller identity, effective date, and lawful-basis decisions before UI or persistence is implemented.
- [ ] Separate notification preference/delivery contracts are resolved if a communication choice is involved; NOTIF-01 remains independent.

**Blocking decisions:** P17E-CONSENT-01, P17E-CONSENT-02, and P17E-CONSENT-03 all block 17E.2. Profile decisions from 17E.1 do not substitute for these consent decisions.

## 33. Exact handoff

Phase 17E.0 remains a contract-consolidation document. P17E-PROFILE-01..04 and P17E-ACCOUNT-01..02 are **OWNER-APPROVED / RESOLVED — 2026-09-30**, authorizing the separate 17E.1 implementation. Consent decisions P17E-CONSENT-01..03 remain **DECISION PENDING**; no consent approval or 17E.2 implementation is implied.

The bounded Phase 17E.1 implementation is recorded in the [implementation handoff](./PHASE_17E1_PROFILE_ACCOUNT_SECURITY_IMPLEMENTATION.md). Keep unrelated Phase 12C governance and recovery questions open unless the Patient UAT contract resolves them explicitly. Phase 17E.2 remains separately gated on controller, legal, purpose, version, scope, withdrawal, evidence, and retention inputs.

The owner decision record does not itself authorize changes beyond the bounded 17E.1 contract. Implementation does not approve consent, preferences, or unrelated account governance.
