# บันทึกการย้าย Interaction ของงานคลินิกและผู้ป่วย — UX-D3

สถานะเริ่มต้น: UX-D3.0 preflight, 2026-11-02

เอกสารนี้เป็น migration ledger ของ UX-D3 ครอบคลุม Patient Baseline, การกำหนด อสม. หลายคน, ยาของฉัน, บันทึกอาหาร, บันทึกการออกกำลังกาย และเป้าหมายน้ำหนัก ระบุ interaction ปัจจุบัน, surface เป้าหมาย, ขอบเขต mutation/recovery และหลักฐานทดสอบ UX-D3 เปลี่ยนเฉพาะ interaction layer ไม่เปลี่ยน schema, migration, domain API, Server Action signature, transaction, authorization หรือกฎทางคลินิก ข้อความใหม่ทั้งหมดเป็นภาษาไทยและใช้คำศัพท์เดิมของ DEMI

## Preflight

- Branch: `main`; baseline HEAD: `fb38573cab014289545bfe3a38d3036c8270e83f` ตรงกับ HEAD ที่ review ล่าสุด ไม่มี commit ใหม่กว่า; worktree สะอาด
- อ่านแล้ว: `AGENTS.md`, `DESIGN.md`, `docs/ui/UX_D1_DIALOG_INTERACTION_STANDARD.md`, `docs/ui/UX_D2_OPERATIONAL_DIALOG_MIGRATION.md`, `docs/ui/PATIENT_WELLNESS_UX.md`, `ModalDialog`, `ConfirmDialog`, `ConfirmableActionForm`, `mutation-action-state.ts`, `UnknownOutcomeAlert`, `useDialogFormDraft`
- อ่าน transport/contract แล้ว: `createPatientBaselineAction` + `server-action-helpers.ts` (ปฏิเสธ field ที่ไม่รู้จักหรือซ้ำ และ write-once ผ่าน unique constraint → `CONFLICT`), `bulkAssignOsmToPatientsAction` (submission nonce, `ASSIGNED`/`REPLAYED`, atomic), medication actions (`expectedUpdatedAt`, `refreshRequired`, `loginHref`), meal/exercise actions (create nonce + receipt, `CREATE_CONSUMED`, update/delete `expectedUpdatedAt`, `DENIED`), weight goal actions (create nonce, `CREATE_CONSUMED`, update/remove `expectedUpdatedAt`)
- Baseline `npm run typecheck`: ผ่าน
- Baseline `npm run lint`: ผ่าน
- Baseline focused tests `npx vitest run src/components/ui src/modules/patient-baseline src/modules/patient-assignment app/app/patients/assign-osm app/app/personal/medications app/app/personal/wellness src/modules/medications src/modules/meals src/modules/exercises src/modules/weight-goals`: ผ่าน 71 files / 812 tests ไม่มีความล้มเหลวที่มีอยู่ก่อน UX-D3
- ยังไม่ได้ทำ browser QA; jsdom ไม่ยืนยัน native focus containment, layout, safe area หรือ virtual keyboard

## การตัดสินใจที่ยืนยันกับ Product Owner (2026-11-02)

1. **Journal row actions:** แยกปุ่ม “แก้ไข” (Edit Dialog) และ “ลบ” (Destructive Dialog) ในแต่ละรายการของประวัติอาหารและกิจกรรม แทนปุ่มเดียว “แก้ไข / ลบ” เพื่อไม่ให้มี dialog ซ้อน ฟอร์มบันทึกใหม่คงอยู่บนหน้าและ draft ไม่หายระหว่างแก้รายการอื่น
2. **Draft ใน Edit Dialog:** ปิด/ยกเลิก Edit Dialog เก็บค่าที่แก้ไว้ในหน่วยความจำของ component เท่านั้น เปิดรายการเดิมใน version เดิมอีกครั้งได้ค่าที่ค้างไว้; เมื่อรายการหรือ version เปลี่ยน, ได้ผลสำเร็จที่ยืนยันแล้ว หรือสิทธิ์ส่วนตัวถูกยกเลิก จะล้าง draft ไม่ใช้ localStorage/sessionStorage

## Migration ledger

ระดับความเสี่ยงประเมินผลกระทบของ interaction ต่อความถูกต้องของข้อมูลและสิ่งที่ผู้ใช้เห็น ไม่ได้เปลี่ยนการตัดสินสิทธิ์ฝั่ง server

### 1. Patient Baseline — `PatientBaselineForm`

