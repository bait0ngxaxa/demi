# Flexible service rounds FR-2–FR-7 — delivery and verification

วันที่ตัดสินใจผลิตภัณฑ์: 2026-10-28 · สาขา `feat/flexible-service-rounds` · ฐาน `431b8c5` · กติกา [ADR-0022](../adr/0022-plan-driven-service-rounds.md)

## Commits และผลตรวจ

| เฟส | Commit | ผลลัพธ์ | Migration |
|---|---|---|---|
| FR-2 | `1c026c2` | แก้แผน, CUSTOM, จบรอบเมื่อมี DONE, auto skip, เพิ่มรอบ, Follow-up ตามรอบเปิด, Final และ health-path gate | `20261126100000_followup_open_round_guard`, `20261126101000_round_plan_request_receipts` |
| FR-3 | `4e0e0cb` | ตัวแก้แผนเจ้าหน้าที่, เพิ่มกลับ, CUSTOM, confirmation แยกกลุ่ม, เพิ่มรอบและแผนว่าง, พื้นที่ provenance | ไม่มี |
| FR-4 | `4fae29b` | ผู้ป่วยบันทึก 9 ประเภทรายการผ่านบริการเดิม, ตรวจสิทธิ์ปัจจุบันจาก DB, nonce receipt, เจ้าหน้าที่บันทึกซ้ำ, provenance และฟอร์มร่วม | `20261127100000_round_recording_receipts` |
| FR-5 | `afa7ca6` | รายงานทุกครั้งที่เปิด, จำนวนรอบเพิ่มเติมที่จบ, done/planned, NOT_DONE_AT_CLOSE, จำนวนผู้ป่วยบันทึกเอง; Excel คงคอลัมน์เดิมและเพิ่มคอลัมน์ใหม่ | ไม่มี |
| FR-6 | `dcb979f` | ลบขอบเขตรอบเก่าที่ไม่ใช้, อ่านรายการเครื่องมือจากแผน active, ปรับข้อความ/เอกสาร, เส้นทางบริการถึงรายงานและ concurrency | ไม่มี |
| FR-7 | commit สุดท้ายของสาขา (ชื่อ `fix(rounds): protect staff records from patient overwrite (FR-7)`) | ผู้ป่วยบันทึกทับรายการของเจ้าหน้าที่/อสม. ไม่ได้ (vitals และเครื่องมือ 4 ชนิด), เจ้าหน้าที่บันทึกทับ vitals ของผู้ป่วยแทนที่ทั้งชุดพร้อม audit `replacedPatientRecord`, receipt lookup ใช้ partial unique index พร้อม action predicate, policy รับค่าที่คำนวณจริง, จัดรูปแบบโค้ด FR-2–FR-6 | แก้ `20261127100000_round_recording_receipts` เอา `BEGIN;`/`COMMIT;` ออก (ความหมายเดิม) |

| เฟส | คำสั่ง lint | คำสั่ง typecheck | คำสั่ง unit ชุดเต็ม | คำสั่ง integration ชุดเต็ม |
|---|---|---|---|---|
| FR-2 | `npm run lint` ผ่าน | `npm run typecheck` ผ่าน | `npm test` ผ่าน 533 ไฟล์ / 5,932 เทส | `npm run test:integration` ผ่าน 71 ไฟล์ / 1,287 เทส |
| FR-3 | `npm run lint` ผ่าน | `npm run typecheck` ผ่าน | `npm test -- --maxWorkers=2` ผ่าน 534 ไฟล์ / 5,939 เทส | `npm run test:integration` ผ่าน 71 ไฟล์ / 1,287 เทส |
| FR-4 | `npm run lint` ผ่าน | `npm run typecheck` ผ่าน | `npm test -- --maxWorkers=2` ผ่าน 534 ไฟล์ / 5,957 เทส | `npm run test:integration` ผ่าน 71 ไฟล์ / 1,293 เทส |
| FR-5 | `npm run lint` ผ่าน | `npm run typecheck` ผ่าน | `npm test -- --maxWorkers=2` ผ่าน 535 ไฟล์ / 5,962 เทส | `npm run test:integration` ผ่าน 71 ไฟล์ / 1,296 เทส |
| FR-6 | `npm run lint` ผ่าน | `npm run typecheck` ผ่าน | `npm test -- --maxWorkers=2` ผ่าน 535 ไฟล์ / 5,965 เทส | `npm run test:integration` ผ่าน 71 ไฟล์ / 1,299 เทส |
| FR-7 | `npm run lint` ผ่าน | `npm run typecheck` ผ่าน | `npm test -- --maxWorkers=2` ผ่าน 536 ไฟล์ / 5,970 เทส | `npm run test:integration` ผ่าน 71 ไฟล์ / 1,304 เทส |

