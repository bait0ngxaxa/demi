# Authorization capability inventory: every OWNER gate

- Status: MP-0 classification, Product Owner decision of 2026-11-01 (MEMBER operational parity).
- Scope: every non-test `.ts`/`.tsx` file under `src/` and `app/` that matches `MembershipType.OWNER`, `assertOwnerInDatabase`
  or `"OWNER"`. A match belongs to the **top-level declaration** that contains it (function, `const`, type); a match outside
  any declaration (an `import`) is `<module>`.
- Guard: `src/modules/identity/authz-capability-inventory.test.ts` fails when a matching `file` + `function` pair is missing
  from either table below. A new OWNER gate must be classified here before it can land.

## Classes

| Class | Meaning | Target |
| --- | --- | --- |
| `HOSPITAL_MANAGEMENT` | Hospital settings, contact info, self-registration switch, service catalog, news/content, network (Child create/attach/end/rename/cancel, Child OWNER invitation, network-read grant management), Hospital governance | OWNER |
| `USER_MANAGEMENT` | Workforce staff/OSM provisioning, lifecycle, promote/demote, activation links/slips, credential reset/recovery, account-misuse report (UM-1), staff/OSM name correction; Patient Excel import, Patient account invitations/activation/slips/regeneration, Patient account recovery/reset, ending a Patient–Hospital care relationship (ก-18) | OWNER |
| `OPERATIONAL` | Reports (dashboard, rows, `INCLUDE_ENDED`, export, Parent→Child RPT-32, network export), service-request confirm/reject, OSM ↔ Patient assignment, network Patient read, Patient name correction (E3), and care work that was already shared | OWNER + MEMBER |

`NOT_A_GATE` rows match the pattern but do not decide what the **actor** may do: they describe a target membership
(`TARGET_ROLE`), protect an invariant such as "a Hospital keeps an ACTIVE OWNER" (`INVARIANT`), label or type data
(`DISPLAY`, `TYPE`), or import a gate defined elsewhere (`IMPORT`).

Decisions recorded with the Product Owner on 2026-11-01 for rows the decision table did not name:

- Care tracking `includeEnded` (Patients whose care ended) is `OPERATIONAL`: the same cohort as the report `INCLUDE_ENDED`.
- The Patient list on an OSM's workforce detail page is `OPERATIONAL`: it is the read side of OSM ↔ Patient assignment.
  Every other control on that page stays `USER_MANAGEMENT`.

## Gates

