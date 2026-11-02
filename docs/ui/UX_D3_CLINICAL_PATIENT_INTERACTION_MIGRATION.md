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