FR-4 หลังชุดเต็มพบชนิด error ของเจ้าหน้าที่เปลี่ยนใน branch ปฏิเสธสิทธิ์ จึงคืน error เดิม และตรวจ `npm test -- src/modules/patient-program/services/patient-program-lifecycle-service.test.ts src/modules/patient-program/services/patient-program-service-one-service.test.ts src/modules/patient-program-rounds/services/round-service.test.ts src/modules/screening/services/screening-service.test.ts --maxWorkers=2` ผ่าน 3 ไฟล์ที่ตรง filter / 48 เทส, `npx eslint src/modules/patient-program/services/patient-program-lifecycle-service.ts src/modules/screening/transport/server-actions.ts src/modules/screening/transport/server-actions.test.ts` ผ่าน, `npm run typecheck` ผ่าน และ integration ชุดเต็มยืนยันผ่านหลังแก้ โดยไม่เปลี่ยนสิทธิ์หรือผ่อน assertions

## สภาพแวดล้อมและคำสั่งตรวจเฉพาะจุด

- Unit/lint/typecheck รันใน Windows workspace จริง Integration ตั้งแต่ FR-3 รันในสำเนาตรวจแยกใน WSL Ubuntu, Node 24.22.1, Prisma 6.19.3 และ dependency จาก lockfile เดียวกัน ตรวจ SHA-256 ของไฟล์ที่เปลี่ยนให้ตรง workspace ก่อน commit (FR-3: 13, FR-4: 42, FR-5: 21, FR-6: 26 ไฟล์) ไม่มีการเปลี่ยน dependency หรือ timeout/assertion เพื่อทำให้ผ่าน
- PostgreSQL 17 เป็นฐาน integration ที่พอร์ต 55432 มี disposable-database marker ผ่าน runner ของ repo ใช้ `npm run test:db:up`; การ reset ก่อนหน้ารันเฉพาะ `npm run test:db:reset` ของฐานนี้ Migration guard ใช้ข้อยืนยันว่าไม่มีข้อมูลผู้ใช้จริงใน dev/demo; ไม่ได้แต่งประวัติหรือย้ายข้อมูลจริง
- ค่าทดสอบ LINE ตั้งใน process ของ integration เท่านั้น: `DEMI_LINE_LOGIN_CHANNEL_ID=1234567890` และ `DEMI_LINE_PUBLIC_ORIGIN=https://demi-integration.example.test` ไม่ใช่ credentials จริง ไม่ได้เปิด `DEMI_ALLOW_TEST_NATIONAL_IDS`
- `npm run prisma:migrations:check` ผ่าน: FR-2 มี 108 migrations; FR-4 มี 109 migrations การรัน integration deploy migrations ผ่าน runner ทุกเฟส
- Windows broad run เคยมี timeout ใน source scanners / subprocess และ integration ภายใต้ resource contention จึงแยก reproduce และใช้ `--maxWorkers=2` สำหรับ unit และ WSL สำหรับ integration ไม่มีการผ่อน timeout หรือข้ามเทส
- แก้เทสเก่าที่ใช้ window alert/confirm ให้กดและตรวจ dialog จริงตาม pattern ปัจจุบัน เพิ่ม dialog mock ที่รองรับ showModal/close; assertions ด้านความปลอดภัยยังคงอยู่ แก้ fixture เลขบัตร 4 จุดให้ checksum ถูกต้อง และรอคิว query-log ของ Prisma ก่อนตรวจจำนวน SQL (ยังตรวจ ≤12 และเท่ากันทั้งสองหน้า)
- ความล้มเหลวที่แจ้งไว้ (`line-workflow-issuance` เมื่อไม่มี LINE env และ `line/rich-menu/assets`) ไม่เหลือ failure ในผลชุดเต็มที่รายงาน มี stderr จาก jsdom ที่ไม่รองรับ navigation แต่เทสผ่าน

คำสั่งตรวจเฉพาะจุดที่ใช้กับ implementation สุดท้าย:

