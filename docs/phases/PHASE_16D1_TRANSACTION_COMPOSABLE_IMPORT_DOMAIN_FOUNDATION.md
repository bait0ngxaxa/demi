# DEMI Phase 16D.1 — Transaction-Composable Import Domain Foundation

**สถานะ:** Implemented foundation; ยังไม่เริ่ม expanded roster persistence หรือ full orchestration

**Starting HEAD:** `1780cc24d5e5ce87f3ecaeafcf8d0dfc88f83efe`

## 1. Scope and outcome

Phase 16D.1 แยก transaction-composable seams สำหรับ Patient core provisioning,
Patient Baseline และ Patient–OSM assignment โดยย้าย authoritative mutation
implementation เดิมไปไว้ใน server-only transaction modules ที่รับ
`Prisma.TransactionClient` จาก caller โดยตรง.

Public standalone services ยังคง interface และ behavior เดิม: caller ไม่ต้องรู้จัก
Prisma transaction, service ยัง validate input, authorize ตาม application boundary,
เปิด Serializable transaction, retry และ normalize error ตาม domain เดิม.

Phase นี้ไม่เพิ่ม `PatientRosterImportService` เพราะยังไม่มี executable orchestration
ที่ปลอดภัยก่อน gates ของ Baseline/classification/OSM reconciliation ปิด. Transaction
seams ที่ใช้งานและทดสอบได้จริงเป็น foundation ที่เพียงพอสำหรับ Phase 16D.1.

## 2. Pre-refactor transaction ownership

ก่อน phase นี้ mutation path ทั้งสามมี private in-module operation แต่ public service
แต่ละตัวเปิด Prisma transaction และ retry เอง:

| Domain | Standalone transaction owner | Composition constraint เดิม |
| --- | --- | --- |
| Patient provisioning | `provisionPatient` และ bulk row path | core mutation ไม่สามารถถูกเรียกด้วย caller-owned transaction |
| Patient Baseline | `createPatientBaseline` | private `createInTransaction` ใช้ซ้ำข้าม module ไม่ได้อย่างตั้งใจ |
| Patient–OSM assignment | `assignOsmToPatient` / `unassignOsmFromPatient` | private assign/unassign operations ใช้ซ้ำข้าม module ไม่ได้ |
| Audit | domain mutation ส่ง transaction ให้ `recordAuditEvent` อยู่แล้ว | audit composable แต่ domain operation ยังไม่ composable |

การเรียก public services เหล่านี้ต่อกันจึง commit แยกกัน และห้ามอ้างว่าเป็น
one-row atomic transaction.

## 3. Transaction-composable architecture

Standalone path หลัง refactor:

```text
public service
  → schema validation / application authorization boundary
  → runSerializableTransaction(database, tx => ...)
  → domainOperationInTransaction(tx, authoritative actor, validated input)
  → domain mutation + audit through the same tx
```

Future row path ที่ Phase 16D.5 สามารถสร้างได้หลัง gates ปิด:

```text
PatientRosterImportService
  → validate server-parsed row and reconciliation choices
  → runSerializableTransaction(database, tx =>
      provisionPatientInTransaction(tx, ..., "BULK")
      createPatientBaselineInTransaction(tx, ...)
      future classification operation
      assignOsmToPatientInTransaction(tx, ...)
    )
  → commit once
```

Transaction primitives ไม่เปิด `$transaction()`, ไม่ retry และไม่ normalize
database errors. Outer application boundary เป็นเจ้าของ transaction/retry เพียงชั้นเดียว.

## 4. Module responsibilities

### 4.1 Patient provisioning

`patient-provisioning-service.ts` ยังคงเป็น public standalone interface และ bulk
import compatibility path. Input ยังผ่าน `patientProvisionInputSchema`; single และ
bulk actor-context policies ยังถูกตรวจที่ public boundary ก่อนเปิด transaction.

`patient-provisioning-transaction.ts` เป็น server-only seam และรับ authorization mode
แบบ explicit (`SINGLE` หรือ `BULK`). Primitive ตรวจ policy ซ้ำเพื่อให้ direct
server-side composition fail closed และตรวจ authoritative database state ภายใน
transaction ได้แก่ active actor, current roles, active exact target Hospital และ
current direct/OSM scope ตาม mode. `BULK` ยอมรับเฉพาะ active direct Hospital scope;
OSM fallback ยังใช้ไม่ได้.

