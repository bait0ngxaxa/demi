# DEMI Project Context

เอกสารนี้เป็นจุดเริ่มต้นแบบกระชับสำหรับ developer และ AI coding agent ก่อนลงมือเปลี่ยนระบบ อ่านรายละเอียดที่ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md) และเหตุผลของแต่ละ decision ที่ [ADR Index](./adr/README.md)

## Project Purpose

DEMI กำลังถูก redesign/rewrite ใหม่เพื่อแยก identity, account, role, membership, authorization และ operational responsibility ออกจากกันอย่างชัดเจน

Legacy DEMI repository ใช้ศึกษา behavior, terminology และ domain knowledge เดิมได้เท่านั้น ไม่ใช่ target architecture และไม่ใช่ source of truth สำหรับ authentication, authorization, role model หรือ data-access pattern ของระบบใหม่

## Current Phase

ขณะนี้ **Phase 10B.0–10D.0 prototype slices implement แล้ว** ต่อจาก **Phase 10A Patient Profile / Baseline / Status Tracking analysis** โดย 10C.0 เพิ่ม dedicated, immutable, relationship-scoped Baseline และ 10D.0 เพิ่ม relationship-level image evidence แบบ append-only สำหรับ requirement validation ทั้งหมดนี้ยังไม่ใช่ customer-approved behavior รายละเอียดอยู่ที่ [Phase 10D.0 handoff](./phases/PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md)

**Phase 11A Workforce Lifecycle & Hospital Governance requirements/domain-boundary analysis เสร็จแล้ว** และ **Phase 11B.0 Staff Membership Lifecycle working prototype implement แล้ว** แบบ narrowly scoped MVP สำหรับ validation โดยใช้ direct active Hospital Owner boundary, bounded Staff detail, profession update, membership suspend/restore และ atomic audit ตาม [Phase 11B.0 handoff](./phases/PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md) ส่วน User account recovery, Hospital/Owner governance และ workforce lifecycle อื่น ๆ ยังไม่เริ่มและยังเป็น open requirements ตาม [Phase 11A requirements](./phases/PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md)

**Phase 11C OSM Relationship Lifecycle & Patient Assignment Consequence Analysis เสร็จแล้ว** ตาม [Phase 11C analysis](./phases/PHASE_11C_OSM_RELATIONSHIP_LIFECYCLE_ASSIGNMENT_CONSEQUENCES.md) และ **Phase 11D.0 OSM Relationship Suspend / Restore working prototype implement แล้ว** ตาม [Phase 11D.0 handoff](./phases/PHASE_11D0_OSM_RELATIONSHIP_LIFECYCLE_WORKING_PROTOTYPE.md) โดยยังคงเป็น narrowly scoped prototype: exact active Hospital Owner เท่านั้น, ต้องไม่มี current Patient assignment ใน Hospital เดียวกัน, และ restore มี defensive reconciliation guard. Emergency suspension, transfer, deletion, geography, governance, account recovery และ customer requirements อื่น ๆ ยังเป็น open requirements

**Phase 12A Hospital Governance & Account Recovery analysis เสร็จแล้ว** ตาม [Phase 12A analysis](./phases/PHASE_12A_HOSPITAL_GOVERNANCE_ACCOUNT_RECOVERY_REQUIREMENTS.md) และ **Phase 12B.0 Hospital Lifecycle Working Prototype implement แล้ว** ตาม [Phase 12B.0 handoff](./phases/PHASE_12B0_HOSPITAL_LIFECYCLE_WORKING_PROTOTYPE.md) โดยมี bounded Platform Admin Hospital governance directory/detail และการเปลี่ยน `ACTIVE <-> SUSPENDED` แบบ status-only, no-cascade prototype. **Phase 12C Hospital Owner Governance + Account Recovery detailed analysis/contract เสร็จแล้ว** ตาม [Phase 12C contract](./phases/PHASE_12C_OWNER_GOVERNANCE_ACCOUNT_RECOVERY_CONTRACT.md) โดยกำหนด provisional Owner Governance direction สำหรับ Phase 12D.0 และยืนยันว่า active-account recovery ต้อง defer หาก trusted identity/control proof, delivery channel และ session semantics ยังไม่ถูกกำหนดอย่างปลอดภัย. Semantics สุดท้ายของการ suspend/restore และ final customer requirements ยังคงเป็น provisional/open requirements

**Phase 12D.0 Hospital Owner Governance working prototype implement แล้ว** ตาม [Phase 12D.0 handoff](./phases/PHASE_12D0_HOSPITAL_OWNER_GOVERNANCE_WORKING_PROTOTYPE.md) โดยจำกัดการเปลี่ยนแปลงไว้ที่ `HospitalMembership.membershipType` ระหว่าง `MEMBER <-> OWNER` ภายใน exact ACTIVE Hospital, บังคับให้มี eligible Owner อย่างน้อยหนึ่งรายด้วย serializable transaction และ atomic audit. Active-account recovery, final-Owner recovery และ User account governance ยังอยู่นอกขอบเขตและยังเป็น open requirements

**Phase 13A Demo Flow Gap Analysis เสร็จแล้ว** ตาม [Phase 13A analysis](./phases/PHASE_13A_DEMO_FLOW_GAP_ANALYSIS.md) และ **Phase 13B.0 End-to-End Demo Continuity working prototype implement แล้ว** ตาม [Phase 13B.0 handoff](./phases/PHASE_13B0_DEMO_CONTINUITY_WORKING_PROTOTYPE.md) โดยเพิ่ม actor-aware `/app` workspace, Hospital lifecycle visibility, authoritative Patient Detail continuation, selected Hospital context handoff และ Screening → Goals → Follow-up navigation บน service/policy เดิม. ไม่เพิ่ม schema/migration และยังไม่เริ่ม Patient self-service, account recovery หรือ Admin reconciliation `P13-D7`

**Phase 13C Post-Integration Business Flow Re-Audit เสร็จแล้ว** ตาม [Phase 13C audit](./phases/PHASE_13C_POST_INTEGRATION_BUSINESS_FLOW_REAUDIT.md) โดย re-audit golden journeys A–E หลัง Phase 13B.0 และสรุปว่าไม่มี current `DEMO_BLOCKER`; rewrite มี breadth เพียงพอสำหรับ customer requirement workshop ภายใต้ demo dataset/handoff prerequisites ที่ระบุไว้. Recommendation คือ Requirements First เพื่อเก็บ customer decisions ของ recovery, reconciliation, Patient self-service, OSM scope, clinical semantics และ reporting ก่อนเริ่ม implementation slice ใหม่. **Phase 14 ยังไม่เริ่ม**