- **ปัจจุบัน:** ฟอร์มคลินิกยาวหลาย section บนหน้า `/app/patients/[relationshipId]/baseline`; submit แรกถูก `preventDefault` แล้วเปิดกล่องยืนยัน inline (`confirmationRequested`) ท้ายหน้า มีเพียงข้อความทั่วไป
- **เป้าหมาย:** คงฟอร์มบนหน้าเดิมทั้งหมด; ปุ่ม “ตรวจสอบข้อมูลก่อนบันทึก” เปิด Review Dialog หลัง native validation ผ่านเท่านั้น แสดงบริบทผู้ป่วย/โรงพยาบาล/HN, วันที่บันทึก, ความหมายแบบอ่านอย่างเดียว และสรุปค่าที่กรอกจริงตาม section เดิม พร้อมแยก “ไม่ได้บันทึก” จากค่าที่บันทึก
- **เหตุผล:** การบันทึกเป็น write-once ผู้ใช้ต้องตรวจค่าจริงก่อน commit; การกรอกข้อมูลยาวต้องอยู่บนหน้าเพื่อพื้นที่และบริบท
- **Resource identity:** `patientHospitalRelationshipId` hidden field เดิม (จาก route) ไม่มี field ใหม่ที่มี `name` เพราะ server ปฏิเสธ field ที่ไม่รู้จัก
- **Authorization:** server ตรวจ actor และ policy เดิม (`getProtectedApplicationActor`, `createPatientBaseline`); UI ไม่ใช่ขอบเขตสิทธิ์
- **Mutation:** `createPatientBaselineAction` ผ่าน `useMutationActionState` และ `<form action>` เดิม; dialog render ภายใน form เดิม ไม่มี form ซ้อน ปุ่มยืนยันเป็น `type="submit"` ของ form เดิม
- **Idempotency/version:** ไม่มี nonce; write-once บังคับด้วย unique constraint → `CONFLICT`
- **Recovery:** unknown outcome ใช้ `resend` ของ payload `FormData` เดิม; dialog ปิดไม่ได้ระหว่าง pending และระหว่าง unknown; การยืนยันแบบปกติถูกปิดจนกว่าจะได้ผลยืนยัน
- **Draft:** controlled state เดิม; กลับไปแก้ไขไม่ล้างค่า, error ที่ยืนยันแล้วไม่ล้างค่า
- **Focus:** initial focus ที่ “กลับไปแก้ไข”; ปิดแล้วคืนไปปุ่มตรวจสอบ
- **Tests:** jsdom test ใหม่ครอบคลุม open ไม่ dispatch, สรุปค่าจริง/ค่าว่าง, กลับไปแก้, native validation, confirm ครั้งเดียว, validation/conflict, unknown + resend payload เดิม, success navigation, focus
- **Risk:** สูง (ข้อมูลคลินิก write-once)

### 2. การกำหนด อสม. หลายคน — `PatientOsmBulkAssignmentWorkspace`

- **ปัจจุบัน:** เลือกโรงพยาบาล/ค้นหา/เลือกผู้ป่วย/เลือก อสม. บนหน้า; “ตรวจสอบก่อนมอบหมาย” สร้าง nonce แล้วแสดง Panel ยืนยัน inline ที่ derive รายชื่อจาก `view` ปัจจุบัน
- **เป้าหมาย:** คงการเลือกทั้งหมดบนหน้า; แทน Panel ยืนยันด้วย Review Dialog ที่ใช้ snapshot ของ hospital ID, OSM, relationship IDs และ nonce ณ ตอนเปิด แสดงโรงพยาบาล, อสม., จำนวนผู้ป่วย, รายชื่อแบบมีขอบเขต และคำอธิบาย atomic
- **เหตุผล:** การมอบหมายมีผลต่อผู้ป่วยหลายคนพร้อมกัน ต้องทบทวน snapshot ที่แน่นอน
- **Resource identity:** `hospitalId`, `osmUserId`, `patientHospitalRelationshipId[]`, `submissionNonce` จาก snapshot ไม่ใช้ array index; ถ้า view เปลี่ยนจน snapshot ไม่ตรง (ผู้ป่วยใน snapshot หายจากรายการหรือโรงพยาบาลเปลี่ยน) ต้องกลับไปตรวจใหม่และปุ่มยืนยันถูกปิด
- **Authorization:** server ตรวจ hospital scope, eligibility ของ อสม. และผู้ป่วยเดิม
- **Mutation:** `bulkAssignOsmToPatientsAction` ผ่าน `assignAndNotify`, `inFlight` single-flight และ `UnconfirmedBulkAssignment` เดิม
- **Idempotency/version:** nonce หนึ่งค่าต่อการเปิด review หนึ่งครั้ง; resend ใช้ `FormData` object เดิมจาก hook; ไม่สร้าง nonce ใหม่เมื่อ unknown
- **Recovery:** unknown → dialog ปิดไม่ได้, “กลับไปแก้ไข”/ยืนยันถูกปิด, มีเฉพาะ “ตรวจสอบผลด้วยคำขอเดิม”
- **Draft:** การเลือกบนหน้าไม่ถูกล้างเมื่อยกเลิก
- **Focus:** initial focus “กลับไปแก้ไข”; ปิดแล้วคืนไปปุ่มตรวจสอบ หรือหัวข้อ “เลือก อสม.” ถ้าปุ่มหาย
- **Tests:** ปรับ `patient-osm-bulk-assignment-feedback.test.tsx` ให้ยืนยันผ่าน dialog และเพิ่ม guard, snapshot IDs, cancel ไม่ mutation, snapshot เปลี่ยน, double submit, unknown/resend nonce เดิม
- **Risk:** สูง (atomic หลายผู้ป่วย)