```text
npm test -- src/modules/patient-program-rounds src/modules/patient-program/services/patient-program-service-one src/modules/patient-program/transport/patient-program-service-one src/modules/screening app/app/personal/patient-self-program-rounds-view.test.tsx --maxWorkers=2
npm run test:integration:focused -- tests/integration/patient-program-rounds.integration.test.ts
npm run test:integration:focused -- tests/integration/patient-program.integration.test.ts
npm test -- src/modules/reporting app/app/hospitals/reporting src/modules/patient-program-rounds/services/round-query-service.test.ts --maxWorkers=2
npm run test:integration:focused -- tests/integration/program-reporting.integration.test.ts
npm run test:integration:focused -- tests/integration/hospital-reporting.integration.test.ts
npm run test:integration:focused -- tests/integration/report-pipeline-e2e.integration.test.ts
npm test -- src/modules/patient-program-rounds src/modules/patient-program/services/patient-program-service-one-query-service.test.ts src/modules/patient-program/services/patient-program-query-service.test.ts src/modules/reporting/services/hospital-report-workbook-service.test.ts app/app/patients app/app/personal/patient-self-program-rounds-view.test.tsx --maxWorkers=2
npm test -- src/modules/reporting/projections/round-report-projection.test.ts src/modules/patient-program-rounds/domain/round-steps.test.ts --maxWorkers=2
git diff --check
```

คำสั่ง focused integration ของ runner รับหนึ่ง path ต่อครั้ง จึงรันรายงานทั้งสามไฟล์ตามลำดับ `Impeccable detect --json` ของหน้าที่แก้ให้ผล `[]` ใน FR-3/4/5; FR-6 ให้ผล `[]` เช่นกัน ตรวจ React component, keyboard focus, semantic markup และ no forbidden controls ด้วย component tests

FR-6 ชุดเต็มครั้งแรกมี 1,298 เทสผ่าน และล้มเฉพาะ assertion เก่าที่คาดว่า round 3 ซึ่งยังไม่เปิดปรากฏใน Service 1 detail จึงแก้ให้ตรวจว่าไม่แสดง round 3 และแสดง round 1 เท่านั้น ยังคง assertions ของข้อมูลจริงหลังเปิดรอบและบันทึกไว้ครบ ตรวจ focused ผ่าน 28 เทส, `npx eslint tests/integration/patient-program.integration.test.ts` ผ่าน และยืนยัน integration ชุดเต็มผ่าน 71 ไฟล์ / 1,299 เทสหลังแก้

## การตัดสินใจและขอบเขตการยืนยัน

