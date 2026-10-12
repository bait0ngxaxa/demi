# UX-03 — OSM Operational Journey

วันที่: 2026-10-12 (Asia/Bangkok)

Starting commit: `41fd72a815d4c2a198f64ebd18ca9eb333a388e3`, branch `main`, ตรง reviewed baseline. ก่อนเริ่มมี untracked `outputs/`; ไม่อ่าน/แก้/เพิ่มเข้า commit. Remote main ยังตรง base ก่อนส่งงาน.

Final commit: commit ที่เพิ่ม handoff นี้พร้อม implementation/tests; resolve full SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_03_OSM_OPERATIONAL_JOURNEY_HANDOFF.md`. ไม่สามารถฝัง hash ของ commit ไว้ในเนื้อหาของ commit เดียวกันได้; delivery report ระบุ full SHA หลัง commit/push.

Disposition: IMPLEMENTED / FOCUSED AUTOMATED VERIFICATION PASS; actual modified UI desktop/mobile UAT ยังต้องทำ. ไม่ปิด canonical business-flow audit, clinical acceptance หรือ Workbook DoD และไม่เปลี่ยน business-gap statuses. ไม่เริ่ม UX-04.

## 1. Context และ verified gaps

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, current sections ของ docs/CONTEXT.md, UX-01/02 handoffs, canonical OSM/CARE/appointment rows และ WB-00 customer evidence/decision dependencies. ใช้ Impeccable context, Operate, craft floor และ detector; ตรวจ React component checklist. อ่าน local Next.js Link guide ก่อนแก้ navigation.

อ่าน Canva richtexts ของ `DAHSvdQ3gvU` และ `DAHW1jWjScY` โดยตรง: customer intent เชื่อมผู้ป่วยที่ดูแล → จัดบริการ → ผลการจัดบริการ/ทบทวนแผน/ติดตาม และแสดง appointment response แยกต่างหาก. ไม่ตรวจลูกศร/geometry เพิ่มเติมในรอบนี้; ใช้ visually verified repository evidence ใน WB-00. Diagram ไม่ให้สิทธิ์หรืออนุมัติ transition ใหม่.

ปัญหาจาก source:

- Directory row เป็น link ทั้งแถว แต่ไม่มี visible action label ว่าเปิดเพื่อทำงานดูแลต่อ; Hospital กับ HN อยู่คนละกลุ่มและใช้ shrink-0 metadata ซึ่งอ่านยากเมื่อชื่อ/HN ยาว.
- Count เดิม “พบ N รายการ” ไม่อธิบาย grain: query นับ PatientHospitalRelationship ใน exact assigned scope ไม่ใช่ unique persons หรือ tasks.
- Empty state ตรวจเฉพาะ search value: classification-only no-results กลับบอกว่าไม่มีผู้ป่วยมอบหมาย และแนะนำจัด assignment แม้แค่ตัวกรองไม่ตรง.
- ไม่มี reset search/filter entry และ breadcrumb ของ directory ไม่กลับ Work Home.
- Patient Detail มี safe assigned-directory return อยู่แล้ว แต่ breadcrumb ใช้คำทั่วไป “ผู้ป่วย” และ footer ไม่บอกว่าเป็น assigned scope.
- UX-01 Program sections, lifecycle, allowed operations, history และ result/readback routes เชื่อมกันอยู่แล้ว; ไม่มี verified gap ที่ต้องเปลี่ยน shared Program/business implementation ใน phase นี้.

## 2. Actor → Directory → Patient → Program → Operation → Readback

ให้ `R` = exact PatientHospitalRelationship ID, `P` = exact Program ID; base patient path `/app/patients/R`.

| Actor/context | Directory | Patient | Program/operation | Readback/return |
| --- | --- | --- | --- | --- |
| OSM + active exact assignment | `/app/patients/assigned`; NAME partial / HN exact / classification / bounded pagination | row เปิด exact R; Hospital/HN แสดงก่อนเข้า | UX-01 active entry `/programs/P`; sections Service 1 / Goal / Follow-up / Final ใช้ existing flags | Program → Patient; breadcrumb/footer “ผู้ป่วยที่รับผิดชอบ” → assigned directory → Work Home |
| OSM + active association ไม่มี assignment | authorized directory คืน zero relationships | ไม่มี row หรือข้อมูลรายอื่น | association ไม่ใช่ patient authority | empty state อธิบายขอบเขต/contact OWNER โดยไม่สร้าง acceptance task |
| Ended assignment / inaccessible R | predicate `endedAt: null`; crafted detail outside scope ไม่คืน record | fail closed/not-found เดิม | Program revalidates exact assignment/current actor | ไม่มี patient/Program projection จาก unauthorized target |
| Inactive association / suspended Hospital | assigned policy ปฏิเสธเมื่อไม่มี applicable active scope; เมื่อมี scope อื่น query กรองแต่ละ Hospital ตาม persisted predicates | exact R ต้อง authorized | current Hospital/assignment policy เดิม | page redirect/not-found เดิม |
| หลาย OSM associations | shared assigned list แต่แต่ละ row เป็น distinct R/Hospital/HN | ไม่รวม records ข้าม R | query ตรวจ R/P คู่กัน | return ไม่มี browser-selected Hospital authority |
| OSM + PATIENT | Work Home และ directory เดิม | PATIENT ไม่เพิ่ม Work authority | existing scoped Program access | ไม่ส่งกลับ Personal แทน Work |
| Hospital OWNER/MEMBER หรือ multi-role ที่มี direct target scope | `/app/patients?hospitalId=H` เดิม | breadcrumb/footer “รายชื่อผู้ป่วยของโรงพยาบาล” | shared UX-01/Program unchanged; OWNER-only operations แยกตาม policy | กลับ Hospital ของ exact R ไม่กลับ arbitrary Hospital |
| COMPLETED Program / read-only projection | ไม่ประดิษฐ์สถานะ Program ใน directory | history entry เดิม | Program historical/read-only; capability flags แยกจาก lifecycle | report/Goal/Follow-up history/detail เดิม |

## 3. Actual source changes และ before/after

- `app/app/patients/assigned/assigned-patient-directory-view.tsx`: Work Home breadcrumb; current-assignment scope/help; row grid stacks บน mobile, wrap Hospital/HN, visible “เปิดผู้ป่วยเพื่อดูแลต่อ” ภายใน link เดียว. ไม่เพิ่ม CTA ซ้ำหรือ nested interactive element. URL encode exact relationship ID.
- Search ยังเป็น native GET form, เพิ่ม explicit assigned action และ reset เฉพาะ filtered/error state; classification-only และ name/HN no-results มี recovery copy แยกจาก no active assignments. Reset ล้างทั้งคำค้นหา/filter/page ด้วย fixed internal URL.
- Total ใช้ authoritative `result.total` เดิม พร้อม label ความสัมพันธ์ผู้ป่วยและ filtered scope. ไม่คำนวณจาก loaded rows และไม่ query count ใหม่. Pagination links เก็บ lookupType/value/classification/page เดิม.
- `app/app/patients/[relationshipId]/page.tsx`: label ของ existing safe back destination ตรงกับ policy-selected directory; ไม่เพิ่ม role rule, arbitrary return URL, query หรือ route. Combined direct Hospital + OSM ยังเลือก Hospital directory ตาม behavior เดิม. การกลับ list ใช้ canonical URL ไม่เก็บ previous list filters/page; browser Back ยังใช้ได้ตามเดิม.
- New directory static-render tests และ expanded existing assigned-query/Patient Detail tests. ไม่แก้ Program components เพราะ continuity พร้อมอยู่แล้ว.

## 4. Readback และ boundaries ที่ตรวจจาก implementation

ใช้ `findAssignedPatientDirectory()` เดิม: parsed bounded input → assigned policy → identical assignment predicate สำหรับ count/findMany → `take: 25`, deterministic order และ clamped page. No N+1 Program/Baseline/Follow-up query, no new sensitive projection, no cross-Hospital aggregate. Count grain เป็น authorized relationships ไม่ใช่ unique patient count.

Patient Detail อ่าน independently authorized directory/classification/Baseline/Program contexts ตามเดิม. OSM detail predicate ตรวจ actor ID, active Hospital/association/user/OSM role และ assignment `endedAt: null`. Program access service โหลด current authoritative actor และ exact target ก่อน policy; Program detail query ผูกทั้ง P และ R.

Service One/Final บันทึกใน workspace แล้ว refresh/readback พร้อม existing error/success states. Goal save ไป immutable detail ของ R/P. Follow-up save ไป exact detail; กรณี BR-06 “ปรับแผน” ไป existing Goal creation ที่ผูก sourceFollowupId ตาม confirmed decision. Goal/Follow-up detail มี Program/history/Patient return เดิม. Appointment history/detail เป็น separate patient capability; current policy มี read/create/acknowledge/request-cancel/coordination ตาม exact scope แต่ OSM direct manage ยัง deny. ไม่ตีความ appointment acknowledgment เป็น assignment acceptance.

ไม่แก้ authentication/policies/services/mutations/schema/migrations, one-active Program/lifecycle, assignment lifecycle, preferred OSM, request-to-Program linking, reporting/export หรือ LINE reconciliation. Navigation visibility ไม่เป็น authorization. Hospital staff experience, UX-01 Hub และ UX-02 routing/projections คงเดิม.

## 5. Verification — commands และ actual results

Final focused run **16 files / 169 tests PASS**:

```powershell
npm run test -- app/app/patients/assigned/assigned-patient-directory-view.test.tsx src/modules/patient-directory/transport/assigned-patient-directory-page.test.ts src/modules/patient-directory/transport/patient-detail-page.test.ts src/modules/patient-directory/services/patient-assigned-directory-query-service.test.ts src/modules/patient-directory/services/patient-directory-query-service.test.ts src/modules/patient-directory/policies/patient-directory-policy.test.ts 'app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.test.tsx' src/modules/patient-program/policies/patient-program-policy.test.ts src/modules/patient-program/services/patient-program-query-service.test.ts src/modules/patient-program/transport/patient-program-service-one-workspace.test.ts src/modules/patient-final-assessment/transport/final-assessment-workspace.test.ts src/modules/goals/policies/goal-policy.test.ts src/modules/followups/policies/followup-policy.test.ts src/modules/appointments/policies/appointment-policy.test.ts app/app/page.test.ts src/components/app-shell/application-workspace.test.ts
npm run lint -- --max-warnings=0
npm run typecheck
git diff --check
```

- Repository-wide lint zero warnings PASS; typecheck PASS.
- Iteration: initial 3 files/29 PASS; expanded 2 files/28 PASS + 1 FAIL เพราะ new test คาด partial-name predicate OR ที่ root แต่ implementation ใช้ AND of OR tokens. แก้ assertion ให้ตรวจ persisted query structure จริงและ specific Thai name filters; rerun 3 files/36 PASS. ไม่แก้ production service หรือ weaken security assertion.
- Complete code/test diff reviewed ก่อน final checks; detector บน directory คืน `[]`. Strict UTF-8/no replacement characters/no new BOM และ `git diff --check` PASS ก่อน commit.
- Security coverage เป็น policy tests, mocked service predicates/fail-closed และ transport/static-render tests; ไม่ใช่ real DB integration หรือ browser proof ของ cross-Hospital isolation.
- ไม่รัน full suite, production build หรือ dev server เพราะ bounded presentation changes; ไม่มี module boundary ใหม่และ repo ไม่มี architecture:check script.

## 6. Responsive/accessibility และ pending manual UAT

Source/static markup: named heading/nav/result landmarks, native labeled search/select/submit, one focusable row link, visible inset row focus, existing button minimum touch sizes/focus tokens. Single-column controls/rows บน narrow screens, wrap long Hospital/HN/name text, result/header groups wrap. ไม่เพิ่ม client hooks, global shell behavior หรือ loading/error infrastructure.

Browser available แต่ DEMI tab ที่เปิดอยู่เป็น Hospital staff provisioning session ที่กำลังใช้งาน และ deployed version ไม่ใช่ modified UX-03 code. ไม่เปลี่ยนหน้า/session หรือ submit mutation. **ไม่ได้ทำ actual modified desktop/mobile/browser UAT** และยังไม่มี authorized OSM test session สำหรับ phase นี้.

ต้อง UAT ใน authorized non-production environment:

1. 320/375px mobile และ desktop; ชื่อไทย/Hospital/HN ยาว, no overflow, keyboard Tab/Enter, visible focus, reset/filter/pagination และ screen-reader labels.
2. Exact assigned/unassigned/ended OSM, inactive association, suspended Hospital, multiple associations, OSM+PATIENT และ Hospital OWNER/MEMBER/multi-role; crafted R/P ต้อง fail closed กับ actual database.
3. Directory → Patient → active/completed Program → permitted/read-only operations → saved readback → Patient → correctly scoped directory/Home; pending/error/conflict feedback ของ existing forms.

## 7. Decision-gated / next phase

P-14 Assignment Acceptance/decline lifecycle, appointment reschedule-request semantics, P-17 six-round UI, P-18 due/extra activities, P-13 automatic request-to-Program links และ clinical progress/mandatory next steps ไม่ implement. ไม่มี fake urgency/deadline/queue/clinical-completion labels. Safe UX portion นี้ไม่ต้องรอ decisions เหล่านั้น.

Recommended next phase: **UX-04 Hospital Service Request Workspace**, หลัง UX-03 review/UAT; ไม่เริ่มอัตโนมัติ.
