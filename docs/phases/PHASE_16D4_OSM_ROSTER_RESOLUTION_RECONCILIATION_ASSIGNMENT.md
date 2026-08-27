# DEMI Phase 16D.4 — OSM / Coach Roster Resolution, Reconciliation & Assignment

**สถานะ:** Implemented

**วันที่ดำเนินการ:** 2026-08-27

**Starting HEAD:** `28c739fff2bb6ae35a7e7d4bad24ba38eaedd9d1`

Phase นี้เริ่มจาก HEAD ที่ตรวจพบจริงหลัง `git fetch origin --prune` และตรวจ branch,
working tree, `origin/main` และ commit ล่าสุดแล้ว ไม่มีการ reset, rewrite หรือ
เขียนทับการเปลี่ยนแปลงของผู้ใช้

## 1. ผลลัพธ์และขอบเขต

Phase 16D.4 เปลี่ยน `osmCaregiverName` จากข้อมูลที่ parse แต่ยัง gated ให้เป็น
source assertion สำหรับ assignment ปัจจุบันของ Patient กับ OSM ใน Hospital ที่
server เลือก โดยมี workflow:

```text
parse → normalize → exact Hospital-scoped resolve → preview
→ explicit OWNER reconciliation → confirm reparse/re-resolve
→ one Serializable transaction per row → assign/reassign
```

ยังคงจำกัดที่ Patient core + Baseline + patient-global Classification +
Hospital-scoped OSM assignment ใน roster row เดียว ไม่ได้เพิ่ม generic
reconciliation framework, ImportBatch หรือ background job

## 2. Authority decision

`P16C-OSM-01` ปิดแล้วด้วย authority เดิม:

- assignment/reassignment จาก roster ต้องเป็น active direct Hospital `OWNER`
- ต้องผ่าน capability `patient:assign-osm`
- `HOSPITAL MEMBER` ไม่มีสิทธิ์ assign หรือ reassign
- OSM ห้าม assign ตัวเองหรือ OSM คนอื่น
- ADMIN ไม่ใช่ routine assignment authority
- ไม่มี approval workflow, temporary import bypass หรือ bulk auto-reassignment

ข้อจำกัดนี้ถูกบังคับซ้ำที่ existing assignment domain และ transaction seam ฝั่ง
server ไม่พึ่ง checkbox หรือ role ที่ส่งจาก browser

## 3. Existing assignment domain และ schema decision

ใช้ `PatientOsmAssignment` เดิมเป็น source of truth และเรียก
`assignOsmToPatientInTransaction(...)` ผ่าน caller-owned transaction seam จาก
Phase 16D.1 ไม่ได้คัดลอก logic end-old-assignment, create-new-assignment หรือ audit
มาไว้ใน import service

ตรวจพบ database partial unique index สำหรับ active assignment ต่อ
`PatientHospitalRelationship` อยู่แล้ว จึงไม่มี schema change และไม่มี migration
ใหม่ใน Phase นี้ (migration count: **0**). ไม่เพิ่ม model ต่อไปนี้:

- `PatientImportOsmAssignment`
- `PendingOsmAssignment`
- `RosterAssignment`
- `CaregiverCandidate`
- `AssignmentApproval`

Assignment ยังผูกกับ `PatientHospitalRelationship` ไม่ใช่ PatientProfile แบบ global
และ source Hospital/รพ.สต. ในไฟล์ยังไม่สามารถเลือก target Hospital หรืออนุมาน
hierarchy ได้

## 4. Source contract และ normalization

Canonical field คือ `osmCaregiverName` และ aliases ที่รองรับยัง bounded เป็น:

| Header alias | Canonical field |
| --- | --- |
| `ชื่อผู้ดูแล (อสม.)` | `osmCaregiverName` |
| `ชื่อผู้ดูแล(อสม)` | `osmCaregiverName` |
| `ผู้ดูแล(อสม.)` | `osmCaregiverName` |
| `ผู้ดูแล(อสม)` | `osmCaregiverName` |
| `โค้ช` | `osmCaregiverName` |
| `โค้ชผู้ดูแล` | `osmCaregiverName` |
| `coach` | `osmCaregiverName` |

