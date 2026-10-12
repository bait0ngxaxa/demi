# UX-02 — Role-based Home & Action Workspace

วันที่: 2026-10-12 (Asia/Bangkok)

Base commit: `4286be07496390765db23b98259a26273b2cdd60`, branch `main`; HEAD ตรง reference และ working tree สะอาดก่อนเริ่ม. ตรวจ remote ก่อนส่งงานแล้ว main ยังอยู่ที่ base เดิม.

Final commit: commit ที่เพิ่ม handoff นี้พร้อม implementation และ tests; resolve exact SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_02_ROLE_BASED_HOME_HANDOFF.md`. SHA ของ commit ไม่สามารถฝังอยู่ในเนื้อหาของ commit เดียวกันได้; delivery report ระบุ full final SHA หลัง commit/push.

สถานะ: IMPLEMENTED / FOCUSED AUTOMATED VERIFICATION PASS. Browser/mobile UAT ยังไม่ได้ทำ. ไม่ปิด BF-GAP-02, clinical acceptance หรือ full Workbook DoD; ไม่เปลี่ยน canonical statuses.

## 1. Context และปัญหาที่ตรวจจาก source

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, current sections ของ docs/CONTEXT.md, UX-01 handoff, canonical Business Flow rows ที่เกี่ยวกับ role/Owner/Area และ Reporting Access Canonical; ใช้ WB-00 §3.1–3.2 เป็น visually verified customer evidence และ pending decisions. อ่าน Canva richtexts โดยตรงจาก `DAHSvdQ3gvU` และ `DAHW1jWjScY`; ข้อความสนับสนุนการแยกงานผู้ป่วย/ภาคสนาม/โรงพยาบาล/บริหาร แต่ไม่ใช้เป็นสิทธิ์หรือ transition ใหม่ และไม่ได้ตรวจ geometry/ลูกศรเพิ่มเติมในรอบนี้.

ใช้ Impeccable context, Operate และ craft floor; คง Quiet Clinical Access และ primitives เดิม. อ่าน Next.js 16.3 local Link documentation ก่อนเปลี่ยน navigation presentation.

ปัญหาเดิมที่ยืนยัน:

- Account panel ขนาดใหญ่อยู่ก่อนงานจริง; “งานถัดไป” เป็นรายการลิงก์ ไม่ใช่ pending queue.
- OWNER เห็น workforce ก่อนรายชื่อผู้ป่วย และทุก action มีน้ำหนักเท่ากัน.
- คำขอและ catalog links ซ้ำใต้หลาย Hospital ทั้งที่ destination แสดง actor-wide authorized scope.
- Home ไม่มีทางเข้า contact/content/Hospital reporting แม้ shell navigation อนุญาตอยู่แล้ว.
- Hospital ACTIVE badge เดิม “พร้อมดำเนินงาน” อาจปะปนสถานะ Hospital กับสิทธิ์ของ actor; active Hospital ที่ไม่มี permitted operation ถูกกรองหาย.

## 2. Role → context → งานหลัก → supporting workspace

| Actor | Context ที่ใช้ | งานหลัก | งานรอง/ข้อจำกัด |
| --- | --- | --- | --- |
| PATIENT-only | personal | redirect `/app/personal` เดิม | ไม่ได้สิทธิ์ Work จาก self access |
| OSM + active association | exact Hospital associations; Patient access ตรวจ exact assignment ที่ directory/service | `/app/patients/assigned` ก่อน; provisioning รายบุคคลใน Hospital ที่อนุญาต | ไม่ให้ general directory, bulk import, activation หรือ workforce |
| OSM ไม่มี active association | ไม่มี applicable operations | empty state; ถ้ามี association ที่ inactive แสดง context พร้อมคำอธิบาย | ไม่สร้าง assigned-patient shortcut |
| HOSPITAL MEMBER | direct active membership/Hospital | Hospital patient directory → UX-01; provision/import และ activation ตาม policy | shared request review; ไม่มี OWNER-only tools |
| HOSPITAL OWNER | direct active OWNER/Hospital | care directory ก่อน administrative tools | workforce disclosure ภายใต้ Hospital; shared catalog; contact/content/report selectors ตาม navigation projection |
| ADMIN-only | platform governance | report, Hospital governance, onboarding review | ไม่มี routine care destination; ไม่ต้องมี Hospital membership เพื่อเข้ารายงาน ADMIN |
| OSM/HOSPITAL + PATIENT | work และ personal แยกกัน | `/app` คง Work Home; มี link ไป Personal | PATIENT role ไม่เพิ่ม Work authority |
| หลาย Hospital/หลาย association | cards แยก Hospital ID/name/code | scoped operations แยก exact hospitalId; assigned entry ร่วมครั้งเดียว | request/catalog links ร่วมครั้งเดียว ไม่แอบอ้าง selected Hospital filter |
| Hospital suspended/pending หรือ membership/association inactive | facts เดิมจาก service/ActorContext | แสดงสถานะ/ข้อจำกัดและ empty operations | ไม่มี active operations จาก context ที่ policy ปฏิเสธ |

Profession ไม่ใช้เป็น authority หรือแยก dashboard; ยังคงแสดง/จัดการที่ workforce destination เดิม. Context labels ของ Home อธิบาย membership/association เท่านั้น.

## 3. Implementation และลำดับงาน

- `app/app/page.tsx`: H1 “พื้นที่ทำงาน”, compact Work role badges, Personal switch เฉพาะ workspace ที่มีอยู่. Primary entry คือ assigned care หรือ directory ของแต่ละ Hospital; ADMIN-only เริ่ม governance. ไม่มีบัญชี panel ใหญ่ขวางงาน.
- ภายใต้ Hospital: patient operations อยู่ก่อน workforce ซึ่งใช้ native disclosure. Request review เป็น section งานร่วม ตามด้วย supporting administration/reporting. Account status และคำอธิบายสิทธิ์อยู่ disclosure ท้ายหน้า.
- `application-workspace.ts`: เพิ่ม presentation categories, context labels, shared request/supporting actions และ deduplicate โดย URL. policy checks เดิมยังเป็นเจ้าของ visibility; ไม่เพิ่ม generic dashboard engine. Contact/content/report links ใช้ existing navigation projection. ส่งต่อ prefetch flags เดิมของ navigation รวม ADMIN report.
- Active Hospital แสดง “โรงพยาบาลใช้งานอยู่”; membership/association ที่ไม่ ACTIVE มีคำกำกับ. ไม่มีสิทธิ์ก็แสดง empty operation copy โดยไม่อ้างว่า Hospital status ให้สิทธิ์.
- Home/page และ projection tests ขยาย role matrix, actual rendered order/destinations, distinct Work/Personal, suspended/pending, shared scope และ LINE scheduler preservation.

Care มาก่อนเพื่อให้เลือกผู้ป่วยแล้วเข้า UX-01 ต่อได้; review requests ไม่อ้างว่ามี pending work; workforce/catalog/content/report เป็น supporting operations. ไม่เพิ่ม metric, progress, due date, task count หรือ patient identifiers บน Home.

## 4. Hospital-context link audit

ตรวจ destination pages และ query/service boundaries จริงก่อนใช้ URL:

| Destination | Actual scope / parameter support | Home presentation |
| --- | --- | --- |
| `/app/patients` | `searchParams.hospitalId` → permitted scopes → exact Hospital directory | exact Hospital card พร้อม hospitalId เดิม |
| `/app/patients/provision` | hospitalId เลือกจาก authorized provisioning scopes; OSM single mode / direct Hospital bulk mode แยก | exact Hospital card; copy ไม่โฆษณา import ให้ OSM |
| `/app/patients/activation` | hospitalId เลือกจาก authorized activation scopes | exact Hospital card |
| `/app/workforce` | hospitalId เลือกจาก owner Hospitals; `listWorkforce` รับ exact targetHospitalId | Hospital administration disclosure |
| `/app/patients/assigned` | actor-assigned scope; Home association ไม่พิสูจน์ว่ามี Patient assignment | shared OSM entry ครั้งเดียว; exact authority ตรวจที่ destination |
| `/app/patients/access-requests` | page ไม่รับ Hospital filter; list service resolve current active direct memberships ของ actor | shared request section ครั้งเดียว ไม่มี hospitalId |
| `/app/patients/service-requests` | page ไม่รับ Hospital filter; service ใช้ eligible hospitalIds ของ actor | shared request section ครั้งเดียว ไม่มี hospitalId |
| `/app/patients/service-catalog` | page ไม่รับ Hospital filter; service คืน catalogs ของ authorized direct OWNER memberships | shared supporting section ครั้งเดียว ไม่มี hospitalId |
| `/app/hospitals/contact`, `/knowledge` | รองรับ hospitalId และมี authorized Hospital selector | shared supporting entry ให้เลือก Hospital ที่ destination; ไม่อ้างว่ากรองตาม card |
| `/app/hospitals/reporting` | authorized selection, hospitalId และ target รองรับ direct OWNER/exact Child contract เดิม | shared report selector ไม่ตั้ง Child/network target เอง |
| `/app/admin/reporting` | ADMIN authorized selected-Hospital report | platform area แยกจาก care; prefetch=false ตาม existing navigation |
| `/app/admin/hospitals`, `/hospital-onboarding` | platform governance/onboarding policy | governance area |

Mismatch ที่แก้: เดิม access/service requests และ catalog อยู่ในแต่ละ Hospital card พร้อม copy “ในโรงพยาบาลนี้” แม้ URL/query ไม่ filter ตาม card. ย้ายและแก้ copy ให้ตรง actor-authorized scope; ไม่มี query/pagination/aggregation/domain change. Reporting เดิมใช้ generic governance description; เปลี่ยน description ให้ระบุเลือก Hospital เพื่อดูรายงาน.

## 5. Read models และ boundaries ที่รักษา

ใช้ existing `getProtectedApplicationActor()` และ `listActorHospitalWorkspaces()` เท่านั้น. Hospital metadata service ใช้ membership/association IDs ใน bounded actor context และ query ครั้งเดียวตามเดิม. Presentation เรียก policies/navigation projection ใน memory; ไม่มี N+1 domain queries, pending list queries หรือ aggregation เพิ่ม.

- `scheduleCurrentLineAccountReconciliation()` คง call หลัง Work routing และก่อน render เดิม; Patient-only redirect ไม่ผ่าน call นี้ตามเดิม.
- ไม่แก้ policies, services, server actions, business transactions, schema/migrations, Program lifecycle, assignment acceptance, preferred OSM, clinical definitions หรือ reporting/export authority.
- Selected Hospital เป็น navigation context; destination ตรวจ server authority/current persisted scope อีกครั้ง. ADMIN, MEMBER, OSM และ self-access ไม่ได้ bypass policies.
- UX-01 components/routes ไม่แก้; directory → relationship-scoped patient hub ยังเหมือนเดิม. Global App Shell/Personal Home ไม่แก้.
- OWNER-01 broader management/deletion, AREA-01, staff workforce grants, OSM appointment acceptance, clinical round definitions, live task/due semantics และ broader reporting disclosure ยังคง decision-gated/out of scope. ไม่มี blocked portion ที่ต้องเพิ่มเพื่อให้ Home presentation นี้ทำงาน.

## 6. Verification — actual results

Final focused run: **13 files / 156 tests PASS**:

```powershell
npm run test -- app/app/page.test.ts src/components/app-shell/application-workspace.test.ts src/components/app-shell/application-navigation.test.ts src/modules/patient-directory/policies/patient-directory-policy.test.ts src/modules/patient-provisioning/policies/patient-provisioning-policy.test.ts src/modules/patient-service-requests/policies/patient-service-request-policy.test.ts src/modules/patient-access-requests/policies/patient-access-request-policy.test.ts src/modules/patient-directory/services/patient-assigned-directory-query-service.test.ts src/modules/workforce/policies/workforce-policy.test.ts src/modules/patient-activation/policies/patient-activation-policy.test.ts src/modules/reporting/policies/hospital-report-policy.test.ts src/modules/patient-directory/transport/patient-detail-page.test.ts 'app/app/patients/[relationshipId]/programs/[programId]/program-detail-view.test.tsx'
npm run lint -- --max-warnings=0
npm run typecheck
git diff --check
```

- Repository-wide lint zero warnings: PASS. Typecheck: PASS.
- หลังเพิ่ม test-only presence assertions ก่อนเทียบ order: `npm run test -- app/app/page.test.ts`: **13 tests PASS**. ไม่มี production code change หลัง broad lint/typecheck.
- During implementation: initial projection/routing run 18 tests PASS; first expanded render run 28 PASS / 1 FAIL เพราะ test ใช้ Hospital enum `PROVISIONED` ที่ไม่มีจริง. แก้ fixture เป็น `PENDING_VERIFICATION` จาก schema แล้ว focused expanded run 103 tests PASS. ไม่มี production fix เพื่อเลี่ยง security assertion.
- Complete production/test diff reviewed ก่อน final lint/typecheck; UTF-8 without replacement characters และ diff whitespace checks PASS. Impeccable detector บน Home คืน `[]`.
- Repo ไม่มี architecture:check; dependency direction ยังเป็น UI/presentation → existing policies/services ไม่มี boundary ใหม่. Full suite, DB integration, production build และ dev server ไม่รัน เพราะเป็น bounded presentation change; ใช้ focused policy/query regressions แทน.

## 7. Responsive/accessibility และ manual UAT

Source/static render review: single-column flow, responsive header/status stacking, wrapped role badges, break-words สำหรับชื่อ/Thai copy, full-width primary link และ native link semantics. Existing button focus ring และ minimum touch sizes คงไว้; details/summary รองรับ keyboard; headings/sections ใช้ aria-labelledby. ไม่มี fixed-width dashboard/grid หรือ horizontal scrolling ใหม่. Existing App Shell loading/error infrastructure ไม่แก้; Home ไม่เพิ่ม mutation หรือ success/pending state.

Browser inventory มี Chrome แต่ไม่มี DEMI authenticated session/test account ที่พร้อมใช้. **ไม่ได้ทำ real desktop/mobile/browser UAT**; static render tests ไม่ใช่หลักฐาน no-overflow หรือ keyboard interaction จริง.

ยังต้องทดสอบใน authorized non-production environment:

1. Desktop และ 320/375px mobile: Hospital/Thai labels ยาว, CTA wrap, no horizontal overflow, disclosures และ Work/Personal switch.
2. Keyboard Tab/Shift+Tab/Enter/Space, visible focus และ semantic navigation.
3. OWNER/MEMBER/OSM exact assigned/unassigned/ADMIN-only/multi-role และหลาย Hospitals; craft cross-Hospital URLs ต้อง fail closed ที่ destination.
4. Suspended/pending Hospital, inactive membership/association, no operations และ multiple authorized request/catalog scopes.
5. Directory → UX-01 → Program → back navigation และ LINE lazy reconciliation ใน authenticated runtime.

## 8. Next phase

แนะนำ **UX-03 OSM Operational Journey** หลัง review/UAT UX-02. ไม่เริ่ม UX-03 อัตโนมัติ และไม่อ้างว่าปิด customer business-flow/clinical/Workbook acceptance.
