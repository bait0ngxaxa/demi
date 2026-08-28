# DEMI Phase 16D.6 — Import Preview / Confirmation UX & Operational Polish

Status: ready for re-audit after implementation

Starting reviewed HEAD: `3e273345b897e8409515b697ee2bddc0a4b2138e`

## Scope

This phase polishes the existing canonical Patient roster preview/confirm
workflow for Hospital operators. It does not introduce a new import state or
change the authority of the server-side preview, binding, reconciliation, or
per-row import service.

## UX problems addressed

- Operators can find the canonical Template, its 500-row limit, and the warning
  that changed columns may not be accepted.
- The effective date is labeled as `ข้อมูลตั้งต้น ณ วันที่` and explains that it
  applies to health Baseline values such as weight, waist circumference, DTX,
  and HbA1c. It is not presented as upload, registration, or diagnosis date.
- File name and size remain visible after selection, with a clear-file action.
  Changing the file, Hospital, or effective date invalidates the preview,
  confirmation selections, and previous result.
- Preview loading keeps the inputs visible, uses `กำลังตรวจสอบไฟล์...`, and
  prevents duplicate submission.

## Preview information hierarchy

The preview starts with a compact authoritative summary of total rows, rows that
are currently executable, `ALREADY_EXISTS`, unresolved attention rows, and
invalid rows. The table then uses actual Excel source coordinates and the minimum
operator columns: Excel row, masked National ID, Patient name, HN, status, and
grouped details. Internal contract versions, parser modes, worksheet ranges, and
raw identity values are not presented to normal users.

Attention follows the shared classification helper: `INVALID`, `CONFLICT`,
`NEEDS_REVIEW`, `HOSPITAL_MISMATCH`, `UNSUPPORTED_REQUIREMENT`, and
`DUPLICATE_IN_FILE` require attention; `READY` and `ALREADY_EXISTS` do not.
Requirement-gated columns are explained as fields that are not persisted in this
version, rather than making the whole row fail.

## Confirmation UX

- Classification changes show the current status and source status and require a
  checkbox reading `ยืนยันเปลี่ยนสถานะผู้ป่วยจาก ... เป็น ...`.
- OSM initial exact matches show the candidate and the resulting assignment.
- OWNER-only reassignment shows current caregiver → file caregiver and requires
  `ยืนยันเปลี่ยนผู้ดูแลเป็น ...`.
- Not found, ambiguous, self-assignment, invalid caregiver, and
  `OWNER_REQUIRED` states never receive a misleading checkbox. MEMBER users see
  `รายการนี้ต้องให้เจ้าของโรงพยาบาลยืนยันผู้ดูแล`.
- Classification and OSM confirmations remain separate when both are required;
  a row is executable only after every required confirmation is selected.
- The executable count updates locally from the authoritative preview plus
  selections. The server remains authoritative for permission, reconciliation,
  candidate identity, and confirm-time validity.

Before confirmation the UI states `พร้อมนำเข้า X จาก Y รายการ` when applicable
and explains that blocked rows will not be saved. The button is labeled with the
current executable count and is disabled when no row can execute or while import
is pending. Import loading uses `กำลังนำเข้าข้อมูล...` and keeps the preview
state until the response arrives.

## Partial-import and result behavior

Rows still execute independently. The result summary reports imported,
idempotent, attention/review, invalid, and failed buckets. It uses success for a
fully successful/idempotent outcome, warning for a mixed outcome with useful
successes, and danger when every attempted row remains blocked or failed.

- All-idempotent: `ไฟล์นี้ไม่มีรายการที่ต้องแก้ไข ข้อมูลที่มีอยู่แล้วไม่ได้ถูกสร้างซ้ำ`.
- Mixed: `นำเข้ารายการที่พร้อมเรียบร้อยแล้ว และยังมีบางรายการที่ต้องตรวจสอบ`.
- All blocked: the preview cannot submit and says there is no row ready to import.
- After import, only attention rows are listed with Excel row, masked identity,
  name, HN, result, and safe reason. Failed rows use a safe fallback rather than
  infrastructure details.
- Recovery tells operators to fix the file and upload it again. OWNER-required
  rows direct the operator to have the Hospital Owner run the import again.
  `นำเข้าไฟล์ใหม่` resets file, date, preview, selections, and result without a
  page reload. The Hospital patient-list link remains available after useful
  success.

Canonical mismatch keeps the exact actionable validation message and presents a
nearby `ดาวน์โหลด Template` action. Safe file-size and 500-row limit messages
remain specific.

## Accessibility and privacy

Checkboxes use explicit IDs and labels, status is conveyed by text as well as
semantic color, loading controls expose disabled/busy state, tables include
captions and scoped headers, and controls retain keyboard focus-visible styles.
National IDs stay masked; no UUID, OSM ID, relationship ID, or raw identity is
rendered.

## Verification

Focused tests cover preview summary/readiness helpers, all-idempotent attention
classification, classification and OSM confirmation combinations, row-level
messages, canonical mismatch mapping, binding preservation, source rows 501/502,
stale preview rejection, and unchanged mixed result summaries. Existing adapter,
template, classification, OSM, service, workspace, and server-action tests remain
in the project test suite.

Required verification for this handoff:

- `npm run generate:patient-import-template`
- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:integration`

Observed verification on 2026-08-28: template generation completed; Prisma
validation and client generation completed; the focused set passed 10 files /
85 tests; the full unit suite passed 137 files / 926 tests; and integration
passed 23 files / 204 tests. Lint and typecheck passed. The Impeccable detector
reported no findings for the changed UI targets. The generated Template artifact
was compared with the reviewed baseline and no generated binary noise or
Template v1 structural change was included in the commit.

No migration, Prisma schema change, Template v1 structural change, compatibility
fallback, classification semantic change, OSM permission change, profile
persistence, Hospital hierarchy, or real Patient data is part of this phase.

## Remaining gates and next phase

The following requirements remain OPEN and are deliberately not implemented:

- `IMP-REQ-03` — Hospital / รพ.สต. hierarchy
- `P16C-PROFILE-01` — profile/contact/address persistence ownership

Recommended next phase: **Phase 16E — Patient Import End-to-End Re-audit & Release
Gate**, covering the final canonical journey, permission matrix, rollback/privacy
review, template artifact, customer requirement gap review, and demo readiness.
