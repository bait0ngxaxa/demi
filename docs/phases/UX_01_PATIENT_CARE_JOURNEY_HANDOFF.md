# UX-01 — Patient Care Journey Hub

วันที่: 2026-10-12 (Asia/Bangkok)

Analyzed branch / HEAD: `main` / `e11dda3d40ec7d559194f5d3420ba3155a640bd6` ตรงกับ reference HEAD และ working tree สะอาดก่อนเริ่มงาน. ตรวจ remote main ก่อนส่งงานแล้ว ยังอยู่ที่ HEAD เดิม.

Disposition: IMPLEMENTED / FOCUSED AUTOMATED VERIFICATION PASS; manual browser/mobile UAT ยังต้องทำ. Phase นี้ไม่ปิด BF-GAP-02, customer clinical requirements หรือ full Workbook DoD และไม่เปลี่ยนสถานะใน canonical business-gap register.

## 1. Context และปัญหาที่ตรวจจาก source

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, docs/CONTEXT.md และ relevant sections ของ BUSINESS_FLOW_GAP_CANONICAL, BF-GAP-01R, BF-GAP-WB-00 และ BF-GAP-WB-03. ใช้ Impeccable context / Operate / craft floor และตรวจ React component checklist; Next.js 16.3 local `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` ยืนยัน route/hash navigation และ scroll-margin สำหรับ sticky header.

Canva connector อ่าน metadata และ richtexts ของ “ร่าง DEMI App ใหม่” (`DAHSvdQ3gvU`) และ “DEMI App Flow” (`DAHW1jWjScY`) โดยตรงได้. Summary ระบุ Onboard → นัดหมาย/ร้องขอบริการ → มอบหมาย/ตอบรับ → จัดบริการ → บันทึกผล → ทบทวนแผนสุขภาพ → ติดตามรอบถัดไป. ใช้ข้อความนี้เป็น customer intent เท่านั้น ไม่ได้ตรวจ geometry/ลูกศรทางภาพในรอบนี้; ใช้ visually verified repository evidence ใน WB-00 §3.1 และ Owner decisions §5.1 สำหรับ round reporting. ไม่ถือว่า diagram อนุมัติ transition หรือ authority ใหม่.

ปัญหาที่ตรวจพบ:

- Patient Detail วาง full profile, account recovery และ classification/history ก่อน Baseline/Program; history links บางรายการมีน้ำหนัก primary เทียบเท่างานปัจจุบัน.
- Active Program มีเพียง detail link; ผู้ใช้ต้องค้นหา Service 1, Goal Plan, Follow-up และ Final ในหน้ายาวเอง.
- Program Detail เริ่มด้วยคำอธิบายขอบเขตยาว ก่อน patient/lifecycle context; read-only alert ของ completed Program อยู่ท้ายหน้า.
- Goal Plan และ Follow-up empty states แสดง creation CTA ซ้ำกับ section header.

## 2. Route และ read-model architecture

`application-navigation.ts` project เมนูจาก capability/scope; `application-workspace.ts` และ `/app` ให้ direct Hospital directory actions พร้อม `hospitalId` และ OSM assigned directory แยกกัน. AppShell ใช้ responsive sidebar/drawer กับ main landmark. Hospital selector เป็น local screen context ไม่ใช่ global authority. ไม่แก้ shell หรือ home ใน UX-01.

Directory → `/app/patients/[relationshipId]` ใช้ opaque PatientHospitalRelationship ID. Page เรียก `getPatientDirectoryDetail`, classification page context, Baseline navigation และ Program page context ผ่าน services ที่ตรวจสิทธิ์แยกกัน. Classification เป็น Patient-wide current fact ตาม domain เดิม; HN/profile/Hospital context ยังคง exact relationship. Profile fallback semantics ไม่เปลี่ยน.

Program → `/app/patients/[relationshipId]/programs/[programId]` ตรวจคู่ relationship/Program ผ่าน `getPatientProgramDetail`. Goal overview/detail, Follow-up history และ Final projection ถูก resolve โดย existing authorized services. Service 1 อยู่ใน detail projection เดิม. Hub ไม่เพิ่ม query, persistence, workflow engine หรือ authorization rule.

