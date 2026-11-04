# DEMI Product Language Guidelines

Status: current application-wide Thai UI terminology baseline, 2026-11-04.

This document governs wording shown to DEMI users. It does not rename persisted roles, enums, database fields, audit events, routes, or authorization capabilities. Business behavior and authorization remain defined by the current accepted decisions, including ADR-0019 as amended by ADR-0026, ADR-0027, ADR-0028, `docs/CONTEXT.md`, and the current requirements.

## Voice and writing rules

- Write concise, professional Thai that hospital staff, อสม., patients, and caregivers can understand without knowing DEMI's data model.
- Name the action and affected person, account, hospital, appointment, or information when that changes the user's decision.
- Use the same Thai label for the same concept throughout navigation, forms, status text, confirmation dialogs, server-action feedback, and accessible names.
- Distinguish an account from a hospital-specific role or permission, and distinguish a caregiver connection from each separately granted data-sharing permission.
- Describe the confirmed result. Keep uncertain outcomes unconfirmed; do not report a success, failure, or cause that the server did not establish.
- Preserve safe generic authentication, authorization, and privacy errors. Do not reveal whether an account, patient, invitation, or protected record exists when the current contract intentionally withholds it.
- Keep legal text, clinical questions, scales, thresholds, classifications, and unapproved clinical concepts unchanged until their owner approves wording.
- Keep Thai text UTF-8 and allow long Thai copy to wrap at narrow viewport widths.

## Canonical role labels

| Internal role or membership | User-facing Thai | Meaning and boundary |
| --- | --- | --- |
| Platform `ADMIN` | ผู้ดูแลระบบ DEMI | Platform governance and permitted exceptional operations. Clearly distinct from a hospital administrator. |
| Hospital `OWNER` | แอดมินโรงพยาบาล | Hospital-specific administration and user management. This is not Platform `ADMIN`. |
| Hospital `MEMBER` | เจ้าหน้าที่โรงพยาบาล | Hospital staff with operational rights confirmed by ADR-0026; hospital and user management remain OWNER-only. Preserve a specific profession label when it is available and relevant. |
| `OSM` | อสม. | Community health volunteer. Describe the relevant hospital-specific work permission when discussing a workforce action. |
| `PATIENT` | ผู้ป่วย | Patient person/account label. Do not conflate ending care at one Hospital with deleting the person's account. |
| `CAREGIVER` | ญาติหรือผู้ดูแล | A patient-invited participant. A connection or invitation does not itself grant access to clinical information. |

Professional classifications remain specific: `DOCTOR` → แพทย์, `NURSE` → พยาบาล, `COORDINATOR` → ผู้ประสานงาน, and `OTHER` → อื่น ๆ. Do not replace a relevant profession with เจ้าหน้าที่โรงพยาบาล.

## Domain terms that must stay distinct

| Product concept | User-facing language | Do not imply |
| --- | --- | --- |
| User account | บัญชี / บัญชี DEMI | That a hospital membership change suspends, deletes, or restores the whole account. |
| Hospital staff membership | สิทธิ์การทำงานกับโรงพยาบาลนี้; สถานะการทำงานกับโรงพยาบาล | A global user-account state or an ordinary, authority-free system membership. |
| OSM–Hospital work permission | สิทธิ์ อสม. ในโรงพยาบาลนี้ / อสม. ที่ทำงานร่วมกับโรงพยาบาลนี้ | A patient assignment or access to patients outside the existing assignment scope. |
| Patient–Hospital care | การดูแลผู้ป่วยกับโรงพยาบาลนี้ | Patient account deletion or a change to care at another Hospital. |
| Patient–OSM assignment | ผู้รับผิดชอบผู้ป่วย / การมอบหมาย อสม. | A change unless the relevant service confirms it. |
| `PatientProgram` / Program | โปรแกรม | A care-program record groups its existing service and follow-up records; its status does not prove clinical success or completed service. |
| Goal Plan / `PatientGoalPlan` | แผนสุขภาพ | WB-D4 approves this name for Goal Plan. Do not infer that separately named health-plan artifacts are the same record. |
| Caregiver connection | ผู้ดูแลที่เชื่อมไว้ / การเชื่อมต่อกับผู้ดูแล | A data grant. State each accepted sharing permission separately. |
| Appointment/resource sharing | สิทธิ์ดูนัดหมาย / สิทธิ์ดูข้อมูล [รายการ] | The end of the caregiver connection or access to all clinical information. |
| Parent/Child Hospital | โรงพยาบาลแม่ข่าย / โรงพยาบาลลูกข่าย | Clinical or patient access beyond the accepted network policy. |
| Hospital organizational status | สถานะโรงพยาบาล | A person's account, membership, or OSM status. |