Mutation invariants เดิมอยู่ใน primitive เดียว: HMAC identity resolution, Person
reuse/create, name conflict, User reuse/create, reusable account state, PATIENT role
additive preservation, PatientProfile reuse/create, exact Hospital relationship,
HN fill-if-empty/conflict และ bounded provisioning audit. Raw identity ไม่ถูกเก็บหรือ
ใส่ audit.

### 4.2 Patient Baseline

`patient-baseline-service.ts` ยังคง validate ด้วย schema, require server actor,
resolve server time, own outer transaction/retry และ preserve domain-specific error
normalization.

`patient-baseline-transaction.ts` รับ validated Baseline request, server ActorContext
และ server-resolved `now`. Primitive ใช้ `resolvePatientBaselineAccessContext` กับ
transaction เดิม จึงตรวจ exact relationship, active Hospital, authoritative current
actor และ `patient:baseline:create` สำหรับ direct Hospital OWNER/MEMBER หรือ exact
assigned OSM ตาม policy เดิม. Primitive รักษา one-Baseline conflict, server recorder,
optional active Program `initialBaselineId` linking, immutable semantics และ audit
เดิมทั้งหมด. ไม่มี Baseline field ใหม่และไม่มี update/delete/amendment path.

Phase นี้ไม่เพิ่ม roster-specific same-value/different-value helper. Existing Baseline
query module รองรับ `Prisma.TransactionClient` อยู่แล้ว; เมื่อ Phase 16D.2 gates ปิด
import reconciliation ต้อง compare เฉพาะ fields ที่ import contract มี authority
เท่านั้น ไม่ใช่ diff ทั้ง Baseline record.

### 4.3 Patient–OSM assignment

`patient-osm-assignment-service.ts` ยังคง validate opaque IDs, require server actor,
own outer transaction/retry และ preserve error normalization.

`patient-osm-assignment-transaction.ts` re-resolve active exact Patient–Hospital
relationship, ตรวจ `patient:assign-osm`, current active HOSPITAL role และ direct
OWNER membership ใน active target Hospital. Assignment ยังตรวจ target User ACTIVE,
Role.OSM, active exact-Hospital OSM relationship และ self-assignment rejection.
Same OSM ยังเป็น `NOOP`; different OSM ยัง end current row แล้ว create new row;
history, unassign และ audit behavior เดิมยังอยู่ครบ.

Candidate query ไม่ถูกแก้หรือขยาย. Existing management query ยัง OWNER-protected,
exact-Hospital, bounded และไม่ใช่ import resolver. ไม่มี fuzzy/cross-Hospital search.

## 5. Shared Serializable transaction helper

เพิ่ม `src/lib/db/serializable-transaction.ts` เพราะทั้งสาม public services มี logic
ที่เหมือนกันจริงสำหรับ:

- Prisma interactive transaction;
- `Serializable` isolation;
- bounded retry count;
- retry เฉพาะ `P2002` และ `P2034` ตาม behavior เดิม.

Helper ไม่เป็น Unit of Work/repository framework และไม่ normalize errors. แต่ละ public
service ยังคง map `P2002`, `P2034`, `P2003` และ unknown failures เป็น domain-specific
`ConflictError`/`InfrastructureError` เหมือนก่อน refactor.

Retry ownership rule:

```text
standalone public service       → owns outer retry
future row application service → owns outer retry
transaction primitive          → never retries and never starts a transaction
```

## 6. Audit atomicity

`recordAuditEvent` ได้รับ Prisma transaction อยู่แล้วและไม่มีการเปลี่ยน interface.
ทุก extracted mutation primitive ยังคงส่ง supplied transaction เดียวกันให้ audit.

```text
domain mutation + audit succeed → caller may commit
audit or later operation fails  → caller-owned transaction rolls back all writes
```

Public wrappers ไม่เขียน audit ซ้ำ. `NOOP` behavior ที่เดิมไม่สร้าง audit ยังคงเดิม.

## 7. Error and public compatibility

Public function names, parameters, result shapes และ exported provisioning conflict
class/types ยังคง import ผ่าน service modules เดิม. Transaction primitives อาจ throw
application/domain errors หรือ raw retryable Prisma errors; public wrappers เป็นผู้
preserve externally observable `ValidationError`, `ForbiddenError`, `NotFoundError`,
`ConflictError` และ `InfrastructureError` semantics.