## 3. Actor → Entry → Patient Context → Current State → Available Action → Destination → Readback

ในตาราง `R` = exact relationship ID, `P` = exact Program ID; base path = `/app/patients/R`.

| Actor | Entry | Patient Context | Current State | Available Action | Destination | Readback |
| --- | --- | --- | --- | --- | --- | --- |
| Hospital OWNER | `/app` หรือ `/app/patients?hospitalId=H` | direct ACTIVE Hospital membership + exact R | Baseline absent / present | create เฉพาะ `canCreate`; present อ่านอย่างเดียว | `/baseline` | immutable Baseline วันที่บันทึก |
| Hospital MEMBER | direct Hospital directory | exact R ใน Hospital ของสมาชิก | เช่นเดียวกับ OWNER | care operations ตาม existing service flags; ไม่มี OWNER assignment shortcut | `/programs/P` และส่วนงาน | บันทึกใน Program และ histories เดิม |
| OSM exact current assignment | `/app/patients/assigned` | exact R + active OSM–Hospital association/assignment | ACTIVE Program หรือไม่มี Program | open ตาม `canOpen`; manage ตาม Program policy; Follow-up ตาม `canRecord` | `/programs/P`, goals/followups new paths เดิม | Program-scoped records; กลับ assigned directory |
| Authorized care actor | Patient hub | exact R | ACTIVE Program | เปิด workspace; neutral section links ไม่อ้างว่า mutation ใช้ได้ | `/programs/P#program-service-one`, `#program-goals`, `#program-followups`, `#program-final` | สถานะ record presence และ operations จาก projection เดิม |
| Authorized care actor | Program workspace | exact R/P | COMPLETED | อ่านประวัติ/รายงาน; ไม่มี Program writes | Program detail/report และ record details เดิม | historical read-only records |
| Authorized care actor | Supporting information | exact R | ไม่เดาสถานะจาก missing records | neutral navigation | `/screenings`, `/goals`, `/followups`, `/appointments`, `/evidence` | histories/details ของแต่ละ domain; create/manage ตรวจที่ destination ตามเดิม |
| Hospital OWNER | Context/support disclosure | exact Hospital/R | policy allows | จัดการ assignment / account recovery ตาม policy เดิม | `/assignment` / recovery panel | history/feedback เดิม |
| OSM ไม่มี applicable assignment | assigned directory หรือ crafted R/P | ไม่มี exact scope | inaccessible | ไม่มี care projection | existing denied/not-found path | ไม่ส่งข้อมูลผู้ป่วย |
| Platform ADMIN ไม่มี care scope | governance workspace หรือ crafted R/P | ADMIN ไม่ให้ routine Patient authority | inaccessible | ไม่มี routine care actions | existing denied/not-found path | ไม่ส่งข้อมูลผู้ป่วย |
| Multi-role รวม PATIENT | work directory แยก personal workspace | work authority ต้องมี Hospital/assignment scope; SELF ไม่ขยาย work scope | ตาม exact target | ใช้ scoped care capability เดิม | work R/P เดิม; personal routes ไม่ถูกเพิ่ม | ประวัติแยกตาม Hospital relationship |
| ผู้มีหลาย Hospital relationships | selected Hospital directory / exact assignment | ตรวจ Hospital ของ R ทุกครั้ง | ตามแต่ละ R/P | เฉพาะ direct membership/assignment ของ target | URLs ผูก R/P; back link ผูก Hospital ของ patient | ไม่รวม cross-Hospital records |

## 4. Gap classification และสิ่งที่แก้