คำถามเรื่อง owner สุดท้าย, field ownership, visibility, correction, lifecycle, retention และ actor-specific editability ที่ระบุใน Phase 10A ยังเป็น provisional/open requirements

Protected application UI ใช้ shared responsive shell, centralized capability-aware navigation, semantic Tailwind tokens และ small UI primitive layer ตาม [DEMI UI Foundation](./ui/DEMI_UI_FOUNDATION.md) โดย navigation visibility เป็น UX เท่านั้นและไม่แทน server authorization

## Phase 6A Patient Access and Assignment Contract

Phase 6A owner decisions are accepted. The implementation handoff is [Phase 6A Patient Access and Assignment](./phases/PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md):

- An active `HOSPITAL` actor with a direct active `OWNER` or `MEMBER` membership may read Patients only through `PatientHospitalRelationship` rows for that same active Hospital. Profession does not change visibility.
- Parent/child Hospital hierarchy is not Patient authorization. Parent, child, sibling, and network metadata do not expand Patient read or mutation scope.
- OSM Patient read scope is `ASSIGNED_PATIENTS`, not Hospital-wide access. `OsmHospitalRelationship` alone is insufficient; B6.2 uses a first-class Hospital-specific assignment attached to `PatientHospitalRelationship`.
- Patient provisioning remains valid without assignment. B6.2 assignment is optional after provisioning, is controlled by active direct Hospital `OWNER` plus `patient:assign-osm`, allows one active OSM per Patient–Hospital relationship through a PostgreSQL partial unique index, preserves history, and fails access immediately when the OSM or its Hospital relationship is inactive.
- Platform `ADMIN` has no routine Patient-directory access. Governance/reconciliation access, if later needed, must be separately named, scoped, audited, and authorized.
- Phase 6B.1 is implemented as a Hospital-focused read-only slice: minimal display name/Hospital context/HN/opaque identifiers, bounded server-side name/HN search and offset pagination, stable ordering, no account/activation status by default, no clinical fields, and no Patient self-service portal. Authorization is enforced through the direct Hospital relationship predicate; OSM generic directory read and ADMIN routine read remain denied.
- Phase 6B.2 is implemented after B6.1 with `/app/patients/assigned` and OWNER assignment management under the existing Patient detail route. Phase 6B.3 profile editing, delete/restore/deactivation, transfer/Hospital change, Patient self-service expansion, and clinical workflows remain deferred or require future requirements.

## Phase 7B.0 Screening Working Prototype

