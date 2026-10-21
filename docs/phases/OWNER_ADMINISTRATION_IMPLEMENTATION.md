# Owner administration / Excel-only patient onboarding — implementation evidence

วันที่ 2026-10-21; baseline commit `131b54c0b012dd48ade87e3366a3a199942e5fe1`. implementation และ verification อ้าง baseline นี้; commit/push ดำเนินการภายหลังตามคำสั่งผู้ใช้ ไม่มี deployment ในงานนี้

## สิ่งที่เปลี่ยนและการตัดสินใจ

- OWNER ที่มี direct ACTIVE membership ของ ACTIVE Hospital เท่านั้นบริหารโรงพยาบาลและนำเข้าทะเบียนผู้ป่วยได้; บัญชี User ต้อง ACTIVE จากฐานข้อมูลด้วย MEMBER/OSM คง clinical/resource/assignment scope เดิม
- Policy, query, service และ persisted transaction checks ปิด MEMBER OSM provisioning/read, activation issuance/regeneration/slips/lifecycle และ creator-only credential revocation bypass; ไม่ลบ OSM, relationship, assignment หรือ activation history
- คำเชิญ OSM เดิมที่ออกโดย MEMBER ยังใช้ได้สำหรับผู้รับตามเงื่อนไขเดิม ตรวจทั้ง preview และ complete ด้วย synthetic provider ใน integration test การออกใหม่/สร้างใหม่/บริหารคำเชิญต้อง OWNER
- Patient activation issuance, account-access review, service-request review และ Hospital administrative reporting/export เป็น OWNER-only; grant เก่าไม่ให้อำนาจ การจัดการ delegated export ถูกปิดโดยไม่ลบข้อมูลประวัติ
- `/app/patients/provision` แสดง “นำเข้าผู้ป่วย” ใช้ strict Excel Template v2 เท่านั้น รวมไฟล์ 1 แถว ลบ manual tab/form และปิด legacy action/service; internal row transaction ปฏิเสธ SINGLE และตรวจ persisted OWNER ทุกครั้ง รักษา identity/conflict/profile/classification/baseline/audit เดิม
- Work Home, sidebar, mobile/More และ Hospital workspace ใช้ policy projections เดิมที่ถูกจำกัดใหม่ จึงยังเปิดพื้นที่งานและ care features ของ MEMBER/OSM ได้
- Integration fixture creation ย้ายไป test-only helper ที่ใช้ import row transaction พร้อม OWNER checks; ไม่มี test fixture helper อยู่ใน runtime entry point การตรวจ role preservation ใน workforce test ใช้ set เพราะ SQL query เดิมไม่กำหนดลำดับ
- ไม่เพิ่ม dependency, schema migration หรือ RLS model ใหม่ ระบบนี้ใช้ authoritative persisted authorization ใน Prisma/server services ตามสถาปัตยกรรมเดิม

ดู [role-capability matrix และ classification](../requirements/OWNER_ADMINISTRATION_AND_CARE.md) และ [ADR-0019](../adr/0019-owner-administration-and-import-only-roster.md) ข้อความ ADR-0004/0008/0011 เดิมถูกเก็บพร้อม superseding notice รวมถึง D1 วันที่ 2026-10-14 และ delegated export E1

## Verification ที่รันจริง

| Check | ผล |
| --- | --- |
| Related unit/component/policy/transport tests | 85 files, 1,268 tests ผ่าน; 37.36 s |
| PostgreSQL integration regression | 10 files, 216 tests ผ่าน; 66.38 s |
| `npm run typecheck` | ผ่าน |
| `npm run lint` | exit 0; 0 errors, 2 warnings เดิมเรื่อง `<img>` ใน hospital content components ที่ไม่ได้แก้ |
| ESLint changed/new TypeScript sources ด้วย `--max-warnings=0` | ผ่าน ไม่มี warning ของ diff |
| `npm run line:rich-menu:assets -- --check` | Verified 18 Rich Menu PNG assets against generated output |
| `npm run line:rich-menu:previews` | สร้าง contact sheets ครบ 18 variants ที่ 360/390/430px และ Thai glyph samples |
| Impeccable detector บน import workspace และ workforce detail | `[]` — ไม่พบ mechanical findings |
| `git diff --check` และตรวจ UTF-8 replacement characters | ผ่าน; ไม่มี replacement character ในข้อความที่แก้ |

คำสั่งทดสอบที่ผ่าน (รันจาก repository root):

