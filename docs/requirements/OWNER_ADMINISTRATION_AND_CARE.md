# ข้อกำหนดปัจจุบัน: OWNER บริหารโรงพยาบาล / MEMBER และ OSM ดูแลผู้ป่วย

CONFIRMED_OWNER_REQUIREMENT — 2026-10-21. ข้อกำหนดนี้และ [ADR-0019](../adr/0019-owner-administration-and-import-only-roster.md) มีผลเหนือข้อความเก่าที่ให้ MEMBER/OSM ทำงานบริหาร รวมถึง ADR-0008 D1 วันที่ 2026-10-14 และ E1 delegated report export

| ความสามารถ | OWNER โดยตรง | MEMBER | OSM | PATIENT | Platform ADMIN |
| --- | --- | --- | --- | --- | --- |
| Excel v2 import ตั้งแต่ 1 รายการ | Hospital ตนที่ ACTIVE | ปฏิเสธ | ปฏิเสธ | ปฏิเสธ | ไม่เพิ่มสิทธิ์ |
| บุคลากร/OSM, issuance/regeneration, มอบหมายผู้ดูแล | ตามนโยบายเดิม | ปฏิเสธ | ปฏิเสธ | ปฏิเสธ | recovery เดิมแยกต่างหาก |
| ออกคำเชิญผู้ป่วย / ตรวจคำขอบริการ | exact scope | ปฏิเสธ | ปฏิเสธ | self-service เดิม | boundary เดิม |
| รายงานบริหารและ export | exact scope | ปฏิเสธแม้มี grant เก่า | ปฏิเสธ | ปฏิเสธ | reporting เดิม |
| ตั้งค่า catalog เนื้อหา พื้นที่และเครือข่าย | นโยบายที่มีอยู่ | ปฏิเสธ | ปฏิเสธ | ปฏิเสธ | governance เดิม |
| งานดูแลผู้ป่วย | resource policy | resource policy | assignment policy | self-service เดิม | ไม่เพิ่ม clinical scope |
| บัญชีส่วนตัวและรับคำเชิญเดิม | ของตนเอง | ของตนเอง | ของตนเอง | ของตนเอง | ของตนเอง |

ต้องตรวจ User, Hospital และ membership ที่ ACTIVE จากข้อมูลปัจจุบัน หลายบทบาทไม่ตัดสิทธิ์ OWNER และไม่เพิ่มสิทธิ์บริหารจาก MEMBER/OSM ไม่สืบทอด scope ผ่าน parent/child/sibling

## Capability classification จาก codebase

| กลุ่ม | Classification | ผลตัดสิน |
| --- | --- | --- |
| workforce directory/provision/lifecycle/recovery issuance/slips; patient import/activation issuance; service review; service catalog; assignment; contact/content management; Hospital report/export | HOSPITAL_ADMINISTRATION | direct OWNER เท่านั้น; historical grant ไม่มีอำนาจ |
| patient-directory, screening, followups, goals, patient-program, baseline, classification, evidence, appointments, hospital-profile care updates | PATIENT_CARE | คง exact patient/Hospital/assignment policy เดิม |
| exact-Program report ที่ใช้ patient-program read scope | PATIENT_CARE | สรุปการดูแลราย Program ไม่เพิ่ม Hospital administrative report/export |
| ข้อมูลติดต่อ/ข่าวสารโรงพยาบาลแบบอ่าน | PATIENT_CARE | คง scoped projection เดิม; การแก้ไข OWNER-only |
| network Patient read ตาม ADR-0016 รวม explicit MEMBER read grant | PATIENT_CARE | คง read-only boundary และ audit เดิม ไม่ให้สิทธิ์บริหาร/แก้ไขข้าม Hospital |
| บัญชีตนเอง, password, patient/workforce activation claim, self requests/withdrawal, family grants | PERSONAL_ACCOUNT_SELF_SERVICE | คง identity checks เดิม; MEMBER ออก/สร้างคำเชิญใหม่ไม่ได้ |
| Platform ADMIN governance/recovery/global reporting; explicit Parent network/Child onboarding/report boundaries | GOVERNANCE / EXCEPTIONAL_RECOVERY | คงนโยบายแยกเดิม ไม่ถือเป็น direct Child authority |
| clinical definitions / field disclosure ที่เอกสารเดิมยังไม่ยืนยัน | UNRESOLVED | ไม่เพิ่มสิทธิ์หรือสร้างนิยามใหม่ |

## Patient onboarding และ LINE

`/app/patients/provision` ใช้ชื่อ “นำเข้าผู้ป่วย” สำหรับ OWNER เท่านั้น ไม่มี single-registration tab/form หรือ generic creation endpoint Excel v2 รักษาการ resolve ตัวตน การตรวจซ้ำ การไม่ overwrite และ transaction/audit เดิม

คำขอใช้บัญชีผู้ป่วยสาธารณะและกล่อง OWNER review ถูกเลิกใช้ตาม [ADR-0020 addendum RA-1](../adr/0020-self-registration-by-national-id.md); ผู้ป่วยต้องมี roster record จาก OWNER ก่อน แล้วจึงลงทะเบียนด้วยเลขบัตรหรือใช้ invite/assisted activation.

OSM ทุก variant มี 4 งานหลัก: ผู้ป่วยที่ดูแล, คัดกรองผู้ป่วย, บันทึกติดตาม, งานทั้งหมด ไม่มี “เพิ่มผู้ป่วย” ภาพและพื้นที่กดใช้ shared layout เดียวกัน PATIENT menu, chooser, alias, native switching และ ordinary web links คงเดิม ไม่แก้ LINE Provider จริงและไม่ deploy
