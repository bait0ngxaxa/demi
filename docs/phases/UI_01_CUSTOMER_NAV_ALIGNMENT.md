# UI-01 — Customer Navigation Alignment (คนไข้ทั่วไป)

- **วันที่:** 2026-10-21 (Asia/Bangkok)
- **ขอบเขต:** UI shell, navigation และหน้าหลักของ **คนไข้ทั่วไป (PATIENT, พื้นที่ส่วนตัว)** เท่านั้น
- **ที่มา:** กล่องหมายเหตุหน้าหลักจากลูกค้า (screenshot ที่ Product Owner ส่งในงานนี้; ข้อความเดียวกับ `OWNER_CANVA_FLOW_MAPPING.md` §3.1)
- **ไม่เปลี่ยน:** schema, policy, service, route เดิม, LINE Rich Menu, navigation ของ Work workspace

## 1. การตัดสินใจขอบเขต

Prompt ฉบับแรกกำหนดให้ 4 บทบาท (OWNER, MEMBER, OSM, PATIENT) ใช้เมนูชุดเดียวกัน ระหว่างงาน Product Owner แก้ขอบเขตว่า
**เมนูที่ fixed ตาม screenshot เป็นของคนไข้ทั่วไป ต้องตรงทุกตัว ส่วนบทบาทอื่นให้เป็นตาม role ตามความเหมาะสม (เหมือนเดิม)**

ผลคือ:

| บทบาท / workspace | Navigation |
| --- | --- |
| PATIENT — พื้นที่ส่วนตัว | เมนูลูกค้า 5 บน + 5 ล่าง ตาม screenshot (ใหม่) |
| Hospital OWNER / MEMBER, OSM — พื้นที่งาน | เมนูตาม role เดิม (UI-4) ไม่เปลี่ยน |
| Platform ADMIN | เมนูเดิม ไม่เปลี่ยน |
| หลายบทบาท (เช่น PATIENT + OSM) | พื้นที่ส่วนตัวใช้เมนูลูกค้า, พื้นที่งานใช้เมนูตาม role เดิม; สลับผ่าน `WorkspaceSwitch` เดิม สิทธิ์แต่ละพื้นที่แยกกันเหมือนเดิม |

## 2. Remapping (พื้นที่ส่วนตัว)

ทุกปลายทางเป็น route เดิมของพื้นที่ส่วนตัว ไม่มี route ใหม่และไม่มีการเพิ่มสิทธิ์

### แถบเมนูล่าง (mobile bottom tabs และส่วนบนสุดของ sidebar)

| ลำดับ | เมนู | ปลายทาง | เดิม |
| --- | --- | --- | --- |
| 1 | หน้าหลัก | `/app/personal` | แท็บ "หน้าแรก" |
| 2 | ข้อมูลสุขภาพ | `/app/personal/measurements` (ตัวฉันในตอนนี้) | อยู่ใน "บันทึกสุขภาพ" |
| 3 | นัดหมาย | `/app/personal/appointments` | แท็บ "นัดหมาย" |
| 4 | ติดตาม | `/app/personal/care` (ข้อมูลการดูแล: โปรแกรม/ครั้งที่/การติดตามผล) | แท็บ "ดูแล" |
| 5 | โปรไฟล์ | `/app/more` (hub เดิม แสดงหัวเรื่อง "โปรไฟล์" ในพื้นที่ส่วนตัว) | แท็บ "เพิ่มเติม" |

ไม่มีแท็บ "เพิ่มเติม" สำหรับคนไข้แล้ว รายการรอง (คำขอรับบริการ, ข่าวสาร, สื่อความรู้, ข้อมูลของฉัน, ตั้งค่า, แจ้งปัญหาการใช้งาน) อยู่ใน hub โปรไฟล์และใน sidebar ใต้เมนูหลัก

### แถบเมนูบน (หน้าหลัก และกลุ่ม "เมนูด่วน" ใน sidebar)

| ลำดับ | เมนู | ปลายทาง |
| --- | --- | --- |
| a | ประวัติการนัดหมาย | `/app/personal/appointments` (บนหน้าหลัก: `/app/personal/appointments/{relationship}` ของโรงพยาบาลที่เลือก) |
| b | ครอบครัวของฉัน | `/app/family` |
| c | ยา | `/app/personal/medications` |
| d | Food & Finess | `/app/personal/wellness` (คงคำสะกดของลูกค้า) |
| e | ติดต่อเรา | `/app/personal#personal-hospital-contact` (บนหน้าหลัก: `?hospital={relationship}` ของโรงพยาบาลที่เลือก) |