| File | Function | Capability | Current rule (MP-0) | Class | Target |
| --- | --- | --- | --- | --- | --- |
| `app/app/patients/[relationshipId]/profile/page.tsx` | `HospitalPatientProfilePage` | shows the E3 Patient name-correction form | ACTIVE OWNER membership of the Patient's Hospital | OPERATIONAL | OWNER + MEMBER |
| `app/app/workforce/[kind]/[relationshipId]/page.tsx` | `WorkforceDetailView` | shows the workforce contact-phone control | `viewerScope === "OWNER"` | USER_MANAGEMENT | OWNER |
| `app/app/workforce/[kind]/[relationshipId]/workforce-management-controls.tsx` | `WorkforceManagementControls` | shows activation, lifecycle, network-read grant and release controls | `viewerScope === "OWNER"` | USER_MANAGEMENT | OWNER (network-read grant control removed in MP-2) |
| `src/components/app-shell/application-navigation.ts` | `canOpenHospitalSettings` | "ตั้งค่าโรงพยาบาล" entry | ACTIVE OWNER of an ACTIVE Hospital (or contact edit policy) | HOSPITAL_MANAGEMENT | OWNER |
| `src/components/app-shell/application-navigation.ts` | `canOpenParentAreaOverview` | "จัดการลูกข่าย" entry | ACTIVE OWNER of an ACTIVE Parent | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/account-security/policies/account-recovery-policy.ts` | `decideAccountRecoveryIssuePolicy` | Patient account recovery issuance | ACTIVE OWNER of the ACTIVE Hospital | USER_MANAGEMENT | OWNER |
| `src/modules/account-security/services/mediated-password-reset-service.ts` | `authorizeIssuerAndTarget` | mediated credential reset issuer | ACTIVE OWNER of the target's Hospital, or Platform ADMIN | USER_MANAGEMENT | OWNER |
| `src/modules/account-security/services/mediated-password-reset-service.ts` | `isOwnerScopedTarget` | which targets an OWNER may reset | target relationship in the OWNER's Hospital; never another OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/account-security/services/mediated-password-reset-service.ts` | `searchMediatedPasswordResetTargets` | credential reset target search | ACTIVE OWNER scope, or Platform ADMIN | USER_MANAGEMENT | OWNER |
| `src/modules/appointments/policies/appointment-policy.ts` | `hasActiveDirectHospitalScope` | appointment care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/appointments/services/appointment-line-notification-delivery-service.ts` | `currentEligibility` | Hospital staff still eligible at send time | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/appointments/services/work-appointment-query-service.ts` | `activeDirectMembershipWhere` | Work appointment list | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/care-tracking/services/care-tracking-query-service.ts` | `resolveScope` | care tracking `includeEnded` | ended relationships only for an ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/followups/policies/followup-policy.ts` | `hasActiveDirectHospitalScope` | follow-up care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/goals/policies/goal-policy.ts` | `hasActiveDirectHospitalScope` | goal care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/hospital-contact/policies/hospital-contact-policy.ts` | `decideHospitalContactPolicy` | contact info edit | ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-contact/policies/hospital-contact-policy.ts` | `hasActiveWorkHospitalScope` | contact info read in Work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/hospital-contact/policies/hospital-contact-policy.ts` | `hasDirectActiveOwnerScope` | contact info edit | ACTIVE OWNER of an ACTIVE Hospital | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-contact/services/hospital-contact-service.ts` | `getActiveOwnerHospitalWhere` | contact info edit | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-contact/services/hospital-contact-service.ts` | `lockAndRevalidateEditorAuthority` | contact info edit | persisted ACTIVE OWNER, locked | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-contact/services/hospital-contact-work-query-service.ts` | `activeWorkHospitalWhere` | contact info read in Work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/hospital-content/policies/hospital-content-policy.ts` | `decideHospitalContentPolicy` | news/content composer | ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-content/services/hospital-content-image-service.ts` | `assertOwnerCanSeeContent` | content image management | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-content/services/hospital-content-image-service.ts` | `getHospitalContentImageSignedUrl` | draft image preview | persisted ACTIVE OWNER for unpublished content | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-content/services/hospital-content-image-service.ts` | `uploadHospitalContentImage` | content image upload | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-content/services/hospital-content-service.ts` | `getActiveOwnerHospitalWhere` | content composer | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-content/services/hospital-content-service.ts` | `lockAndRevalidateAuthority` | content create/edit/publish | persisted ACTIVE OWNER, locked | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-hierarchy/services/hospital-hierarchy-service.ts` | `findOwnerContext` | Hospital network summary on the report dashboard (`getHospitalHierarchyContext` has no other caller) | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/hospital-service-areas/services/child-owner-invitation-context.ts` | `parentOwnerMembershipWhere` | Child OWNER invitation issuer | inviting ACTIVE Parent OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-service-areas/services/hospital-network-access.ts` | `findNetworkReportExportScope` | network report export (ADR-0025) | ACTIVE Parent OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/hospital-service-areas/services/hospital-network-access.ts` | `networkMembershipTypes` | network authorities: `OWNER` (network management), `PATIENT_READ`, `REPORT_EXPORT` | `OWNER`: OWNER; `PATIENT_READ`: OWNER or MEMBER with grant; `REPORT_EXPORT`: OWNER or MEMBER | HOSPITAL_MANAGEMENT (`OWNER`), OPERATIONAL (`PATIENT_READ`, `REPORT_EXPORT`) | `OWNER`: OWNER; `PATIENT_READ`: OWNER + MEMBER without grant; `REPORT_EXPORT`: OWNER + MEMBER |
| `src/modules/hospital-service-areas/services/hospital-service-area-service.ts` | `authorize` | network management (attach/end) | persisted ACTIVE Parent OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-service-areas/transport/network-page-context.ts` | `getOwnerNetworkPageContext` | "จัดการลูกข่าย" page | Parents the actor OWNS | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-settings/services/hospital-self-registration-settings-service.ts` | `listOwnedHospitalSelfRegistrationSettings` | self-registration switch | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/hospital-settings/services/hospital-self-registration-settings-service.ts` | `setHospitalSelfRegistrationEnabled` | self-registration switch | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/identity/services/workforce-relationship-compatibility.ts` | `assertWorkforceRelationshipsCompatible` | conflict disclosure while provisioning | persisted ACTIVE OWNER of the disclosing Hospital | USER_MANAGEMENT | OWNER |
| `src/modules/patient-activation/policies/patient-activation-policy.ts` | `hasActiveDirectHospitalScope` | Patient account invitations/slips | ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-activation/services/patient-activation-query-service.ts` | `listPatientActivationScopes` | Patient activation list | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-activation/services/patient-activation-service.ts` | `assertPatientActivationActorInDatabase` | Patient activation issue/regenerate | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-assignment/policies/patient-osm-assignment-policy.ts` | `decidePatientOsmAssignmentPolicy` | OSM ↔ Patient assignment | ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-assignment-query-service.ts` | `buildOwnerHospitalWhere` | assignment candidates | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-assignment-service.ts` | `patientOsmAssignmentInternals` | re-exports the assignment actor check | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts` | `assertOwnerInDatabase` | assignment actor check | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts` | `assignOsmToPatientInTransaction` | assign | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts` | `patientOsmAssignmentTransactionInternals` | exports the assignment actor check | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts` | `unassignOsmFromPatientInTransaction` | unassign | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-assignment/services/patient-osm-bulk-assignment-transaction.ts` | `assignOsmToPatientsInTransaction` | bulk assign | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-baseline/policies/patient-baseline-policy.ts` | `hasActiveDirectHospitalScope` | Baseline care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/patient-classification/policies/patient-classification-policy.ts` | `hasActiveDirectHospitalScope` | classification care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/patient-classification/services/patient-classification-query-service.ts` | `buildAuthorizedHospitalWhere` | classification read | persisted ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/patient-directory/policies/patient-directory-policy.ts` | `isActiveDirectHospitalScope` | Patient directory | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/patient-directory/services/patient-directory-query-service.ts` | `buildAuthorizedHospitalWhere` | Patient directory (default OWNER or MEMBER) | persisted ACTIVE membership of the given types | OPERATIONAL | OWNER + MEMBER (unchanged default) |
| `src/modules/patient-directory/services/patient-directory-query-service.ts` | `buildOsmDetailAssignedPatientRelationshipWhere` | Patients assigned to one OSM | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-directory/services/patient-directory-query-service.ts` | `findPatientsAssignedToOsmInHospital` | Patients assigned to one OSM | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-evidence/policies/patient-evidence-policy.ts` | `hasActiveDirectHospitalScope` | evidence care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/patient-hospital-profile/services/patient-name-correction-service.ts` | `loadActor` | E3 Patient name correction (`correctPatientName`) | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-hospital-profile/services/patient-name-correction-service.ts` | `loadActor` | UM-1 staff/OSM name correction (`correctWorkforcePersonName`) | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service.ts` | `isActiveOwnerOfHospital` | end care relationship (ก-18) | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-program/policies/patient-program-policy.ts` | `hasActiveDirectHospitalScope` | Program care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/patient-provisioning/policies/patient-provisioning-policy.ts` | `isActiveDirectHospitalScope` | Patient Excel import | ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-provisioning/services/patient-provisioning-transaction.ts` | `assertPatientProvisioningActorInDatabase` | Patient Excel import rows | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/patient-service-requests/policies/patient-service-request-policy.ts` | `decidePatientServiceRequestPolicy` | `manageCatalog` | ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/patient-service-requests/policies/patient-service-request-policy.ts` | `decidePatientServiceRequestPolicy` | `review` (confirm/reject, inbox) | ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-service-requests/services/patient-service-catalog-service.ts` | `assertPersistedOwnerScope` | service catalog edit | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/patient-service-requests/services/patient-service-catalog-service.ts` | `listManagedHospitalServiceCatalog` | service catalog page | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | OWNER |
| `src/modules/patient-service-requests/services/patient-service-request-service.ts` | `assertPersistedHospitalReviewer` | confirm/reject | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/patient-service-requests/services/patient-service-request-service.ts` | `listHospitalPatientServiceRequests` | service-request inbox | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/reporting/policies/hospital-network-child-report-policy.ts` | `decideHospitalNetworkChildReportPolicy` | Parent→Child summary read/export (RPT-32) | ACTIVE Parent OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/reporting/policies/hospital-report-policy.ts` | `decideHospitalReportPolicy` | dashboard, rows, `INCLUDE_ENDED`, export | dashboard/rows/`INCLUDE_ENDED`: OWNER; ACTIVE-cohort export: OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/reporting/services/hospital-report-access-service.ts` | `listHospitalReportingHospitals` | report Hospital list | persisted ACTIVE OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/reporting/services/hospital-report-access-service.ts` | `resolveHospitalReportingAccessContext` | report context, audit `accessBasis` | OWNER for every capability; MEMBER for ACTIVE export | OPERATIONAL | OWNER + MEMBER |
| `src/modules/reporting/services/network-report-access-service.ts` | `resolveNetworkReportExportContext` | network export audit `accessBasis` | ACTIVE Parent OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/reporting/services/parent-child-hospital-report-access-service.ts` | `listParentChildHospitalReportTargetGroups` | Parent→Child report targets | ACTIVE Parent OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/reporting/services/parent-child-hospital-report-access-service.ts` | `resolveInDatabase` | Parent→Child report context | ACTIVE Parent OWNER | OPERATIONAL | OWNER + MEMBER |
| `src/modules/screening/policies/screening-policy.ts` | `hasActiveDirectHospitalScope` | screening care work | ACTIVE OWNER or MEMBER | OPERATIONAL | OWNER + MEMBER (unchanged) |
| `src/modules/user-management/services/user-directory-service.ts` | `findOwnedHospital` | user directory | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/user-management/services/user-directory-service.ts` | `getHospitalUserDetail` | user detail | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/user-management/services/user-record-deletion-service.ts` | `deleteUnusedUserRecord` | delete an unused user record | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/user-management/services/user-takeover-service.ts` | `lockSuspectedTakeover` | account-misuse report (UM-1) | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/policies/hospital-owner-policy.ts` | `decideHospitalOwnerPolicy` | promote/demote, governance read, network-read grant | ACTIVE OWNER | USER_MANAGEMENT (promote/demote), HOSPITAL_MANAGEMENT (governance, grant) | OWNER (grant capability removed in MP-1) |
| `src/modules/workforce/policies/workforce-password-reset-policy.ts` | `decideWorkforcePasswordResetPolicy` | workforce credential reset | ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/policies/workforce-policy.ts` | `decideWorkforcePolicy` | workforce provision/lifecycle/release | ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `assertOwnerInDatabase` | workforce/user-management actor check | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `assertWorkforceProvisionerInDatabase` | workforce provisioning | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `assertActivationContextAuthority` | issuer still trusted when a workforce activation is claimed | OWNER (legacy OSM claim: OWNER or MEMBER) | USER_MANAGEMENT | OWNER (legacy claim unchanged) |
| `src/modules/workforce/services/workforce-service.ts` | `executeHospitalOwnerMutation` | promote/demote | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `getWorkforceDetail` | workforce detail management projection | persisted ACTIVE OWNER; viewer basis OWNER/MEMBER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `listWorkforce` | workforce directory (MEMBER: OSM read-only, no staff page) | viewer basis OWNER/MEMBER | USER_MANAGEMENT | OWNER (MEMBER view unchanged) |
| `src/modules/workforce/services/workforce-service.ts` | `listWorkforceHospitals` | workforce Hospital picker and viewer basis | OWNER or MEMBER, basis recorded | USER_MANAGEMENT | OWNER (MEMBER view unchanged) |
| `src/modules/workforce/services/workforce-service.ts` | `releaseWorkforceRelationship` | release a relationship | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `revokeIssuedWorkforceActivation` | revoke an issued activation | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `revokeWorkforceActivation` | revoke a workforce activation | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `setHospitalMembershipNetworkPatientReadGrant` | network-read grant issue/revoke | persisted ACTIVE OWNER | HOSPITAL_MANAGEMENT | removed in MP-1 (MEMBER reads without a grant) |
| `src/modules/workforce/services/workforce-service.ts` | `toReportExportGrantDetail` | grant controls on the detail page | OWNER viewer only | HOSPITAL_MANAGEMENT | removed in MP-1 |
| `src/modules/workforce/services/workforce-service.ts` | `toWorkforceDetail` | contact phone, promote/demote availability | OWNER viewer only | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `toWorkforceDetailActions` | lifecycle and reset actions | OWNER viewer only | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `transitionHospitalMembership` | staff suspend/restore | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `transitionOsmRelationship` | OSM suspend/restore | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `updateHospitalMembershipProfession` | staff profession | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `updateWorkforceContactPhone` | workforce contact phone | persisted ACTIVE OWNER | USER_MANAGEMENT | OWNER |