การเปรียบเทียบใช้ helper เดียวทั้ง preview และ confirm:

- ลบ BOM ที่ต้นข้อความ
- Unicode NFC
- รวม Unicode whitespace ที่ชัดเจนเป็น regular space
- trim ขอบข้อความ
- blank/marker ที่ adapter แปลงเป็น `null` คือ no assertion

ไม่ลบ punctuation ภายในชื่อ, ไม่ตัดคำนำหน้า, ไม่ transliterate, ไม่สลับชื่อ,
ไม่เทียบเพียงชื่อหน้า และไม่ทำ typo/phonetic/Levenshtein/fuzzy matching
ดังนั้นชื่อที่ต่างจริงจะไม่ถูกเดาให้ตรงกัน

Import contract version เปลี่ยนเป็น `phase-16d4-osm-assignment-v1` ทำให้ binding
ของ preview รุ่นเก่าใช้ยืนยันไม่ได้อัตโนมัติ

Alias `diabetes type` ที่ทำให้ความหมายของ `diabetesClassification` สับสนถูกนำออก
แล้ว ส่วน aliases ภาษาไทยที่ใช้ระบุ `กลุ่มเสี่ยง` / `เบาหวาน` ยังคงอยู่

## 5. Exact resolver contract

`listEligibleRosterOsmCandidates(...)` เป็น server-only resolver ที่ query เฉพาะ:

```text
target Hospital ที่ถูกเลือกจาก server
+ Hospital ACTIVE
+ User ACTIVE
+ User มี Role.OSM
+ OsmHospitalRelationship ของ target Hospital ACTIVE
```

ไม่ค้น Hospital อื่น ไม่ใช้ National ID, phone, email, auth subject หรือ cross-Hospital
identity และไม่สร้าง/invite account. Preview query ผู้มีสิทธิ์ครั้งเดียวใน target Hospital
แล้วสร้าง exact-name index ใน memory เพื่อ resolve สูงสุด 500 rows โดยไม่ query หรือ scan
organization network ซ้ำต่อแถว. Display name ใช้ convention เดิม
`Person.givenName + " " + Person.familyName` แล้ว exact-match ด้วย normalized
caregiver text

ผลลัพธ์ที่ bounded และ deterministic:

| Resolution | ความหมายและผลกระทบ |
| --- | --- |
| `OSM_NOT_APPLICABLE` | caregiver blank/ไม่ปรากฏ; ไม่มี assignment assertion และไม่ unassign |
| `OSM_MATCHED` | มี eligible candidate ตรง exact เพียงหนึ่งราย |
| `OSM_NOT_FOUND` | ไม่มี candidate; ไม่ assign และต้อง review |
| `OSM_AMBIGUOUS` | มี candidate exact มากกว่าหนึ่งราย; ไม่เลือกอัตโนมัติ |
| `OSM_DATA_INVALID` | source malformed, ambiguous header หรือค่าไม่ผ่าน parser |

Candidate list ที่ส่งให้ OWNER มีเฉพาะ display name และถูกจำกัดจำนวน ไม่ส่ง National
ID, phone, private email, auth subject, internal UUID หรือ membership ของ Hospital อื่น

## 6. Current assignment reconciliation

เมื่อ resolve แล้วจะเปรียบเทียบ active assignment ของ target
`PatientHospitalRelationship`:

| Assignment state | Behavior |
| --- | --- |
| `OSM_ASSIGNMENT_READY` | ไม่มี current assignment และ OWNER พร้อมสร้าง assignment หลัง confirm |
| `OSM_ASSIGNMENT_ALREADY_EXISTS` | current = resolved OSM; authoritative NOOP ไม่มี duplicate/history ใหม่ |
| `OSM_ASSIGNMENT_CONFLICT` | current ต่างจาก source; ต้อง explicit OWNER reassignment confirmation |
| `OSM_OWNER_REQUIRED` | source ต้องสร้าง/เปลี่ยน assignment แต่ actor ไม่ใช่ OWNER; row เป็น `NEEDS_REVIEW` |