### หน้าหลัก (`/app/personal`)

1. ชื่อ-สกุล — "สวัสดี, ชื่อ นามสกุล" (เดิม)
2. โรงพยาบาลที่สังกัด — chip เลือกโรงพยาบาลเดิม (ไม่มีโรงพยาบาล → "ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน" ไม่สร้างสังกัดขึ้นเอง)
3. แถบเมนูบน 5 รายการ — แทน shortcut เดิม 7–8 รายการ
4. สื่อความรู้ (ตรงกลาง) — ส่วนข่าวสาร + สื่อความรู้เดิม
5. แถบเมนูล่าง — bottom navigation ของ shell
6. แจ้งปัญหาการใช้งาน App — ลิงก์ใหม่ไป `/app/support` (route เดิม)

ส่วนติดต่อโรงพยาบาล: ถ้าโรงพยาบาลที่เลือกยังไม่มีข้อมูลติดต่อที่แสดงได้ หน้าหลักจะแสดง "ยังไม่มีข้อมูลติดต่อ" ที่ anchor เดิม เพื่อให้เมนู "ติดต่อเรา" ไม่ไปจบที่หน้าว่าง

## 3. Implementation

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `src/components/app-shell/customer-navigation.ts` (ใหม่) | label/ลำดับ/icon ของเมนูลูกค้าเป็น source เดียว |
| `src/components/app-shell/application-navigation.ts` | `withPersonalCustomerNavigation`: เพิ่ม section `primary` และ `top-menu` ให้พื้นที่ส่วนตัว และตัดรายการส่วนตัวที่ซ้ำ href กับเมนูลูกค้า; พื้นที่งานไม่ถูกแตะ |
| `navigation-types.ts`, `navigation-sections.ts` | section id `primary` (ไม่มีหัวข้อ), `top-menu` ("เมนูด่วน"), `menuId` บน item |
| `mobile-tab-projection.ts` | แท็บของพื้นที่ส่วนตัวมาจาก section `primary` โดยตรง (5 แท็บ ไม่มี "เพิ่มเติม"); พื้นที่งานยังใช้ `projectWorkTabs` เดิม; More hub ไม่แสดงรายการ "โปรไฟล์" ของตัวเอง |
| `mobile-navigation-glyph.tsx`, `navigation-list.tsx`, `more-menu-navigation.tsx` | icon ของเมนูลูกค้ามาจากเมนู ไม่ใช่จาก href |
| `src/components/home/home-top-menu.tsx` (ใหม่) | `projectHomeTopMenu` (หน้าหลักอ่านเมนูบนจาก navigation projection เดียวกับ sidebar) และ `HomeSupportLink` |
| `app/app/personal/page.tsx`, `patient-personal-home.tsx` | หน้าหลักคนไข้ตามข้อ 2 |
| `app/app/more/page.tsx` | หัวเรื่อง "โปรไฟล์" เมื่อเปิดจากพื้นที่ส่วนตัว; พื้นที่งานยังเป็น "เพิ่มเติม" |

Deep link เดิมทั้งหมดยังเปิดได้ (ไม่มีการลบหรือย้าย route) และไม่มีการเปลี่ยน LINE Rich Menu หรือ LINE workflow

## 4. งานที่เหลือระดับ journey (รอ Product Owner)