| Classification | Gap / disposition |
| --- | --- |
| UX_ONLY | แบ่ง Patient Detail เป็นบริบท → งานดูแลปัจจุบัน → ข้อมูลประกอบ/ประวัติ พร้อม local anchor navigation |
| UX_ONLY | แนะนำ Baseline เมื่อ absent + `canCreate`; มิฉะนั้นเน้น active Program entry ถ้ามี โดยไม่สร้าง prerequisite |
| UX_ONLY | แยก completed Program history ผ่าน native details/summary และ secondary links; classification current badge แสดงทันที ส่วน manage/history เปิด disclosure |
| UX_ONLY | Program section navigation แสดง record presence จริงและ lifecycle/read-only context ก่อน workspaces; completion อยู่ร่วมกับ Final แต่ยังเป็น operation แยกกัน |
| UX_ONLY | ตัด empty-state creation CTA ที่ซ้ำ โดยเก็บ header CTA และ URL เดิม; account recovery ลดลำดับไว้ใน supporting disclosure |
| READ_MODEL | Hub-level due items, appointment next-task summary, assigned-person summary หรือจำนวน care records ที่ไม่มีใน page context: ไม่เพิ่ม projection ใน phase นี้ ใช้ neutral links |
| DECISION_GATED | P-13 ServiceRequest → delivery link, P-14 assignment acceptance, P-15 preferred/proposed OSM: ไม่ implement |
| DECISION_GATED | P-16 Health Plan identity, P-17 six-round navigator, P-18 due/extra activities, P-19 atomic plan adjustment: ไม่ implement |
| OUT_OF_SCOPE | Role-based Home redesign, schema/migrations, reporting expansion, clinical definitions, platform/native/notification changes |

Workbook mapping เดิมยังเป็น Round 1 = Service One, Round 2 = Goal Plan, Rounds 3–6 = Follow-up สำหรับ reporting. Navigation ใหม่แบ่งตาม domain capabilities ไม่มี numbered rounds, progress completion หรือ six-step mandatory workflow. ชื่อ Health Plan ใน workspaces เดิมไม่ได้ถูกตีความเป็นการปิด P-16.

## 5. Files และ behavior changed

- `app/app/patients/[relationshipId]/page.tsx`: three-level hub, current classification badge, contextual recommendation, supporting/history grouping และ native disclosure.
- `app/app/patients/[relationshipId]/programs/patient-program-view.tsx`: active workspace priority, exact Program section links และ completed-history disclosure.
- `app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.tsx`: lifecycle/context first, section navigator with record-presence labels, read-only message early, Final/completion grouping และ Patient return action.
- `app/app/patients/[relationshipId]/programs/[programId]/service-two-workspace.tsx` และ `followup-workspace.tsx`: remove duplicate empty-state CTA เท่านั้น.
- `app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.test.tsx`: render real composed workspaces with mocked action hooks; verify links, empty/present records, readonly/completed states, independent action flags และ Program opening.
- `src/modules/patient-directory/transport/patient-detail-page.test.ts`: unavailable Baseline, preserved destinations, contextual Program suggestion, scoped back links และ multi-role behavior.
- `src/modules/patient-program/policies/patient-program-policy.test.ts`: direct OWNER/MEMBER + PATIENT self role และ multiple exact Hospitals.
- เอกสาร handoff นี้.

## 6. Business / security invariants preserved

- ไม่มี production policy/service/schema/migration/mutation changes. Server ยังคงตรวจ current actor, Hospital status, relationship และ assignment; navigation ไม่เป็น authorization boundary.
- Program ACTIVE/COMPLETED, one-active-episode constraint, open/complete semantics, immutable histories และ transaction/idempotency behavior เดิม.
- Final Assessment และ Program completion แยกกัน; ไม่บังคับ Final หรือ Service 1/Screening/Goal Plan ก่อนการจบหรือ Follow-up เพิ่มเติม.
- Goal Plan creation ใช้ ACTIVE + existing `canManage`; Follow-up ใช้ ACTIVE + `canRecord`; Service 1 และ Final ใช้ controls เดิม รวม pending/error/success feedback.
- ADMIN role เพียงอย่างเดียวไม่มี routine Patient access; multi-role ADMIN ที่มี valid scoped care role ยังคงใช้งานได้ตาม policy เดิม. PATIENT self-access ไม่ให้ authority ต่อ arbitrary patient.
- URL เดิมทุก destination ยังเข้าถึงได้; เพิ่มเฉพาะ hash anchors. ไม่มีข้อมูลอ่อนไหวเพิ่ม ไม่มี status/count สมมติ.
- ใช้ existing Panel, StatusBadge, Alert, buttonClassName, Thai labels และ tokens. Existing file encodings/line endings ถูกคงไว้; ไฟล์ใหม่ UTF-8 without BOM.

## 7. Verification — actual results

Final focused verification: **11 files / 93 tests PASS**:

```powershell
npm run test -- src/modules/patient-directory/transport/patient-detail-page.test.ts 'app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.test.tsx' src/modules/patient-program/policies/patient-program-policy.test.ts src/modules/patient-program/services/patient-program-query-service.test.ts src/modules/patient-program/services/patient-program-service.test.ts src/modules/patient-directory/policies/patient-directory-policy.test.ts src/modules/patient-directory/services/patient-directory-query-service.test.ts src/modules/patient-directory/services/patient-assigned-directory-query-service.test.ts src/modules/patient-baseline/policies/patient-baseline-policy.test.ts src/modules/patient-program/transport/patient-program-service-one-workspace.test.ts src/modules/patient-final-assessment/transport/final-assessment-workspace.test.ts
```

- `npm run lint -- --max-warnings=0`: PASS, repository-wide ESLint with zero warnings.
- `npx --no-install eslint 'app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.test.tsx' --max-warnings=0`: PASS หลังแก้ test fixture type.
- `npm run typecheck`: PASS หลังแก้ local nullable callback reference และ incomplete test fixture. Earlier failures เป็น introduced development errors ที่แก้แล้ว.
- Initial 4-file targeted run: 31 PASS / 1 FAIL จาก assertion substring ที่จับ unavailable copy ด้วย; แก้เป็นตรวจ absent Baseline destination แล้ว final suite ผ่าน.
- `npm run lint:strict` และ `npm run architecture:check`: ไม่สามารถรันได้ เพราะ package.json ไม่มี scripts ทั้งสองชื่อ. ไม่เพิ่ม scripts เพื่อทำให้สถานะดูผ่าน. Import review ยืนยันว่าไม่มี lower-layer → UI dependency ใหม่; queries/mutations ผ่าน boundaries เดิม.
- ตรวจ complete diff ก่อน final focused verification; `git diff --check` และ UTF-8 / replacement-character inspection ผ่าน.
- Full suite, production build, database integration และ development server: ไม่รัน เพราะ change เป็น bounded presentation; existing policy/query/service tests ให้ focused signal และไม่มี runtime/schema/config change ที่ต้อง build.
- Browser inventory ตรวจแล้ว ไม่มี DEMI tab/session ที่พร้อมใช้งาน. **ไม่ได้ทำ actual browser/mobile validation** และไม่ถือ static render tests เป็น browser UAT.

## 8. Responsive/accessibility review และ manual testing remaining

Source/render review: native links สำหรับ navigation, buttons/forms สำหรับ mutations, named nav landmarks, semantic headings, native keyboard-operable details/summary, visible focus classes, focusable hash targets และ `scroll-mt-24` รองรับ header เดิม. Navigation ใช้ wrap และ single-column บน mobile / two-column ตั้งแต่ sm; patient context ใช้ break-words. ไม่เพิ่ม fixed-width containers หรือ horizontal scrolling. Pending/error/success components เดิมยังอยู่.

ต้องทดสอบใน authenticated non-production environment ด้วย authorized test patients:

1. Desktop และ 320/375px mobile: ชื่อ/HN/Hospital และ Thai labels ยาว, no horizontal overflow, anchor offset, directory return context.
2. Keyboard: Tab/Shift+Tab, Enter/Space บน disclosures, focus visibility และ hash target behavior.
3. OWNER, MEMBER, assigned OSM, unassigned OSM, ADMIN-only, multi-role + PATIENT และหลาย Hospital relationships; crafted cross-Hospital R/P ต้อง fail closed.
4. No/existing Baseline, no/ACTIVE/COMPLETED Program, empty/present Goal/Follow-up/Final, historical links, pending/error/success และ conflict feedback หลัง mutation เดิม.
5. Manual customer UAT สำหรับการจัดลำดับงานและการค้นพบ history/disclosures; ไม่อ้าง clinical validation จาก UX labels.

## 9. Next phase

แนะนำ **UX-02 Role-based Home & Action Workspace** หลัง review/UAT UX-01 โดยใช้ actor capabilities และ local Hospital context เดิม. UX-02 ยังไม่เริ่ม. P-13–P-19 และ Workbook/clinical/governance gates ยังคงต้องตัดสินแยกตาม canonical documents.