## Not a gate

| File | Function | Reason | Note |
| --- | --- | --- | --- |
| `app/app/line/account/page.tsx` | `ApplicationLineAccountPage` | INVARIANT | sole-OWNER recovery readiness warning; no action is gated |
| `app/app/workforce/[kind]/[relationshipId]/hospital-owner-governance-controls.tsx` | `HospitalOwnerGovernanceControls` | TARGET_ROLE | promote/demote form for a target membership type; the page is already OWNER-only |
| `app/app/workforce/[kind]/[relationshipId]/hospital-owner-governance-controls.tsx` | `ownerConfirms` | TARGET_ROLE | confirmation wording for the target membership type |
| `app/app/workforce/[kind]/[relationshipId]/staff-membership-controls.tsx` | `StaffMembershipControls` | TARGET_ROLE | an OWNER target has no MEMBER lifecycle controls |
| `src/components/app-shell/application-workspace.ts` | `workspaceContextLabel` | DISPLAY | "เจ้าของโรงพยาบาล" / "สมาชิกโรงพยาบาล" label |
| `src/modules/account-security/services/caregiver-invitation-takeover-lock.ts` | `lockCaregiverInvitationIdentityInTransaction` | TARGET_ROLE | held OWNER invitation of the locked user |
| `src/modules/account-security/services/mediated-password-reset-service.ts` | `isHeldOwnerInvitationResetTarget` | TARGET_ROLE | held OWNER invitation of the reset target |
| `src/modules/account-security/services/mediated-password-reset-service.ts` | `restoreTakeoverRelationships` | TARGET_ROLE | restores the target's held OWNER invitation |
| `src/modules/hospital-governance/services/hospital-governance-service.ts` | `retireHospitalsInTransaction` | TARGET_ROLE | pending OWNER invitations end with the Hospital |
| `src/modules/hospital-governance/services/hospital-owner-recovery-readiness-service.ts` | `countSoleActiveOwnerHospitals` | INVARIANT | Hospitals whose only ACTIVE OWNER is the actor |
| `src/modules/hospital-onboarding/services/hospital-onboarding-service.ts` | `approveHospitalOnboarding` | TARGET_ROLE | Platform ADMIN approval creates the OWNER membership |
| `src/modules/hospital-onboarding/services/onboarding-hospital-service.ts` | `publicOnboardableHospitalWhere` | TARGET_ROLE | a Hospital with an open OWNER invitation is not publicly onboardable |
| `src/modules/hospital-onboarding/services/parent-owner-invitation-context.ts` | `activatePendingParentOwner` | TARGET_ROLE | activates the invited Parent OWNER |
| `src/modules/hospital-onboarding/services/parent-owner-invitation-context.ts` | `assertParentOwnerInvitationContext` | TARGET_ROLE | invited Parent OWNER membership; the issuer is a Platform ADMIN |
| `src/modules/hospital-onboarding/services/parent-owner-invitation-context.ts` | `openOwnerInvitationWhere` | TARGET_ROLE | open OWNER invitation shape |
| `src/modules/hospital-onboarding/services/parent-owner-invitation-service.ts` | `getParentOwnerInvitationState` | TARGET_ROLE | declined OWNER invitation state |
| `src/modules/hospital-onboarding/services/parent-owner-invitation-service.ts` | `hasActiveOwner` | INVARIANT | a Parent with an ACTIVE OWNER needs no invitation |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `cancelPendingChildFacility` | TARGET_ROLE | ends the Child's pending OWNER invitation |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `findOpenOwnerInvitation` | TARGET_ROLE | the Child's open OWNER invitation |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `findOwnInvitation` | TARGET_ROLE | the actor's own OWNER invitation (self-service) |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `findReplayedChild` | TARGET_ROLE | Parent-created Child with an OWNER invitation |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `hasActiveOwner` | INVARIANT | a Child with an ACTIVE OWNER |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `listHospitalOwnerInvitationsForActor` | TARGET_ROLE | the actor's own OWNER invitations (self-service) |
| `src/modules/hospital-service-areas/services/child-facility-service.ts` | `listManagedChildFacilities` | TARGET_ROLE | each Child's OWNER invitation state |
| `src/modules/hospital-service-areas/services/child-owner-invitation-context.ts` | `activatePendingChildOwner` | TARGET_ROLE | activates the invited Child OWNER |
| `src/modules/hospital-service-areas/services/child-owner-invitation-context.ts` | `assertChildOwnerInvitationContext` | TARGET_ROLE | invited Child OWNER membership; the issuer check is `parentOwnerMembershipWhere` |
| `src/modules/hospital-service-areas/services/hospital-network-access.ts` | `HospitalNetworkAuthority` | TYPE | authority names |
| `src/modules/hospital-service-areas/services/hospital-network-access.ts` | `HospitalNetworkReportExportScope` | TYPE | membership type of the resolved scope |
| `src/modules/reporting/services/hospital-report-access-service.ts` | `HospitalReportingAccessContext` | TYPE | audit `accessBasis` |
| `src/modules/reporting/services/hospital-report-query-service.ts` | `NetworkReportExportPreview` | TYPE | `accessBasis` |
| `src/modules/reporting/services/network-report-access-service.ts` | `NetworkReportExportContext` | TYPE | `accessBasis` |
| `src/modules/self-registration/services/self-registration-eligibility.ts` | `isOwnerOrAdmin` | TARGET_ROLE | an OWNER or ADMIN account cannot self-register |
| `src/modules/user-management/services/user-directory-service.ts` | `<module>` | IMPORT | imports `assertOwnerInDatabase` |
| `src/modules/user-management/services/user-directory-service.ts` | `loadDetailRecord` | TARGET_ROLE | target holds an OWNER membership |
| `src/modules/user-management/services/user-record-deletion-service.ts` | `<module>` | IMPORT | imports `assertOwnerInDatabase` |
| `src/modules/user-management/services/user-takeover-service.ts` | `<module>` | IMPORT | imports `assertOwnerInDatabase` |
| `src/modules/user-management/services/user-takeover-service.ts` | `locateTarget` | TARGET_ROLE | target holds an OWNER membership |
| `src/modules/workforce/services/hospital-owner-invitation.ts` | `writeHospitalOwnerInvitationInTransaction` | TARGET_ROLE | writes an OWNER invitation |
| `src/modules/workforce/services/workforce-service.ts` | `WorkforceViewerScope` | TYPE | viewer basis |
| `src/modules/workforce/services/workforce-service.ts` | `assertEligibleOwnerRemains` | INVARIANT | a Hospital keeps an eligible ACTIVE OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `countEligibleOwners` | INVARIANT | eligible ACTIVE OWNER count |
| `src/modules/workforce/services/workforce-service.ts` | `demoteHospitalOwnerInTransaction` | TARGET_ROLE | demotes the target OWNER |
| `src/modules/workforce/services/workforce-service.ts` | `ensureHospitalMembership` | TARGET_ROLE | an existing OWNER membership is never downgraded |
| `src/modules/workforce/services/workforce-service.ts` | `isActivationTargetEligible` | TARGET_ROLE | an OWNER account cannot claim a self-registration activation |
| `src/modules/workforce/services/workforce-service.ts` | `isInitialWorkforceScopeEligible` | TARGET_ROLE | target with a non-ended OWNER membership |
| `src/modules/workforce/services/workforce-service.ts` | `isOwnerInvitationScopeEligible` | TARGET_ROLE | pending OWNER invitation target |
| `src/modules/workforce/services/workforce-service.ts` | `listHospitalOwnersForPasswordReset` | TARGET_ROLE | Platform ADMIN lists a Hospital's OWNERs to reset |
| `src/modules/workforce/services/workforce-service.ts` | `promoteHospitalOwnerInTransaction` | TARGET_ROLE | promotes the target to OWNER |
| `src/modules/workforce/transport/action-state.ts` | `WorkforceOwnerGovernanceMutationResultState` | TYPE | result membership type |
| `src/modules/workforce/transport/server-actions.ts` | `toOwnerGovernanceMutationResultState` | TYPE | result membership type check |