`OSM_NOT_FOUND`, `OSM_AMBIGUOUS` ที่ยังไม่ได้เลือก และ `OSM_DATA_INVALID` เป็น
review/invalid ตาม diagnostic ของ row. Not-found ไม่เคลียร์ current assignment และ
blank ไม่เคย end current assignment

## 7. Preview, candidate selection และ confirm binding

Preview เพิ่ม `patientOsmAssignment` แยกจาก Patient Classification โดยแสดง
resolution status, assignment status, source display name, current caregiver,
resolved display name และ bounded candidate display names. Public projection ตัด
internal IDs ออก

กรณี ambiguous OWNER เลือก candidate ผ่าน opaque reference token เท่านั้น. Browser
ไม่ส่ง arbitrary `osmUserId` เป็น authority. กรณี current ต่างกันมี checkbox แยกต่อ
row สำหรับข้อความยืนยันว่า:

```text
ผู้ดูแลปัจจุบัน: A
ผู้ดูแลจากไฟล์: B
ยืนยันเปลี่ยนผู้ดูแลเป็น B
```

Candidate/reconciliation HMAC binding ผูกอย่างน้อย:

```text
contract version + actor user ID + target Hospital ID + effective date
+ file fingerprint + source row + resolution status
+ normalized source caregiver + candidate OSM user ID
+ current OSM user ID เมื่อเป็น candidate/reassignment consent
```

มี stable candidate-reference binding สำหรับการตรวจชุด candidate และ current-bound
candidate/reassignment binding สำหรับป้องกัน stale consent. Confirm จะ validate
schema, duplicate row, target/file/actor/date/contract binding, reparse workbook,
re-resolve candidate eligibility และ reload current assignment ก่อน import service
จะรับ server-derived choice

กรณีต่อไปนี้ fail closed และต้อง preview ใหม่:

- candidate กลายเป็น inactive หรือหลุด OSM–Hospital relationship
- candidate exact เดิมกลายเป็น ambiguous
- current เปลี่ยนจาก A เป็น C
- current จาก A เปลี่ยนเป็น null ก่อน confirm
- source, row, Hospital, file, actor หรือ contract ไม่ตรง binding
- candidate token/reference/reassignment token ถูกแก้ไข หรือมาจาก Hospital อื่น

ถ้า preview A → B แต่ก่อน confirmมี OWNER อื่นเปลี่ยนเป็น B แล้ว ระบบ reload แล้ว
ทำ authoritative safe NOOP ได้; จะไม่สร้าง assignment ซ้ำ

## 8. MEMBER behavior

Roster import เดิมอาจเปิดให้ Hospital MEMBER ใช้ได้ จึงไม่ทำให้ workbook ทั้งหมด
ใช้ไม่ได้เพียงเพราะมี caregiver column แต่มี contract ชัดเจน:

- blank caregiver: row ดำเนิน core/Baseline/Classification ต่อได้
- source ตรงกับ current assignment: ดำเนินต่อได้ เป็น read-only NOOP
- source ต้องสร้าง assignment ใหม่หรือเปลี่ยน current: row เป็น `NEEDS_REVIEW` พร้อม
  `OSM_OWNER_REQUIRED` และไม่ mutate domain ใดของ row
- MEMBER ไม่มี candidate selection หรือ reassignment checkbox

การตรวจนี้อยู่ทั้ง preview และ server mutation; client control ไม่ใช่ security
boundary

## 9. Row transaction และ atomicity

เมื่อทุก assertion ใน row ได้รับการยืนยันแล้ว flow ใช้หนึ่ง Serializable transaction:

```text
provision/reuse Patient
→ reconcile/create Baseline
→ reconcile/create/change Classification + history
→ authoritative OSM assign/reassign + audit
→ commit
```

การ parse, hash, candidate discovery และ preview query อยู่นอก transaction. ถ้า OSM
assignment หรือ audit ล้มเหลวหลัง core/Baseline/Classification จะ rollback state ที่
row นี้สร้างทั้งหมด รวม Person, User, PATIENT role, PatientProfile,
PatientHospitalRelationship, PatientBaseline, PatientClassification,
PatientClassificationHistory, PatientOsmAssignment และ AuditEvent. หาก Patient เดิม
มีอยู่แล้วจะไม่ลบ authoritative state เดิม