- ใช้ Program row lock และ serializable transaction เดิมร่วมกัน ไม่แยกกติกาธุรกิจสำหรับผู้ป่วย Nonce receipt ไม่เปลี่ยนตามการบันทึกซ้ำ จึงไม่คืนข้อมูลเก่าหลังเจ้าหน้าที่แก้ไข
- การบันทึกผู้ป่วยถูกตรวจ fresh account/role, ความสัมพันธ์ของตนที่ยัง active, ACTIVE Hospital/Program, current open round และ active plan; ผู้ดูแล/Parent/unassigned OSM/โรงพยาบาลอื่นไม่ได้สิทธิ์เพิ่ม
- รายงานใช้ `computeRoundStatus` เดียวกับ completion และโหลดข้อมูลรอบเป็น batch ตาม Program ที่ได้รับอนุญาต ไม่ยิง query ต่อหนึ่ง Program; export cap ของ Follow-up คงเดิม
- รอบ 1 “เส้นทางสุขภาพ” เป็นผล derived จากสัญญาณชีพและนับ DONE ได้ แต่จำนวนผู้ป่วยบันทึกเองนับเฉพาะ DONE ที่ catalog อนุญาตให้ผู้ป่วยบันทึก จึงไม่เพิ่มยอดซ้ำจากรายการ derived
- คงชื่อ/ความหมาย Before และคอลัมน์ดั้งเดิม ครั้งที่ 1–6; Follow-up ที่ไม่มีในรอบก่อนหน้าไม่ทำให้คอลัมน์รอบถัดไปเลื่อน ข้อมูลตั้งแต่ครั้งที่ 7 แสดงแยกพร้อมเลขรอบจริง
- คงกติกาส่วนสูงฝั่งเจ้าหน้าที่ในสองครั้งแรกของแนวทาง โดยเปลี่ยนชื่อ helper ให้ตรงหน้าที่ ไม่ใช้เป็นข้อจำกัดตาราง vitals ผู้ป่วยวัดส่วนสูงเองได้ในรอบปัจจุบันตาม FR-D4a
- ไม่ได้รัน production build, dev server หรือ browser E2E เส้นทาง end-to-end ที่ตรวจเป็น integration ผ่าน Server Actions/services → PostgreSQL → projection → workbook และ component tests ไม่ได้อ้างว่าได้ตรวจภาพหน้าจอ 380 px ใน browser จริง
- FR-7: ผู้ป่วยถูกปฏิเสธก่อนเขียนใด ๆ เมื่อแถวของรอบ (vitals หรือเครื่องมือ) บันทึกโดยผู้ใช้อื่น จึงไม่มี ledger/receipt ใหม่; retry ด้วย nonce เดิมของผู้ป่วยยังได้ `ALREADY_RECORDED` จาก receipt UI ผู้ป่วยใช้ `staffRecordedSteps` ที่ server คำนวณจากกติกาเดียวกัน จึงซ่อนฟอร์มของ vitals ที่เจ้าหน้าที่บันทึกไม่ครบด้วย
- FR-7 index: SQL จาก Prisma JSON-path คือ `("metadata"#>ARRAY[$n]::text[])::jsonb = $m` ซึ่งไม่ตรง expression `(metadata->>'submissionNonce')` ของ index; ตรวจ `EXPLAIN` ด้วยมือ (`enable_seqscan = off`) ได้แค่ Bitmap Index Scan ตาม predicate ของ action แล้วกรอง nonce ทีหลัง จึงเปลี่ยนทั้งสอง lookup เป็น `$queryRaw` ที่ใช้ expression เดียวกับ index และ action แบบค่าคงที่ ผลคือ `Index Scan` พร้อม `Index Cond: ((metadata ->> 'submissionNonce'::text) = …)` ซึ่ง integration test ตรวจไว้
- FR-7 migration: `npm run prisma:migrations:check` ตรวจลำดับเท่านั้น ไม่ได้ห้ามแก้ไฟล์ การเอา `BEGIN;`/`COMMIT;` ออกเปลี่ยน checksum ของ migration ที่ apply แล้วในฐาน dev/demo (ไม่มีข้อมูลจริง) ฐานเหล่านั้นอาจต้อง `prisma migrate resolve` หรือ reset
- ไม่มีคำถามผลิตภัณฑ์ที่ค้างจากข้อกำหนดนี้ ไม่มี push, squash, amend หรือแก้ประวัติ commit ก่อนหน้า

## ไฟล์ที่เปลี่ยนต่อเฟส

### FR-7 (19 ไฟล์)

- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-plan-editor.tsx`
- `app/app/personal/patient-round-recording.tsx`
- `app/app/personal/patient-self-program-rounds-view.test.tsx`
- `app/app/personal/patient-self-program-rounds-view.tsx`
- `docs/adr/0022-plan-driven-service-rounds.md`
- `docs/phases/FLEXIBLE_SERVICE_ROUNDS_VERIFICATION.md`
- `prisma/migrations/20261127100000_round_recording_receipts/migration.sql`
- `src/modules/patient-program-rounds/services/round-plan-write-service.ts`
- `src/modules/patient-program-rounds/services/round-query-service.ts`
- `src/modules/patient-program-rounds/services/round-record-ownership.ts`
- `src/modules/patient-program-rounds/services/round-recording-receipt.ts`
- `src/modules/patient-program-rounds/services/round-service.test.ts`
- `src/modules/patient-program-rounds/services/round-service.ts`
- `src/modules/patient-program/services/patient-program-lifecycle-service.test.ts`
- `src/modules/patient-program/services/patient-program-lifecycle-service.ts`
- `src/modules/patient-program/services/patient-program-service-one-service.ts`
- `src/modules/reporting/presentation/round-report-table.tsx`
- `src/modules/reporting/services/round-report-query-service.ts`
- `tests/integration/patient-program-rounds.integration.test.ts`

### FR-2 — 1c026c2 (31 ไฟล์)

- `app/app/more/page.test.tsx`
- `app/app/patients/[relationshipId]/followups/new/followup-form.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/followups/new/page.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/program-rounds-views.test.tsx`
- `app/app/patients/activation/patient-activation-interactions.test.tsx`
- `app/app/workforce/workforce-activation-toast.test.tsx`
- `app/app/workforce/workforce-import-slips.test.tsx`
- `app/app/workforce/workforce-provision-toast.test.tsx`
- `docs/adr/0022-plan-driven-service-rounds.md`
- `prisma/migrations/20261126100000_followup_open_round_guard/migration.sql`
- `prisma/migrations/20261126101000_round_plan_request_receipts/migration.sql`
- `src/components/app-shell/application-navigation.test.ts`
- `src/components/workforce/activation-presentation.test.tsx`
- `src/modules/followups/services/followup-service.ts`
- `src/modules/patient-final-assessment/services/patient-final-assessment-service.test.ts`
- `src/modules/patient-final-assessment/services/patient-final-assessment-service.ts`
- `src/modules/patient-program-rounds/domain/round-catalog.ts`
- `src/modules/patient-program-rounds/domain/round-steps.test.ts`
- `src/modules/patient-program-rounds/domain/round-steps.ts`
- `src/modules/patient-program-rounds/services/round-plan-write-service.ts`
- `src/modules/patient-program-rounds/services/round-query-service.test.ts`
- `src/modules/patient-program-rounds/services/round-query-service.ts`
- `src/modules/patient-program-rounds/services/round-sequencing.ts`
- `src/modules/patient-program-rounds/services/round-service.test.ts`
- `src/modules/patient-program-rounds/services/round-service.ts`
- `src/modules/patient-program-rounds/transport/action-state.ts`
- `src/modules/patient-program-rounds/transport/server-actions.ts`
- `src/shared/testing/server-action-module-contract.test.ts`
- `tests/integration/family-appointment-grant.integration.test.ts`
- `tests/integration/patient-program-rounds.integration.test.ts`
- `tests/integration/program-reporting.integration.test.ts`

### FR-3 — 4e0e0cb (13 ไฟล์)

- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/page.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/program-round-detail-view.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-plan-editor.test.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-plan-editor.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-step-controls.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/program-rounds-overview-view.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/program-rounds-views.test.tsx`
- `src/modules/patient-program-rounds/domain/round-steps.ts`
- `src/modules/patient-program-rounds/presentation/round-progress.tsx`
- `src/modules/patient-program-rounds/presentation/round-step-timeline.tsx`
- `src/modules/patient-program-rounds/services/round-query-service.ts`
- `tests/integration/patient-roster-baseline-import.integration.test.ts`
- `tests/integration/workforce-onboarding-v2.integration.test.ts`

### FR-4 — 4fae29b (42 ไฟล์)

- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/program-round-detail-view.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-plan-editor.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-step-controls.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-vitals-form.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/service-one-workspace.tsx`
- `app/app/patients/[relationshipId]/screenings/new/page.tsx`
- `app/app/patients/[relationshipId]/screenings/new/screening-form.tsx`
- `app/app/personal/patient-round-recording.tsx`
- `app/app/personal/patient-self-program-detail-view.tsx`
- `app/app/personal/patient-self-program-rounds-view.test.tsx`
- `app/app/personal/patient-self-program-rounds-view.tsx`
- `prisma/migrations/20261127100000_round_recording_receipts/migration.sql`
- `src/modules/patient-program-rounds/domain/round-steps.ts`
- `src/modules/patient-program-rounds/presentation/round-step-timeline.tsx`
- `src/modules/patient-program-rounds/presentation/round-vitals-display.tsx`
- `src/modules/patient-program-rounds/schemas/round-schemas.test.ts`
- `src/modules/patient-program-rounds/schemas/round-schemas.ts`
- `src/modules/patient-program-rounds/services/round-ledger.ts`
- `src/modules/patient-program-rounds/services/round-plan-write-service.ts`
- `src/modules/patient-program-rounds/services/round-query-service.ts`
- `src/modules/patient-program-rounds/services/round-recording-receipt.ts`
- `src/modules/patient-program-rounds/services/round-service.test.ts`
- `src/modules/patient-program-rounds/services/round-service.ts`
- `src/modules/patient-program-rounds/transport/server-action-helpers.ts`
- `src/modules/patient-program-rounds/transport/server-actions.test.ts`
- `src/modules/patient-program-rounds/transport/server-actions.ts`
- `src/modules/patient-program/schemas/patient-program-service-one-schemas.ts`
- `src/modules/patient-program/services/patient-program-access-service.ts`
- `src/modules/patient-program/services/patient-program-lifecycle-service.ts`
- `src/modules/patient-program/services/patient-program-service-one-query-service.test.ts`
- `src/modules/patient-program/services/patient-program-service-one-query-service.ts`
- `src/modules/patient-program/services/patient-program-service-one-service.ts`
- `src/modules/patient-program/transport/patient-program-service-one-server-actions.test.ts`
- `src/modules/patient-program/transport/patient-program-service-one-server-actions.ts`
- `src/modules/patient-self/policies/patient-self-policy.test.ts`
- `src/modules/patient-self/policies/patient-self-policy.ts`
- `src/modules/patient-self/services/patient-self-care-query-service.ts`
- `src/modules/screening/services/screening-service.test.ts`
- `src/modules/screening/services/screening-service.ts`
- `src/modules/screening/transport/server-actions.test.ts`
- `src/modules/screening/transport/server-actions.ts`
- `tests/integration/patient-program-rounds.integration.test.ts`

### FR-5 — afa7ca6 (21 ไฟล์)

- `app/app/hospitals/reporting/hospital-report-workspace.test.tsx`
- `app/app/hospitals/reporting/hospital-report-workspace.tsx`
- `app/app/hospitals/reporting/report-chart-categories.ts`
- `app/app/patients/[relationshipId]/programs/[programId]/report/program-report-view.tsx`
- `src/modules/patient-program-rounds/services/round-query-service.ts`
- `src/modules/reporting/presentation/round-report-table.tsx`
- `src/modules/reporting/projections/hospital-report-projection.ts`
- `src/modules/reporting/projections/program-report-projection.ts`
- `src/modules/reporting/projections/round-report-projection.test.ts`
- `src/modules/reporting/projections/round-report-projection.ts`
- `src/modules/reporting/services/hospital-report-query-service.test.ts`
- `src/modules/reporting/services/hospital-report-query-service.ts`
- `src/modules/reporting/services/hospital-report-workbook-golden.test.ts`
- `src/modules/reporting/services/hospital-report-workbook-service.test.ts`
- `src/modules/reporting/services/hospital-report-workbook-service.ts`
- `src/modules/reporting/services/program-report-query-service.test.ts`
- `src/modules/reporting/services/program-report-query-service.ts`
- `src/modules/reporting/services/round-report-query-service.ts`
- `src/modules/reporting/transport/program-report-page.test.ts`
- `tests/integration/program-reporting.integration.test.ts`
- `tests/integration/report-pipeline-e2e.integration.test.ts`

### FR-6 (26 ไฟล์)

- `app/app/patients/[relationshipId]/page.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.test.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/program-round-detail-view.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/page.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/program-rounds-overview-view.tsx`
- `app/app/patients/[relationshipId]/programs/[programId]/rounds/program-rounds-views.test.tsx`
- `app/app/patients/[relationshipId]/programs/patient-program-view.tsx`
- `app/app/personal/patient-round-recording.tsx`
- `docs/requirements/WB_ALIGNMENT_DECISIONS.md`
- `src/modules/patient-program-rounds/domain/round-catalog.ts`
- `src/modules/patient-program-rounds/domain/round-steps.test.ts`
- `src/modules/patient-program-rounds/domain/round-steps.ts`
- `src/modules/patient-program-rounds/services/round-query-service.ts`
- `src/modules/patient-program-rounds/services/round-sequencing.ts`
- `src/modules/patient-program-rounds/services/round-service.ts`
- `src/modules/patient-program/services/patient-program-query-service.ts`
- `src/modules/patient-program/services/patient-program-service-one-query-service.test.ts`
- `src/modules/patient-program/services/patient-program-service-one-query-service.ts`
- `src/modules/reporting/projections/hospital-report-projection.ts`
- `src/modules/reporting/projections/round-report-projection.test.ts`
- `src/modules/reporting/projections/round-report-projection.ts`
- `src/modules/reporting/services/hospital-report-workbook-service.ts`
- `tests/integration/patient-program-rounds.integration.test.ts`
- `docs/phases/FLEXIBLE_SERVICE_ROUNDS_VERIFICATION.md`
- `tests/integration/patient-program.integration.test.ts`