### 3. ยาของฉัน — `personal-medication-controls.tsx`, `personal-medication-workspace.tsx`

| งาน | ปัจจุบัน → เป้าหมาย | Mutation / identity / recovery | Focus / risk / tests |
| --- | --- | --- | --- |
| แก้ชื่อยาและข้อความประกอบ — `MedicationEditor item` | ฟอร์ม inline ในรายละเอียด → Edit Dialog; รายละเอียดอ่านอย่างเดียว (ชื่อ, ข้อความประกอบ, สถานะ) ยังแสดงนอก dialog | `updatePersonalMedicationAction`; `medicationId`, `expectedUpdatedAt` snapshot เมื่อ editor mount; field errors คงใน dialog; `CONFLICT`/`refreshRequired` ปิด dialog ได้แต่ feedback และการล็อกยังอยู่บนหน้า; `loginHref` แสดง session expired | คืน focus ปุ่มแก้ไข หรือหัวข้อรายละเอียดเมื่อ remount; กลาง; jsdom tests |
| เพิ่มรายการยา — `MedicationEditor` (create) | คง inline บนหน้า | create รวมเวลาเตือน, preset และข้อความ LINE eligibility; ไม่ใช่งาน bounded สั้น | ไม่มี dialog; คง tests เดิม |
| หยุดติดตาม — `MedicationStopForm` | ปุ่มเปิดกล่องยืนยัน inline → `ConfirmableActionForm` (destructive) | `stopPersonalMedicationAction`; `medicationId`, `expectedUpdatedAt`; ข้อความเดิม “สิ้นสุดการติดตามใน DEMI เท่านั้น ไม่เปลี่ยนการใช้ยาของคุณ…”; `refreshRequired` → outcome unknown (reload) | initial focus ยกเลิก; สูง; ทดสอบ cancel ไม่ mutation, payload, coordination |
| เวลาติดตามรายวัน — `MedicationScheduleEditor` | section inline → Task Dialog (`fullscreen` บนมือถือ); รายละเอียดแสดงเวลาที่บันทึกแบบอ่านอย่างเดียว | `replacePersonalMedicationSchedulesAction`; JSON `times` HH:mm เดิม, schema/duplicate/max เดิม, ไม่มี Date conversion | คืน focus ปุ่มแก้เวลา; กลาง; คง tests payload |
| Coordination | `SelectedMedicationForms` เป็นเจ้าของ `blocked`; ทุก form ใช้ object เดียว | เพิ่ม `submitting` เพื่อกันปิด dialog ระหว่าง pending และเก็บผลล่าสุดที่บล็อกไว้แสดงบนหน้าเมื่อ dialog ปิด | ไม่แทนด้วย controller ใหม่ |

### 4. บันทึกอาหารและการออกกำลังกาย — `personal-meal-*`, `personal-exercise-*`

| งาน | ปัจจุบัน → เป้าหมาย | Mutation / identity / recovery | Focus / risk / tests |
| --- | --- | --- | --- |
| บันทึกอาหารใหม่ (เลือกหมวด) | คง inline | quick entry ที่อนุมัติแล้ว; nonce จาก server/workspace; recovery `RETRY_ORIGINAL` snapshot เดิม | ไม่มี dialog |
| บันทึกกิจกรรมใหม่ (ค้นหา/กรอกเอง) | คง inline | เหมือนข้างต้น | ไม่มี dialog |
| แก้ไขรายการที่เลือก | Panel หลักสลับเป็น editor ของรายการ → Edit Dialog ระบุหมวด/กิจกรรมและวันที่เดิม; ฟอร์มบันทึกใหม่ยังอยู่บนหน้า | `update*Action`; `entryId`, `expectedUpdatedAt` จาก item ที่เลือก; `CONFLICT`/`UNCONFIRMED` → `REVIEW_REQUIRED` dialog ปิดไม่ได้ ต้อง “โหลดรายการล่าสุด” ภายใน dialog; success รอ read ล่าสุดแล้วปิด | คืน focus ปุ่มแก้ไขของรายการ หรือหัวข้อประวัติ; กลาง/สูง |
| ลบรายการ | ปุ่มลบในแผงแก้ไข + ยืนยัน inline → Destructive Dialog แยก แสดงหมวด/กิจกรรม วันที่ และรายละเอียด | `delete*Action`; `entryId`, `expectedUpdatedAt`; ลบจากรายการหลัง server ยืนยันเท่านั้น และ read ใหม่เพื่อ aggregate | initial focus ยกเลิก; คืนหัวข้อประวัติเมื่อแถวหาย; สูง |
| Nonce ของ create | regenerate หลัง mutation ใดก็ได้ที่ยืนยันแล้ว | regenerate เฉพาะหลัง create ที่ยืนยันแล้วหรือ “เริ่มบันทึกใหม่” เพราะ create editor ยังแสดงอยู่ระหว่างแก้รายการอื่น การแก้/ลบสำเร็จจึงไม่ล้าง draft หรือเปลี่ยน intent ของ create | ทดสอบ create draft คงอยู่ |
| Private authority | `clearPrivateState` ล้าง page/selected/nonce | เพิ่มการล้าง dialog และ retained draft; ผลจาก generation เก่าถูกละเว้นตามเดิม | ทดสอบ invalidation |