The word “ความสัมพันธ์” remains appropriate for a real human relationship, a named patient-care relationship when needed for precision, or a technical/developer audience. Avoid it as the default label for an ordinary workforce operation when “สิทธิ์การทำงาน”, “เจ้าหน้าที่”, “ผู้ดูแลที่เชื่อมไว้”, or the actual care action is clearer.

## Workforce lifecycle wording

| State/action | Preferred wording | Required semantic boundary |
| --- | --- | --- |
| `SUSPENDED` staff | พักสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้ชั่วคราว | Only this Hospital's membership is suspended; the account is not suspended. |
| `SUSPENDED` OSM | พักสิทธิ์ อสม. ในโรงพยาบาลนี้ | Only this Hospital's OSM work permission is suspended. Preserve current assignment eligibility checks and state the actual blocker. |
| Restore to `ACTIVE` | เปิดสิทธิ์การทำงานอีกครั้ง; OSM-specific: เปิดสิทธิ์ อสม. ในโรงพยาบาลนี้อีกครั้ง | Do not suggest that prior Patient assignments are recreated. |
| `ENDED` staff | นำเจ้าหน้าที่ออกจากโรงพยาบาลนี้อย่างถาวร | Hospital-specific permission ends and cannot simply be restored; re-entry requires the existing provisioning flow; history remains. |
| `ENDED` OSM | นำ อสม. ออกจากโรงพยาบาลนี้อย่างถาวร | In addition, current assignments in this Hospital end where the service confirms this. Do not imply other Hospital assignments end. |
| Eligible unused-record hard delete | ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน | Permanent deletion is limited to the existing server-verified eligibility; never imply active historical users can be deleted. |

For an OSM lifecycle block, say that the OSM still has patients to care for and instruct the user to reassign them first. Include the actual count only when the interface has it. Do not bypass server checks.

### Permanent workforce release finding

`releaseWorkforceRelationship()` in `src/modules/workforce/services/workforce-service.ts` ends the selected Hospital relationship and, for OSM, ends current assignments in that Hospital. It also revokes every unused workforce activation token for the target user, without a Hospital predicate. A user may have non-ended relationships at other Hospitals, so this revocation can cancel their outstanding workforce activation links there. The same operation does not delete the User account or other Hospital memberships. The current UI's statement that pending password-reset links are also revoked is not supported by this service operation.

This is a cross-Hospital side effect and a separate functional/security review finding. This copy task preserves the current token-revocation behavior, discloses the scope accurately, and does not claim that every other-Hospital flow is unaffected.

## Other lifecycle and safety wording

