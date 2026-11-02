# บันทึกการย้าย Interaction งานบริการและการติดตาม — UX-D4

สถานะ: UX-D4.0 inventory จาก source ปัจจุบัน ณ `64a9ba1c89446d6d6e652136eabcfeb3d7b9ca83` (2026-11-02)

เอกสารนี้แยกการเปลี่ยน interaction ออกจาก business contract และบันทึกหลักฐานก่อนเริ่มแต่ละ slice ข้อความใหม่ให้ใช้ภาษาไทยและศัพท์เดิมของ DEMI ตามที่ผู้ใช้ยืนยัน

## หลักฐานและการตัดสินใจที่ยึด

- อ่าน `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `docs/CONTEXT.md`, UX-D1/2/3, ADR-0022, ADR-0023, UX-04 handoff และ OWNER Canva mapping แล้ว
- ADR-0023 และ implementation ปัจจุบันเป็นข้อยุติเรื่องคำขอบริการ: `ยืนยันนัด` เปลี่ยน PENDING หรือ legacy APPROVED เป็น STARTED พร้อมสร้างนัดหมายใน transaction เดียว; การเลือก อสม. สำหรับคำขอไม่เปลี่ยน `PatientOsmAssignment`; rejection ใช้เหตุผลที่ผู้ป่วยเห็น; withdrawal อนุญาตเฉพาะ PENDING/legacy APPROVED; catalog เปลี่ยนเฉพาะการเปิดรับคำขอ
- ADR-0022 เป็นข้อยุติเรื่องรอบบริการ: แผนเป็นรายการที่ปรับได้, จบรอบได้เมื่อมีอย่างน้อยหนึ่งรายการ DONE, รายการที่เหลือรับ system reason ตามกฎเดิม, แผนว่างจบไม่ได้ และรอบที่จบเป็น read-only; ผู้ป่วย SELF บันทึกได้เฉพาะรายการที่ ADR อนุญาต
- ADR-0026 ปัจจุบันให้ OWNER และ MEMBER ที่ active ตรวจรับ/ไม่อนุมัติคำขอได้เหมือนกัน แต่ service catalog ยังเป็นการจัดการโรงพยาบาลของ OWNER เท่านั้น
- UX-04 ลงวันที่ 2026-10-13 อธิบาย approve-then-book แบบเก่า จึงใช้เป็นประวัติการจัดหน้าเท่านั้น ไม่ใช้สถานะ APPROVED เป็นผลใหม่หรือเปลี่ยนความหมายตามเอกสารนั้น
- OWNER Canva mapping เป็นหลักฐานนำทางเชิงประวัติ ไม่เป็นนโยบายสิทธิ์หรือข้อกำหนดให้เปลี่ยน navigation ใน UX-D4; การตรวจบทบาทจะยึด ADR ล่าสุด, policy และ persisted authorization ในโค้ด
- UX-D1 กำหนดให้ใช้ `ModalDialog`/`ConfirmDialog`/`ConfirmableActionForm` ที่มีอยู่, native form validation, recovery เดิม, ไม่มี nested dialog/form และคืน focus ไป trigger หรือ logical target เมื่อ trigger หาย

## ประเภท interaction

| ประเภท | การใช้งานใน UX-D4 |
| --- | --- |
| A — ย้ายเป็น dialog เฉพาะงาน | การตัดสินใจ/ตรวจทานสั้นที่ต้องเห็น resource และผลก่อน commit |
| B — harden dialog เดิม | ใช้ dialog อยู่แล้ว จึงแก้ lifecycle/recovery/focus โดยไม่ย้าย workflow ซ้ำ |
| C — คงหน้าเฉพาะ | แบบคลินิกยาวหรือหน้าที่มีข้อมูลอ่าน/ขั้นตอนหลายส่วน |
| D — คง inline | งานเฉพาะจุดที่สั้นและย้อนกลับได้ หรือการนำทาง/ตัวกรอง |
| E — เลื่อนไปงานอื่นอย่างชัดเจน | อยู่นอกการย้าย interaction นี้; UX-D4.5 ตรวจสัญญา journey เท่าที่มีหลักฐาน |

## Inventory

ความเสี่ยงหมายถึงผลกระทบหากเกิดการกดผิด/ข้อมูลผิด ไม่ใช่การจัดชั้น authorization

| ID / ประเภท | Component และ route · interaction ปัจจุบัน → เป้าหมาย | บทบาท · resource · Server Action · business transition | Nonce/version · mutation/unknown · draft · focus กลับ | Regression ที่ต้องมี · ความเสี่ยง |
| --- | --- | --- | --- | --- | --- |
| H-1 / A | `hospital-service-request-controls.tsx`, `hospital-service-requests-workspace.tsx`; ฟอร์มนัดขยายในการ์ด → `ยืนยันนัด` เปิด task dialog ที่อ่าน Patient/Hospital, บริการ, วัน/ช่วงเวลาที่ผู้ป่วยต้องการ, อสม. ที่ผู้ป่วยต้องการและผู้ดูแลปัจจุบัน พร้อมผู้ไปเยี่ยมจริง, วันเวลาแน่นอน, ระยะเวลา, สถานที่และหมายเหตุ | HOSPITAL OWNER/MEMBER ที่ server อนุญาต · `requestId` · `confirmPatientServiceRequestAction` · PENDING หรือ legacy APPROVED → STARTED และสร้าง appointment ใน transaction เดิม; อสม. ที่ต่างจากผู้ดูแลเป็นผู้เยี่ยมครั้งเดียวและไม่เปลี่ยน assignment | ใช้ `submissionNonce` ที่ server ส่งต่อ request; payload คือ `requestId`, `submissionNonce`, `osmUserId`, `scheduledAt`, `durationMinutes`, `locationDetail`, `note`; `datetime-local` แปลงเป็นเวลา Asia/Bangkok (`+07:00`) เหมือนเดิม. Workspace ถือ action/pending/unknown ร่วม; unknown ใช้ reload/reconcile และล็อกทุกคำขอ. Cancel ต้องไม่ส่ง; draft ยังอยู่เมื่อเปิดใหม่ตราบที่ request เดิมยังแสดง. Success ปิดและคง appointment link/feedback นอก card; focus ไป feedback ที่รอดจากการย้ายกลุ่ม | เปิด/ยกเลิกไม่ mutation, exact FormData, timezone, required OSM/date, duration/defaults, one-off copy, shared lock, double submit, conflict/unknown, success link/card ย้าย, focus fallback · **สูง** |
| H-2 / A | component/route เดียวกัน; textarea rejection อยู่ใต้ฟอร์มนัด → `ไม่อนุมัติคำขอ` เปิด decision dialog แสดง Patient/Hospital/service, ผลคือ request ถูกปฏิเสธและเหตุผลจะเห็นโดยผู้ป่วย, ไม่ใช่ลบ Patient หรือนัด | HOSPITAL OWNER/MEMBER ที่ server อนุญาต · `requestId` · `rejectPatientServiceRequestAction` · PENDING → REJECTED เท่านั้น | ไม่มี nonce/version ในฟอร์มปัจจุบัน; required `reason` และ max 500; mutation/unknown ใช้ authority และ lock เดียวกับ H-1. Cancel ไม่ส่งและคง draft บน request เดิม. เมื่อ card ย้าย ให้ focus ที่ feedback กลาง | ทดสอบ PENDING เท่านั้น, required/max reason, ผู้ป่วยอ่าน reason ได้, cancel, shared lock กับ H-1, unknown, conflict และ focus · **สูง** |
| P-1 / D | `PatientServiceRequestForm`, `/app/personal/services`; การสร้างคำขอเป็นฟอร์มยาวบนหน้า → คงบนหน้า | PATIENT SELF · `relationshipId`, `offeringId` · `createPatientServiceRequestAction` · สร้าง request PENDING; preference ต่อ อสม. ไม่ได้มอบหมายผู้ดูแล | ไม่มี nonce ใน action ปัจจุบัน; preferred date จากพรุ่งนี้ถึง 60 วันตามปฏิทินกรุงเทพฯ, slot, offering, requested OSM และ note เดิม. `useMutationActionState`; unknown เปิดการตรวจรายการล่าสุดและปิด submit; draft คงอยู่จน success แล้วจึง reset. ไม่เพิ่ม dialog | ทดสอบ payload/eligibility/date bounds/SELF, preference ไม่ assign, duplicate open request, success reset และ unknown reconciliation · **กลาง** |
| P-2 / A | `WithdrawPatientServiceRequestButton`, `/app/personal/services`; ส่งถอนตรงจาก history row → dialog ยืนยันที่ระบุบริการ/วัน/โรงพยาบาลและผล withdrawal | PATIENT SELF เจ้าของคำขอ · `requestId` · `withdrawOwnPatientServiceRequestAction` · PENDING หรือ legacy APPROVED → WITHDRAWN; ไม่ยกเลิก appointment ที่สร้างแล้วและไม่อนุญาต STARTED | ไม่มี nonce/version ในฟอร์มปัจจุบัน; คง `useMutationActionState`, pending/unknown และ reload reconciliation. Cancel ไม่ส่ง; draft ไม่มี. Unknown ล็อกปุ่มยืนยัน/ปิด dialog จน reconcile. คืน focus ไป status/feedback ของ row หรือหัวข้อประวัติถ้า control หาย | ทดสอบ cancel/no mutation, allowed/denied statuses, ไม่ cancel appointment, unknown/reload, duplicate, row/status readback และ focus · **สูง** |
| C-1 / A | `HospitalServiceOfferingControl`, `/app/patients/service-catalog`; enable/disable ส่งตรง → เฉพาะการปิดบริการที่กำลังเปิดให้มี bounded confirm | OWNER ของ Hospital ที่อนุญาต · `hospitalId`, service `code`, enabled state · `setHospitalServiceOfferingAction` · enabled toggle เดิม; ปิดหมายถึงหยุดรับคำขอใหม่เท่านั้น | ไม่มี nonce/version; คง mutation state และ reload สำหรับ unknown. ขอบเขต hospital/code จาก row เดิม; confirm cancel ไม่ส่ง. Focus กลับ row/status ที่เดิม. เปิดบริการยังส่งตรง | ทดสอบ enabled/disabled payload, exact Hospital, disable copy แยกจาก cancel requests/appointments/disable service, cancel, pending/unknown, focus · **สูง** |
| R-1 / B | `RoundPlanEditor`, round detail `/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]`; ใช้ `ModalDialog` เพิ่มรายการอยู่แล้ว → คง dialog และ harden pending/unknown, stale choice, validation, close/reset/focus | OWNER/MEMBER/assigned OSM ตาม policy · `patientProgramId`, `roundNumber`, `stepCode`/`customTitle` · `addRoundPlanItemAction` · เพิ่มรายการในแผนของรอบที่เปิดอยู่; CUSTOM title ≤120 | `submissionNonce` ที่ page ส่งให้ editor; `useMutationActionState` และ resend FormData เดิม; success/conflict refresh. ต้องไม่ส่งเมื่อเปิด/ยกเลิก, ไม่เปลี่ยน nonce เมื่อปิดเปิด dialog; คง selected choice/title เมื่อ error/unknown และไม่ใช้ choice ที่ server view ระบุ unavailable. Focus กลับปุ่มเปิดหรือ heading แผนเมื่อ trigger หาย | open/cancel, standard/custom choice, required/max, stale choice/conflict, pending/unknown resend, duplicate, payload/nonce, success close/focus · **กลาง** |
| R-2 / D | `PlanItemControl` ใน round detail; mark/undo custom item เป็น inline | OWNER/MEMBER/assigned OSM; Patient SELF ทำได้เฉพาะ mark CUSTOM ตาม ADR · `patientProgramId`, `roundNumber`, `planItemId`, optional note · `markCustomItemDoneAction` / `unmarkCustomItemDoneAction` · TODO CUSTOM → DONE / DONE → TODO ตาม guard เดิม | `submissionNonce` ต่อ control; mark มี note ≤500; action-state เดิมและ resend payload เดิม. คง inline; success/conflict revalidate; ไม่เพิ่ม confirmation | exact planItemId/note/nonce, role scope, no mutation on read-only round, double submit, unknown recovery · **กลาง** |
| R-3 / B | `PlanItemControl`; เอา plan item TODO ออกด้วย `ConfirmableActionForm` → คง dialog เดิมและตรวจ lifecycle/focus | OWNER/MEMBER/assigned OSM · `patientProgramId`, `roundNumber`, `planItemId` · `removeRoundPlanItemAction` · soft remove รายการที่เข้า eligibility; ไม่ลบ history/clinical evidence | `submissionNonce` ของ control; pending/outcome/resultKey ของ `ConfirmableActionForm`; unknown ใช้ resend เดิม; no nested dialog/form. Cancel คงรายการ. เมื่อ success รายการอาจหาย จึงคืน focus ไป heading/แผน | review resource, cancel/no mutation, eligible TODO only, stale item/conflict, unknown, double submit, payload และ focus เมื่อ row หาย · **กลาง** |
| R-4 / D | `AddProgramRoundControl`; submit inline ในบริบท rounds | OWNER/MEMBER/assigned OSM ตาม policy · `patientProgramId` · `addProgramRoundAction` · เปิดรอบถัดไปตามลำดับ/limit 1–12 เดิม | `submissionNonce` ที่ server component ออก; MutationForm/action-state เดิม, resend FormData เดิม. คง inline และ return ไป overview หลังยืนยัน/refresh | limit/order/eligibility, payload/nonce, double submit, conflict/unknown, read-only completed Program · **กลาง** |
| R-5 / B | `SkipStepControl`, round detail; task dialog มีเหตุผลอยู่แล้ว → กันปิด/ยกเลิกขณะ pending **หรือ unknown**, ทำ recovery reachable และคง reason/note/original target | OWNER/MEMBER/assigned OSM ตาม policy · `patientProgramId`, `roundNumber`, `planItemId` · `skipPatientProgramRoundStepAction` · TODO plan item → SKIPPED พร้อม reason; OTHER บังคับ note ≤500 | ไม่มี submission nonce ใน form ปัจจุบัน; target + reason + note เป็น original FormData ที่ hook resend. pending/unknown/error/conflict คง draft; unknown ไม่มี ordinary submit และ dialog ปิดไม่ได้; conflict refresh ให้ reconciliation ปัจจุบัน. Cancel idle กลับ trigger | reason choices/OTHER note, open/cancel, pending/unknown dismissal lock, same FormData resend, conflict refresh, double submit, stale plan item, focus · **สูง** |
| R-6 / D | `UnskipStepControl`; ส่งตรง inline จากรายการ SKIPPED → คงไว้ เพราะ reversible และเหตุผล/ประวัติเดิมยังอยู่ | OWNER/MEMBER/assigned OSM · `patientProgramId`, `roundNumber`, `planItemId` · `unskipPatientProgramRoundStepAction` · SKIPPED → TODO/actionable ตาม guard; ไม่ลบหลักฐานเดิมนอกเหนือการยก skip ตาม domain | ไม่มี nonce ใน form ปัจจุบัน; original FormData resend ผ่าน action-state; pending/unknown lock, conflict refresh. คง inline; focus หลัง success ไปสถานะ/step ที่เปลี่ยน | exact target, eligibility, no extra confirmation, duplicate/unknown/conflict, latest state readback · **ต่ำ–กลาง** |
| R-7 / B | `CompleteRoundControl`; `ConfirmableActionForm` อยู่แล้ว → คง dialog เดิมและตรวจ summary/lifecycle | OWNER/MEMBER/assigned OSM ตาม policy · `patientProgramId`, `roundNumber` · `completePatientProgramRoundAction` · จบรอบแบบ immutable; อย่างน้อยหนึ่ง DONE, plan ต้องไม่ว่าง, TODO ที่เหลือรับ system reason เดิม | `submissionNonce` ต่อการจบ; dialog สรุป DONE/SKIPPED/TODO และ round; `ConfirmableActionForm` unknown/resend เดิม. Success ไป overview; completed round เป็น read-only. Focus ไป heading ที่หน้า overview | summary count/item accuracy, empty/zero-DONE guard, flexible completion, no mandatory vitals, unknown/double submit, completed read-only, destination focus · **สูง** |
| R-8 / C+D | Round detail + `RoundVitalsForm`, `ScreeningForm`, `ServiceOneToolStep`; inline multi-step records/links → คงบน dedicated round detail และฟอร์มเฉพาะของแต่ละ step | staff/assigned OSM; Patient SELF เฉพาะ step ตาม ADR-0022 · identity เป็น program/relationship/round และ step · `recordPatientProgramRoundVitalsAction`, `recordPatientProgramRoundProfileAction`, `recordPatientProgramRoundReviewAction`, `submitScreeningAction`, `recordPatientProgramServiceOneRoutineAction`, `recordPatientProgramServiceOneFloatingChartAction`, `recordPatientProgramServiceOneDreamCardAction`, `recordPatientProgramServiceOneConfidenceAction` · บันทึก evidence ของ step เดิม | nonce/version ของแต่ละ form ตาม page เดิม; recovery/action state ของแต่ละ form. ไม่รวมหลาย step เข้า dialog และไม่เปลี่ยน native form. Success ไป step/return path เดิม | route/deep link, roles, step eligibility, payload/nonce, missing vs zero, completed/read-only และ return navigation · **สูง** |
| R-9 / C+D | `PatientRoundRecording`, `/app/personal/care/...`; ใช้ฟอร์ม shared ใน step disclosure → คงพื้นที่ Self และอนุญาตเฉพาะรายการ ADR-0022 | PATIENT SELF ต่อ ACTIVE Program/round ที่เปิดของตน · exact relationship/program/round/item · actions ที่อนุญาตคือ `recordPatientProgramRoundVitalsAction`, `recordPatientProgramRoundProfileAction`, `submitScreeningAction` (PAM/PROMs), `recordPatientProgramServiceOneRoutineAction`, `recordPatientProgramServiceOneFloatingChartAction`, `recordPatientProgramServiceOneDreamCardAction`, `recordPatientProgramServiceOneConfidenceAction` และ `markCustomItemDoneAction` · สร้าง/แก้เฉพาะ record ของตน; ห้าม plan edit, skip, completion หรือ Follow-up | nonce server-rendered ต่อ view/เดิมของ form; ไม่มี dialog รวม clinical entries. existing single-flight/unknown path ของแต่ละ form คงเดิม. คืนไป deep link `returnTo`/round summary ที่มี | own relationship/program/round scope, staff evidence ห้ามเขียนทับ, partial staff vitals, allowed step allowlist, hidden forbidden controls, no staff recorder names, exact payload/recovery · **สูง** |
| F-1 / A+C | `FollowupForm`, `/app/patients/[relationshipId]/followups/new` และ `/programs/[programId]/followups/new`; แบบคลินิกยาวอยู่บน dedicated page; ปัจจุบันมี confirmation เฉพาะ Program missing vitals → คง form page และใช้ review dialog เดียวกับการ acknowledge missing vitals | direct Hospital OWNER/MEMBER หรือ OSM ที่มี exact active assignment; ไม่ใช่ Patient SELF · relationship/Program/current round/appointment/goal plan · `createFollowupAction` หรือ `createFollowupForProgramAction` · สร้าง immutable Follow-up ตาม contract; Program follow-up ผูก current open round ตาม service rule | `submissionNonce` ที่ page สร้างและอยู่ใน original FormData; native validation ก่อน review; review เปิดไม่ dispatch; final explicit confirm dispatch action เดิมหนึ่งครั้ง; unknown คง recovery/resend FormData เดิมและล็อก identity; draft/ค่าคลินิกไม่ล้างเมื่อ cancel/error. Success navigation เดิม (ปรับแผน → goal plan; อื่น → detail/returnTo) | native validation ก่อน review, all review values/unknown vs zero, appointment/goal/round identity, missing vital acknowledgment + skip consequence, plan-adjustment, exact FormData, no nested dialog/form, cancel/error draft, conflict/forbidden/unknown/resend/success/focus · **สูงมาก** |
| N-1 / C+D | `CareTrackingWorkspaceView`, `/app/services`; read-heavy search/filter/pagination/Hospital scope, patient links และ round timeline disclosure → คง dedicated page และ inline navigation | Hospital staff ตาม scope หรือ OSM assigned; Patient SELF route แยก; resource ของแต่ละ relationship/Program · read/navigation actions เท่านั้น; ไม่มี write Server Action จาก filter/navigation | URL/query state เดิม; link ไป exact patient/round path; no mutation identity/nonce. Focus เป็น browser navigation ไป heading ของหน้าปลายทาง | filters/pagination preserve params, Hospital/relationship scope, network read-only, deep links, empty state และ mobile wrapping · **ต่ำ** |
| E-1 / E | OSM appointment accept/reschedule หลังคำขอได้รับการยืนยัน; เป็น workflow นัดหมายเฉพาะเดิมนอก controls ที่ UX-D4 ย้าย | OSM ของ appointment/active Hospital ตาม appointment policy · Server Actions ของ appointment ปัจจุบัน; D4.5 ตรวจการเข้าถึงและ transition โดย code/test เท่านั้น | nonce/version/recovery ตาม appointment feature เดิม; ไม่มี interaction migration ใน D4.1–D4.4 | cross-role transition/access evidence ใน D4.5; browser verification จะถูกระบุแยก · **สูง; ไม่แก้ใน phase นี้** |

## Baseline UX-D4.0

ตรวจที่ HEAD `64a9ba1c89446d6d6e652136eabcfeb3d7b9ca83`; branch `main`; worktree สะอาดก่อนเริ่ม

| คำสั่ง | ผลจริง |
| --- | --- |
| `npm run typecheck` | **ไม่ผ่านก่อนตรวจ source**: TypeScript parse error ใน generated/ignored `.next/dev/types/routes.d.ts` บรรทัด 203 เป็นต้นไป (`TS1434`, `TS1128`, string literal ไม่ปิด); source route type file ถูกตัดกลางบรรทัด. ยังไม่ใช่หลักฐานว่า first-party type ผิด |
| `npm run lint` | **ผ่าน**, exit 0 |
| targeted `npm run test -- …` (service request/catalog, rounds, follow-up; 25 test files) | **ผ่าน 25 files / 319 tests**, exit 0, Vitest 4.1.10 |

รายการ test ที่รัน: Hospital request workspace/page, patient-service-request action/service/schema/presentation/policy/domain, round plan editor/overview/SELF view และ round action/service/schema/domain/timeline, follow-up action/service/schema/policy/domain และ follow-up detail page. ไม่มี PostgreSQL integration suite หรือ browser/device test ใน baseline นี้

## สรุปการจัดประเภทก่อนเริ่ม implementation

- **A — dialog:** ยืนยันนัด, ไม่อนุมัติคำขอ, ถอนคำขอผู้ป่วย, ปิดรับบริการ, final follow-up review
- **B — harden dialog เดิม:** เพิ่มรายการในแผน, เอารายการ TODO ออก, skip step, จบรอบ
- **C — คงหน้าเฉพาะ:** Follow-up form, Hospital request workspace, round detail, care tracking; รวม Patient SELF round context
- **D — คง inline:** patient request creation, เปิดรับบริการ, custom item mark/unmark, เพิ่มรอบ, unskip, vitals/tool/Screening step forms, filters และ navigation
- **E — เลื่อนไปงานอื่น:** appointment accept/reschedule ไม่เปลี่ยน UI ใน slices D4.1–D4.4; D4.5 ตรวจ contract โดยไม่ย้าย workflow

งาน UX-D4.1–D4.6 จะเพิ่มผลตรวจ สถานะการย้าย รายการ role/access และหลักฐานที่เกิดจริงต่อท้ายเอกสารนี้ ห้ามอ่านช่อง browser/integration ที่ยังไม่ตรวจว่าเป็น PASS

## UX-D4.1 — ผลการย้าย Hospital Service Request Decisions

สถานะ: **ดำเนินการแล้ว** ที่ commit UX-D4.1; เปลี่ยนเฉพาะ interaction ฝั่ง client และ regression tests

- H-1 ย้ายฟอร์มนัดออกจากการ์ดเป็น `ModalDialog` เดียว แสดง Patient, Hospital, บริการ, ความประสงค์, ผู้ดูแลปัจจุบัน และค่าการนัดหมายที่จะบันทึกจริง; วันเวลา, อสม., ระยะเวลา, สถานที่ และหมายเหตุแก้ไขได้ใน dialog
- H-2 ย้ายการไม่อนุมัติเป็น dialog แสดงผลที่เกิดกับคำขอและกำกับชัดว่าเหตุผลที่กรอกจะเห็นโดยผู้ป่วย; required/max length เดิมยังอยู่
- `confirmPatientServiceRequestAction` และ `rejectPatientServiceRequestAction` ยังเป็น Server Action เดิม; eligibility, transaction, permission, request transitions และ revalidation ไม่เปลี่ยน
- ใช้ nonce ยืนยันนัดที่ server สร้างและคงค่าไว้ตลอดการปิด/เปิด dialog; payload ยังเป็น requestId, submissionNonce, osmUserId, scheduledAt, durationMinutes, locationDetail และ note. `datetime-local` ยังคงแปลงเป็น `+07:00` โดยไม่ตีความเป็น UTC
- Workspace ยังคุม action state, pending/unknown และ synchronous single-flight lock ร่วมกันทุกการ์ด. ผล unknown ล็อกการยืนยันปกติและไม่ให้ปิด dialog; คำแนะนำให้โหลดข้อมูลล่าสุดอยู่ใน dialog และ workspace. ไม่ retry อัตโนมัติ
- Draft ของฟอร์มนัดและเหตุผลไม่หายเมื่อยกเลิกแล้วเปิด dialog เดิมใหม่. Cancel คืน focus ไปปุ่มเดิม; success/conflict คืน focus ไป feedback ที่อยู่นอกการ์ดซึ่งอาจย้ายกลุ่ม
- คงการจัดกลุ่ม, การเรียง, pagination, summary และลิงก์นัดหมายที่ยืนยันแล้วไว้ตามเดิม

### หลักฐาน D4.1

| ตรวจ | ผลจริง |
| --- | --- |
| `npm run test -- app/app/patients/service-requests src/modules/patient-service-requests src/modules/appointments` | **ผ่าน 24 files / 272 tests** |
| Dialog/workspace/server-action tests เฉพาะที่เพิ่มและเกี่ยวข้อง | **ผ่าน 3 files / 37 tests**; ครอบคลุม open/cancel, draft, exact FormData/Bangkok time, one-off OSM copy, rejection reason, double-submit lock, unknown outcome และ focus |
| `npm run lint` | **ผ่าน**, exit 0 |
| `npx eslint` เฉพาะ dialog regression test หลังแก้ test เพิ่ม | **ผ่าน**, exit 0 |
| `npx tsc --noEmit --project .next/ux-d4-tsconfig.json --pretty false` (include เฉพาะไฟล์ D4.1 และ dependencies) | **ผ่าน**, exit 0; config/ไฟล์ชั่วคราวใน `.next` ถูกลบหลังตรวจ |
| `npm run typecheck` | **ยังไม่ผ่านการตรวจเต็ม**: หลังสร้าง route types ใหม่ด้วย `npx next typegen` และเอา generated route file ที่เสียออกจาก `.next/dev/types`, `tsc` ใช้ heap 2 GB จน Node จบด้วย out-of-memory; เครื่องมี RAM ว่างราว 2.5 GB ขณะตรวจ จึงไม่เพิ่มเพดาน heap. ไม่พบ source diagnostic ก่อน OOM |
| Authorization, transaction และ state transition | **ตรวจผ่านโดยอ่านโค้ดและ tests ที่มี**: server actions/service/schema เดิมไม่ได้แก้; ไม่มี PostgreSQL integration test ใน slice นี้ |
| Browser/device accessibility | **ยังไม่ตรวจ**; jsdom tests ตรวจ open/cancel, modal focus return และ lock เท่านั้น |

ไฟล์ D4.1: `hospital-service-request-controls.tsx`, `hospital-service-requests-workspace.tsx`, tests ของ workspace และ dialog. ไม่แก้ schema, Server Action signature, service/domain, permission หรือ appointment transaction

## UX-D4.2 — ผลการย้าย Patient Service Requests และ Service Availability

สถานะ: **ดำเนินการแล้ว** ที่ commit UX-D4.2; สร้างคำขอของผู้ป่วยยังอยู่บนหน้าเดิม

- P-1 คงฟอร์มสร้างคำขอและค่า relationship/offering/date/slot/preferred OSM/note ตามเดิม; preferred OSM ยังคงเป็นความประสงค์ ไม่ใช่การ assign. ค่า min/max ที่ server คำนวณตามปฏิทินกรุงเทพฯ ไม่เปลี่ยน
- P-2 ครอบการถอนคำขอด้วย `ConfirmableActionForm`; dialog แสดงบริการ โรงพยาบาล วันที่/ช่วงเวลาที่เลือก และแจ้งว่าการถอนเปลี่ยนสถานะคำขอแต่ไม่ยกเลิกนัดหมาย. มี action เฉพาะ PENDING/APPROVED ตาม prop เดิม; `requestId` และ Server Action เดิม
- เมื่อผลถอนยังไม่ทราบ ยืนยันซ้ำไม่ได้; ปิดหน้าต่างได้โดยไม่ retry และจึงเข้าถึง `โหลดข้อมูลล่าสุด` บนหน้าได้. เมื่อยืนยันสำเร็จ feedback เป็น status และซ่อนปุ่มซ้ำ; คืน focus ไปผลลัพธ์หรือแถวคำขอที่ยังอยู่
- C-1 ปิดรับคำขอของ offering ที่เปิดอยู่ผ่าน confirmation ที่ระบุว่าหยุดเฉพาะคำขอใหม่; อธิบายชัดว่าไม่ถอนคำขอเดิม ไม่ยกเลิกนัดหมาย และไม่ปิดบริการต้นทาง. เปิดรับคำขอยังคงส่งตรง
- ทั้งสองสถานะ catalog ส่ง `hospitalId`, service `code` และค่า `enabled` เดิมอย่างชัดเจน; ไม่มีการเปลี่ยน scope/authorization ฝั่ง server หรือเขียนประวัติย้อนหลัง

### หลักฐาน D4.2

| ตรวจ | ผลจริง |
| --- | --- |
| `npm run test -- app/app/personal/services/patient-service-interactions.test.tsx app/app/appointments/service-source-surfaces.test.tsx app/app/patients/hospital-operations-navigation.test.tsx src/modules/patient-service-requests` | **ผ่าน 10 files / 94 tests** |
| `npx eslint` บน controls, workspace และ interaction test ที่แก้ | **ผ่าน**, exit 0 |
| `npx tsc --noEmit --project .next/ux-d4-tsconfig.json --pretty false` (include เฉพาะไฟล์ D4.2 และ dependencies; temporary config ถูกลบแล้ว) | **ผ่าน**, exit 0 |
| Withdrawal/offering payload, status eligibility, unknown/cancel/success/focus | **ผ่าน component tests**; no PostgreSQL integration execution |
| Authorization และ domain contract | **ตรวจผ่านจาก code inspection**: Server Action, schemas, service/policy และ database transaction ไม่ได้แก้; tests ตรวจ scope ที่ส่งจากแต่ละ offering |
| Browser/device/mobile verification | **ยังไม่ตรวจ**; mobile dimensions และ software keyboard ไม่ได้ทดสอบใน jsdom |

ไฟล์ D4.2: patient request controls/workspace, hospital service catalog controls และ component interaction tests. ไม่มีการเปลี่ยน request creation flow หรือ service/action contract

## UX-D4.3 — ผลการตรวจและ harden Program Round Operations

สถานะ: **ดำเนินการแล้ว** ที่ commit UX-D4.3; คงรูปแบบหน้า/inline เดิมและปรับ lifecycle ของ controls ที่มีอยู่

- R-1 คง `RoundPlanEditor` ใน `ModalDialog` เดิม; เพิ่ม synchronous single-flight lock, ปิดการส่ง/ปิดหน้าต่างระหว่าง pending หรือ unknown, กันตัวเลือกที่เปลี่ยนเป็น unavailable ระหว่างเปิด dialog และคงตัวเลือก/ชื่อ CUSTOM เมื่อยกเลิกแล้วเปิดใหม่. Success จึง reset draft และปิด dialog; ถ้าปุ่มเปิดซ้ำหาย focus กลับปุ่มเพิ่มรายการที่คงอยู่
- R-3 คง `ConfirmableActionForm` เดิมสำหรับตัดเฉพาะรายการ TODO; เมื่อแถวหาย focus กลับ heading ของ step ปัจจุบัน. ระหว่าง audit พบ recovery button อยู่ใน disabled fieldset ทำให้ resend หลัง unknown ใช้ไม่ได้ จึงเพิ่มช่อง `recovery` ใน `ConfirmableActionForm` ให้ recovery อยู่พ้น fieldset และทำงานได้หลังผู้ใช้ปิดหน้าต่างผลไม่ชัดเจน; ไม่มี dialog/form ซ้อนและใช้ original FormData จาก `useMutationActionState`
- R-5 คง Skip dialog; lock ปิดด้วย Escape/ปุ่มปิด/ยกเลิกทั้ง pending และ unknown. เหตุผล/หมายเหตุ/`planItemId`/round target อยู่ใน dialog ระหว่าง recovery, ordinary submit ถูกปิด, และผู้ใช้ส่ง original payload ซ้ำได้จาก recovery ที่ยัง reachable. Cancel ตอนยังไม่ส่งไม่ mutation และคืน focus ไป heading ปัจจุบัน
- R-6 `UnskipStepControl` ยังคง inline โดยไม่เพิ่ม confirmation สำหรับการย้อนสถานะที่ reversible; เพิ่ม synchronous single-flight lock และคง resend FormData เดิมเมื่อ unknown. `planItemId` และ target ไม่เปลี่ยน
- R-7 คง `ConfirmableActionForm` หนึ่ง dialog; review แสดงจำนวนและชื่อรายการ DONE/SKIPPED/TODO พร้อมบอกว่า TODO ที่เหลือรับ system reason, ต้องมีอย่างน้อยหนึ่ง DONE, และไม่ต้องจัดการทุกรายการก่อนจบ. ยังคงกฎแผนไม่ว่าง, completion immutable/read-only และไม่มีข้อบังคับ vital เพิ่มเติม
- ไม่แก้ Server Action, submission nonce/version, policy, service, persistence หรือ transition ของรอบ; confirmation/recovery ใช้ action state และ exact request identity เดิม

### หลักฐาน D4.3

| ตรวจ | ผลจริง |
| --- | --- |
| `npm run test -- app/app/patients/[relationshipId]/programs/[programId]/rounds/[roundNumber] src/modules/patient-program-rounds src/components/ui/confirmable-action-form.test.tsx` | **ผ่าน 9 files / 145 tests** |
| Regression test ใหม่/ขยายใน `round-plan-editor.test.tsx` | **ผ่าน 14 tests**; ครอบคลุม draft, stale choice, payload/nonce, no mutation on open/cancel, TODO remove focus, skip OTHER + exact-payload recovery/dismissal lock, unskip single-flight, flexible completion summary, completion double-submit และ resend nonce เดิม |
| `npx eslint` บน ConfirmableActionForm และไฟล์ round ที่เปลี่ยน | **ผ่าน**, exit 0 |
| `npx tsc --noEmit --incremental false --project .next/ux-d4-tsconfig.json --pretty false` (ไฟล์ D4.3 และ dependency ที่เกี่ยวข้อง) | **ผ่าน**, exit 0; temporary config ถูกลบหลังตรวจ |
| Authorization, round eligibility/completion และ persistence | **ตรวจผ่านโดย code inspection และ service/action tests**; Server Action/service/policy ไม่เปลี่ยน; ไม่ได้รัน PostgreSQL integration |
| Browser/device/accessibility | **ยังไม่ตรวจใน browser**; jsdom ตรวจ cancellation, recovery lock, exact payload และ focus target เท่านั้น |

ไฟล์ D4.3: controls ของ round plan/step, `program-round-detail-view.tsx`, shared `ConfirmableActionForm` recovery slot และ regression tests. ไม่เพิ่ม dialog หรือ form ซ้อน และไม่เปลี่ยนกฎ domain

## UX-D4.4 — ผลการเพิ่ม Follow-up Recording Review

สถานะ: **ดำเนินการแล้ว** ที่ commit UX-D4.4; ฟอร์มคลินิกยังอยู่บนหน้าเฉพาะ

- F-1 คง Follow-up form เต็มไว้บนหน้าเดิม; ใช้ `ConfirmDialog` เพียงหนึ่งรายการเป็น final review และยุบการยืนยัน missing vitals ที่มีอยู่เดิมเข้ามาใน review เดียว
- การส่งครั้งแรกผ่าน native browser validation แล้วเปิด review โดยไม่เรียก Server Action. ฟอร์มไม่ผูก Server Action กับ `action` โดยตรง; หลังผู้ใช้กดยืนยัน review แล้ว `requestSubmit()` ตรวจ native validation อีกครั้ง และ `dispatchFormDataPreservingInput` ส่ง `FormData` จากฟอร์มเดิมผ่าน `useMutationActionState`. จึงไม่มีทางส่งแบบ progressive form ก่อน hydration ที่ข้าม review และไม่มี hidden review field เพิ่มใน payload
- Review แสดง Patient/Hospital, โปรแกรมสุขภาพและรอบปัจจุบัน, วันที่บริการแบบปฏิทินกรุงเทพฯ, นัดหมาย, goal plan, ค่าที่กรอกจริง, ช่องที่ว่าง, คำตอบและความคืบหน้าของเป้าหมาย, plan-adjustment intent, อุปสรรค และ free-text notes. ค่า `0` ยังคงแสดงเป็นค่าที่บันทึก; ค่าว่างระบุว่าไม่ได้กรอก ไม่แปลงเป็นศูนย์
- สำหรับ Program follow-up เท่านั้น หาก vital fields เดิมที่ใช้กับกฎ missing-vitals ขาดอย่างน้อยหนึ่งค่า ผู้ใช้ต้องติ๊กยืนยันผลก่อนส่ง. Review แจ้งว่าขั้นตอน vital ของรอบอาจต้องมี skip reason ที่ผู้ใช้ระบุเอง; ระบบไม่ข้ามขั้นตอนหรือสร้างเหตุผลให้อัตโนมัติ. ส่วนสูงยังแสดงใน review แต่คงอยู่นอกชุด missing-vitals เดิมตาม business contract
- การยืนยัน dispatch เพียงครั้งเดียวด้วย `submissionNonce` และ fields เดิมทั้งหมด. การเปิด/cancel review ไม่ mutation; draft อยู่ครบ. Validation error คืน focus ไป feedback บนหน้าโดยไม่ล้าง draft; conflict/forbidden คงการ refresh เดิม
- หากผลไม่ชัดเจน review ยังคงแสดง `UnknownOutcomeAlert` และ resend เฉพาะ original `FormData`/nonce; ไม่มี ordinary submit หรือสร้าง identity ใหม่. ผู้ใช้ปิด review เพื่อใช้ recovery ที่แสดงบนหน้าได้; ลิงก์ออกจากฟอร์มถูกล็อกระหว่าง pending/unknown. ไม่มี automatic retry
- เมื่อ success เท่านั้นที่ปิด review และใช้ navigation เดิม: ปรับแผนไปหน้า goal-plan creation พร้อม `sourceFollowupId`/`returnTo`; เส้นทางอื่นไปหน้า follow-up detail ตามเดิม

### หลักฐาน D4.4

| ตรวจ | ผลจริง |
| --- | --- |
| `npm run test -- app/app/patients/[relationshipId]/followups/new/followup-form.test.tsx` | **ผ่าน 1 file / 9 tests**; native validation, no dispatch on open/cancel, exact reviewed values, zero vs missing, explicit acknowledgment, single dispatch, exact `FormData`/nonce, unknown exact-payload resend, conflict/forbidden, success routing และ focus |
| `npm run test -- "app/app/patients/[relationshipId]/followups" src/modules/followups` | **ผ่าน 8 files / 89 tests**, รวม UI, transport, policy, service, query, schema และ domain regression |
| `npx eslint` บน Follow-up form และ regression test | **ผ่าน**, exit 0 |
| `npx tsc --noEmit --incremental false --project .next/ux-d4-tsconfig.json --pretty false` (Follow-up form, test และสอง page entry points; config ชั่วคราวถูกลบหลังตรวจ) | **ผ่าน**, exit 0 |
| Follow-up authorization, immutable recording และ navigation contract | **ตรวจผ่านจาก code inspection**: ไม่แก้ Server Actions, schema, service, nonce creation, persisted authorization หรือ post-success workflow |
| Browser/device/accessibility และ PostgreSQL integration | **ยังไม่ตรวจ**; jsdom ครอบคลุมโครงสร้าง dialog, no nested form/dialog, cancel/recovery, exact payload และ focus target แต่ไม่ยืนยัน keyboard/screen-reader/mobile behavior ใน browser |

ไฟล์ D4.4: `followup-form.tsx` และ `followup-form.test.tsx`. ไม่เปลี่ยน action signature, FormData fields, persistence หรือ clinical semantics

## UX-D4.5 — Cross-role Service Journey Audit

ตรวจ workflow ด้วย test ที่มีและ code inspection; **ยังไม่ได้ทดสอบเป็น E2E เดียวต่อเนื่องใน browser หรือ PostgreSQL**. ในตาราง `T` คือมี automated test ครอบคลุมส่วนที่ระบุ, `C` คือยืนยันจาก code inspection, `B` คือ browser, และ `NV` คือยังไม่ verified. ไม่มีรายการใดผ่าน browser ใน phase นี้

### Primary journey matrix

| Transition | Actor และ resource scope | Evidence / verification state |
| --- | --- | --- |
| Patient สร้างคำขอ → Hospital inbox | `PATIENT` SELF ผ่าน relationship ของตน; `HOSPITAL` OWNER/MEMBER เห็น requests เฉพาะ direct active Hospital ที่ operate | **T:** Patient interactions, request Server Action และ bounded Hospital list tests. **C:** create ตรวจ relationship ที่ผูกกับ persisted Patient, active care/Hospital และ offering ใน Hospital เดียว; inbox resolve operator Hospital จาก persisted membership. **B/NV:** ไม่ตรวจ browser หรือข้อมูลจริงปลายทางร่วมกัน |
| Hospital อ่านแล้ว confirm/reject คำขอ | OWNER/MEMBER ของ Hospital เดียวกับ request; resource `requestId` จากรายการที่ได้ server-side scope | **T:** workspace/dialog/list/action/policy tests; D4.5 เพิ่ม policy assertion ให้ OWNER และ MEMBER ผ่าน reviewer decision. **C:** confirm/reject โหลด request และ re-check persisted active operator ภายใน transaction; reject ได้เฉพาะ PENDING และเก็บเหตุผลที่ Patient อ่านได้. **B/NV:** ไม่มี browser/DB transaction journey test |
| Confirm request → appointment ถูกสร้าง | Hospital OWNER/MEMBER; resource คือ request relationship เดิมและ appointment ใหม่ | **T:** action payload/revalidation tests และ appointment create idempotency/transaction tests แยกกัน. **C:** `confirmPatientServiceRequest` เรียก appointment creation ภายใน serializable transaction พร้อม `serviceRequestId`; สถานะใหม่เป็น STARTED ผ่าน contract เดิม ไม่ใช่เพียง APPROVED. **NV:** ไม่มี PostgreSQL test ที่ยืนยันการเชื่อม request→appointment ใน transaction เดียว |
| One-off OSM รับนัดหรือขอเปลี่ยนเวลา | OSM ที่ assigned บน appointment; อำนาจเป็น appointment-level จาก appointment ที่เกิดจาก service request | **T:** appointment policy tests จำกัด one-off scope เฉพาะ appointment และตรวจ assigned OSM, สถานะ, Hospital และเวลาสิ้นสุด; action tests ครอบ accept/reschedule payload และ version/nonce. **C:** ไม่เขียน `PatientOsmAssignment`; OSM ที่มาเยี่ยมไม่ได้รับสิทธิอ่านหรือจัดการ patient record จากนัดนี้. **B/NV:** ไม่ได้เดิน UI เต็มเส้นทาง |
| Hospital ใช้ care tracking → เปิด Patient/Program/Round | direct active Hospital scope; network Child แสดง read-only; destination ยังคง relationship/program/round deep link เดิม | **T:** care-tracking workspace และ Hospital navigation tests ตรวจ scope/query parameters, direct vs network read-only และ patient/round links. **C:** route/query services resolve active persisted Hospital scope. **B/NV:** ไม่ตรวจ browser URL navigation |
| OSM/Hospital staff บันทึก Round | OWNER/MEMBER ของ Hospital ที่เกี่ยวข้อง หรือ exact active assigned OSM; Patient ใช้แยก SELF route | **T:** program policy, round query/write/action suites ตรวจ direct Hospital, assigned OSM, wrong relationship/Program, inactive target, read-only completed round และ Patient SELF view. **C:** read/write access แยกตาม persisted relationship/assignment; round action ไม่รับ authority จาก client. **B/NV:** ไม่ตรวจอุปกรณ์จริง |
| Follow-up บันทึกผล → แสดงผลตาม scope | Hospital OWNER/MEMBER โดยตรง หรือ exact assigned OSM; immutable Follow-up ผูกกับ relationship/Program ที่ตรวจสิทธิ | **T:** follow-up policy, query, action, service suites และ D4.4 form tests ตรวจ role, exact scope, same-Program options, immutable create, native validation/review และ success navigation. **C:** actor/membership/assignment ตรวจจากข้อมูล persisted; Patient SELF ไม่ใช้ staff create action. **B/NV:** ไม่มี browser หรือ DB E2E |
| Patient ดู request, appointment, Round และประวัติของตน | `PATIENT` SELF ผ่าน person/relationship/Program ที่เป็นของตน; review/cancel ตาม capability ของแต่ละ resource | **T:** Patient request, appointment hub, own care-history query และ SELF round UI/service tests ตรวจ own scope, appointment/follow-up history, privacy ของผู้บันทึก และการไม่มี write controls ใน history. **C:** query กรองโดย persisted person/relationship และ allowlist DTO; SELF follow-up history มาจาก Patient SELF service ไม่ใช่ staff follow-up endpoint. **B/NV:** ไม่ตรวจ browser sign-in/session |

### Role/access matrix

| Actor case | Evidence และผลที่ตรวจได้ |
| --- | --- |
| Hospital OWNER | **T+C:** request policy/list, appointment/program/follow-up policies และ catalog policy อนุญาตเฉพาะ capability/active direct scope ที่กำหนด |
| Hospital MEMBER | **T+C:** service-request list ใช้ active OWNER/MEMBER predicate; request reviewer policy regression ของ D4.5 ครอบทั้ง OWNER และ MEMBER; appointment/Program policy ทดสอบ MEMBER. Catalog ยังคง OWNER-only ตาม ADR-0026 |
| OSM | **T+C:** appointment, Program และ follow-up policies ใช้ exact active assignment; one-off appointment ให้อำนาจกับ appointment เท่านั้น. ไม่มีการขยาย patient assignment |
| PATIENT | **T+C:** own request/appointment/service history และ SELF round recording ใช้ person/relationship ของตน. ไม่ได้สิทธิ staff follow-up creation |
| Mixed-role actors | **T+C:** appointment/Program/follow-up policies ทดสอบการอนุญาตผ่าน secondary direct Hospital หรือ exact OSM scope ที่มีจริง. Service-request policy คงการปฏิเสธ ADMIN แม้มี HOSPITAL role; catalog management ยัง OWNER-only |
| Platform ADMIN | **T+C:** service-request reviewer และ catalog policy tests ปฏิเสธ ADMIN-only และ ADMIN+HOSPITAL; modules อื่นยังประเมินเฉพาะ authority ที่ module นั้นอนุญาตตาม tests เดิม ไม่มีการอนุมานสิทธิจากชื่อ role เพียงอย่างเดียว |
| Ended/inactive relationship, suspended Hospital/User, wrong Hospital/foreign Patient or Program | **T+C:** service-request list, appointment/Program/follow-up policy/query และ Patient SELF query suites ทดสอบหรือบังคับ active status และ exact persisted scope; จุดอ่าน history ที่ยังให้ Patient ดูข้อมูลเก่าตาม policy คงไว้ แต่ไม่คืนสิทธิ write ให้ relationship ที่ inactive |

### หลักฐาน D4.5

| ตรวจ | ผลจริง |
| --- | --- |
| Cross-journey automated suites | **ผ่าน 61 files / 717 tests** ด้วย `npm run test -- src/modules/patient-service-requests app/app/patients/service-requests app/app/personal/services/patient-service-interactions.test.tsx app/app/patients/hospital-operations-navigation.test.tsx src/modules/appointments app/app/patients/[relationshipId]/appointments app/app/personal/appointments src/modules/patient-program src/modules/patient-program-rounds src/modules/patient-self/services/patient-self-care-query-service.test.ts app/app/personal/patient-self-program-rounds-view.test.tsx app/app/services/care-tracking-workspace-view.test.tsx src/modules/followups app/app/patients/[relationshipId]/followups` |
| Reviewer policy OWNER/MEMBER regression | **ผ่าน**; มี test MEMBER เพิ่มใน D4.5. แก้เฉพาะ comment เก่าที่อ้าง ADR-0019 ให้ตรง ADR-0026; ไม่เปลี่ยน policy/runtime behavior |
| `npx eslint` บน policy test และ patient service request service | **ผ่าน**, exit 0 |
| PostgreSQL end-to-end / browser cross-role journey | **ไม่ได้รัน/ยังไม่ verified**; ไม่มี disposable database ที่ตรวจยืนยันในงานนี้ และไม่ได้ใช้ browser |

ไฟล์ D4.5: policy reviewer test, comment อธิบาย ADR ปัจจุบันใน service request service และ matrix นี้. ไม่แก้ persisted authorization, Server Action, transaction หรือ workflow semantics