### 5. เป้าหมายน้ำหนัก — `personal-weight-goal-*`

| งาน | ปัจจุบัน → เป้าหมาย | Mutation / identity / recovery | Focus / risk / tests |
| --- | --- | --- | --- |
| ตั้งเป้าหมาย (create) | คง inline | slider + “ใช้ระยะเวลานี้” + วันที่แก้เอง; nonce/`nonceClaimed`/`CREATE_CONSUMED`/`requiresCurrentGoalReview` เดิม | ไม่มี dialog |
| แก้ไขเป้าหมาย | editor inline ใต้ readback → Edit Dialog; readback ยังแสดงบนหน้า | `updatePersonalWeightGoalAction`; `goalId`, `expectedUpdatedAt`; เปิด dialog ไม่เปลี่ยนวันที่; `CONFLICT`/`UNCONFIRMED` (`lockedForReview`) → dialog ปิดไม่ได้ ต้องโหลดข้อมูลล่าสุดภายใน dialog | คืน focus ปุ่มแก้ไข; กลาง |
| ลบเป้าหมาย | ยืนยัน inline (focus ที่ปุ่มลบ) → Destructive Dialog (focus ที่ยกเลิก) ระบุน้ำหนัก/วันที่เป้าหมาย และย้ำว่าไม่ลบบันทึกน้ำหนักที่วัดเอง | `removePersonalWeightGoalAction`; `goalId`, `expectedUpdatedAt`; lock/review เหมือนแก้ไข | คืน focus ปุ่มลบ หรือปุ่มตั้งเป้าหมายเมื่อเป้าหมายถูกลบ; กลาง/สูง |

## Workflow ที่คงไว้โดยตั้งใจ

- ฟอร์ม Patient Baseline ทั้งหมดอยู่บนหน้าเฉพาะ (มีเพียงขั้นทบทวนเป็น dialog)
- การเลือกโรงพยาบาล, ค้นหา/โหลดเพิ่ม และ checkbox ผู้ป่วย/เลือก อสม. ใน bulk assignment
- การเพิ่มรายการยา (รวมเวลาเตือนและ preset)
- Quick entry ของอาหารและกิจกรรม รวม date navigation และสรุปรายวัน
- การตั้งเป้าหมายน้ำหนักใหม่ (slider/วันที่)
- รายละเอียดยาที่หยุดติดตามแล้ว (อ่านอย่างเดียว)

## Invariants ที่ใช้กับทุก slice

- ไม่เปลี่ยน Server Action signature, schema, permissions, scope, version, nonce, eligibility, audit, database contract หรือกฎทางคลินิก
- Dialog ที่เป็นฟอร์มใช้ form เดียว ไม่มี form ซ้อน ไม่มี dialog ซ้อน ไม่เพิ่ม field ที่มี `name` นอก contract เดิม
- ปิดหลังผลที่ยืนยันแล้วเท่านั้น; pending ปิดไม่ได้; unknown/conflict ที่ต้องทบทวนคงคำแนะนำและ recovery ของเจ้าของ mutation
- ไม่สร้าง nonce ใหม่เมื่อเปิด/ปิด dialog หรือเมื่อผลยังไม่ยืนยัน
- ไม่เก็บ draft ทางคลินิกหรือส่วนตัวใน browser storage; draft ที่เก็บไว้อยู่ใน memory ของ component และผูกกับ resource ID + version
- Browser QA ต้องตรวจ 320px, mobile portrait/landscape, tablet และ desktop เมื่อ environment พร้อม หากทำไม่ได้ต้องรายงานเป็น unverified

## ความคืบหน้าตาม slice