- Ending Patient–Hospital care: use “สิ้นสุดการดูแลผู้ป่วยรายนี้” or “สิ้นสุดการดูแลกับโรงพยาบาลนี้”. State effects on exact-Hospital access, future appointments, OSM assignments, pending requests, LINE notifications, retained history, other Hospitals, and reversibility as implemented. Never call this patient deletion.
- Canceling a caregiver invitation: say that the pending invitation becomes unusable. Do not say that an account or established connection is deleted.
- Ending an established caregiver connection: use “ยกเลิกการเชื่อมต่อกับผู้ดูแล”. Describe its effect on the connection and associated sharing according to the service; do not call it a permission-only change.
- Revoking one sharing grant: name the exact permission, such as “ยกเลิกสิทธิ์ดูนัดหมาย” or “ยกเลิกสิทธิ์ดูข้อมูลทั่วไป”. Do not imply the caregiver connection ends.
- Patient cancellation request: use “ส่งคำขอยกเลิกนัด”; say the appointment remains until the Hospital confirms the request.
- Unavailable, restricted, suppressed, or undefined report values must not be rendered as zero. Keep “ยังไม่พร้อมใช้งาน” or the current safe explanation where it accurately describes the value.
- Support submission confirms receipt only; it does not claim that the underlying issue is fixed.
- Account-recovery and authentication errors retain their existing privacy-safe disclosure boundary.
- Legal documents and consent text remain subject to the current ADR-0028 versioning and owner-provided text; UX copy review is not approval of legal wording.

## Current open terminology decisions

The following are not resolved by style preference and must not be inferred from this glossary:

- `PatientGoalPlan` is presented as “แผนสุขภาพ” for the Goal Plan workflow under WB-D4 in `docs/requirements/WB_ALIGNMENT_DECISIONS.md`. This does not resolve whether separately named artifacts such as “แผนสุขภาพดีของฉัน” or health-plan review are the same artifact; do not collapse them without a newer decision.
- Validated Thai wording and semantics for PAM/PROMs and other clinical instruments, including questions, scales, scoring, and classifications.
- Approved names for Service 2 and other service artifacts whose meaning is still open in the current canonical requirements.
- Legal wording supplied by the responsible agency. ADR-0028 describes versioned documents but does not make placeholder legal copy final.

For Baseline and existing Patient classification, retain the current approved field labels and meanings. Do not invent a broader diagnosis or clinical interpretation.

## High-impact occurrence inventory and audit classification

This inventory records the baseline observed on `main` before implementation. File paths identify presentation or user-facing action feedback; internal identifiers and service/domain names are intentionally not renamed.