Current Excel adapter/preview/confirm path ไม่ถูกเปลี่ยน. `importPatientProvisioning`
ยังวนหนึ่ง row ต่อหนึ่ง public provisioning transaction และ persist เฉพาะ:

```text
nationalId → HMAC identity boundary
givenName
familyName
hospitalNumber
```

Weight, waist, height, HbA1c, blood sugar/DTX, classification, OSM assignment,
profile/contact/address และ gated clinical fields ยังไม่ถูก persist จาก workbook.

## 8. Tests added and preserved

เพิ่ม focused unit tests ที่เรียก Baseline และ assignment transaction primitives ด้วย
transaction fakes ที่ไม่มี `$transaction`, ยืนยันว่า primitive ทำงานและส่ง transaction
เดียวกันให้ audit โดยไม่เรียก database transaction wrapper.

เพิ่ม PostgreSQL integration suite
`patient-import-domain-transaction.integration.test.ts` ซึ่งพิสูจน์ว่า:

1. provisioning + Baseline + assignment + three domain audits commit ผ่าน
   caller-owned Serializable transaction เดียว;
2. intentional failure หลังทั้งสาม operations ทำให้ Patient core, Baseline,
   assignment และ audits rollback พร้อมกัน.

Existing provisioning, Baseline, assignment, import adapter/transport, audit,
authorization และ concurrency suites ยังคงเป็น regression baseline.

## 9. Files changed

- `src/lib/db/serializable-transaction.ts`
- `src/lib/db/serializable-transaction.test.ts`
- `src/modules/patient-provisioning/services/patient-provisioning-service.ts`
- `src/modules/patient-provisioning/services/patient-provisioning-transaction.ts`
- `src/modules/patient-provisioning/services/patient-provisioning-transaction.test.ts`
- `src/modules/patient-baseline/services/patient-baseline-service.ts`
- `src/modules/patient-baseline/services/patient-baseline-transaction.ts`
- `src/modules/patient-baseline/services/patient-baseline-service.test.ts`
- `src/modules/patient-assignment/services/patient-osm-assignment-service.ts`
- `src/modules/patient-assignment/services/patient-osm-assignment-transaction.ts`
- `src/modules/patient-assignment/services/patient-osm-assignment-service.test.ts`
- `tests/integration/patient-import-domain-transaction.integration.test.ts`
- `docs/phases/PHASE_16D1_TRANSACTION_COMPOSABLE_IMPORT_DOMAIN_FOUNDATION.md`
- `docs/CONTEXT.md`

ไม่มีการแก้ `prisma/schema.prisma`, `prisma/migrations/**`, lockfile, workbook หรือ
generated files.

## 10. Requirement gates unchanged

- `IMP-REQ-03` Hospital / รพ.สต. hierarchy = **OPEN**
- `IMP-REQ-05` shared effective date = **PROVISIONAL**
- `P16C-CLASS-01` classification vocabulary/lifecycle/authority/history = **UNRESOLVED**
- `P16C-CLINICAL-01` units/protocol และ DTX vs generic blood sugar = **UNRESOLVED**
- `P16C-OSM-01` OWNER vs MEMBER caregiver assignment authority = **UNRESOLVED**
- `P16C-PROFILE-01` profile/contact/address mutation ownership = **UNRESOLVED**

ไม่มี `import:anything` super-capability. `patient:provision` ไม่ authorize Baseline
หรือ OSM assignment และ MEMBER ยังไม่มี `patient:assign-osm` authority.

## 11. Exact next-phase handoff

Phase 16D.2 ต้องยังไม่เริ่ม permanent initial-Baseline import persistence จนกว่า
อย่างน้อย `IMP-REQ-05` และ `P16C-CLINICAL-01` จะปิดด้วย owner-approved effective-date,
unit/protocol และ DTX semantics. เมื่อ gates ปิด ให้เพิ่มเฉพาะ approved typed Baseline
mappings/reconciliation บน `createPatientBaselineInTransaction`; ห้ามสร้าง parallel
Baseline mutation logic.

Classification ต้องรอ `P16C-CLASS-01`; OSM resolver/reconciliation ต้องรอ
`P16C-OSM-01` และอยู่ใน Phase 16D.4. Full one-row roster orchestration ควรเริ่มใน
Phase 16D.5 หลัง transaction seams และทุก gated domain operation พร้อมแล้ว.