- UX-D3.0 inventory: commit `21fbba6b`.
- UX-D3.1 Patient Baseline: แทนกล่องยืนยัน inline ด้วย Review Dialog ภายใน form เดิม (ไม่มี form ซ้อน); เปิดหลัง native validation ผ่าน ไม่ dispatch; สรุปค่าตาม section ด้วย label ชุดเดียวกับฟอร์มและแสดง “ไม่ได้บันทึก” สำหรับช่องว่าง; confirmed error ปิด dialog คง draft และย้าย focus ไปที่ข้อความผิดพลาด; unknown ล็อก dialog และมีเฉพาะ resend ของ `FormData` เดิม; single-flight lock ปลดเมื่อ pending จบ (mutation check ยืนยันว่า test จับ submit ซ้ำที่ `useActionState` เข้าคิวไว้). Focused: `src/modules/patient-baseline` ผ่าน 8 files / 53 tests; targeted ESLint และ `npm run typecheck` ผ่าน.
- UX-D3.2 Bulk OSM assignment: แทน Panel ยืนยัน inline ด้วย Review Dialog ที่ส่ง payload จาก snapshot (`hospitalId`, `osmUserId`, relationship IDs ตามลำดับที่เลือก, `submissionNonce`) ที่สร้างตอนเปิด review; nonce ใหม่ต่อการเปิด review หนึ่งครั้งและคงเดิมเมื่อยืนยันซ้ำหลัง confirmed error หรือ resend; รายชื่อในรายการแสดงไม่เกิน 8 คนพร้อมจำนวนที่เหลือ; ถ้าโรงพยาบาลหรือรายการผู้ป่วยที่ authoritative เปลี่ยนจน snapshot ไม่ตรง ปุ่มยืนยันถูกปิดและต้องกลับไปตรวจใหม่; `action()` ปฏิเสธการส่งเมื่อ unknown หรือ stale แม้เรียก `requestSubmit()` ตรง (เดิมกันได้เฉพาะปุ่มที่ disabled); สำเร็จแล้วปิด dialog และ focus ไปที่ผลลัพธ์. Focused: `app/app/patients/assign-osm` + `src/modules/patient-assignment` ผ่าน 12 files / 126 tests; targeted ESLint และ typecheck ผ่าน.
- UX-D3.3 ยาของฉัน: รายละเอียดรายการ ACTIVE เป็นแบบอ่านอย่างเดียว (ข้อความประกอบ, เวลาที่บันทึก); แก้ชื่อ/ข้อความประกอบเป็น Edit Dialog, เวลาติดตามเป็น Task Dialog (`fullscreen` บนมือถือ), หยุดติดตามเป็น `ConfirmableActionForm` แบบ destructive ที่คงข้อความเดิมและ focus แรกที่ยกเลิก; การเพิ่มรายการยาคงอยู่บนหน้า. `SelectedMedicationForms` ยังเป็นเจ้าของ `blocked` และเพิ่ม `submitting` (ปิด dialog ไม่ได้ระหว่าง pending) และ notice ที่คง CONFLICT/`refreshRequired`/`loginHref` ไว้บนหน้าหลังปิด dialog. เพิ่ม `useRetainedDraft` (draft ใน memory ผูก `medicationId:updatedAt`; ล้างเมื่อสำเร็จหรือ version เปลี่ยน). เพิ่ม `onSubmitted` และ `pendingLabel` ให้ `ConfirmableActionForm`: พบว่าการเรียก `coordination.onSubmit()` ภายใน action ทำให้ `setBlocked` ถูกเลื่อนไปจนกว่า transition จะจบ จึงเรียกแบบ synchronous หลัง dispatch แทน. ย้าย tests ที่ผูกกับ hook slot/inline confirmation ไปเป็น jsdom (`personal-medication-dialogs.test.tsx`). JSON `times`, schema, duplicate/max และ Asia/Bangkok semantics ไม่เปลี่ยน. Focused: `src/components/ui` + `app/app/personal/medications` + `src/modules/medications` ผ่าน 27 files / 363 tests; targeted ESLint และ typecheck ผ่าน.
- UX-D3.4 บันทึกอาหารและกิจกรรม: quick entry (หมวดอาหาร, ค้นหา/กรอกกิจกรรม) คงอยู่บนหน้า; แต่ละรายการในประวัติมีปุ่ม “แก้ไข” (Edit Dialog, `fullscreen` บนมือถือ, ระบุหมวด/กิจกรรมและวันที่บันทึก) และ “ลบ” (Destructive Dialog แสดง readback ของรายการ, focus แรกที่ยกเลิก) แยกกัน จึงไม่มี dialog ซ้อน. `selected` ยังเป็นตัวแยกผลของ entry ออกจาก create ตาม state machine เดิม; `REVIEW_REQUIRED` ทำให้ dialog ปิดไม่ได้และมี “โหลดรายการล่าสุด” ภายใน dialog; การลบเอาแถวออกหลัง server ยืนยันแล้วเท่านั้นและ read วันเดิมใหม่เพื่อ aggregate. Nonce ของ create ถูกสร้างใหม่เฉพาะหลัง create ที่ยืนยันแล้ว (หรือ “เริ่มบันทึกใหม่”) เพื่อไม่ทำลาย create draft/intent ระหว่างแก้หรือลบรายการอื่น. พบช่องโหว่เดิมสองข้อและแก้ใน interaction layer: (1) `onPending(true)` ถูกเรียกก่อน `await` ใน action transition ทำให้ `saving` ไม่ commit จนกว่า request จะจบ จึงเพิ่ม `onSubmitting` จาก native submit (urgent) เพื่อกันปิด dialog และล็อกปุ่มระหว่าง pending; (2) submit ซ้ำเร็ว ๆ ถูก `useActionState` เข้าคิวเป็น request ที่สอง จึงเพิ่ม single-flight guard ใน `useMealAction`/`useExerciseAction` (mutation check ยืนยันว่า test จับได้). `clearPrivateState` ล้าง retained draft และปิด dialog; pagehide ล้าง dialog ผ่าน shared authority เดิม. Focused: `app/app/personal/wellness` + `src/modules/meals` + `src/modules/exercises` + `src/components/ui` ผ่าน 31 files / 313 tests; targeted ESLint และ typecheck ผ่าน.
- UX-D3.5 เป้าหมายน้ำหนัก: readback ของเป้าหมายปัจจุบันคงอยู่บนหน้า; “แก้ไข” เปิด Edit Dialog (`fullscreen` บนมือถือ) ที่เริ่มจากวันที่เป้าหมายที่บันทึกไว้ และเปลี่ยนวันที่เฉพาะเมื่อกด “ใช้ระยะเวลานี้” หรือแก้วันที่เอง; “ลบเป้าหมาย” เปิด Destructive Dialog ที่แสดงน้ำหนัก/วันที่เป้าหมาย, ระบุว่าไม่ลบบันทึกน้ำหนักที่วัดเองใน “ตัวฉันในตอนนี้” (ตรวจแล้วว่า `removePersonalWeightGoal` ลบเฉพาะ `personalWeightGoal`) และให้ focus แรกที่ยกเลิก (เดิม focus ที่ปุ่มลบ). การตั้งเป้าหมายใหม่, nonce/`nonceClaimed`, `CREATE_CONSUMED` และ `requiresCurrentGoalReview` คงเดิม. `lockedForReview` ทำให้ dialog ปิดไม่ได้และมี “โหลดข้อมูลล่าสุด” ภายใน dialog. ใช้การแก้ urgent pending + single-flight แบบเดียวกับ D3.4 ใน `useWeightGoalAction`; ตัด logic คืน focus เองของ remove (`restoreRemoveFocus`) เพราะ `ModalDialog` คืน focus ให้ปุ่มเปิด หรือหัวข้อ “เป้าหมายน้ำหนัก” เมื่อเป้าหมายถูกลบ. ปุ่มเปิดไม่ถูก disable ระหว่าง dialog เปิด (พื้นหลัง inert อยู่แล้ว) เพื่อให้คืน focus ได้. Focused: `app/app/personal/wellness` + `src/modules/weight-goals` ผ่าน 22 files / 199 tests; targeted ESLint และ typecheck ผ่าน.
- UX-D3.6 regression และ closeout: ดูหัวข้อถัดไป

