# Phase 17J.0B — Multi-role Rich Menu Owner Decision Closeout

- สถานะ: **CLOSED / OWNER DECISION CLOSED**
- มติ: **Option C — explicit role/workspace Rich Menu switching**
- วันที่ปิดมติ: 2026-10-06
- ผล: ปิดเฉพาะ UX presentation context; ไม่เปลี่ยน identity หรือ authorization ของ DEMI

เอกสารนี้บันทึกคำตัดสินของเจ้าของผลิตภัณฑ์ที่ปิดคำถาม multi-role ซึ่งยัง OPEN ใน [Phase 17J.0](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md) และ [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md) ณ เวลาที่เอกสารเหล่านั้นปิดสถาปัตยกรรม

## 1. มติที่อนุมัติ

เลือก **Option C — ใช้ Rich Menu switching ของ LINE เพื่อสลับ workspace ตาม operational role** ผู้ใช้คนเดียวอาจมี workspace ที่มีสิทธิ์มากกว่าหนึ่งแบบ:

```text
PATIENT workspace ⇄ OSM workspace ⇄ HOSPITAL workspace
```

ระบบเลือกได้เฉพาะ workspace ที่ขณะนั้นมีสิทธิ์สำหรับ DEMI User คนเดิม การเลือกเมนูเป็น presentation preference เท่านั้น

## 2. UX ที่เจ้าของอนุมัติ

### ผู้ใช้มี operational role เดียว

ถ้ามี PATIENT, OSM หรือ HOSPITAL ที่ eligible เพียง role เดียว ให้แสดง Rich Menu ของ role นั้นทันที ไม่ต้องแสดง chooser

### ผู้ใช้มีหลาย operational roles

เมื่อมีหลาย role และยังไม่มี last selected presentation role ที่ยัง eligible ให้แสดง neutral chooser ในประสบการณ์ multi-role ครั้งแรก ตัวอย่าง:

```text
เลือกการใช้งาน

[ ผู้ป่วย ]  [ อสม. ]  [ โรงพยาบาล ]
```

chooser ต้องมีเฉพาะ role ที่ eligible ปัจจุบัน ผู้ใช้เลือก role แล้ว LINE สลับไป role-specific Rich Menu ด้วยกลไก native ของ Rich Menu switching/alias

role-specific menu ของผู้ใช้หลาย role ต้องมีตำแหน่งสลับ workspace ที่ชัดเจนและคงที่ เมนูแสดงเฉพาะ workspace อื่นที่ eligible สำหรับผู้ใช้นั้น

### Presentation preference

ระบบจำ last selected presentation role ได้เมื่อผู้ใช้เลือกผ่าน Rich Menu switch สำเร็จ ค่าใช้ได้เพียง `PATIENT`, `OSM`, `HOSPITAL` หรือ `null` และเป็น UX preference เท่านั้น

ทุกครั้งที่ reconcile ให้คำนวณ eligible roles จากข้อมูล DEMI ปัจจุบันก่อน ถ้า preference ยัง eligible เมนู role นั้นอาจคงอยู่ ถ้าไม่ eligible ให้ทิ้ง preference แล้วใช้ fallback:

| operational roles ที่ยัง eligible | projection |
| --- | --- |
| 0 | `LINKED_INELIGIBLE` / neutral menu |
| 1 | role menu ของ role เดียวที่เหลือ |
| มากกว่า 1 และไม่มี preference ที่ยัง eligible | `ROLE_CHOOSER` |

ไม่มี role precedence ไม่ว่าในข้อมูลหรือการเรียงลำดับเมนู เช่น HOSPITAL ไม่ชนะ OSM หรือ PATIENT

## 3. เส้นแบ่ง authority ที่ไม่เปลี่ยน

การเลือก Rich Menu workspace:

- ไม่เปลี่ยน DEMI User หรือ Supabase session
- ไม่ให้หรือเลือก DEMI Role
- ไม่ให้ Hospital membership, Patient scope, OSM assignment หรือ capability
- ไม่เลือก Hospital, Patient, PatientHospitalRelationship, Program, appointment, medication, Family grant หรือ clinical record
- ไม่เปลี่ยน server-side policy หรือผล authorization

ทุก operation ต้อง resolve persisted DEMI authority ปัจจุบันและผ่าน server policy ของ operation นั้น Rich Menu เป็น presentation เท่านั้น

ตัวอย่าง: HOSPITAL menu เปิด flow ที่มี server-authorized Hospital selector; server คืนเฉพาะ Hospital ที่ผู้ใช้เข้าถึงได้ในขณะนั้น OSM menu ไม่ระบุ Patient คนเดียว

## 4. ADMIN และ stale menu

`ADMIN` อย่างเดียวได้ `LINKED_INELIGIBLE` / neutral menu และไม่ทำให้มี PATIENT, OSM หรือ HOSPITAL authority ถ้า User มี `ADMIN + HOSPITAL`, HOSPITAL menu ใช้ได้เพราะ HOSPITAL role และ current Hospital membership ที่ eligible เท่านั้น

menu ที่ยังมองเห็นหลัง Role, Membership, Relationship หรือ User status เปลี่ยน ไม่ใช่หลักฐานสิทธิ์ Server ต้อง deny operation ที่ไม่ authorized ทันที แล้ว reconcile menu เป็น presentation ภายหลัง

## 5. ข้อกำหนดด้าน Rich Menu

- ใช้ LINE-native `richmenuswitch` และ aliases สำหรับการเปลี่ยน workspace; ห้ามทำแอป-side fake role switch
- เมนูเป็น shared reusable resources ไม่สร้าง Rich Menu ใหม่ต่อ User
- แสดงเฉพาะ operational roles ที่ eligible; ห้ามใส่ Hospital หรือ Patient resource selector ไว้ใน menu
- เมนูบอกได้เฉพาะ action ที่มีจริงใน 17J.1; รายละเอียด provisioning และเมนูแบบ finite eligible-role set อยู่ใน [สัญญา implementation 17J.1](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md)
- ความสำเร็จของ LINE API ต้องตรวจ read-back เมื่อยืนยัน state ที่คาดหวัง

## 6. ผลต่อ Phase 17J

มตินี้เติมคำถาม multi-role ที่เปิดไว้ใน Phase 17J.0 โดยไม่ supersede ADR-0009 และไม่เปลี่ยน topology LINE, LIFF identity flow, authorization boundary หรือ notification transport ที่อนุมัติแล้ว

## 7. สถานะ

- Phase 17J.0: **CLOSED / ARCHITECTURE CONTRACT COMPLETE**
- Phase 17J.0B: **CLOSED / OWNER DECISION CLOSED**
- Multi-role Rich Menu: **CLOSED / OWNER APPROVED — OPTION C**
- Phase 17J.1 technical contract: [COMPLETE / CLEARED FOR IMPLEMENTATION](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md)
- Phase 17J.1 runtime: **NOT IMPLEMENTED**
- LINE Provider/OA/channel provisioning, real-device UAT และ production deployment: **NOT CLAIMED**

เอกสาร Phase 17J.0 เดิมคง OPEN state ไว้เป็นหลักฐานของสถานะเมื่อปิด architecture contract มติปัจจุบันอยู่ในเอกสาร closeout นี้และ addendum ปัจจุบันที่เชื่อมจาก [Project Context](../CONTEXT.md), [UAT Backlog](./PHASE_17_UAT_BACKLOG.md) และ [Architecture Baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md)