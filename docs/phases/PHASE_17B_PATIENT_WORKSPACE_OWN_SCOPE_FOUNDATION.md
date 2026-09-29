# DEMI Phase 17B — Patient Workspace & Own-Scope Foundation

- สถานะ: **IMPLEMENTED**
- สัญญาผลิตภัณฑ์: [Phase 17A Customer Flow Canonicalization UAT Contract](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md)
- Backlog: [Phase 17 UAT Backlog](./PHASE_17_UAT_BACKLOG.md)

## Goal

ทำให้บัญชี `PATIENT` ที่เปิดใช้งานแล้วเข้าสู่ Personal workspace ได้ และอ่าน identity/profile กับความสัมพันธ์ Hospital ของตนเองผ่าน self-scope ที่ derive จาก ActorContext ฝั่ง server โดยไม่เปลี่ยน Person/User identity, credential, Work authorization หรือ semantics ที่ยัง requirement-gated.

## Implemented scope

- Patient-only ที่เข้า `/app` ถูกส่งไป `/app/personal` แทน empty/no-work state เดิม.
- เพิ่ม `/app/personal` เป็น Patient Home และ `/app/personal/profile` เป็นหน้าอ่านข้อมูลของฉัน.
- Multi-role `OSM + PATIENT` และ `HOSPITAL + PATIENT` เห็น context selector `ส่วนตัว` / `งาน` ใน navigation เดียวกับ application shell และใช้ Person/User เดิม.
- Personal Home แสดง persisted display name เมื่อมี, Patient และ Personal context indication, Hospital relationship summary และทางไปหน้า profile. ไม่มี tile/route สำหรับ care, appointment หรือ domain ที่ยังไม่เปิดให้ Patient.
- หน้า profile แสดงชื่อ/นามสกุล, เบอร์โทรศัพท์, ที่อยู่ และความสัมพันธ์ Hospital ที่อนุญาตให้อ่าน.
- Loading ใช้ shared structural skeleton; missing profile และไม่มี active Hospital relationship แสดงสถานะว่างอย่างตรงไปตรงมา.
- National ID login, Patient provisioning/activation, Work navigation และ Work policies เดิมยังเป็นแหล่ง behavior ของตนเอง.

## Routes and navigation

| Route | Behavior |
| --- | --- |
| `/app` | Work Home เดิม; PATIENT-only redirect ไป Personal Home |
| `/app/personal` | อ่าน own Patient context และแสดง Personal Home |
| `/app/personal/profile` | อ่าน allowlisted own identity/profile และ Hospital relationship facts |

`application-workspace-context.ts` project available contexts จาก server-resolved ActorContext roles: `PATIENT` ให้ Personal; `ADMIN`, `HOSPITAL` หรือ `OSM` ให้ Work. Multi-role ที่มีทั้งสอง role เห็นทั้งสอง context. Work เป็นค่าเริ่มต้นเมื่อไม่มี valid selection; PATIENT-only มีเฉพาะ Personal. Navigation ใช้ pathname เป็น presentation state เท่านั้น. ไม่มี workspace cookie, localStorage หรือ database preference.

Navigation groups ถูกสร้าง server-side และกรองตาม route เพื่อแสดง context ปัจจุบัน. การเลือก context ไม่ถูกส่งเข้า policy และไม่ได้สร้าง role, capability, membership, Patient ownership หรือ OSM assignment. Route ของ Personal เรียก protected actor resolution และ self-read service ใหม่ทุก request; Work routes คงตรวจ policy เดิม.

## Exact Patient self-scope semantics

`resolveOwnPatientContext(actor)` เป็น dedicated read operation และรับเฉพาะ ActorContext กับ dependency สำหรับ database; ไม่มี `patientId` หรือ `relationshipId` เป็น input.

Policy กำหนด `patient:self:read` ภายใต้ `PATIENT` + `SELF` scope และ fail closed เมื่อ ActorContext/identity ไม่ครบหรือไม่มี PATIENT role. Query ผูก chain ด้วยเงื่อนไขทั้งหมด:

```text
Person.id = ActorContext.personId
Person.user.id = ActorContext.userId
User.status = ACTIVE
UserRole includes PATIENT
Person.patientProfile
PatientProfile.hospitalRelationships
```

ดังนั้น OSM assignment และ Hospital membership ไม่ถูกใช้เป็นหลักฐาน self ownership. OSM+PATIENT และ HOSPITAL+PATIENT อ่าน self ผ่าน query/policy นี้ ขณะที่ Work queries/policies ยังคงแยก path และ scope เดิม.

`PatientHospitalRelationship` ปัจจุบันไม่มี lifecycle/status field. Self projection จึงรวมทุก relationship ของ PatientProfile ที่อยู่กับ Hospital สถานะ `ACTIVE`, เรียงตามชื่อ Hospital และ relationship ID อย่าง deterministic, และไม่เลือก primary Hospital. Relationship ของ Hospital ที่ไม่ ACTIVE จะไม่ถูกเปิดเผยใน Personal projection; หากไม่เหลือรายการจะแสดง empty state. นี่ไม่ได้ประกาศว่า relationship นั้นถูกยกเลิกหรือ suspended.

ไม่มี route/query รับ relationship ID จาก browser. Service คืนเฉพาะ Hospital code/name และ Hospital patient number; ไม่คืน relationship/profile/User IDs. ถ้า identity chain หรือ PatientProfile ไม่ resolve จะคืน `null` เพื่อแสดง incomplete state โดยไม่ขยาย scope.