## UX-D3.6 Regression และ closeout

### สรุป surface

- **ย้ายแล้ว:** Patient Baseline review (Review Dialog ใน form เดิม); bulk OSM assignment review (Review Dialog ที่ส่ง snapshot); ยา: แก้ชื่อ/ข้อความประกอบ (Edit Dialog), เวลาติดตาม (Task Dialog), หยุดติดตาม (`ConfirmableActionForm` destructive); อาหาร/กิจกรรม: แก้ไขรายการ (Edit Dialog), ลบรายการ (Destructive Dialog); เป้าหมายน้ำหนัก: แก้ไข (Edit Dialog), ลบ (Destructive Dialog)
- **คงไว้บนหน้า:** ฟอร์ม Patient Baseline ทั้งหมด; การเลือกโรงพยาบาล/ค้นหา/เลือกผู้ป่วยและ อสม.; การเพิ่มรายการยา (รวม preset และเวลาเตือน); quick entry ของอาหารและกิจกรรม รวม date navigation และสรุปรายวัน; การตั้งเป้าหมายน้ำหนักใหม่; รายละเอียดยาที่หยุดติดตามแล้ว
- **ไม่มีการเบี่ยงจากแผนที่ทำให้ invariant อ่อนลง** การเปลี่ยนจากแผน: (1) ปุ่ม “แก้ไข / ลบ” ในประวัติอาหาร/กิจกรรมแยกเป็นสองปุ่มตามที่ Product Owner ยืนยัน; (2) แก้ช่องโหว่ interaction เดิมที่พบระหว่าง migration (ดู Findings)

### Cross-feature audit

- Nested form/dialog: `app/app/ux-d3-dialog-structure.test.tsx` เปิด dialog ของทั้ง 11 surface และยืนยันว่ามี `<dialog>` เดียว, ไม่มี `dialog dialog`, ไม่มี `form form`, ชื่อ dialog มาจาก `aria-labelledby`, initial focus อยู่ใน dialog, การเปิดไม่ dispatch mutation และปิดตอน idle แล้ว focus กลับมาอยู่ในหน้า (ไม่ตกไปที่ `body`). Baseline dialog อยู่ภายใน form เดิมโดยไม่มี form ภายใน dialog; dialog อื่นมี form ของตัวเองเพียงชุดเดียว
- FormData/hidden fields: ทดสอบ payload จริงของทุก write (baseline 17 field ไม่มี field ใหม่/ซ้ำ; bulk `hospitalId`/`osmUserId`/relationship IDs/nonce จาก snapshot; ยา `medicationId`/`expectedUpdatedAt`/`times` JSON; journal `entryId`/`expectedUpdatedAt`; goal `goalId`/`expectedUpdatedAt`/`targetDate`)
- Nonce: ไม่มี nonce ใหม่เมื่อเปิด/ปิด dialog; bulk สร้าง nonce ต่อการเปิด review และ resend ใช้ `FormData` object เดิม; journal create nonce สร้างใหม่เฉพาะหลัง create ที่ยืนยันแล้วหรือ “เริ่มบันทึกใหม่”; weight goal nonce lifecycle เดิม
- Dismissal: dialog ปิดไม่ได้ระหว่าง pending และระหว่าง outcome ที่ต้องทบทวน (baseline/bulk unknown, journal `REVIEW_REQUIRED`, goal `lockedForReview`); medication CONFLICT/`refreshRequired`/`loginHref` ปิด dialog ได้แต่ข้อความและการล็อกยังอยู่บนหน้า
- Stale context: bulk snapshot stale ปิดการยืนยัน; draft ที่เก็บไว้ผูกกับ resource ID + version จึงไม่ข้ามรายการหรือ version
- Cross-resource leakage: ผลของ journal entry ผูกกับ `selected` ตาม state machine เดิม; การแยกปุ่มแก้ไข/ลบไม่เปลี่ยนการจัดประเภทผล create/entry
- Wellness dialog render อยู่ภายใน `<fieldset disabled={pending}>` ของหน้าสุขภาพ: fieldset จะ disable control ใน dialog ด้วยระหว่างอ่านข้อมูลวันใหม่ แต่ไม่เกิดขณะ dialog เปิดเพราะ date form อยู่หลัง modal และ date change ถูกล็อกระหว่างงานเขียน