```powershell
npm run test -- src/modules/workforce/policies src/modules/workforce/services src/modules/workforce/transport src/modules/patient-provisioning src/modules/patient-activation src/modules/patient-access-requests src/modules/patient-service-requests src/modules/reporting/policies src/modules/reporting/services/hospital-report-access-service.test.ts src/components/app-shell src/components/home app/app/workforce app/app/patients/provision src/modules/line/rich-menu src/modules/line/domain/line-navigation-intents.test.ts src/modules/patient-directory/policies src/modules/screening/policies src/modules/followups/policies src/modules/patient-baseline/policies src/modules/patient-assignment/policies --reporter=dot
```

```powershell
node --env-file=.env.integration node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/owner-administration.integration.test.ts tests/integration/patient-core-flow.integration.test.ts tests/integration/patient-activation.integration.test.ts tests/integration/workforce.integration.test.ts tests/integration/workforce-onboarding-v2.integration.test.ts tests/integration/patient-provisioning.integration.test.ts tests/integration/screening.integration.test.ts tests/integration/followups.integration.test.ts tests/integration/phase-e-access.integration.test.ts tests/integration/hospital-reporting.integration.test.ts
```

สำหรับ integration ใหม่ยังรัน `npm run test:integration:focused -- tests/integration/owner-administration.integration.test.ts` ด้วย runner ที่ยืนยัน local-only database และ apply เฉพาะ migrations ที่มีอยู่แล้ว ก่อนชุด final ใช้ disposable Docker PostgreSQL ที่ repository กำหนด ไม่มี production database operation

ชุดก่อน final พบ expected permissions เดิมที่ต้อง supersede, assertion ที่สมมติ row order ของ SQL และ timeout เมื่อรัน bulk tests พร้อมงานตรวจอื่น แก้ expectation ตาม product decision และตรวจ affected tests แยกแล้ว กลุ่ม durable bulk ผ่านเมื่อรันแยก และ final integration ทั้ง 10 files ผ่าน ไม่ปรับ timeout หรืออ่อนข้อ authorization เพื่อทำให้ tests ผ่าน

## LINE artifacts

4 OSM images ถูก regenerate: ผู้ป่วยที่ดูแล / คัดกรองผู้ป่วย / บันทึกติดตาม / งานทั้งหมด เป็น primary grid 2×2 Account management และ native role switching อยู่ footer เดิมตาม shared layout; aliases, PATIENT menu, authentication, account linking และ ordinary web links คงเดิม Generic HOSPITAL menu ไม่มี OWNER-only action

| Asset | bytes | SHA-256 |
| --- | ---: | --- |
| osm_direct.png | 98541 | 6e2c14cc2eef125545b1bf257d992af6bf88f67d6cdcd2d8ffbe38a4aa258853 |
| osm_patient_osm.png | 109935 | e6053ae3ff33fee1feda222e9c77f250afeab8fded18bf30229bc71fb96daff0 |
| osm_osm_hospital.png | 111443 | 97ff9e3532242668a721280dad04d4512be2b75355bb6248d4e2c7838946da79 |
| osm_patient_osm_hospital.png | 121397 | afc272d8d423085f6d821c04acbf01e51380446c12af9c791948c20a891e3760 |

ตรวจภาพ [390px contact sheet](../line/rich-menu-previews/rich-menu-contact-390.png) ด้วยสายตา: ภาษาไทยอ่านได้ทั้ง 4 OSM variants ไม่มีเพิ่มผู้ป่วย และ chooser/account controls ไม่ถูกตัด Assets tests ตรวจ PNG 2500×1686, ขนาดไม่เกิน 1 MiB, action bounds, overlap, switching และ shared manifest

## ข้อจำกัด / release notes

- ไม่รัน full repository unit suite, full integration suite, browser E2E, dev server หรือ production build; ใช้ affected regression suites ข้างต้น ยังไม่ได้ทำ browser UAT กับ session จริง
- `architecture:check` และ `lint:strict` ไม่มีใน package scripts ของ repository นี้ ใช้ scripts ที่มีและ strict ESLint เฉพาะ diff แทน ไม่เพิ่ม scripts ใหม่
- ไม่เปลี่ยน LINE Provider จริง ไม่มี `--apply`, ไม่ deploy และไม่สร้าง LIFF application ใหม่ การ sync ภาพกับ action areas ไป LINE เป็น release operation ที่ยังไม่ได้ทำ
- 2 root lint warnings เดิมอยู่ที่ `app/app/hospitals/knowledge/hospital-content-image-manager.tsx:103` และ `src/components/hospital-content/hospital-content-image-list.tsx:18`
- Network Patient read grant ตาม ADR-0016 ถูกจัดเป็น PATIENT_CARE แบบ read-only และคงเดิม Explicit Parent network governance/reporting และ Platform ADMIN recovery ยังอยู่ใน boundary แยก ไม่ใช่ implicit direct Child authority
- Clinical definitions/field disclosure ที่ยังไม่ยืนยันในเอกสารเดิมยัง UNRESOLVED; งานนี้ไม่สร้างนิยามหรือเพิ่มสิทธิ์ใหม่
- `.tmp-line-rich-menu-*` / `.tmp-rich-menu-*` ที่มีอยู่ก่อนเริ่มงานคงไว้ ไม่ใช่ deliverable ใหม่ของงานนี้