| ID | ประเด็น |
| --- | --- |
| UI01-G1 | **เมนูของ OWNER / MEMBER / OSM**: ยังเป็นเมนูตาม role เดิม (UI-4) Product Owner ระบุว่า "ตามความเหมาะสม" ต้องกำหนดเมนูต่อบทบาท (ดู OWNER-CANVA-01 §9–§10 และ Q-01..Q-07) ก่อนปรับ |
| UI01-G2 | **ข้อมูลสุขภาพ**: Canva ระบุ 13 ช่อง (ชื่อ อายุ น้ำหนัก ส่วนสูง BMI รอบเอว โรคประจำตัว ประวัติครอบครัว ผู้ติดต่อฉุกเฉิน ยา นัด อสม.ผู้ดูแล แผนสุขภาพ) ปัจจุบันชี้ไป "ตัวฉันในตอนนี้" ซึ่งมีเฉพาะค่าที่วัด ต้องการหน้าสรุปตาม journey |
| UI01-G3 | **นัดหมาย vs ประวัติการนัดหมาย**: ทั้งสองเมนูเปิดหน้านัดหมายเดียวกัน (มีทั้งนัดที่จะถึงและประวัติ) ใน sidebar จึง highlight พร้อมกันทั้งสองรายการ Canva แบ่ง "นัดหมาย / ประวัติการนัดหมาย / ตอบรับนัดหมาย" ต้องกำหนด journey แยก |
| UI01-G4 | **ติดตาม**: ชี้ไป "ข้อมูลการดูแล" (โปรแกรม/ครั้งที่/การติดตามผล แบบอ่าน) ยังไม่ได้กำหนดว่าคนไข้ทำ action อะไรได้ในเมนูนี้ |
| UI01-G5 | **โปรไฟล์**: Canva ระบุ บัญชีของฉัน, ครอบครัว, ที่อยู่ของฉัน, ประวัติการนัดหมาย, ประวัติการจัดบริการ, การตั้งค่า, เงื่อนไขและการใช้งาน ปัจจุบันเป็น hub เดิม (ข้อมูลของฉัน, ตั้งค่า, แจ้งปัญหา, รายการรอง) ไม่มี "ที่อยู่ของฉัน" และ "เงื่อนไขและการใช้งาน" |
| UI01-G6 | **ติดต่อเรา**: เป็น anchor บนหน้าหลัก ไม่ใช่หน้าแยก; active state ของ sidebar จึงไม่ highlight รายการนี้ |
| UI01-G7 | ชื่อ tab ของ browser ที่ `/app/more` ยังเป็น "เพิ่มเติม" (metadata คงที่) แม้หัวเรื่องหน้าจะเป็น "โปรไฟล์" |
| UI01-G8 | รายการที่ไม่ได้อยู่ในเมนูลูกค้า (คำขอรับบริการ, ข่าวสาร, สื่อความรู้) อยู่ใน hub โปรไฟล์/ sidebar ชั่วคราว รอยืนยันตำแหน่ง |

## 5. Verification

- `npm run typecheck` — ผ่าน
- `npm run lint` — 0 error (2 warning `no-img-element` เดิมในไฟล์ที่ไม่ได้แตะ)
- Focused: `src/components/app-shell`, `src/components/home`, `app/app/personal`, `app/app/layout.test.tsx`, `app/app/page.test.ts` — ผ่านทั้งหมด ยกเว้น 2 test ใน `app/app/page.test.ts` (Work Home ของ MEMBER/OSM) ซึ่ง **fail อยู่แล้วบน HEAD `c9ca50d` ก่อนงานนี้** (ตรวจด้วย `git stash`) และไม่เกี่ยวกับการเปลี่ยนแปลงนี้
- Full `npm run test` (หนึ่งครั้งหลัง diff นิ่ง): 5118 ผ่าน, 5 fail — ทั้ง 5 **fail บน HEAD `c9ca50d` เดิมเช่นกัน** (ตรวจด้วย `git stash`) และเป็นฝั่ง Work/OSM ที่งานนี้ไม่ได้แตะ:
  - `app/app/page.test.ts` × 2 (Work Home ของ MEMBER/OSM)
  - `app/app/more/page.test.tsx` × 2 (คาดว่า OSM เห็น `/app/patients/provision`)
  - `src/modules/line/adapters/line-messaging-client.test.ts` × 1 (OSM work entry)
- Test ที่ปรับตามพฤติกรรมใหม่ที่ตั้งใจ: section ของคนไข้, แท็บมือถือของคนไข้, Family อยู่ในเมนูบนของพื้นที่ส่วนตัว, หน้าหลักคนไข้
- Test ใหม่: เมนูลูกค้าตรงตามลำดับ/ข้อความในทุกชุดบทบาทที่มี PATIENT และไม่ปรากฏใน Work/ADMIN; active tab ของคนไข้บน deep link
- ไม่ได้ทดสอบใน browser จริง