| Area and occurrence | Classification | Evidence and implementation direction |
| --- | --- | --- |
| Workspace role and OSM labels: `src/components/app-shell/application-workspace.ts` (“เจ้าของโรงพยาบาล”, “สมาชิกโรงพยาบาล”, “อสม. ที่สัมพันธ์กับโรงพยาบาล”) | Ambiguous terminology; inconsistent wording | Use the canonical role labels and describe the OSM's work with the selected Hospital. Keep account and Hospital status separate. |
| Workforce directory/detail/lifecycle: `app/app/workforce/workforce-workspace.tsx`, `app/app/workforce/workforce-import-workspace.tsx`, `app/app/workforce/[kind]/[relationshipId]/page.tsx`, `staff-membership-controls.tsx`, `osm-relationship-controls.tsx`, `workforce-management-controls.tsx`, `hospital-owner-governance-controls.tsx`, and `workforce-release-control.tsx` | Ambiguous terminology; incorrect scope; inconsistent wording; security-sensitive | Replace membership/relationship actions with hospital-specific work-permission language. Distinguish temporary suspension, restoration, permanent release, profession, and owner administration. Keep OWNER-only user-management boundaries from ADR-0026. |
| Workforce action feedback: `src/modules/workforce/transport/server-actions.ts`, `workforce-release-action.ts`, and related workforce UI tests | Ambiguous terminology; inconsistent wording; security-sensitive | Use action-specific feedback; preserve explicit conflict/refusal outcomes and the existing unconfirmed outcome contract. |
| Release confirmation: `app/app/workforce/[kind]/[relationshipId]/workforce-release-control.tsx`, `src/modules/workforce/schemas/workforce-schemas.ts`, `src/modules/workforce/services/workforce-service.ts` | Incorrect meaning; security-sensitive | Name the selected Hospital, permanence, retained history, OSM assignment effect, re-provisioning, and cross-Hospital unused activation-token revocation. Synchronize the displayed typed phrase with server validation. |
| Account recovery and Hospital guidance: `app/recover/public-account-recovery-form.tsx`, `app/app/workforce/workforce-password-reset-control.tsx`, `app/app/hospitals/network/page.tsx` | Ambiguous terminology; security/privacy-sensitive | Use the canonical Hospital Admin label and keep current identity-proofing/recovery limits. Do not expose account existence or promise an unsupported recovery method. |
| Hospital onboarding/governance/network: `app/app/admin/hospital-onboarding/[id]/review-actions.tsx`, `approval-continuation.tsx`, `app/app/admin/hospitals/hospital-network-directory.tsx`, `app/app/admin/hospitals/[hospitalId]/page.tsx`, `hospital-network-section.tsx`, and `app/app/hospitals/network/page.tsx` | Ambiguous terminology; inconsistent wording | Use the canonical role labels and “โรงพยาบาลแม่ข่าย/ลูกข่าย”; preserve the no-inherited-clinical-access boundary. |
| Patient care ending: `app/app/patients/patient-care-end-form.tsx` and `src/modules/patient-hospital-relationship/transport/server-actions.ts` | Security/privacy-sensitive; mostly correct | Existing confirmation correctly distinguishes Hospital-specific care ending from account deletion and retains history. Keep the detailed consequence list and canonicalize only role names in authorization feedback. |
| User-record deletion: `app/app/users/[kind]/[relationshipId]/user-record-delete-control.tsx`, `src/modules/user-management/transport/server-actions.ts`, and `action-state.ts` | Ambiguous terminology; security-sensitive | Current UI calls this “ลบรายการ”. Use the approved unused-user-record wording and keep exact eligibility, permanent deletion, blocker, and typed-confirmation semantics. |
| Family and caregiver: `app/app/family/family-management-workspace.tsx`, `appointment-sharing-workspace.tsx`, `family-invitation-preview.tsx`, `error.tsx`, and `src/modules/family/transport/server-actions.ts` | Ambiguous terminology; privacy-sensitive | Separate invitation cancellation, established connection termination, individual grant revocation, and caregiver participation. Keep explicit consent and allowlisted data scope. |
| Shared home and patient directory: `app/app/page.tsx`, `app/app/patients/assigned/assigned-patient-directory-view.tsx`, and patient OSM-assignment workspaces | Ambiguous terminology; security-sensitive | Explain work availability and assignments without exposing relationship state-machine vocabulary or suggesting a broader patient scope. |
| Authentication, onboarding, LINE, and content: `app/login/`, `app/register/`, `app/activate/`, `app/line/`, `app/app/hospitals/knowledge/`, and related server actions | Inconsistent wording; security/privacy-sensitive | Existing UXH-C copy is retained where its factual and privacy boundaries remain correct. New edits use action-specific feedback and preserve unknown outcomes, activation-vs-recovery distinctions, and content lifecycle states. |
| Patient services and reporting: `app/app/patients/`, `app/app/personal/`, `app/app/hospitals/reporting/`, `app/app/admin/reporting/`, and `src/modules/reporting/` | Clinical/legal owner decision required; security/privacy-sensitive | Preserve current clinical wording and metric availability semantics; do not equate a request with a completed service or unavailable data with zero. |

## Decision precedence and reconciliation

For copy, follow the latest confirmed Product Owner direction, accepted ADRs and amendments, current `PRODUCT.md` and `docs/CONTEXT.md`, actual service behavior, then historical phase audits. The OWNER DECISION REQUIRED entries in the older UXH-C audit are not automatically current: use the current decisions summarized here and its reconciliation addendum. This glossary is presentation-only and cannot authorize a business operation.
