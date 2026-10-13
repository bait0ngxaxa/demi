# UX-05 — Patient Personal Home & Self-Service Journey

วันที่: 2026-10-13 (Asia/Bangkok)

Base commit: `d836556b739d418bf8453724601fb60b9b9b9776`, branch `main`; actual HEAD ตรง reviewed baseline. ก่อนเริ่มมี untracked `outputs/` ซึ่งไม่อ่าน/แก้/stage. ตรวจ remote main ก่อนส่งงานแล้วตรง base เดิม.

Final working-tree inspection: `outputs/` ไม่อยู่แล้ว (`Test-Path` false); task นี้ไม่มี delete/move operation สำหรับ path ดังกล่าวและไม่รวม path นี้ใน commit.

Final commit: commit ที่เพิ่ม handoff นี้พร้อม source/tests; resolve full SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_05_PATIENT_PERSONAL_EXPERIENCE_HANDOFF.md`. ไม่สามารถฝัง hash ของ commit ไว้ในเนื้อหาของ commit เดียวกันได้; delivery report ระบุ full final SHA หลัง commit/push.

Disposition: UX-05 IMPLEMENTED / FOCUSED AUTOMATED VERIFICATION PASS. Browser/mobile UAT ยังต้องทำ. ไม่อ้าง clinical acceptance, production readiness หรือ complete Owner Workbook DoD; ไม่เปลี่ยน canonical business-gap statuses และไม่เริ่ม UX-06.

## 1. Context และ verified source problems

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, relevant patient sections ของ docs/CONTEXT.md และ UX-01–04 handoffs. ตรวจ BUSINESS_FLOW_GAP_CANONICAL, WB-00 pending decisions, Owner-approved profile/account contract 17E.0, service request contract 17E.3, medication 17G.1/2, wellness 17H.0B และ Patient content 17I.3 พร้อม current implementations. ใช้ Impeccable context / Operate / clarify / craft floor และ detector; คง Quiet Clinical Access tokens/primitives. อ่าน local Next.js 16.3 Link guide และ React component checklist ก่อนส่งงาน.

Canva public view URL เปิดผ่าน web tool ไม่ได้; Canva connector อ่าน richtexts ของ `DAHSvdQ3gvU` และ `DAHW1jWjScY` ได้. Customer intent มี care information, appointments, service requests, medications, Food & Fitness, profile, Hospital contact และ family. ไม่ตรวจ geometry/ลูกศรเพิ่มเติมในรอบนี้; ใช้ visually verified repository evidence ของ WB-00 ประกอบ. Legacy password/DOB, family access, อสม. acceptance และ health interpretation ในภาพไม่ใช่การอนุมัติ business/identity rules ใหม่.

ปัญหาจาก source ที่แก้:

- Home มี navigation buttons ขนาดใกล้เคียงกันใน PageHeader โดยไม่มีคำอธิบายปลายทาง; identity Panel กับ role/context badges เด่นก่อนกิจกรรม.
- Home ไม่มีทางเข้าฟังก์ชัน wellness และ knowledge แม้มี authorized Personal destinations จริง.
- Hospital list มีเพียง profile action; ไม่มี exact relationship care entry. React key เดิมใช้ Hospital code/name/index แทน relationship ID.
- หน้าเลือก Hospital สำหรับ care และ appointments ใช้ component เดียวกันซึ่งวาง care เป็น primary action เสมอ แม้ผู้ใช้เลือกนัดหมายมาแล้ว.
- Medication, wellness และ knowledge feed ไม่มี local return navigation ไป Personal Home; ส่วน care/appointments/profile/services และ record detail routes มี continuity อยู่แล้ว.

## 2. Before / after structure

| Before | After |
| --- | --- |
| PageHeader รวมทางลัดหกปุ่ม | PageHeader สั้น ตามด้วยชื่อจาก persisted identity |
| ไม่มีคำอธิบายบริการแต่ละพื้นที่ | การดูแลและบริการ: care → appointments → service requests พร้อมผลที่ปลายทางรองรับจริง |
| ยา/profile/family อยู่กลุ่มเดียวกับงานหลัก | กลุ่มข้อมูลสุขภาพส่วนตัว: medications, wellness, profile, knowledge |
| Hospital context + profile link | exact Hospital context/contact เดิม + primary care link และ secondary profile link |
| Role/context badges บน identity panel | account/password และ family อยู่ section รองท้ายหน้า |
| Hospital selector มี care + appointment CTAs แข่งกัน | selected area กำหนดหนึ่ง primary destination ต่อ relationship |
| บาง supporting pages ต้องใช้ shell เพื่อกลับ | local breadcrumbs/return navigation กลับ Personal โดยไม่แก้ global shell |

Home ไม่มี health KPI, pending-task/overdue badge, progress, risk/adherence score หรือ inferred clinical completion. Copy อธิบายว่า request ไม่สร้าง Program/appointment/assignment อัตโนมัติ และ personal medication/wellness เป็นข้อมูลที่ผู้ป่วยบันทึกเอง.

## 3. Patient self-service journey crosswalk

ให้ `R` = exact PatientHospitalRelationship ID, `P` = existing Program ID, `A` = existing Appointment ID. Navigation ใช้ encoded locator ที่ service ส่งมา ไม่ใช้ Hospital code, Person ID หรือ request ID แทน R.

| Home entry | Selection / destination | Existing operation / readback | Return |
| --- | --- | --- | --- |
| ข้อมูลการดูแลของฉัน | `/app/personal/care` → `/app/personal/care/R` หรือ exact Hospital card บน Home | factual Screening/Baseline, Program/Goal/Follow-up histories; existing `/programs/P`, `/goal-plans/{id}`, `/followups/{id}` | existing detail → relationship care → selection/Home breadcrumbs |
| นัดหมายของฉัน | `/app/personal/appointments` → `/app/personal/appointments/R` → `/A` | own appointment details/history; acknowledgement-only และ cancellation request เมื่อ existing policy อนุญาต; ไม่เพิ่ม scheduling/reschedule/direct cancel | existing relationship/history/Home breadcrumbs |
| คำขอรับบริการของฉัน | `/app/personal/services` | existing per-relationship available offerings, preferred OSM, submission/status/withdraw; โรงพยาบาลตรวจคำขอ และ preference ไม่ใช่ assignment | existing Home breadcrumb; action feedback/readback เดิม |
| ยาของฉัน | `/app/personal/medications` | own item create/edit, daily schedule, stop tracking และ history; ไม่มี clinical prescription/medical advice | เพิ่ม Home breadcrumb; existing item/list return คงเดิม |
| บันทึกสุขภาพของฉัน | `/app/personal/wellness` | independent food/exercise journals และ target-only weight goal; existing create/edit/delete/feedback และ private lifecycle | เพิ่ม Home breadcrumb ทั้ง normal และ authority-unavailable state |
| ข้อมูลของฉัน | `/app/personal/profile` → `/app/personal/profile/R` | exact Hospital permitted general fields; name/DOB/National ID/HN/clinical data ไม่ถูกเพิ่มเป็น Patient edits | existing profile/Home breadcrumbs |
| ข่าวสารและความรู้ | `/app/personal/knowledge` → `/{contentId}` | authorized published Hospital content, attribution, category/cursor navigation, read-only | เพิ่ม Home breadcrumb ที่ feed ทั้ง READY/VALIDATION โดยใช้ existing PatientContentLink document GET |
| โรงพยาบาล | exact Home relationship row | name/code/HN/status/contact เดิม; care/profile links ของ R เดียวกัน | existing scoped routes/Home |
| บัญชีและผู้ดูแล | `/app/personal/password`, `/app/family` | existing own account password change และ separately authorized relationship/grant management | existing destinations/shell navigation; ไม่มี global navigation redesign |

Services ไม่มี route filter R; Home ใช้ generic services URL จริง ไม่เติม hospitalId/relationshipId ที่ query ไม่รองรับ. Medication/wellness เป็น Patient-profile SELF scope ไม่ใช่ shared Hospital clinical record. Knowledge feed มี attribution ต่อ Hospital ตามเดิม ไม่ย้าย content มา Home.

## 4. Scope / security / privacy preserved

- Home ยังคงเรียก `getPatientPersonalHomePageContext()` และ `scheduleCurrentLineAccountReconciliation()` ใน page เดิม. ไม่แก้ scheduler/provider behavior.
- `resolveOwnPatientContext()` ใช้ exact actor.userId/personId, current ACTIVE persisted User และ persisted PATIENT role. Person/User แยก identity ตามเดิม; Home ไม่รับ client-selected Patient.
- PATIENT-only, OSM+PATIENT และ HOSPITAL+PATIENT เข้า Personal ด้วย SELF เท่านั้น. Home component ไม่ใช้ professional role เพื่อเพิ่ม Work links. Work Home/PATIENT redirect และ global navigation projections ไม่แก้.
- Care queries resolve R ภายใต้ current User → Person → PatientProfile ownership ก่อนโหลด record; Program/Goal/Follow-up/Appointment detail ตรวจคู่ R/resource ID. Forged locators ไม่เพิ่ม authority.
- ACTIVE/SUSPENDED/PENDING_VERIFICATION Hospitals ยังคงมี distinct relationship navigation และ historical reads ตาม policy เดิม. ไม่กรองทิ้งด้วย UI status. Contact แสดงเฉพาะ authorized ACTIVE projection ตาม behavior เดิม; confirmed-empty, unavailable และ inactive copy แยกกัน.
- Missing identity/Profile ยังคง null/unavailable state และไม่มี self-service controls ที่อ้างข้อมูลพร้อม. Missing name แสดง “ยังไม่ได้บันทึกชื่อในระบบ”; resolved Profile ที่ไม่มี Hospitals ยังคงเข้าฟังก์ชันส่วนตัวได้ และแต่ละ destination แสดง own empty state.
- Hospital list key ใช้ relationshipId; code/name/HN/status/contact และ URLs ผูก R เดียวกัน ไม่ merge คนเดียวกันข้าม Hospital. Home ไม่แสดง general profile phone/address/emergency contact หรือ internal identity IDs เพิ่ม.
- Family relationship ไม่ grant ข้อมูลสุขภาพทั้งหมด. Existing appointment-only delegated grant มี independent proposal/acceptance/exact-PHR checks และ operational/governance gates; ไม่มีการเปลี่ยน allowlist หรือ authority.
- ไม่มี changes ต่อ authentication/policies/services/schema/migrations/transactions/validation, clinical calculation, Program/assignment lifecycle หรือ mutations. Original pending/success/error/conflict behavior ของฟอร์มคงเดิม.
- Knowledge Home breadcrumb ใช้ existing protected PatientContentLink (prefetch=false + authoritative document GET) แทนเพิ่ม cached-navigation path. Private lifecycle/boundary ของ knowledge และ wellness คงเดิม.

## 5. Read models / query cost / performance findings

Reuse Home context เดิม: one own identity/relationship query + batch own Hospital Contact service แล้ว Map join ด้วย relationshipId. ไม่มี per-card query, no Program/appointment/follow-up/medication/service-request histories on Home และไม่มี cross-domain dashboard summary. ไม่เรียก compact next-appointment query เพราะไม่จำเป็นต่อ entry-point UX นี้.

New and changed Home/relationship navigation links ใช้ prefetch=false เพื่อไม่ pre-load private destinations/ทุก Hospital care history จากรายการลิงก์นี้. Knowledge protected-link semantics คงเดิม. ไม่มี count/total ที่คำนวณจาก loaded rows และไม่มีการอ้าง clinical record presence จาก Home.

Existing limits ที่ไม่แก้ใน phase นี้:

- Own relationship projection และ batch contact query ไม่มี explicit pagination limit; cost O(R) สำหรับ Hospitals ที่ผูกกับผู้ป่วยรายเดียว ไม่ใช่ whole-system Patient history. ไม่เพิ่ม collection หรือทำ fixed take ที่ซ่อน Hospitals. หาก cardinality สูงขึ้นต้องออกแบบ relationship pagination โดยรักษา exact scope/contact semantics.
- Personal `listOwnPatientServiceRequests()` มี nested own serviceRequests history แบบไม่มี bounded pagination. UX-05 ไม่ดึง history นี้เข้า Home และปิด link prefetch จาก Home; gap ที่ปลายทางยังอยู่ ควรทำ focused server-side pagination/count contract แยก. Hospital-side UX-04 keyset pagination ไม่ทำให้ Personal-side history bounded โดยอัตโนมัติ.
- Care/appointment histories มี existing bounded pages; medication, meals/exercises และ knowledge ใช้ existing cursors. ไม่มีการเปลี่ยน query contract/index หรือ claim measured latency. ไม่ได้ทำ realistic-volume benchmark/EXPLAIN.

## 6. Changed source and tests

Source (8 files):

- `app/app/personal/patient-personal-home.tsx`: task hierarchy, accurate Thai descriptions, wellness/knowledge/account entries, compact identity, responsive links, empty-state recovery.
- `app/app/personal/patient-self-relationship-list.tsx`: optional Home care navigation, stable R key, screen-reader Hospital context, existing contact/profile behavior preserved.
- `app/app/personal/patient-self-relationship-navigation.tsx`: explicit selected-area prop, one exact-R CTA, readable Hospital patient-number label.
- `app/app/personal/care/page.tsx`, `appointments/page.tsx`: pass corresponding area to existing shared selector.
- `app/app/personal/medications/personal-medication-workspace.tsx`, `wellness/personal-wellness-workspace.tsx`: Home breadcrumbs only.
- `app/app/personal/knowledge/patient-content-feed.tsx`: Home breadcrumb using existing privacy-safe link.

Tests (6 files):

- `app/app/personal/personal-pages.test.ts`: hierarchy, exact primary/supporting destinations, no/one/multiple Hospitals, all Hospital statuses, missing identity/name/optional fields, long Thai/escaping, prefetch disabled, no Work/PII/health metrics/false completion, area continuity/empty selection, LINE scheduler preservation.
- `app/app/personal/patient-self-care-views.test.tsx`: selected care-only Hospital navigation; existing Program/history/appointment/empty projections retained.
- `app/app/personal/medications/personal-medication-workspace.test.tsx`, `wellness/personal-wellness-workspace.test.tsx`, `knowledge/patient-content-views.test.tsx`: Personal return path; knowledge privacy-safe prefetch behavior including validation recovery.
- `src/modules/patient-self/services/patient-self-query-service.test.ts`: foreign relationship denial expanded to PATIENT, OSM+PATIENT, HOSPITAL+PATIENT; exact persisted SELF predicate assertions preserved.

Documentation: this handoff. ไม่มี dependencies/lockfile, canonical registers, Work surfaces หรือ unrelated outputs changes.

## 7. Verification actually executed

Final focused Vitest regression: **30 files / 286 tests PASS**:

```powershell
npm run test -- app/app/personal/personal-pages.test.ts app/app/personal/patient-self-care-views.test.tsx app/app/personal/patient-hospital-contact-card.test.tsx app/app/personal/medications/personal-medication-workspace.test.tsx app/app/personal/medications/medication-schedule-editor.test.tsx app/app/personal/medications/page.test.tsx app/app/personal/wellness/personal-wellness-workspace.test.tsx app/app/personal/wellness/personal-wellness-private-lifecycle.test.tsx app/app/personal/wellness/personal-exercise-lifecycle.test.tsx app/app/personal/wellness/personal-meal-lifecycle.test.tsx app/app/personal/wellness/personal-weight-goal-review-lifecycle.test.tsx app/app/personal/wellness/page.test.tsx app/app/personal/knowledge/patient-content-views.test.tsx app/app/personal/knowledge/patient-content-private-boundary.test.tsx app/app/personal/knowledge/page.test.tsx app/patient/patient-core-flow-ui.test.tsx src/modules/patient-self/policies/patient-self-policy.test.ts src/modules/patient-self/services/patient-self-query-service.test.ts src/modules/patient-self/services/patient-self-care-query-service.test.ts src/modules/patient-self/transport/patient-self-page-context.test.ts src/modules/patient-hospital-profile/policies/patient-hospital-profile-policy.test.ts src/modules/patient-hospital-profile/services/patient-hospital-profile-service.test.ts src/modules/patient-service-requests/policies/patient-service-request-policy.test.ts src/modules/medications/policies/personal-medication-policy.test.ts src/modules/medications/services/personal-medication-services.test.ts src/modules/medications/services/medication-schedule-services.test.ts src/modules/family/policies/caregiver-relationship-policy.test.ts src/modules/family/services/appointment-grant.test.ts src/components/app-shell/application-navigation.test.ts app/app/page.test.ts
npm run typecheck
npm run lint -- --max-warnings=0
git diff --check
```

Typecheck: PASS. Repository-wide lint zero warnings: PASS. Diff whitespace check: PASS. Impeccable detector on six changed UI components: completed, JSON `[]` (no findings). Final source/test diff reviewed before final regression/lint/typecheck. No newly introduced any/non-null assertions, generated/vendor changes or lower-layer UI imports. Thai text preserved; UTF-8 inspection included at delivery.

Initial focused UI run: 46 PASS / 1 FAIL from a test regex assuming href precedes data-prefetch. Corrected assertion uses independent attribute predicates; targeted confirmation 25 PASS. After stable source/test changes, affected 7-file run 65 PASS before final 30-file regression. No production behavior weakened to pass tests.

Full suite, DB integration, production build/dev server and real browser/mobile UAT not run: presentation-only changes reuse unchanged authorized services/mutations and focused policy/query/private-lifecycle tests. Repo has no architecture:check script; reviewed import boundaries directly. No authorized test browser/account supplied; static rendering does not verify hydration, geometry or device behavior.

## 8. Remaining manual UAT

Use authorized synthetic/non-production test accounts:

1. PATIENT-only, OSM+PATIENT, HOSPITAL+PATIENT: Home → each self-service destination → exact own data; no Work authority added by PATIENT and no other-person access through professional role.
2. No/one/multiple Hospitals; ACTIVE/SUSPENDED/PENDING_VERIFICATION; missing Profile/name/HN/contact. Historical records remain visible only according to current domain policy. Contact unavailable is distinct from confirmed empty.
3. Desktop, 320px/375px, 200% zoom: long Thai names/Hospital codes/address, button text wrapping, no horizontal overflow, large touch targets, readable hierarchy.
4. Keyboard/screen reader: heading/nav structure, Tab/Enter/visible focus, exact Hospital link names, breadcrumb returns and unavailable-state recovery.
5. Care → existing Program/Goal/Follow-up detail → back; missing clinical/appointment records; forged R/Program/Appointment/service/medication IDs must be denied by destination services.
6. Existing appointment acknowledgement/cancellation request, service submit/withdraw, profile edit, medication/schedule/stop, food/exercise/target operations: pending, success/error/conflict and persisted readback after navigation/reload.
7. Knowledge/wellness privacy after logout/account change/pagehide/BFCache; Home link and private boundaries must maintain authoritative rechecks. Family invitation/grant entry must not expose unauthorized clinical data.
8. LINE Home lazy reconciliation unchanged in authenticated runtime; no real provider notification behavior newly authorized.

## 9. Exclusions / next phase

P-13 request-to-delivery linkage, P-14 OSM acceptance, P-15 preferred/actual OSM, P-16 Health Plan identity, P-17 six-round navigator, P-18 due/extra activities และ P-19 atomic plan adjustment remain separately decision-gated. ไม่ implement new clinical interpretation/measurement advice, scheduling powers, cross-Hospital merged clinical record, caregiver clinical access, consent/legal documents, provider notifications or global navigation redesign.

Recommended next phase: **UX-06 Appointment & Cross-role Handoff** หลัง UX-05 review/UAT. ไม่เริ่ม UX-06 อัตโนมัติ; UX-08 global navigation และ full Owner Workbook DoD ยังคงแยกขอบเขต.
