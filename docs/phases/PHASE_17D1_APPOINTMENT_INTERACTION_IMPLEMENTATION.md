# Phase 17D.1 — Appointment interactions and responsibility snapshot

- Status: **CLOSED**
- Owner contract: [Phase 17D.0 decision register](./PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md)
- Date: 2026-09-30

Phase 17D.1 implements the owner-approved decisions P17D-APT-01 through P17D-APT-18. The decision register marks every APT decision **OWNER-APPROVED / RESOLVED** and maps it to its contract topic. P17D-NOTIF-01 remains open; this phase adds no notification delivery.

## Approved behavior

- Patient appointment response is **acknowledgement only**: “รับทราบนัดหมาย”. It does not confirm attendance, and it is stored separately from `AppointmentStatus`.
- A Patient may acknowledge their own scheduled appointment and submit a cancellation request. The Patient cannot directly cancel, reschedule, create, complete, or mark an appointment as no-show.
- Patient and OSM rescheduling happens by contacting the Hospital directly. DEMI has no reschedule-request workflow and does not invent a contact number or channel.
- A cancellation request leaves the appointment scheduled until an authorized Hospital actor approves it and carries out the operational cancellation. The Patient cannot withdraw a request.
- An exact, actively assigned OSM may read and create appointments for the assigned Patient, record coordination, acknowledge for the Patient, and submit a cancellation request for the Patient. OSM authority does not include operational appointment management.
- `responsibleUserId` is the Hospital care-responsible person. New selections require an active direct membership in the exact Hospital with `DOCTOR` or `NURSE` profession. OSM caregiving remains a separate concept.
- Appointments capture the active OSM assignment at creation. Existing appointments are not backfilled; a current assignment never replaces missing historical evidence.
- Appointment views may show approved names, Hospital context, and location. They do not show phone/contact details. Patient projections also omit creator identity, internal IDs, notes, and audit data.
- A person with both `HOSPITAL` and `PATIENT` roles may use independently valid Hospital Work authority on their own appointment. Selecting Personal or Work is presentation only; ADMIN-only access grants no appointment authority.

## Authorization matrix

| Action | Patient SELF | Exact active OSM assignment | Direct Hospital scope | ADMIN-only |
| --- | --- | --- | --- | --- |
| Read | Own Personal projection | Assigned Patient Work scope | Patient’s Hospital Work scope | Denied |
| Create | Denied | Assigned Patient | Hospital relationship scope | Denied |
| Acknowledge | Own scheduled appointment | On behalf of assigned Patient | Not granted by Hospital role alone | Denied |
| Request cancellation | Own scheduled appointment | On behalf of assigned Patient | Not granted by Hospital role alone | Denied |
| Record coordination | Denied | Assigned Patient only | Not granted by Hospital role alone | Denied |
| Review cancellation request | Denied | Denied | Hospital operational authority | Denied |
| Direct reschedule/cancel/complete/no-show | Denied | Denied | Existing Hospital manage authority | Denied |

Each mutation loads the active actor and current appointment relationship from the database and checks the action-specific capability and scope server-side. OSM actions recheck the active Hospital relationship and exact Patient assignment at submission time. Role labels, request fields, and workspace selection do not grant authority.

## Persistence and transaction rules

The additive migration `20260930100000_appointment_interactions` adds:

- Nullable `PatientAppointment.osmAssignmentIdAtCreation`, referencing the exact `PatientOsmAssignment` selected by the server when creating an appointment. Existing rows remain `NULL`.
- Immutable acknowledgement records, attributed to the actor and source and unique for each appointment version (`updatedAt`). A stale acknowledgement conflicts; retrying an already-recorded current version returns the canonical acknowledgement. Appointment status is unchanged.
- Cancellation-request history with source, submitter, appointment version, nonce, resolver, and resolution time. A PostgreSQL partial unique index permits at most one pending request per appointment. Requests move through `PENDING`, `APPROVED`, `REJECTED`, or `SUPERSEDED`.
- Coordination events with actor, timestamp, and idempotency nonce. They contain no free-text note and do not imply acknowledgement or attendance.

Appointment changes and request decisions use serializable transactions with bounded retry behavior and audit events. Cancellation approval operationally cancels the appointment and resolves its request in one transaction. Rejection leaves the appointment unchanged. A reschedule or operational terminal transition supersedes a pending cancellation request in the same transaction. Request, acknowledgement, coordination, and existing create operations have retry/idempotency handling; database uniqueness constraints protect concurrent submissions.

No migration backfills an OSM association. Historical `responsibleUserId` values remain readable and can be preserved unchanged during rescheduling, while a newly selected or changed value must pass the doctor/nurse eligibility rule. Profession is not used as authorization.