### Mutation matrix (subset ที่ใช้ได้)

| Feature | ครอบคลุม | ไม่ครอบคลุม / เหตุผล |
| --- | --- | --- |
| Patient Baseline | 1–4, 6–14, 17 (navigation หลังสำเร็จ), 18 | 5: หน้าเดียวต่อ relationship เดียว; 15/16: ระหว่าง pending ปิดไม่ได้ และ unknown มี beforeunload guard ของ `UnknownOutcomeAlert` แต่ browser navigation ยังไม่ได้ตรวจใน browser จริง |
| Bulk OSM | 1–5, 7–14, 15 (เปลี่ยนโรงพยาบาลระหว่าง pending — test เดิม), 16 (unmount — test เดิม), 17, 18 | 6: dialog มีเฉพาะ hidden fields |
| ยา: แก้ข้อความ/เวลา | 1–5, 7–11 (CONFLICT), 13 (thrown → `refreshRequired`), 18 + session expired | 6: `required` ของชื่อยาเป็น native และไม่ได้ทดสอบแยกใน jsdom; 12: DENIED ของ SELF เป็น ERROR message เดียวกับ forbidden ใน test SSR เดิม; 14: recovery เป็น reload ไม่มี resend; 16/17: success remount ด้วย key `id:updatedAt` |
| ยา: หยุดติดตาม | 1, 2, 7, 8, 9, 13, 18 | 3–6: ไม่มี field ให้แก้; 14: reload-based |
| อาหาร/กิจกรรม: แก้/ลบ | 1–5, 7–9, 11 และ 13 (`REVIEW_REQUIRED` — test เดิมปรับใหม่), 12 (DENIED), 16 (late response หลัง invalidation), 17 (ลบแล้วแถวหาย → focus หัวข้อประวัติ), 18 + pagehide | 6/10: validation ของ field เดิมครอบคลุมโดย test SSR เดิม; 14: entry update/delete ใช้ reload review ไม่มี retry |
| เป้าหมายน้ำหนัก: แก้/ลบ | 1–4, 7–11, 12 (DENIED), 13 (UNCONFIRMED), 16 (late response), 17 (ลบแล้ว → focus หัวข้อ), 18 + CREATE_CONSUMED และ current-goal reconciliation | 5: มีเป้าหมายได้ครั้งละหนึ่ง; 14: reload-based |

### Clinical review

- Baseline ยัง write-once (unique constraint และ server action เดิม); ไม่มี field ใหม่; ช่องว่างแสดง “ไม่ได้บันทึก” และส่งเป็นค่าว่างตามเดิม ไม่แปลงเป็นศูนย์; review แสดงค่าที่กรอกตามตัวอักษร ไม่คำนวณ BMI หรือแปลผล
- Bulk assignment ยัง atomic; ไม่มี partial-success handling ใหม่
- ข้อความหยุดติดตามคงเดิม: สิ้นสุดการติดตามใน DEMI เท่านั้น ไม่เปลี่ยนการใช้ยา (test ยืนยันว่าไม่มีคำว่า “หยุดยา/หยุดรับประทาน”)
- Aggregate รายวันมาจาก read ของ server หลัง write ที่ยืนยันแล้วเท่านั้น; ไม่มี optimistic deletion
- การลบเป้าหมายแตะเฉพาะ `personalWeightGoal`; ไม่มีการเปลี่ยน Patient SELF scope, caregiver หรือ staff access

### Accessibility และ focus