แต่ละ row เป็น transaction แยกกัน; row ที่ unresolved ไม่ rollback row ที่ valid.
ไม่ใช้ workbook-wide transaction และยังจำกัด 500 rows / 64 columns / 5 MiB ตาม
adapter เดิม

## 10. Architecture, audit และ privacy

Assignment policy/invariants/mutation/history ยังคงอยู่ใน
`src/modules/patient-assignment/**`. Phase นี้เพิ่ม focused server-only
`patient-osm-roster-resolver.ts` สำหรับ normalization, exact candidate resolution,
preview state และ transaction-composable reconciliation แทนการสร้าง assignment
model หรือ duplicate invariant ใน import layer. Existing provisioning API wrappers
ยังคง backward compatible; การ extract cross-domain `PatientRosterImportService`
ทั้งก้อนเป็นงาน consolidation ที่เหมาะกับ Phase 16D.5 หลัง full compatibility audit

Audit ใช้ assignment domain เดิม (`patient.osm_assigned` / `patient.osm_reassigned`)
พร้อม actor, PatientHospitalRelationship, assignment และ OSM IDs ตาม convention เดิม
ไม่บันทึก raw workbook row, National ID, phone, clinical value หรือชื่อ caregiver ลง
generic audit metadata. Tests ใช้ชื่อ/identity สังเคราะห์ ไม่มีข้อมูลผู้ป่วยหรือ workforce
จริง

Summary เพิ่ม counters แบบ bounded: assigned, already assigned, reassigned, not found,
ambiguous, assignment conflict และ owner required. `ALREADY_EXISTS` ไม่ถูกนับเป็น
attention warning เพียงลำพัง

## 11. Tests และ verification

เพิ่ม/ปรับ focused coverage สำหรับ:

- blank, whitespace/NFC, exact match, no match, duplicate exact names และ no fuzzy match
- target-Hospital filtering, active User/Hospital/relationship และ Role.OSM filtering
- OWNER create/reassign, MEMBER denial/NOOP, OSM/ADMIN denial และ opaque token tampering
- candidate selection, explicit reassignment, same-assignment idempotency และ blank/no-found no-clear
- stale candidate uniqueness/eligibility และ stale current assignment (including safe current-target NOOP)
- combined Classification + OSM confirmations: neither/one/both
- successful complete row, forced OSM failure rollback, independent rows และ concurrent initial assignment
- Phase 16D.2 Baseline regression และ Phase 16D.3 classification regression
- แก้ rollback assertion ของ Phase 16D.3 ให้ใช้ `THAI_NATIONAL_IDENTITY_NAMESPACE` จริง

ผลที่ตรวจแล้วก่อนส่งมอบ:

```text
npx tsc --noEmit                         PASS
npm run lint                             PASS (ไม่มี error)
npm test -- focused Phase 16D.4 files   PASS (48 tests)
npm run test:integration                 PASS (23 files, 200 tests)
```

`npx prisma validate` และ `npx prisma generate` ผ่านแล้ว และตรวจแล้วว่าไม่มี migration
ใหม่ใน working tree

## 12. Remaining gates และ next phase

ยังเปิดอยู่และไม่ได้เปลี่ยนสถานะ:

- `IMP-REQ-03` Hospital / รพ.สต. hierarchy
- `P16C-PROFILE-01` profile/contact/address persistence ownership

ไม่เพิ่ม profile, address, emergency contact, clinical field ใหม่, hierarchy หรือ
cross-Hospital inference ใน Phase นี้

ข้อเสนอแนะถัดไปคือ **Phase 16D.5 — Full Roster Import Orchestration & Compatibility
Hardening**: consolidate roster orchestration boundaries, audit full-row composition,
harden preview/confirm and summary/idempotency behavior, and run a full synthetic
compatibility re-audit โดยไม่เพิ่ม speculative persistence