## User interface and privacy

- Patient Personal detail offers “รับทราบนัดหมาย” only for an unacknowledged scheduled version and presents acknowledgement as receipt, not attendance.
- The Patient cancellation control is labelled as a request and explains that the Hospital reviews it; the page does not offer direct cancellation.
- Patient and OSM pages direct rescheduling to the Hospital without exposing a phone number or adding a fake request flow.
- Exact-assigned OSM Work detail offers only proxy acknowledgement, cancellation request, and coordination. Direct Hospital Work authority retains operational reschedule and status controls and can approve or reject pending cancellation requests.
- Patient appointment history/detail are allowlisted projections: they include approved clinician/appointment-time OSM names, Hospital context, location, current acknowledgement, and bounded cancellation-request state/history. Internal actor and assignment identifiers, creator identity, notes, phone/contact values, and audit metadata are excluded.

All new interactive copy and action-state messages are in Thai. The Patient acknowledges receipt only; no attendance-confirmation language or notification control is present.

## Verification

- `npm run prisma:generate` — passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed with no warnings after removing unused type imports.
- Focused unit/UI suite — 5 files, 63 tests passed.
- `npm run test` full normal suite — first run: 145 of 146 files and 1,048 of 1,051 tests passed. Three failures were stale Patient SELF appointment query fixtures/allowlist assertions; after updating those fixtures and assertions, the affected Patient SELF query file passed all 12 tests. The full suite was not repeated after this test-only correction.
- Appointment PostgreSQL integration file — 1 file, 5 tests passed against the local-only integration database after correcting its Patient fixtures to represent an activated account.
- A preceding full integration run applied all 25 migrations; 22 of 23 files (204 of 206 tests) passed. Its two failures were the appointment tests using provisioned, inactive Patient fixtures. The fixture was corrected and the full affected appointment file passed; the complete integration suite was not repeated after that test-only correction.
- Impeccable UI detector — returned no findings (`[]`).
- `git diff --check` is recorded in the final repository review.

### Closeout hardening evidence (2026-09-30)

- Architecture Baseline and CONTEXT now identify Phase 17D.0 / 17D.1 as the source for resolved Appointment interaction authority. The only remaining Appointment requirement gate is P17D-NOTIF-01.
- Work and Patient history/detail projections include `responsibleProfession` resolved only from the exact Hospital membership, without returning membership internals. `DOCTOR` displays “แพทย์ผู้ดูแล”, `NURSE` displays “พยาบาลผู้ดูแล”, historical `COORDINATOR` / `OTHER` / null profession displays “ผู้รับผิดชอบเดิม”, and an absent responsible user displays “ยังไม่ระบุ”. Historical appointment rows are not rewritten or backfilled.
- The responsible-selection DTO contains only the opaque User ID, display name, and profession. New selections remain limited server-side to an active User with an active direct membership in the exact Hospital and `DOCTOR` / `NURSE` profession. Reschedule context preserves an unchanged historical responsible person without exposing `membershipType`; changing to a non-clinical profession remains rejected.
- Patient appointment projection remains structurally allowlisted. Focused query and PostgreSQL integration assertions cover absence of responsible/creator/assignment IDs, membership type, contact fields, note, and internal actor IDs.
- Focused Appointment/Patient suite — 8 files, 96 tests passed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — full normal suite passed, 148 files / 1,072 tests.
- Appointment PostgreSQL integration file — 1 file / 5 tests passed against the local integration database.
- `git diff --check` — passed after the closeout changes.
- Responsive source review added wrapping and minimum-width protections for long names, Hospital labels, location text, and request submitter details; component tests cover Patient and Work responsibility display. A real 390px browser viewport run was unavailable: the current CUA browser surface exposes no viewport resize/emulation control, and the repository has no browser E2E tooling or visual viewport fixtures. Therefore horizontal overflow and clipped controls were not measured in a browser; the static responsive review and component tests are the available evidence.

This closeout patch adds no schema or migration changes. No production build, browser E2E run, or notification integration was performed. P17D-NOTIF-01 remains open, and Patient/OSM reschedule requests remain out of the system.

## Deliberately out of scope

- P17D-NOTIF-01 remains open. No LINE, email, push, reminder, delivery preference, or notification job is added.
- There is no Patient or OSM reschedule request, Patient/OSM direct reschedule, or Patient/OSM direct cancellation path.
- No Hospital contact model or appointment phone/contact disclosure is introduced.
- Existing appointments without historical OSM evidence remain without an OSM-at-creation display.