- ทุก dialog ใช้ native `ModalDialog` (`showModal`) พร้อม title; confirmation/destructive dialog ให้ focus แรกที่ “ยกเลิก”/“กลับไปแก้ไข”; edit dialog ให้ focus ที่ title (หรือ field แรกของกิจกรรมตามพฤติกรรมเดิม)
- Focus กลับไปที่ trigger ที่ระบุชัดเจน ไม่พึ่ง previous focus เพียงอย่างเดียว (บาง browser ไม่ focus ปุ่มเมื่อคลิก — พบจาก structure test ที่ปุ่มหยุดติดตามและแก้แล้ว); เมื่อ trigger หายหรือถูกล็อกใช้หัวข้อที่ focus ได้ (`medication-detail-heading`, หัวข้อประวัติ, หัวข้อ “เป้าหมายน้ำหนัก”, ข้อความผลการมอบหมาย, ข้อความผิดพลาดของ baseline)
- ไม่มี focus callback ซ้อน: journal ย้าย focus ไปหัวข้อ editor หลัง mutation เฉพาะ create ที่ยืนยันแล้ว; remove goal ใช้การคืน focus ของ `ModalDialog` แทน effect เดิม
- Error ประกาศผ่าน `Alert` (`role="alert"`/`status`) และ `aria-invalid`/`aria-describedby` เดิมของ field

### Responsive

- dialog ที่มี field หลายช่องหรือรายการยาวใช้ `size="fullscreen"` (เต็มจอบนมือถือ, กล่อง 64rem บนจอใหญ่, safe-area padding และ body เลื่อนแยกจาก footer); confirmation ใช้ `compact`
- ยังไม่ได้ตรวจใน browser จริง: 320px, 390px portrait, mobile landscape, tablet, desktop, safe area, bottom navigation และ software keyboard

### Verification

- Focused รอบสุดท้าย (`src/components/ui`, `src/modules/patient-baseline`, `src/modules/patient-assignment`, `app/app/patients`, `app/app/personal/medications`, `app/app/personal/wellness`, `src/modules/medications`, `src/modules/meals`, `src/modules/exercises`, `src/modules/weight-goals`, `app/app/ux-d3-dialog-structure.test.tsx`): ผ่าน 109 files / 1,202 tests
- `npm run typecheck`: ผ่าน; `npm run lint`: ผ่าน
- `npm test` รอบแรก (HEAD `c6d44e25`): ผ่าน 573 files / 6,395 tests, exit 0; รอบสุดท้ายหลังแก้ D3.6: ผ่าน 574 files / 6,408 tests, exit 0. stderr มี JSDOM `navigation (except hash changes)` จาก test เดิมที่เรียก `Location.replace` ซึ่งไม่ทำให้ test fail
- ไม่ได้รัน `npm run test:integration`: UX-D3 ไม่แก้ service, schema หรือ database contract และไม่ได้ยืนยัน disposable integration database ในรอบนี้
- Impeccable: PostToolUse hook สแกนไฟล์ที่เขียนผ่าน Write tool (`baseline-form.tsx`, `personal-meal-workspace.tsx` และ test files) ไม่พบปัญหา; ไม่พบ CLI `impeccable detect` บนเครื่องนี้ จึงไม่ได้สแกนไฟล์ที่แก้ผ่าน script
- Browser QA: ไม่ได้ทำ ต้องใช้บัญชีที่ sign in แล้วและข้อมูลทดสอบ จึงยังไม่ยืนยัน native focus containment, Tab/Escape ใน browser, layout และ virtual keyboard

### Findings

- **P0:** ไม่พบ
- **P1 (แก้แล้วใน slice):** journal และ weight goal เรียก `onPending(true)` ก่อน `await` ภายใน action transition ทำให้ `saving` ไม่ commit จนกว่า request จะจบ จึงปิด dialog ได้ระหว่าง pending — แก้ด้วย `onSubmitting` จาก native submit; `useActionState` เข้าคิว submit ซ้ำเร็ว ๆ เป็น request ที่สองใน journal, weight goal, medication editors และ baseline — แก้ด้วย single-flight lock ที่ปลดเมื่อ pending จบ (mutation check ยืนยันว่า test จับได้ทุกจุด)
- **P2 (แก้แล้ว):** bulk `action()` รับ `requestSubmit()` ตรงขณะ unknown; หยุดติดตามยาคืน focus ไป `body` เมื่อ browser ไม่ focus ปุ่มตอนคลิก; การหยุดติดตามล็อก editor อื่นช้าเพราะ `coordination.onSubmit()` อยู่ใน transition — แก้ด้วย `onSubmitted` ของ `ConfirmableActionForm`
- **P2 (คงเหลือ):** ยังไม่ได้ทำ browser/device QA; ไม่ได้รัน impeccable detector แบบเต็ม; baseline resend ที่ได้ `CONFLICT` “มีอยู่แล้ว” หมายความว่าคำขอแรกบันทึกแล้ว แต่ UI ยังแสดงเป็นข้อผิดพลาดตามพฤติกรรมเดิม (เปลี่ยนการตีความเป็นเรื่อง domain นอกขอบเขต UX-D3)

### Readiness

พร้อมให้ review UX-D3 จากมุม code และ automated checks; ต้องทำ browser/device QA สำหรับรายการที่ยัง unverified ก่อนสรุปว่าผ่าน visual/mobile accessibility validation