## Files changed (100)

- [DESIGN.md](../../DESIGN.md)
- [PRODUCT.md](../../PRODUCT.md)
- [app/app/patients/access-requests/[requestId]/page.tsx](../../app/app/patients/access-requests/[requestId]/page.tsx)
- [app/app/patients/provision/loading.tsx](../../app/app/patients/provision/loading.tsx)
- [app/app/patients/provision/page.tsx](../../app/app/patients/provision/page.tsx)
- [app/app/patients/provision/patient-provisioning-workspace-interactions.test.tsx](../../app/app/patients/provision/patient-provisioning-workspace-interactions.test.tsx)
- [app/app/patients/provision/patient-provisioning-workspace.tsx](../../app/app/patients/provision/patient-provisioning-workspace.tsx)
- [app/app/workforce/[kind]/[relationshipId]/page.tsx](../../app/app/workforce/[kind]/[relationshipId]/page.tsx)
- [docs/CONTEXT.md](../../docs/CONTEXT.md)
- [docs/adr/0004-patient-provisioning-and-activation.md](../../docs/adr/0004-patient-provisioning-and-activation.md)
- [docs/adr/0008-workforce-provisioning-and-activation.md](../../docs/adr/0008-workforce-provisioning-and-activation.md)
- [docs/adr/0011-patient-import-profile-persistence.md](../../docs/adr/0011-patient-import-profile-persistence.md)
- [docs/adr/0019-owner-administration-and-import-only-roster.md](../../docs/adr/0019-owner-administration-and-import-only-roster.md)
- [docs/adr/README.md](../../docs/adr/README.md)
- [docs/architecture/DEMI_ARCHITECTURE_BASELINE.md](../../docs/architecture/DEMI_ARCHITECTURE_BASELINE.md)
- [docs/line/rich-menu-previews/rich-menu-contact-360.png](../../docs/line/rich-menu-previews/rich-menu-contact-360.png)
- [docs/line/rich-menu-previews/rich-menu-contact-390.png](../../docs/line/rich-menu-previews/rich-menu-contact-390.png)
- [docs/line/rich-menu-previews/rich-menu-contact-430.png](../../docs/line/rich-menu-previews/rich-menu-contact-430.png)
- [docs/line/rich-menu-previews/thai-glyph-samples.png](../../docs/line/rich-menu-previews/thai-glyph-samples.png)
- [docs/phases/OWNER_ADMINISTRATION_IMPLEMENTATION.md](../../docs/phases/OWNER_ADMINISTRATION_IMPLEMENTATION.md)
- [docs/phases/PHASE_LINE_QA_A_HYBRID_QUICK_ACTION_RICH_MENU.md](../../docs/phases/PHASE_LINE_QA_A_HYBRID_QUICK_ACTION_RICH_MENU.md)
- [docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md](../../docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md)
- [docs/requirements/OWNER_ADMINISTRATION_AND_CARE.md](../../docs/requirements/OWNER_ADMINISTRATION_AND_CARE.md)
- [docs/requirements/REPORTING_ACCESS_CANONICAL.md](../../docs/requirements/REPORTING_ACCESS_CANONICAL.md)
- [public/line/rich-menus/osm_direct.png](../../public/line/rich-menus/osm_direct.png)
- [public/line/rich-menus/osm_osm_hospital.png](../../public/line/rich-menus/osm_osm_hospital.png)
- [public/line/rich-menus/osm_patient_osm.png](../../public/line/rich-menus/osm_patient_osm.png)
- [public/line/rich-menus/osm_patient_osm_hospital.png](../../public/line/rich-menus/osm_patient_osm_hospital.png)
- [scripts/line-rich-menu-renderer.ts](../../scripts/line-rich-menu-renderer.ts)
- [src/components/app-shell/application-navigation.test.ts](../../src/components/app-shell/application-navigation.test.ts)
- [src/components/app-shell/application-navigation.ts](../../src/components/app-shell/application-navigation.ts)
- [src/components/app-shell/application-workspace.test.ts](../../src/components/app-shell/application-workspace.test.ts)
- [src/components/app-shell/application-workspace.ts](../../src/components/app-shell/application-workspace.ts)
- [src/components/app-shell/responsive-layout.test.tsx](../../src/components/app-shell/responsive-layout.test.tsx)
- [src/components/home/work-home-projection.test.ts](../../src/components/home/work-home-projection.test.ts)
- [src/modules/line/rich-menu/catalog.test.ts](../../src/modules/line/rich-menu/catalog.test.ts)
- [src/modules/line/rich-menu/catalog.ts](../../src/modules/line/rich-menu/catalog.ts)
- [src/modules/line/rich-menu/layout.ts](../../src/modules/line/rich-menu/layout.ts)
- [src/modules/patient-access-requests/policies/patient-access-request-policy.test.ts](../../src/modules/patient-access-requests/policies/patient-access-request-policy.test.ts)
- [src/modules/patient-access-requests/policies/patient-access-request-policy.ts](../../src/modules/patient-access-requests/policies/patient-access-request-policy.ts)
- [src/modules/patient-access-requests/services/patient-access-request-lookup.test.ts](../../src/modules/patient-access-requests/services/patient-access-request-lookup.test.ts)
- [src/modules/patient-access-requests/services/patient-access-request-service.ts](../../src/modules/patient-access-requests/services/patient-access-request-service.ts)
- [src/modules/patient-activation/policies/patient-activation-policy.test.ts](../../src/modules/patient-activation/policies/patient-activation-policy.test.ts)
- [src/modules/patient-activation/policies/patient-activation-policy.ts](../../src/modules/patient-activation/policies/patient-activation-policy.ts)
- [src/modules/patient-activation/services/patient-activation-query-service.ts](../../src/modules/patient-activation/services/patient-activation-query-service.ts)
- [src/modules/patient-activation/services/patient-activation-service.ts](../../src/modules/patient-activation/services/patient-activation-service.ts)
- [src/modules/patient-provisioning/policies/patient-provisioning-policy.test.ts](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.test.ts)
- [src/modules/patient-provisioning/policies/patient-provisioning-policy.ts](../../src/modules/patient-provisioning/policies/patient-provisioning-policy.ts)
- [src/modules/patient-provisioning/services/patient-import-template-service.test.ts](../../src/modules/patient-provisioning/services/patient-import-template-service.test.ts)
- [src/modules/patient-provisioning/services/patient-provisioning-service.ts](../../src/modules/patient-provisioning/services/patient-provisioning-service.ts)
- [src/modules/patient-provisioning/services/patient-provisioning-transaction.test.ts](../../src/modules/patient-provisioning/services/patient-provisioning-transaction.test.ts)
- [src/modules/patient-provisioning/services/patient-provisioning-transaction.ts](../../src/modules/patient-provisioning/services/patient-provisioning-transaction.ts)
- [src/modules/patient-provisioning/services/patient-roster-import-service.test.ts](../../src/modules/patient-provisioning/services/patient-roster-import-service.test.ts)
- [src/modules/patient-provisioning/transport/patient-provisioning-workspace.test.ts](../../src/modules/patient-provisioning/transport/patient-provisioning-workspace.test.ts)
- [src/modules/patient-provisioning/transport/server-actions.test.ts](../../src/modules/patient-provisioning/transport/server-actions.test.ts)
- [src/modules/patient-provisioning/transport/server-actions.ts](../../src/modules/patient-provisioning/transport/server-actions.ts)
- [src/modules/patient-service-requests/policies/patient-service-request-policy.test.ts](../../src/modules/patient-service-requests/policies/patient-service-request-policy.test.ts)
- [src/modules/patient-service-requests/policies/patient-service-request-policy.ts](../../src/modules/patient-service-requests/policies/patient-service-request-policy.ts)
- [src/modules/patient-service-requests/services/hospital-service-request-list.test.ts](../../src/modules/patient-service-requests/services/hospital-service-request-list.test.ts)
- [src/modules/patient-service-requests/services/patient-service-request-service.ts](../../src/modules/patient-service-requests/services/patient-service-request-service.ts)
- [src/modules/reporting/policies/hospital-report-policy.test.ts](../../src/modules/reporting/policies/hospital-report-policy.test.ts)
- [src/modules/reporting/policies/hospital-report-policy.ts](../../src/modules/reporting/policies/hospital-report-policy.ts)
- [src/modules/reporting/policies/responsibility-area-matrix.test.ts](../../src/modules/reporting/policies/responsibility-area-matrix.test.ts)
- [src/modules/reporting/services/hospital-report-access-service.test.ts](../../src/modules/reporting/services/hospital-report-access-service.test.ts)
- [src/modules/reporting/services/hospital-report-access-service.ts](../../src/modules/reporting/services/hospital-report-access-service.ts)
- [src/modules/workforce/policies/hospital-owner-policy.test.ts](../../src/modules/workforce/policies/hospital-owner-policy.test.ts)
- [src/modules/workforce/policies/hospital-owner-policy.ts](../../src/modules/workforce/policies/hospital-owner-policy.ts)
- [src/modules/workforce/policies/owner-administration.test.ts](../../src/modules/workforce/policies/owner-administration.test.ts)
- [src/modules/workforce/policies/workforce-policy.test.ts](../../src/modules/workforce/policies/workforce-policy.test.ts)
- [src/modules/workforce/policies/workforce-policy.ts](../../src/modules/workforce/policies/workforce-policy.ts)
- [src/modules/workforce/services/workforce-service.ts](../../src/modules/workforce/services/workforce-service.ts)
- [tests/integration/appointments.integration.test.ts](../../tests/integration/appointments.integration.test.ts)
- [tests/integration/followups.integration.test.ts](../../tests/integration/followups.integration.test.ts)
- [tests/integration/goals.integration.test.ts](../../tests/integration/goals.integration.test.ts)
- [tests/integration/hospital-governance.integration.test.ts](../../tests/integration/hospital-governance.integration.test.ts)
- [tests/integration/hospital-network-patient-read.integration.test.ts](../../tests/integration/hospital-network-patient-read.integration.test.ts)
- [tests/integration/hospital-owner-governance.integration.test.ts](../../tests/integration/hospital-owner-governance.integration.test.ts)
- [tests/integration/ops-phase-b.integration.test.ts](../../tests/integration/ops-phase-b.integration.test.ts)
- [tests/integration/osm-relationship-lifecycle.integration.test.ts](../../tests/integration/osm-relationship-lifecycle.integration.test.ts)
- [tests/integration/owner-administration.integration.test.ts](../../tests/integration/owner-administration.integration.test.ts)
- [tests/integration/patient-activation.integration.test.ts](../../tests/integration/patient-activation.integration.test.ts)
- [tests/integration/patient-baseline.integration.test.ts](../../tests/integration/patient-baseline.integration.test.ts)
- [tests/integration/patient-care-end.integration.test.ts](../../tests/integration/patient-care-end.integration.test.ts)
- [tests/integration/patient-classification.integration.test.ts](../../tests/integration/patient-classification.integration.test.ts)
- [tests/integration/patient-core-flow.integration.test.ts](../../tests/integration/patient-core-flow.integration.test.ts)
- [tests/integration/patient-directory.integration.test.ts](../../tests/integration/patient-directory.integration.test.ts)
- [tests/integration/patient-evidence.integration.test.ts](../../tests/integration/patient-evidence.integration.test.ts)
- [tests/integration/patient-osm-assignment.integration.test.ts](../../tests/integration/patient-osm-assignment.integration.test.ts)
- [tests/integration/patient-osm-bulk-assignment.integration.test.ts](../../tests/integration/patient-osm-bulk-assignment.integration.test.ts)
- [tests/integration/patient-program-rounds.integration.test.ts](../../tests/integration/patient-program-rounds.integration.test.ts)
- [tests/integration/patient-program.integration.test.ts](../../tests/integration/patient-program.integration.test.ts)
- [tests/integration/patient-provisioning.integration.test.ts](../../tests/integration/patient-provisioning.integration.test.ts)
- [tests/integration/patient-roster-baseline-import.integration.test.ts](../../tests/integration/patient-roster-baseline-import.integration.test.ts)
- [tests/integration/phase-c-engagement.integration.test.ts](../../tests/integration/phase-c-engagement.integration.test.ts)
- [tests/integration/phase-e-access.integration.test.ts](../../tests/integration/phase-e-access.integration.test.ts)
- [tests/integration/program-reporting.integration.test.ts](../../tests/integration/program-reporting.integration.test.ts)
- [tests/integration/screening.integration.test.ts](../../tests/integration/screening.integration.test.ts)
- [tests/integration/support/patient-provisioning.ts](../../tests/integration/support/patient-provisioning.ts)
- [tests/integration/workforce-onboarding-v2.integration.test.ts](../../tests/integration/workforce-onboarding-v2.integration.test.ts)
- [tests/integration/workforce.integration.test.ts](../../tests/integration/workforce.integration.test.ts)