Phase 7B.0 is implemented as a relationship-scoped requirement-validation workflow. The handoffs are [Phase 7A Screening Requirements](./phases/PHASE_7A_SCREENING_REQUIREMENTS.md) and [Phase 7B.0 Screening Working Prototype](./phases/PHASE_7B0_SCREENING_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/screenings`, `/new`, and detail routes read through the authoritative `PatientHospitalRelationship` scope.
- Source-defined question/scoring versions, server-side response validation/scoring, serializable atomic persistence, bounded retry nonce, historical detail, and `screening.submitted` audit are implemented.
- Screening results do not automatically create or mutate Goals. Any Goal Plan is a separate explicit operation.
- Question sets and scoring remain provisional prototype definitions and are not clinical recommendations or final customer requirements.

## Phase 8A/8B.0 Goals & Activity Plan Working Prototype

The Phase 8A contract and Phase 8B.0 handoff are [Phase 8A Goals & Activity Plan Requirements](./phases/PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md) and [Phase 8B.0 Goals & Activity Plan Working Prototype](./phases/PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/goals`, `/new`, and detail routes provide relationship-scoped Goal Plan history, explicit Primary Goal selection/creation, and historical detail for authorized Hospital users and exactly assigned OSM users; history is bounded to the newest 50 rounds.
- The prototype uses source-defined `demi-goals` / `legacy-prototype-v1` definitions, immutable `PatientGoalPlan` rounds with `PatientGoalItem` snapshots, optional Screening context through the independent Screening-owned `screening:read` boundary, automatic retention of the latest Screening source when it supplies prototype defaults, server-side template validation, serializable round allocation, per-form retry nonce, and bounded `goal_plan.created` audit. Goal history retains only opaque Screening source IDs and receives minimal historical summaries through one bounded Screening-owned batch query; denied optional Screening reads do not remove otherwise-authorized Goal history/detail access.
- Prototype capabilities are `goal:read` and `goal:plan`: active direct Hospital OWNER/MEMBER and active exact-assignment OSM are allowed; PATIENT and Platform ADMIN are denied; profession does not independently change authority.
- Goal Plan creation is never automatic from Screening. Primary goals, activity mappings, target defaults, units, authority, approval, visibility, and correction semantics remain provisional/open customer requirements. Patient self-service, edit/delete/amendment, adherence/progress, care plans, and clinical recommendations are not implemented.

## Phase 9A Appointment & Follow-up Requirement Contract

Phase 9A is complete as analysis/documentation: [Appointment & Follow-up Requirement Analysis](./phases/PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md) records the pinned legacy evidence and the provisional contract for the future Phase 9B.0 Appointment and Phase 9C.0 Follow-up / Progress prototypes. It adds no Appointment or Follow-up implementation and does not make provisional business or clinical behavior customer-approved.

- The proposed slices inherit `PatientHospitalRelationship` scope, direct Hospital authorization, exact active `PatientOsmAssignment` for OSM access, server-side ActorContext/policy authority, profession neutrality, and the Platform ADMIN governance boundary.
- The proposed Follow-up contract keeps Goal Plan provenance explicit, favors immutable relationship-scoped rounds, and defers correction/amendment, attachments, clinical rules, and generic workflow behavior until requirements are confirmed.

## Phase 9B.0 Appointment Working Prototype

Phase 9B.0 is implemented as the relationship-scoped Appointment
requirement-validation workflow in [the Phase 9B.0 handoff](./phases/PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/appointments`, `/new`, detail, and edit/reschedule routes provide bounded newest-first Appointment history and explicit create/reschedule/cancel/complete/no-show operations.
- `PatientAppointment` is owned by the exact `PatientHospitalRelationship`; it stores a real PostgreSQL `TIMESTAMPTZ`, uses strict provisional type/status/location values, and retains creator/responsible-user distinctions.
- Provisional `appointment:read` and `appointment:manage` policy allows active direct Hospital OWNER/MEMBER, allows read-only exact-assigned OSM, and denies unassigned OSM, PATIENT, and ADMIN-only actors. An ADMIN role does not revoke valid direct Hospital or exact-assigned OSM authority on a multi-role actor; OSM remains read-only for Appointment management. Profession and Hospital hierarchy do not widen authority.
- Create, reschedule, and terminal mutations use server-side validation, serializable transactions, conditional stale-update checks, unique nonce retry semantics, and atomic bounded Appointment audit events. History/detail projections remain minimal and relationship-scoped.
- This is not customer-approved Appointment behavior. Phase 9C.0 now adds a separate Follow-up / Progress requirement-validation prototype; Appointment completion remains independent and does not create a Follow-up automatically.

## Phase 9C.0 Follow-up / Progress Working Prototype

Phase 9C.0 is implemented as a provisional, relationship-scoped Follow-up workflow in [the Phase 9C.0 handoff](./phases/PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/followups`, `/new`, and detail routes provide bounded newest-first immutable Follow-up history, standalone recording, and optional linkage to a server-validated `COMPLETED` Appointment.
- `PatientFollowup` is owned by the exact `PatientHospitalRelationship`; relationship-scoped rounds use a database uniqueness invariant, serializable transaction, bounded retry, UUID nonce, and immutable request fingerprint.
- Follow-up history requires `followup:read`; its record CTA is derived independently from `followup:record`, and New Follow-up setup/create require `followup:record`. The current provisional matrix allows the same direct Hospital and exact-assigned OSM scopes for both capabilities, but read authority does not imply record authority.
- An explicitly selected historical Goal Plan may provide exact activity progress context. Goal Plan loading is optional enrichment: denied Goal read access leaves standalone Follow-up setup usable with no Goal options, while a selected Goal Plan is still validated strictly through the Goal-owned boundary. Activity progress is optional per activity; submitted codes are checked against that exact immutable plan and no Goal Plan means no fabricated progress rows.
- Provisional `followup:read` and `followup:record` policy allows active direct Hospital OWNER/MEMBER and exact active-assignment OSM, and denies unassigned OSM, PATIENT, and ADMIN-only actors. An ADMIN role does not revoke valid direct Hospital or exact-assigned OSM authority on a multi-role actor. Profession and Hospital hierarchy do not widen authority.
- Follow-up, activity progress, and `followup.created` audit persist atomically. Measurements, confidence, notes, and other sensitive clinical/free-text values are excluded from audit metadata. Follow-up creation has no hidden Appointment, Goal Plan, or Screening side effects.
- PostgreSQL integration tests verify relationship-scoped concurrent round allocation, concurrent identical nonce replay, and changed-payload nonce conflict behavior under the real serializable transaction and uniqueness constraints.
- Measurements, progress statuses, confidence, actor authority, Patient visibility, correction semantics, and clinical meaning remain provisional/open customer requirements. Implemented prototype behavior is not confirmed customer requirement.

## Phase 10A Patient Profile / Baseline / Status Tracking Requirements

Phase 9 is complete. Phase 10A is now complete as an analysis/provisional-contract phase in [the Phase 10A requirements and domain boundary document](./phases/PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md); no product code, Prisma model, migration, route, form, or storage/upload behavior was added.

The provisional ownership conclusions are:

- `Person` remains the human identity source and `User` remains the authentication/account source. PatientProfile must stay bounded and must not absorb Hospital-local, clinical-history, status, or artifact data merely because legacy displayed them on one form.
- `PatientHospitalRelationship` owns HN and Hospital-specific context. Screening, Goal Plan, Appointment, and Follow-up retain their existing relationship-scoped ownership and explicit cross-domain references.
- Baseline is provisionally a dedicated relationship-owned Initial Snapshot. It must not be silently represented as `Followup(round = 0)`, derived from the first Screening/Follow-up, or populated with fabricated values.
- Legacy status tracking is primarily an image/evidence gallery. No generic status table or second Follow-up model is accepted; relationship lifecycle, clinical classification, event history, artifact metadata, and derived summaries must remain separate decisions.
- Artifacts are provisionally owned by one concrete business record, with metadata separate from binary storage and visibility inherited from the owner. A generic enterprise attachment framework and Patient self-service uploads remain deferred.
- Authorization continues to be server-side and fail-closed: direct active Hospital membership or exact active OSM assignment governs relationship access; hierarchy, profession, and ADMIN-only status do not silently widen routine patient authority. Patient self-service remains open.

The existing Patient Detail page was the 10B.0 foundation. Phase 10B.0 now provides the selected provisional read-only profile subset; profile editing remains blocked until field ownership, visibility, correction, and actor-specific editability are confirmed. Phase 10C.0 adds the Baseline / Initial State prototype and Phase 10D.0 adds relationship-level Patient Status Evidence / Artifact. Baseline fields/cardinality/correction, relationship lifecycle status, classification semantics, final artifact scope/lifecycle, and Patient permissions remain major unresolved business decisions.

## Phase 10B.0 Patient Profile Working Prototype

Phase 10B.0 is implemented as a provisional, read-only Patient Profile subset in the existing relationship-scoped Patient Detail workspace; details are in [the Phase 10B.0 handoff](./phases/PHASE_10B0_PATIENT_PROFILE_WORKING_PROTOTYPE.md):

- `PatientProfile` stores eight nullable prototype fields: date of birth, gender, phone number, address, emergency contact name/phone, occupation, and education level. This does not permanently resolve ownership; date of birth and gender may later belong to `Person`.
- Detail reuses the exact `PatientHospitalRelationship` authorization boundary for direct Hospital access and exact-assigned OSM access. ADMIN-only remains denied, while a valid scoped path on a multi-role actor remains usable.
- Profile values appear only in the authorized Patient Detail projection. Patient directory/list projections remain minimal and do not expose these fields; missing values render `ไม่ระบุ`.
- Profile editing, Patient self-service, generic artifacts, and arbitrary uploads remain deferred. Relationship-level image evidence is implemented separately in Phase 10D.0.

## Phase 10C.0 Baseline / Initial State Working Prototype

Phase 10C.0 is implemented as a provisional, immutable initial-state snapshot in [the Phase 10C.0 handoff](./phases/PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md):

- `PatientBaseline` is a dedicated record owned by the exact `PatientHospitalRelationship`; it is not Follow-up round zero, Screening round zero, a PatientProfile field group, or a current-health status record. A unique relationship key allows one Baseline per relationship.
- `/app/patients/[relationshipId]/baseline` provides a mobile-friendly create form when absent and a read-only snapshot after creation. Patient Detail provides a bounded existence/date navigation card without loading the full Baseline payload.
- Creation uses the narrow `patient:baseline:create` capability, reuses the exact relationship `patient:read` boundary, derives `recordedByUserId` server-side, and allows active direct Hospital OWNER/MEMBER or exact active assigned OSM scope. ADMIN-only, unassigned OSM, Hospital hierarchy, profession, and Patient self-service do not widen authority.
- Baseline creation and minimal `patient_baseline.created` audit metadata commit atomically. Measurements and clinical/context text are excluded from audit metadata, and no Screening, Goal, Appointment, Follow-up, PatientProfile, assignment, classification, or artifact side effect is performed.
- The provisional field set, confidence scale, units, requiredness, correction/amendment behavior, care-episode cardinality, and future comparison semantics remain open owner requirements. Phase 10D.0 is implemented as a separate relationship-level image evidence prototype; Baseline attachments remain deferred.

## Phase 10D.0 Relationship-Level Patient Status Evidence / Artifact Prototype

Phase 10D.0 is implemented as a narrow, provisional relationship-level image evidence workflow; the full boundary and operational setup are documented in [the Phase 10D.0 handoff](./phases/PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md):

- `PatientEvidenceArtifact` has exactly one concrete owner: `PatientHospitalRelationship`. Metadata is stored in PostgreSQL while the binary is stored in a private Supabase Storage bucket through a server-only adapter. No polymorphic attachment model, Baseline owner, or Follow-up owner was introduced.
- JPEG, PNG, and WEBP are accepted only when the server-side signature agrees with the declared media type and the file is non-empty and no larger than the provisional 5 MiB limit. SHA-256 integrity metadata is computed from the uploaded bytes; identical content does not imply clinical duplicate meaning.
- Upload, list, and protected view use exact relationship authorization. Direct active Hospital OWNER/MEMBER and exact active assigned OSM paths are allowed; valid multi-role paths remain valid, while ADMIN-only, PATIENT, hierarchy-only, wrong-Hospital, and unassigned OSM paths remain denied or hidden under the established anti-enumeration convention.
- Upload uses a narrow authenticated multipart Route Handler with exact relationship pre-authorization before body consumption, a bounded streamed multipart request (`5 MiB + 128 KiB` total and `5 MiB` actual file), and a `Content-Length` check used only as an early optimization. Storage upload precedes a PostgreSQL transaction containing metadata plus bounded creation audit; a failed transaction triggers best-effort object compensation. Signed URLs are short-lived and never persisted.
- The UI supports create/list/view with Thai-first mobile cards. Delete, replacement, supersession, lifecycle, retention, Patient self-service, PDFs/documents, and generic document management remain explicitly deferred.

## Phase 3A Hospital Onboarding Contract

สัญญาและ checklist ของ slice นี้อยู่ที่ [Phase 3A Hospital Onboarding](./phases/PHASE_3A_HOSPITAL_ONBOARDING.md) ส่วน implementation อยู่ใน `src/modules/hospital-onboarding/`, `/hospital/onboarding` และ `/app/admin/hospital-onboarding`

ส่วนที่ยืนยันแล้วสำหรับ Phase 3B:

- public onboarding มีเฉพาะ Hospital organization application ไม่มี generic signup หรือ role selection
- applicant ต้อง match controlled canonical Hospital Master entry โดย `hospitalCode` เป็น stable business identifier; external master provider ยัง unresolved
- manual Platform `ADMIN` เป็นผู้ review/approve/reject สำหรับ MVP
- approved normalized Hospital Master artifact มี 78 records; `HH` ถูก exclude และ `KANG`/`KHON` เป็น canonical corrections ที่ห้ามเปลี่ยน
- onboarding application แยกจาก `Hospital` และใช้ lifecycle `PENDING → APPROVED | REJECTED` เพื่อเก็บ rejected history และไม่สร้าง active Hospital ก่อน approval
- applicant identity ต้อง resolve ด้วย Thai National ID validation + HMAC และ reuse `Person`/`User` เดิมก่อนสร้างใหม่เสมอ
- National ID เป็น identity lookup input ไม่ใช่ ownership proof; existing account ที่พิสูจน์ไม่ได้ต้อง fail closed และคง non-active จน trusted review/reconciliation
- applicant ที่มีหลาย role หรือหลาย hospital membership ต้องใช้ core identity เดิม
- credential establishment ที่จำเป็นต้องใช้ user-owned password และ Phase 2.1 `provisionPasswordAuthIdentity()` จาก higher-level workflow; primitive นี้ไม่ใช่ public API
- approved applicant ได้ `HOSPITAL` role + ACTIVE `OWNER` HospitalMembership ของ Hospital ที่เป็น `ACTIVE`; Hospital Owner ไม่ได้ Platform `ADMIN`
- approval/rejection และ consistency-critical PostgreSQL writes รวม audit event ต้องเป็น atomic business operation
- cross-system Supabase Auth/PostgreSQL effect ใช้ compensation/reconciliation ไม่ใช่ fake distributed transaction
- capabilities ของ slice นี้มีเฉพาะ `hospital:onboard`, `hospital:review`, `hospital:approve`, `hospital:reject` และยังไม่ใช่ full capability matrix
- Server Actions เป็น web adapters; onboarding business operation อยู่ใน transport-agnostic Application Service และไม่ต้องสร้าง speculative `/api/v1`

Phase 3B implement persistence ตาม contract แล้ว: `Hospital` มี unique `hospitalCode` และ optional parent reference ที่ไม่ใช่ authorization primitive, ส่วน `HospitalOnboardingApplication` แยก lifecycle/history พร้อม reviewer attribution และ database guard สำหรับ pending claim เดียวต่อ Hospital การ import master ใช้ `prisma/seed/hospital-master-v2.json` และ `npm run db:seed` แบบ idempotent โดยใช้ stable `hospitalCode` upsert ไม่ลบ unrelated rows และไม่ reset `ACTIVE` status

## Phase 3C Platform Admin Bootstrap

Fresh environment ที่ยังไม่มี Platform `ADMIN` ใช้ trusted interactive CLI เป็น operational entry point เดียวสำหรับสร้าง Platform Admin คนแรก:

- รัน `npm run admin:bootstrap` จาก developer/server environment ที่ credentials ชี้ไปยัง DEMI database และ Supabase project ที่ต้องการ
- CLI รับ Thai National ID/ตัวระบุ Admin ที่ตั้งเอง, given name, family name และ user-owned password แบบ interactive; ไม่รับ identity/password ผ่าน argv และไม่แสดง password
- Admin identifier ใช้ bounded login schema เดียวกับ `/login` โดยไม่ตรวจ category/checksum; Hospital onboarding และ role อื่นยังใช้ strict Thai National ID schema เดิม
- Application Service ใช้ HMAC namespace `thai-national-id`, ปฏิเสธ existing Person/User และตรวจ `UserRole.ADMIN` โดยไม่กรอง User status
- สร้างเฉพาะ `Person` + `User(PROVISIONED)` แล้วเรียก `provisionPasswordAuthIdentity()` เดิม; หลังตรวจ `authSubject` mapping ใช้ final PostgreSQL `Serializable` transaction re-check ADMIN, เปลี่ยน User เป็น `ACTIVE`, สร้าง `ADMIN` role และ audit event `platform_admin.bootstrapped`
- Supabase Auth กับ PostgreSQL ใช้ explicit compensation/reconciliation; provider/local identity ที่สร้างโดย operation จะถูกลบได้เฉพาะเมื่อ ownership และ expected state ตรงกัน และไม่สร้าง success จาก partial authority
- ผลลัพธ์ไม่มี `HOSPITAL` role, `HospitalMembership` หรือ OWNER membership; Admin login ใช้ `/login` ด้วยตัวระบุที่ตั้งตอน bootstrap + password ส่วน role อื่นใช้ Thai National ID + password ตามปกติ
- ไม่มี public admin signup, hidden browser route, HTTP API หรือ client-controlled role input และยังไม่เพิ่ม admin management/recovery/invitation/password-reset governance
- database target ไม่ใช้ selector ใหม่: `DATABASE_URL`, `DIRECT_URL` และ Supabase credentials ของ process เป็นตัวกำหนด environment เช่นเดียวกับ setup เดิม ผู้ปฏิบัติงานต้องตรวจ target ก่อนรัน

รายละเอียด contract และ acceptance path อยู่ที่ [Phase 3C Platform Admin Bootstrap](./phases/PHASE_3C_PLATFORM_ADMIN_BOOTSTRAP.md)

## Phase 4A Workforce Provisioning and Activation Contract

Decision ที่ยืนยันแล้วสำหรับ Phase 4B อยู่ที่ [Phase 4A Workforce Provisioning](./phases/PHASE_4A_WORKFORCE_PROVISIONING.md) และ [ADR-0008](./adr/0008-workforce-provisioning-and-activation.md):

- Routine workforce provisioning ทำได้เฉพาะ actor ที่เป็น `HOSPITAL` + ACTIVE `OWNER` membership โดยตรงใน target Hospital ที่เป็น `ACTIVE`; ordinary Hospital member, Platform `ADMIN` และ parent/child hierarchy ไม่ bypass policy
- Hospital staff ใช้ `HOSPITAL` role + `HospitalMembership(MEMBER)` กับ `DOCTOR`, `NURSE`, `COORDINATOR` หรือ `OTHER`; profession เป็น classification ไม่ใช่ top-level role/authority
- OSM ใช้ `OSM` role + `OsmHospitalRelationship` แยก โดย unique `(userId, hospitalId)` และ row หมายถึง OSM–Hospital association เท่านั้น ไม่ใช่ area, assigned patient หรือ clinical scope
- Resolve/reuse `Person`/`User` และ preserve roles/relationships เดิมเสมอ; existing `ACTIVE` User ที่ `authSubject` map ถูกต้องเพิ่ม relationship เป็น `ACTIVE` ได้ทันทีโดยไม่ activate credential หรือเรียก provider ซ้ำ
- New workforce User/relationship เริ่ม `PROVISIONED`; first-time activation ใช้ opaque one-time activation credential โดย copy URL, QR และ assisted in-person เป็น presentation ของ capability เดียวกัน
- Target user เป็นผู้ตั้ง password เอง; Hospital staff ไม่รู้หรือกำหนด password, token plaintext ไม่เก็บใน DB และ activation ใช้ secure hash, expiry, single-use, revocation/regeneration และ concurrency-safe claim
- Copy link/QR ใช้ expiry default 24 ชั่วโมง และ assisted ใช้ 15 นาที; email, SMS และ LINE/LIFF ไม่ใช่ core dependency แต่อาจเป็น future delivery channels ส่วน ThaID และ external identity ต้องมี decision แยก
- Provider I/O อยู่นอก local PostgreSQL transaction และใช้ compensation/reconciliation เดิม หาก provider/local finalization ไม่สอดคล้อง

## Phase 4B Workforce Provisioning Implementation

Implementation handoff อยู่ที่ [Phase 4B Workforce Provisioning](./phases/PHASE_4B_WORKFORCE_PROVISIONING.md) และยึด invariant เหล่านี้:

- Staff ใช้ `HOSPITAL + HospitalMembership(MEMBER)` ส่วน OSM ใช้ `OSM + OsmHospitalRelationship` แยก โดย relationship ไม่ใช่ clinical/resource scope
- เฉพาะ `HOSPITAL` ที่มี direct `ACTIVE OWNER` membership ใน `ACTIVE` target Hospital จึง provision workforce ได้; Platform `ADMIN` และ parent/child relation ไม่ bypass policy
- New User เริ่ม `PROVISIONED` และใช้ one-time activation URL; QR/assisted เป็น presentation เดียวกัน, token เก็บเป็น digest, และ target user ตั้ง password เอง
- Existing `ACTIVE` User ที่ provider mapping ถูกต้อง reuse credential และรับ relationship ใหม่เป็น `ACTIVE` โดยไม่ activate หรือเรียก provider ซ้ำ
- Activation provider I/O อยู่นอก long local transaction และใช้ guarded compensation/reconciliation; provisioned/ambiguous account เข้า `/app` ไม่ได้

## Phase 5B.2 Patient First-Time Activation Implementation

Implementation handoff อยู่ที่ [Phase 5B.2 Patient First-Time Activation](./phases/PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md) และยึด invariant เหล่านี้:

- Patient activation เป็น optional operation ที่แยกจาก Patient provisioning และใช้ `PatientActivation` purpose-specific; single provisioning และ Excel import ไม่สร้าง activation และไม่ใช้ `WorkforceActivation` ร่วมกัน
- เฉพาะ ACTIVE `HOSPITAL` actor ที่มี direct active HospitalMembership ใน target Hospital ที่เป็น ACTIVE จึงออก activation ได้; capability แยกเป็น `patient:activation:issue` และ OSM ยังไม่อยู่ใน scope นี้
- Hospital จัดการ activation ผ่าน dedicated `/app/patients/activation` โดยค้นหาด้วย exact Thai National ID ผ่าน HMAC หรือ exact HN ใน Hospital scope; query คืนเฉพาะ activation projection แบบ bounded ไม่ใช่ generic Patient roster/read
- Patient activation ไม่เปลี่ยน `PatientProfile` หรือ `PatientHospitalRelationship`; เปลี่ยนเฉพาะ `User.authSubject`, `User.status` และ activation state ที่เกี่ยวข้อง
- One-time token เป็น random 256-bit URL-safe secret, เก็บเฉพาะ SHA-256 digest, มี expiry 24 ชั่วโมงใน reversible MVP และ QR เป็น presentation ของ URL เท่านั้น
- Provider I/O reuse existing server-only password-auth provisioning boundary และมี bounded 5-minute claim lease, stale-claim recovery เฉพาะเมื่อ local state สะอาด, compensation/reconciliation เมื่อ provider/local state ไม่สอดคล้องกัน
- Provider transport failure/timeout/5xx และ provider alias conflict แยกจาก definitive provider rejection; ambiguous outcome จะคง claim และ mark `reconciliationRequiredAt` เพื่อป้องกัน blind retry
- Existing ACTIVE User ที่มี valid provider mapping และ PATIENT domain state ไม่ต้อง activate ซ้ำและไม่แทนที่ `authSubject` เดิม

## Phase 2.1 National ID Login Adapter

ส่วนที่ implement แล้วใน Phase 2.1 มีขอบเขตดังต่อไปนี้:

- `/login` เป็นหน้าเข้าสู่ระบบภาษาไทยแบบ responsive รับ Thai National ID หรือ bounded Admin identifier และ user-owned password ผ่าน Server Action โดยไม่ต้องแสดงหรือขออีเมล
- Login input validate ด้วย Zod ฝั่ง server: trim เฉพาะช่องว่างรอบนอก, ต้องไม่ว่างและมี length bound ก่อนทำ HMAC/database/provider work; strict Thai National ID checksum ยังคงอยู่ที่ Hospital onboarding และ role อื่น
- server ใช้ identity service source เดิมคำนวณ HMAC ด้วย namespace `thai-national-id` แล้ว resolve `Person.identityKeyHash → Person → User` สำหรับทั้งสอง identifier แบบไม่เก็บ raw value
- Supabase password authentication ใช้ opaque internal alias ที่ derive จาก stable `User.id`; alias ไม่บรรจุ National ID ไม่ใช่อีเมลจริง/contact method และไม่ถูก expose ใน `ActorContext` หรือ browser
- หลัง provider authentication สำเร็จ ระบบ validate provider identity ด้วย `auth.getUser()` แล้วใช้ service เดิม resolve `User.authSubject` เป็น DEMI actor
- subject ที่ provider คืนต้องตรงกับ `User.authSubject` ที่ login identifier resolution เลือกไว้; mismatch ถูก deny และ local sign-out แบบ fail closed
- actor resolution แยกผล `UNAUTHENTICATED`, `APPLICATION_ACCESS_DENIED` และ `AUTHORIZED`; provider/database infrastructure failure ยังคง throw เป็น predictable infrastructure error
- เฉพาะ mapped `User.status = ACTIVE` ที่ resolve `ActorContext` ได้จึงเข้า `/app`; `PROVISIONED`, `INVITED`, `SUSPENDED` และ unmapped provider user ถูก deny
- login ไม่สร้าง `Person`, `User`, role หรือ hospital membership และไม่อ่าน authority จาก provider metadata หรือ browser state
- `/app` ตรวจ protected access ฝั่ง server และแสดง role จาก server-resolved `ActorContext` ใน shared application shell เท่านั้น
- `/` redirect ACTIVE actor ไป `/app` และ redirect สถานะอื่นไป `/login`; infrastructure failure ไม่ถูกแปลงเป็น anonymous state
- logout เรียก Supabase Auth server client ด้วย `scope: "local"` เพื่อ invalidate เฉพาะ current browser/device session และ redirect ไป `/login` โดยไม่แก้ DEMI identity/authorization records
- auth mutations ใช้ Supabase server client ที่กำหนดให้ cookie writes ต้องสำเร็จ; read-only Server Components ยังคงใช้ defensive cookie-write behavior ได้
- unknown National ID และ wrong password ให้ client-facing `INVALID_CREDENTIALS` ข้อความเดียวกัน; identity/provider/database infrastructure failure ยังแยกเป็น infrastructure error ภายใน
- National ID, `identityKeyHash`, password, provider alias, token และ cookie ไม่ถูก log หรือส่งกลับ client
- ไม่มี Prisma schema หรือ migration change ใน Phase 2.1 เพราะ `User.id` เป็น opaque stable alias source อยู่แล้ว และ `authSubject` ยังคงหมายถึง provider subject
- dedicated Supabase Admin client ใช้ `SUPABASE_SERVICE_ROLE_KEY` เฉพาะฝั่ง trusted server และแยกจาก SSR session client; privileged credential ไม่อยู่ใน Client Component, Server Action input หรือ response
- `provisionPasswordAuthIdentity()` รับ existing DEMI User และ user-owned password จาก trusted application workflow, reuse alias helper, สร้าง confirmed provider account แล้ว persist Supabase user ID ลง `User.authSubject`
- provisioning primitive ไม่สร้าง Person, ไม่ assign role/membership และไม่เปลี่ยน `User.status`; higher-level workflow ยังเป็นเจ้าของ business authorization และ lifecycle transition
- User ที่มี `authSubject` แล้วหรือ alias ที่มีอยู่ใน provider จะ fail closed เป็น conflict โดยไม่ overwrite/attach อัตโนมัติ
- operation ข้าม Supabase Auth กับ PostgreSQL ไม่ถูกทำเป็น fake transaction: หาก persist subject ล้มเหลวหลัง provider creation จะลบ provider user ที่เพิ่งสร้างเป็น compensation; cleanup failure เป็น infrastructure/reconciliation error และไม่รายงาน success
- Repository ยังไม่มี shared distributed login rate limiter; bounded validation และ provider safeguards เป็น boundary ปัจจุบัน ส่วน deployment-level rate limiting เป็น security follow-up ก่อนขยาย public exposure

Phase 2.1 ไม่ได้ implement provider-account transition สำหรับ workforce, LIFF identity linking, ThaID, native authentication, role capability matrix หรือ clinical workflows และ primitive นี้ยังไม่มี public endpoint หรือ caller-specific activation policy; Phase 3B Hospital Onboarding เป็น higher-level workflow แรกที่รับผิดชอบ policy, user-owned credential establishment และ approval lifecycle ของ applicant ส่วน Phase 4A เป็น decision contract และ Phase 4B implement workforce one-time activation workflow โดยไม่เปลี่ยน authentication adapter

## Phase 1 Foundation Implementation

ส่วนที่ implement แล้วใน foundation นี้มีขอบเขตดังต่อไปนี้:

- Prisma schema/migration สำหรับ `Person`, `User`, `UserRole`, `Hospital`, `HospitalMembership` และ `AuditEvent`
- `Person.identityKeyHash` เป็น opaque hash ของ identity reference ที่ผ่าน validation; Phase 2.1 กำหนด namespace `thai-national-id` สำหรับ interactive login แล้ว ส่วน external identity/provider link อื่นยังไม่ถูกล็อก
- Supabase Auth เป็น current server authentication adapter โดย provider subject map ผ่าน `User.authSubject`; Supabase user metadata ไม่ใช่ source of truth ของ DEMI authorization
- `ActorContext` load จาก active application `User`, roles และ hospital memberships ผ่าน Prisma
- Next.js 16 `proxy.ts` refreshes Supabase SSR cookies per request; `auth.getUser()` validates the provider identity before mapping to the application `User`
- fail-closed authorization primitives สำหรับ role requirement และ `GLOBAL`/`HOSPITAL`/`SELF`/`DENIED` scope เท่านั้น; primitive นี้ยังไม่ประกาศ full capability matrix หรือ OSM scope semantics นอกเหนือจาก Patient assignment contract ของ Phase 6A
- identity lookup ใช้ deterministic HMAC-SHA-256 ด้วย server-only `IDENTITY_HASH_SECRET`
- audit input boundary ที่จำกัด metadata และปฏิเสธ credential/identity secrets
- audit persistence รับ transaction-compatible Prisma client ได้ และ audit actor foreign key ไม่อนุญาต hard-delete User ที่มีประวัติ audit
- Prisma migration scripts ใช้ standard `prisma migrate dev`, `prisma migrate deploy` และ `prisma generate`; database/environment selection มาจาก credentials ที่ process ได้รับโดยตรง และ integration suite แยกใช้ dedicated test database
- สำหรับ local integration ใช้ `.env.integration` กับ `compose.integration.yaml` ซึ่งเปิด PostgreSQL แบบ disposable ที่ `127.0.0.1:55432`; `DATABASE_URL`, `DIRECT_URL` และ `DEMI_TEST_DATABASE_URL` ต้องชี้ฐานข้อมูล test เดียวกัน
- ให้เปิด disposable PostgreSQL ค้างไว้จาก Docker-enabled WSL terminal แล้วใช้ `npm run test:integration` เป็นคำสั่ง integration เดียวเพื่อ `prisma generate`, apply migrations และรัน integration tests; คำสั่งนี้ไม่เรียก Docker/WSL
- server-side health check ที่ไม่เปิดเผย secret หรือ internal error

Implementation directories และ commands ดูได้จาก [README](../README.md) และ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md)

## Accepted Actors

Top-level business roles ที่ยืนยันแล้วมี 4 รายการ:

| Actor | Responsibility |
| --- | --- |
| `ADMIN` | DEMI Platform Admin ดูแล governance, hospital verification, audit, recovery, reconciliation และ exceptional cases ไม่ใช่ผู้ปฏิบัติงานประจำใน patient workflow |
| `HOSPITAL` | สมาชิกของโรงพยาบาลหรือองค์กรบริการสุขภาพ เป็น actor ฝั่งบริการ/ดูแลเคสภายใน capability และ scope ที่ business requirement อนุญาต |
| `OSM` | อสม. หรือ field operator ทำงานภาคสนามภายใน assigned-Patient scope ที่ Phase 6A ยืนยัน; geographic/clinical scope อื่นยังต้องมี requirement แยก |
| `PATIENT` | ผู้ป่วยที่เป็น actor ของระบบและทำ self-service ได้เฉพาะข้อมูลหรือ action ของตนที่ policy อนุญาต |

## Critical Architecture Rules

- `Person` คือบุคคลจริง และแยกจาก `User` ซึ่งเป็น application account
- หนึ่งคนต้องไม่ถูกสร้าง duplicate core identity เพียงเพราะมีหลาย role
- User มีหลาย role ได้
- User มีหลาย hospital membership ได้โดยไม่สร้าง User หรือ Person ซ้ำ
- Doctor/Nurse เป็น profession classification ก่อน ไม่ใช่ top-level authorization role
- Hospital Owner คือ `HOSPITAL` + owner membership และไม่ใช่ Platform `ADMIN`
- ไม่มี generic public signup ที่ให้ผู้ใช้เลือก role เอง
- Public signup ใช้สำหรับ Hospital organization onboarding
- Public hospital application ต้อง match canonical Hospital Master ด้วย stable `hospitalCode`; external provider ยังไม่ถูกเลือก
- MVP hospital verification เป็น manual Platform `ADMIN` decision และเก็บ application history แยกจาก Hospital lifecycle
- Staff/OSM ถูก provision จาก trusted Hospital context และไม่ self-assign role; Phase 4B จำกัด routine provisioning ที่ ACTIVE Hospital Owner ของ target Hospital โดยตรง
- Patient ที่ Hospital/OSM provision แล้วไม่ register ซ้ำ; หากจำเป็นต้องใช้ interactive account จึงใช้ first-time account activation แยกภายหลัง
- Workforce provisioning แยกจาก credential ownership; new staff/OSM ใช้ opaque one-time activation และ target user ตั้ง password เอง ส่วน existing ACTIVE User reuse credential เดิมโดยไม่ activate ซ้ำ
- Hospital/OSM ต้องไม่รู้หรือกำหนด patient secret credential
- OSM Hospital association แยกจาก `HospitalMembership` และยังไม่ใช่ patient, area หรือ clinical scope
- Authorization ตัดสินด้วย `Role + Capability + Scope` ผ่าน server-side policy และต้อง fail closed
- Browser, client state หรือ request parameter ไม่ใช่ authority สำหรับ permission หรือ scope
- Multi-record business operation ที่ consistency-critical ต้องเป็น transactional
- Admin เน้น governance/recovery ไม่ใช่ routine operational workflow

## Client and Transport Rules

- DEMI field UX เป็น mobile-first โดย `OSM` และ `PATIENT` ต้องใช้งานหลักได้ดีบน mobile devices
- Responsive Web เป็น implementation platform หลักในระยะแรก
- LIFF เป็น initial client/access channel ไม่ใช่ identity หรือ authorization authority
- Native mobile app เป็น future client และไม่อยู่ใน current implementation scope
- Server Actions เป็น web transport adapters
- HTTP APIs เป็น transport adapters สำหรับ client/integration ที่มี requirement จริง
- Application Services ต้อง transport-agnostic และ reuse ได้จากทั้ง Server Action และ HTTP API
- Business logic, Policy และ Prisma orchestration ต้องไม่อยู่ใน Server Actions หรือ Route Handlers
- HTTP API เพิ่มแบบ incremental; ไม่สร้าง endpoint แบบ speculative สำหรับทุก business operation
- LINE identity อาจเชื่อมเป็น external authentication method ของ DEMI User แต่ห้ามแทน `Person`, `User`, role, membership, capability หรือ scope

รายละเอียดและ open questions อยู่ที่ [ADR-0007](./adr/0007-client-transport-and-mobile-ready-architecture.md)

## Application Architecture

```text
Web → Server Action ─────────┐
                             │
LIFF → HTTP API? ────────────┼→ Application Service
                             │           ↓
Native → HTTP API (future) ──┘  Policy / Authorization
                                         ↓
                                       Prisma
                                         ↓
                                PostgreSQL / Supabase
```

| Layer | Responsibility |
| --- | --- |
| Client / UI | Responsive Web และ LIFF ในปัจจุบัน รวมถึง native app ในอนาคต; ทำ rendering/interaction แต่ไม่ตัดสิน authorization ขั้นสุดท้าย |
| Server Action / HTTP API | Peer transport adapters สำหรับ authentication/session resolution, transport validation, input mapping, service invocation และ client response mapping |
| Application Service | Orchestrate business operation, business rules, policy และ persistence โดยไม่กลายเป็น god module |
| Policy / Authorization | ประเมิน actor, role/membership, capability, target resource และ scope; ambiguity หรือ resolution failure ต้องจบด้วย deny |
| Prisma | Typed persistence, scoped queries และ transaction; ไม่ใช่ authorization engine |
| PostgreSQL / Supabase | เก็บและบังคับใช้ data integrity ตามที่กำหนด; managed provider ไม่ได้แทน application authorization |

UI, page component, Server Action และ Route Handler ต้องไม่ถือ business rule/query เป็น source of truth

> หาก agent เห็นว่า operation ต้องมี HTTP API ต้องระบุ current client/use case ที่ต้องใช้ endpoint นั้นก่อน เหตุผลว่า “native app อาจต้องใช้สักวัน” เพียงอย่างเดียวยังไม่เพียงพอ

## Open Requirements

รายการ canonical อยู่ที่ [Explicitly Unresolved Questions](./architecture/DEMI_ARCHITECTURE_BASELINE.md#23-explicitly-unresolved-questions) โดยประเด็นที่ยังห้ามล็อกในการ implementation ได้แก่:

- OSM scope นอกเหนือจาก Patient `ASSIGNED_PATIENTS`: area, geographic หรือ clinical scope ยังไม่ตัดสิน
- สิทธิ์ของ parent/main hospital ต่อ child hospitals ใน workflow ที่ไม่ใช่ Patient access ยังไม่ตัดสิน; Patient authorization ใช้ direct Hospital scope เท่านั้น
- การแต่งตั้ง Hospital Owner เพิ่มเติม
- ความแตกต่างด้าน permission ระหว่าง Doctor/Nurse และผู้อนุมัติ care plan
- patient-editable fields และ health measurements ที่ผู้ป่วยส่งเองได้
- ผู้สร้าง เปลี่ยนเวลา หรือยกเลิก appointment
- การ transfer/reassign patient โดย OSM และการเปลี่ยน hospital affiliation โดย patient
- หลักฐานและขั้นตอนสำหรับ hospital verification
- authoritative external Hospital Master provider และ production master-data ownership/update process
- hospital onboarding reapplication, competing claim และ existing account recovery semantics
- Long-term Patient activation proofing, delivery/recovery channels และ identity-proofing นอกเหนือจาก reversible Phase 5B.2 handoff; implementation นี้ไม่ทำให้ workforce/patient semantics เป็น model เดียวกัน
- additional required staff/OSM profile fields นอกเหนือจาก minimum Phase 4A input
- clinical data ที่ต้องมี immutable/auditable history
- รายงานที่ต้องใช้และ scope ของแต่ละ actor
- LIFF target workflows/audience, LINE account linking, `/api/v1` operations, native authentication, offline/sync, push/device capabilities และ trigger สำหรับเริ่ม native development

> หาก business rule ที่จำเป็นต่อ implementation ยังไม่มีในเอกสาร ห้ามเดา ให้ mark เป็น open requirement หรือขอ clarification

## Source of Truth

เรียงลำดับอำนาจจากสูงไปต่ำ:

1. Confirmed current business requirements
2. Accepted ADRs
3. [Architecture baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md)
4. `CONTEXT.md`
5. Legacy code เฉพาะ behavioral reference

เมื่อ accepted ADR ใหม่ supersede decision เดิม ต้อง update architecture baseline และ `CONTEXT.md` ใน change เดียวกันเพื่อไม่ให้คำแนะนำปัจจุบันขัดกัน

## Agent Working Rules

- รักษาไฟล์และข้อความภาษาไทยเป็น UTF-8 without BOM; ตรวจไม่ให้เกิด mojibake
- ให้ correctness มาก่อน abstraction และเลือก implementation ที่เรียบง่าย ดูแลได้
- ใช้ schema, policy และ business service ที่มีอยู่เป็น source of truth ก่อนสร้างของใหม่
- สร้าง authorization ฝั่ง server และ fail closed เสมอ; UI ใช้เพื่อ UX เท่านั้น
- ใช้ capability ที่มาจาก confirmed requirement ไม่สร้าง generic RBAC framework ล่วงหน้า
- ไม่สร้าง permission เพียงเพราะ profession ต่างกัน หาก requirement ไม่ได้กำหนด behavior ต่างกัน
- ไม่เดา OSM scope นอกเหนือจาก accepted Phase 6A assigned-Patient rule, hospital-network authority หรือ Patient scope อื่นที่ยังไม่มี requirement
- ไม่ bind DEMI identity/authorization เข้ากับ LINE identity หรือ client transport
- ไม่สร้าง HTTP API โดยไม่มี identified current consumer/use case
- ไม่ออก full database schema จาก conceptual entities ใน baseline โดยไม่มี task อนุมัติ
- เมื่อ architecture decision เปลี่ยนสาระสำคัญ ให้สร้าง ADR ใหม่เพื่อ supersede ฉบับเดิม แล้ว sync baseline/context