## Allowlisted Patient projection

คืนเฉพาะ:

- `Person.givenName`, `Person.familyName`
- `PatientProfile.phoneNumber`, `addressText`
- สำหรับแต่ละ Hospital relationship ที่ผ่านเงื่อนไข: `hospitalCode`, `hospitalName`, `hospitalNumber`

ไม่มี DOB หรือ age, gender, occupation, education, emergency-contact fields, classification, clinical record, auth subject, identity hash, audit fields, role mechanics, raw Prisma object หรือ unrelated membership ใน projection. Optional values แสดง `ยังไม่ได้บันทึก`. ไม่มี profile mutation.

## Architecture and security boundaries

- เพิ่ม dedicated `patient-self` policy/query seam; ไม่ขยาย Patient directory, OSM assigned-patient query หรือ Hospital Patient query ให้กลายเป็น self path.
- Query ตรวจ actor User/Person link, persisted active User และ persisted PATIENT role ซ้ำใน read boundary.
- Server-resolved roles สร้าง navigation projection; pathname แสดง UX context เท่านั้น.
- Personal page/helper ไม่ query Prisma โดยตรง; UI รับเฉพาะ bounded `PatientSelfContext` projection.
- Hospital parent/child, Hospital membership และ OSM assignment ไม่ grant self ownership หรือเปลี่ยน scope.
- Hospital Owner ยังคงเป็น HOSPITAL authority ไม่ใช่ Platform ADMIN.
- Login/activation contract และ credential ownership ไม่เปลี่ยน; ไม่มี DOB/default password.

## Models and schema

Reuse `Person`, `User`, `UserRole`, `PatientProfile`, `PatientHospitalRelationship` และ `Hospital` ตาม schema ปัจจุบัน. ไม่มี schema change หรือ migration.

## Tests

เพิ่ม/ปรับ focused tests สำหรับ:

- self-read policy: PATIENT, OSM+PATIENT, HOSPITAL+PATIENT, non-PATIENT, capability/identity failure;
- exact User → Person query boundary, PatientProfile projection, active Hospital filter, deterministic multi-Hospital order, incomplete identity, DB failure และการตัด sensitive/internal fields;
- Patient-only/Work/multi-role available workspace, server navigation projection, stale context fallback และ Patient-only `/app` redirect;
- Personal Home, allowlisted profile, optional/missing data และการไม่แสดง fake care/appointment actions;
- existing Work navigation, Patient directory, OSM assignment, Hospital patient access, login/provisioning/activation regression.

ผลตรวจ ณ handoff: targeted regression 24 test files / 173 tests ผ่าน; full suite 144 test files / 1,000 tests ผ่าน; `npm run typecheck` และ `npm run lint` ผ่าน. Local browser viewport smoke ด้วย synthetic projection ที่ 390×844 และ 1440×1000 ผ่าน โดยไม่เกิด horizontal overflow; mobile context links สูง 44px และเปิด drawer ได้. ไม่มีการเพิ่ม Playwright dependency ใน repository.

## Known limitations

- Schema ไม่มี Patient relationship lifecycle/status โดยตรง; Phase 17B ใช้ Hospital `ACTIVE` เป็นขอบเขตการแสดง relationship summary และไม่ตั้ง primary Hospital.
- หากมี User role PATIENT แต่ profile ขาดหรือ identity link ไม่ตรง จะแสดง incomplete state; ไม่มี repair/mutation flow.
- ข้อมูล care, measurement, appointment, family, medication และ Patient-editable profile ยังไม่แสดงใน Personal workspace.
- Browser smoke นี้ตรวจ responsive UI ด้วยข้อมูลสังเคราะห์เท่านั้น ไม่ได้ยืนยัน authenticated UAT actor/database; การเตรียม non-production environment และ representative actor/data ยังอยู่ใน UAT Delivery / Environment Track.

## Requirement gates preserved

- `AUTH-04`: ความหมายของ “ลงทะเบียนเข้าใช้งานที่หน้า Login” ยังไม่ตัดสิน; ไม่มี public registration หรือ bypass activation.
- `CARE-07`: Patient service request/enrollment และ OSM preference/assignment semantics ยัง gated.
- `PAT-03`: age/BMI/diagnosis/family-history semantics ยัง gated; Phase นี้ไม่อ่านหรือ derive DOB/age.
- `PAT-04`: Patient profile mutation/address/contact editing ยัง gated.
- `PAT-02`, `CARE-01`, `CARE-03`, `CARE-05`, `APT-02`: own care/measurement/appointment read expansion เป็น Phase 17C.
- `PAT-05`, `CARE-02`, `CARE-06`, `APT-03`–`APT-06`, `OSM-03`, caregiver/family, medication, wellness, content, consent, notification, support, responsibility-area และ dashboard/export items ยังคงรอ requirement/phase ตาม Phase 17A backlog.

## Handoff to Phase 17C

ใช้ actor-derived own scope นี้เป็น entry seam สำหรับ Patient care/appointment read แต่ให้แต่ละ domain ใช้ capability, policy และ bounded query ของตนเอง. เพิ่มเฉพาะ persisted factual reads ที่ Phase 17A ระบุ, แสดง empty/history states และคง OSM exact-assignment กับ Hospital direct-scope path แยกจาก self. ห้ามเพิ่ม Patient mutation หรือ clinical interpretation โดยไม่มี requirement decision.
