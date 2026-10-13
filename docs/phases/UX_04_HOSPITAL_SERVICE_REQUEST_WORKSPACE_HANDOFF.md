# UX-04 — Hospital Service Request Review & Operational Handoff

วันที่: 2026-10-13 (Asia/Bangkok)

Starting commit: `1b93584654c503d8bcd9493136af20a2cf864104`, branch `main`, ตรง reviewed baseline. Working tree ก่อนเริ่มมี untracked `outputs/`; ไม่อ่าน แก้ หรือนำเข้า commit. Remote main ตรวจแล้วตรง baseline ก่อนส่งงาน.

Final commit: commit ที่เพิ่ม handoff นี้พร้อม implementation/tests; resolve full SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_04_HOSPITAL_SERVICE_REQUEST_WORKSPACE_HANDOFF.md`. ไม่สามารถฝัง hash ของ commit ลงในเนื้อหาของ commit เดียวกันได้; delivery report ระบุ full SHA หลัง commit/push.

Disposition: IMPLEMENTED / FOCUSED AUTOMATED VERIFICATION PASS; browser/mobile UAT ยังต้องทำ. ไม่เปลี่ยน canonical business-gap statuses และไม่ถือว่าปิด clinical acceptance, Workbook DoD หรือ P-13/P-14/P-15. หยุดหลัง UX-04.

## 1. Context และ verified source problems

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, relevant current sections ของ docs/CONTEXT.md, UX-01/02/03 handoffs, BUSINESS_FLOW_GAP_CANONICAL (CARE-07, CARE-06, OSM-10), WB-00 Owner decisions/pending register และ WB-03 decision pack. ตรวจ owner-approved CARE-07 contract ใน PHASE_17E3_PATIENT_CORE_FLOW_GAP_CLOSURE.md และ actual request, Patient Detail, Work Home, Patient Personal services routes/policies.

ใช้ Impeccable context / Operate / clarify / craft floor / detector และ React component checklist; คง Quiet Clinical Access, Thai-first copy และ UI primitives เดิม. ตรวจ Next.js 16.3 local page/searchParams และ server-actions guides, React useActionState official reference, Prisma Context7 และ Postgres keyset-pagination guidance. Prisma API ที่ใช้ตรวจซ้ำกับ generated v6.19.3 client types และ PostgreSQL integration จริง; ไม่ใช้ API ใหม่จากเอกสารรุ่นอื่น.

ปัญหาที่ตรวจพบจาก source:

- Workspace เดิมแสดงทุกสถานะใน flat list เรียงวันที่ ทำให้ประวัติล่าสุดอยู่ก่อนคำขอที่ต้องตรวจสอบได้.
- คำอธิบาย scope เดิมสั้นและไม่ชัดว่าเป็น actor-wide list จากหลาย eligible direct Hospitals ไม่ใช่ selected Hospital.
- APPROVE/REJECT ไม่มีคำอธิบายผล; APPROVE spinner แสดงแม้กด REJECT. START wording ไม่มีผลการบันทึกอยู่ใกล้ปุ่ม.
- Feedback อยู่ใน branch PENDING/APPROVED ของแต่ละ card; หลัง revalidation เปลี่ยนสถานะแล้ว success อาจหายไปกับ branch/card.
- Conflict ใช้ error เดียวกับ failure ทั่วไปและไม่ revalidate readback ใน catch branch.
- `listHospitalPatientServiceRequests()` โหลดประวัติทั้งหมดโดยไม่มี take และเรียง createdAt อย่างเดียว; ไม่มี tie-breaker หรือ pagination.
- Existing APPROVED/STARTED links ไป exact Patient Detail อยู่แล้ว แต่ handoff copy ยังกล่าวถึง workflow แบบกว้างและไม่มีคำอธิบาย clinical-completion/provenance limit ชัดเจน.

## 2. Old → new workspace structure

| เดิม | ใหม่ |
| --- | --- |
| ทุกสถานะรวมกัน | Server-filtered navigation: รอตรวจสอบ → อนุมัติแล้ว → เริ่มบริการและประวัติ |
| ประวัติล่าสุดแย่งพื้นที่ review | Default PENDING; ประวัติอยู่กลุ่มแยกและไม่มี review mutation |
| Hospital metadata รองจากชื่อ | Patient + Hospital name/code ในแต่ละ request; relationship/request IDs ไม่ถูก merge |
| Unbounded full history | 20 requests/page พร้อม lookahead 1 row; next cursor และกลับหน้าแรกของกลุ่ม |
| Card-local feedback | Workspace-level useActionState; pending announcement, success/error/conflict และ focus ไป feedback หลังบันทึก |
| START action ไม่มีผลการดำเนินการอยู่ใกล้ปุ่ม | ยืนยันเมื่อเริ่มบริการจริง; copy อธิบายว่าเขียนเฉพาะ request status/audit |
| Generic workflow link | Exact relationship Patient Care Journey anchor พร้อม provenance boundary |

`HISTORY` เป็นชื่อกลุ่ม query เท่านั้น ไม่ใช่ persisted request status ใหม่. Navigation เป็น links พร้อม aria-current, ใช้ server query ทุกครั้ง และ prefetch=false; ไม่ filter ประวัติทั้งหมดฝั่ง client. Empty states แยกแต่ละกลุ่มและ empty cursor page ไม่อ้างว่าโรงพยาบาลทั้งหมดไม่มีคำขอเพียงเพราะ PENDING ว่าง.

## 3. Exact status/action matrix

| Persisted status | กลุ่ม | Hospital operation | ผลจริง | Handoff |
| --- | --- | --- | --- | --- |
| PENDING | รอตรวจสอบ | APPROVE / REJECT | APPROVED / REJECTED + existing reviewer/time/audit | ไม่ auto-start บริการ |
| APPROVED | อนุมัติแล้ว | START | STARTED + existing started actor/time/audit เท่านั้น | Link ไป exact Patient Detail `#patient-care` |
| STARTED | เริ่มบริการและประวัติ | ไม่มี | ประวัติอ่านอย่างเดียว; ไม่ใช่หลักฐานว่าบริการเสร็จสิ้น | Link ไป exact Patient Detail `#patient-care` |
| REJECTED | เริ่มบริการและประวัติ | ไม่มี | ประวัติผลไม่อนุมัติ | ไม่มี downstream CTA |
| WITHDRAWN | เริ่มบริการและประวัติ | ไม่มี | ประวัติการถอนคำขอ | ไม่มี downstream CTA |

Patient withdrawal semantics เดิม (PENDING/APPROVED → WITHDRAWN) คงเดิมและตรวจ regression. Hospital REJECT ใช้ secondary button เพื่อแสดงตัวเลือก review โดยไม่สื่อว่าเป็นการลบข้อมูล; ไม่มี confirmation modal เพิ่ม.

## 4. Actor / Hospital scope contract

List อ่าน current persisted ACTIVE User, ต้องมี HOSPITAL และไม่มี ADMIN, แล้ว query direct ACTIVE OWNER/MEMBER memberships ใน ACTIVE Hospitals ตาม service เดิม. ทุกหน้าและทุก cursor ใช้ hospitalIds ที่ server resolve ใหม่. URL ไม่รองรับ hospitalId filter; unsupported hospitalId ไม่ถูกนำไปใช้ และ UI ระบุ multi-Hospital scope ชัดเจน.

| Actor/context | List / review |
| --- | --- |
| Active direct OWNER | อนุญาตเฉพาะ eligible direct Hospitals |
| Active direct MEMBER | เช่นเดียวกันสำหรับ request review; ไม่เพิ่ม OWNER assignment authority |
| Inactive membership / suspended Hospital | ไม่อยู่ใน list scope; mutation deny |
| ADMIN-only | deny |
| ADMIN + HOSPITAL | deny ตาม existing request policy และ persisted reviewer check |
| OSM-only / PATIENT-only | ไม่มี Hospital review access |
| Multiple direct memberships | List รวม eligible Hospitals; request/Patient relationship แยกตาม Hospital |
| Forged request ID ของ Hospital อื่น | exact request Hospital policy deny |
| Membership/Hospital/role ถูก revoke หลัง resolve actor | transaction ตรวจ persisted reviewer ใหม่; fail closed |

Mutations คง existing schema validation, server actor resolution, exact-Hospital policy, persisted reviewer checks, serializable transaction, conditional expected-status update และ atomic audit. ไม่มี auth/policy/database-schema/migration/transaction changes. เพิ่มเฉพาะ validation schema สำหรับ list parameters ตาม query contract ใหม่.

Patient Detail destination ยังคงตรวจ `getPatientDirectoryDetail` และ independently authorized classification/Baseline/Program services. UI link ไม่เป็น authorization. ไม่ใช้ requestId เป็น relationshipId/Program ID และไม่เพิ่ม Patient PII บน Work Home หรือ generic notifications.

## 5. Operational handoff และ mutation readback

Request Review → persisted Request Status Updated → `/app/patients/{relationshipId}#patient-care` → existing authorized care operations.

- Navigation ไม่เป็น verified causal request-to-delivery link และไม่เปิด Program อัตโนมัติ.
- START ไม่สร้าง Program, assignment, Screening Assessment หรือ Follow-up; ไม่ยืนยัน clinical completion.
- preferred OSM เป็นความประสงค์ของผู้ป่วย ไม่ใช่ actual assignment หรือ OSM acceptance.
- useActionState อยู่เหนือ list เพื่อเก็บ result แม้คำขอย้ายกลุ่ม; action state ไม่เป็น authority ของปุ่ม. ปุ่มใช้ persisted status จาก page readback.
- ระหว่าง pending ปิดทุก review button ใน workspace และประกาศกำลังบันทึก โดยไม่อ้างว่ากำลัง APPROVE เมื่อกด REJECT.
- Success บอกผลของ APPROVE/REJECT/START และกลุ่มที่ดูต่อได้. Success revalidate ทั้ง Hospital workspace และ Personal services ตามเดิม.
- Review conflict ใช้ existing sanitized mapping พร้อม conflict flag เฉพาะ action นี้; revalidate Hospital workspace เพื่ออ่าน status ล่าสุด. ไม่เปลี่ยน error mapping หรือ behavior ของ Patient create/withdraw/catalog actions.
- หลัง action เสร็จ focus ไป feedback container เพื่อให้ keyboard user ยังมีตำแหน่งอ่านผลเมื่อ card หายไป. Real focus/screen-reader behavior ยังต้อง manual UAT.

## 6. Query scalability / pagination findings

Before: one actor-scoped unbounded findMany, O(N) response/memory/render work ตาม authorized full history, ไม่มี deterministic ordering เมื่อ timestamps เท่ากัน. ไม่เคยมี authoritative count projection.

After: `listHospitalPatientServiceRequests(actor, dependencies, input)` คืน `{ requests, group, after, nextCursor }`. รักษา dependencies argument เดิม. Strict input: group PENDING/APPROVED/HISTORY; optional after ต้องมี ISO UTC createdAt และ UUID requestId ครบคู่. Page validate query parameters; invalid/repeated/malformed values แสดง warning แล้วกลับ PENDING หน้าแรก. Service ตรวจ input ซ้ำ; forged hospitalId/take fields ใน service input ถูก reject.

- Filter current eligible hospitalIds + persisted status group.
- Deterministic `createdAt DESC, id DESC`.
- Composite keyset predicate: createdAt < cursor date OR (createdAt = cursor date AND id < cursor ID).
- `take: 21`; ส่งกลับไม่เกิน 20. nextCursor ใช้แถวสุดท้ายที่ส่งกลับเฉพาะเมื่อ lookahead มีจริง; 0/19/20 rows ไม่มี next page, 21 rows มี. ไม่ query detail ของ cursor และไม่พึ่ง boundary row ว่ายังอยู่สถานะเดิม.
- ไม่แสดง count/total badges; page limit ไม่ถูกอ้างเป็นจำนวนคำขอทั้งหมด. Grain เป็น request ไม่ใช่ unique Person หรือ Hospital count.
- Minimal nested select เดิม; ไม่มี per-card detail/Program lookup หรือ N+1 ที่เพิ่มจาก UX-04. Prisma relation SQL batching ไม่ได้ benchmark ในงานนี้.
- Index เดิม `(hospitalId, status, createdAt)` ช่วย scope/filter; ไม่เพิ่ม index หรือ migration โดยไม่มี workload evidence. การคืนแถวแบบ bounded ไม่รับรอง DB latency คงที่ใน multi-Hospital/history query; ต้องวัด EXPLAIN/realistic volume แล้วประเมิน id tie-breaker index ภายหลัง.
- Pagination เป็น live read ไม่ใช่ coherent historical snapshot. Request อาจย้ายกลุ่มขณะเปิดหลายหน้า; กลับหน้าแรกของกลุ่มเพื่อดูรายการล่าสุด. Tests ยืนยัน tied dates และ boundary row เปลี่ยนสถานะไม่ทำให้ navigation ขาดเพราะต้องโหลด cursor detail.

## 7. Changed files

Production:

- `app/app/patients/service-requests/page.tsx` — query parsing/recovery และ paginated page contract.
- `app/app/patients/service-requests/hospital-service-requests-workspace.tsx` — grouped navigation, scope/context, care handoff, feedback/focus และ pagination.
- `app/app/patients/service-requests/hospital-service-request-controls.tsx` — exact actions, effect copy และ shared pending controls.
- `src/modules/patient-service-requests/presentation/patient-service-request-presentation.ts` — Hospital group labels/empty states และ internal list href builder; Personal status labels คงเดิม; Hospital caller ระบุ Asia/Bangkok เพื่อให้ SSR/browser render วันที่ตรงกัน ส่วน caller เดิมที่ไม่ระบุ timezone คง behavior เดิม.
- `src/modules/patient-service-requests/schemas/patient-service-request-schemas.ts` — bounded list validation/types.
- `src/modules/patient-service-requests/services/patient-service-request-service.ts` — bounded status-filtered keyset query; mutation implementation คงเดิม.
- `src/modules/patient-service-requests/transport/action-state.ts` — optional success copy/conflict metadata.
- `src/modules/patient-service-requests/transport/server-actions.ts` — review-only outcome copy/conflict revalidation.

Tests:

- `app/app/patients/service-requests/hospital-service-requests-workspace.test.tsx` — persisted action matrix, priority/empty states, exact links, distinct relationships/Hospitals, handoff truth, pending และ success/conflict readback.
- `app/app/patients/service-requests/page.test.tsx` — query validation, multi-Hospital scope และ existing redirects.
- `src/modules/patient-service-requests/services/hospital-service-request-list.test.ts` — all status groups, limit/lookahead, no totals, cursor predicates, current persisted roles/memberships และ minimal projection associations.
- `src/modules/patient-service-requests/presentation/patient-service-request-presentation.test.ts` — Hospital Bangkok date/time และ default formatting ที่คงเดิม.
- `src/modules/patient-service-requests/transport/server-actions.test.ts` — exact decision dispatch, server actor, sanitized failure/conflict และ revalidation.
- `tests/integration/patient-core-flow.integration.test.ts` — new paginated read contract, tied dates/live boundary, membership/Hospital/ADMIN revocation, multi-Hospital list, no downstream creation, repeated START/audit; existing real concurrency tests retained.

Documentation: this handoff. ไม่แก้ UX-01/02/03 production surfaces, Personal services production UI, policy, DB schema, migrations, dependencies/lockfile, canonical registers หรือ outputs/.

## 8. Verification actually executed

Final integrated focused Vitest baseline: **13 files / 177 tests PASS**:

```powershell
npm run test -- app/app/patients/service-requests/hospital-service-requests-workspace.test.tsx app/app/patients/service-requests/page.test.tsx src/modules/patient-service-requests/services/hospital-service-request-list.test.ts src/modules/patient-service-requests/transport/server-actions.test.ts src/modules/patient-service-requests/policies/patient-service-request-policy.test.ts src/modules/patient-service-requests/presentation/patient-service-request-presentation.test.ts app/patient/patient-core-flow-ui.test.tsx src/modules/patient-service-requests/services/patient-service-catalog-service.test.ts src/modules/patient-directory/transport/patient-detail-page.test.ts src/modules/patient-directory/policies/patient-directory-policy.test.ts src/components/app-shell/application-workspace.test.ts src/components/app-shell/application-navigation.test.ts app/app/page.test.ts
npm run test:db:status
npm run test:db:up
npm run test:integration:focused -- tests/integration/patient-core-flow.integration.test.ts
npm run lint -- --max-warnings=0
npm run typecheck
git diff --check
```

PostgreSQL final focused integration: **1 file / 38 tests PASS**, repository disposable local `demi_test` on 127.0.0.1:55432. Runner generated Prisma Client and applied existing migrations only to the local test database; no new migration or production database operation. Tests cover real concurrent approval/withdraw and START/withdraw, repeated transitions, audit and exact-Hospital denial. Initial integration 37 PASS; after adding revocation/multi-Hospital coverage 38 PASS, then final targeted confirmation after adding no-downstream/duplicate-audit assertions 38 PASS. No full integration suite.

Initial new UI run: 74 PASS / 2 FAIL เพราะ test assumed HTML name/value attribute order. แก้ assertion ให้อ่านแต่ละ button tag แล้ว targeted UI 18 PASS; ไม่แก้ behavior เพื่อผ่าน test. Final focused run รวม policy, Patient Detail, Work Home/navigation, catalog และ Personal service-request regression ตามรายชื่อด้านบน.

Typecheck: PASS. Repository-wide lint zero warnings: PASS. Diff whitespace/UTF-8 checks: PASS; no BOM/replacement characters in changed source/tests. Complete code/test diff reviewed ก่อน broad lint/typecheck. Impeccable detector on both modified UI components: completed without findings. React checklist: hooks unconditional, stable request keys, service imports type-only on client, native forms/links, touch-sized buttons, wrapping/min-width layout and existing focus tokens.

Repo ไม่มี architecture:check script; boundary review ยืนยัน UI → existing service/transport ไม่มี DB import ใน UI. หลัง final checks ปรับ isolated scope/pagination copy ให้ภาษาเรียบง่ายและไม่สื่อว่า Hospital เป็นผู้ส่งคำขอ; targeted UI 18 tests และ targeted ESLint ผ่าน. Final review เพิ่ม explicit Asia/Bangkok ที่ Hospital date caller เพื่อป้องกัน SSR/browser timezone mismatch; optional formatter argument คง default ของ Personal caller. Final affected tests **3 files / 26 tests PASS**, targeted ESLint zero warnings และ typecheck PASS อีกครั้ง. ไม่รัน full lint/test suite ใหม่เพราะแก้ isolated copy/date rendering:

```powershell
npm run test -- app/app/patients/service-requests/hospital-service-requests-workspace.test.tsx src/modules/patient-service-requests/presentation/patient-service-request-presentation.test.ts app/patient/patient-core-flow-ui.test.tsx
npx eslint app/app/patients/service-requests/hospital-service-requests-workspace.tsx src/modules/patient-service-requests/presentation/patient-service-request-presentation.ts src/modules/patient-service-requests/presentation/patient-service-request-presentation.test.ts --max-warnings=0
npm run typecheck
```

 Full test suite, production build/dev server และ browser/mobile checks ไม่รัน; ไม่มี framework/config/routing-convention change ที่ต้อง production build.

## 9. Remaining manual UAT / limitations

ยังไม่ได้ทดสอบ authenticated browser/mobile เพราะไม่มี authorized test account/session ให้ใช้ในงานนี้. Static markup/mocked hooks ไม่แทน real hydration, focus, useActionState หรือ screen-reader UAT.

ใน authorized non-production environment ให้ตรวจ:

1. OWNER/MEMBER, inactive membership, Hospital suspended, ADMIN-only/ADMIN+HOSPITAL, OSM-only/PATIENT-only และหลาย direct Hospitals; crafted cross-Hospital request/Patient URLs ต้อง deny ที่ destination.
2. Desktop และ 320/375px mobile/200% zoom: ชื่อ Hospital/Thai Patient ยาว, wrapping, ไม่มี horizontal overflow, touch target และ navigation.
3. Keyboard Tab/Shift+Tab/Enter, visible focus และ screen-reader result announcement; success/conflict focus หลัง card ย้ายกลุ่ม.
4. PENDING approve/reject → กลุ่มใหม่; APPROVED start → history; correct readback และไม่มี duplicate submit ระหว่าง pending.
5. สอง session ทำ review/withdraw พร้อมกัน; conflict refresh ไม่แสดง stale action และ audit ไม่ซ้ำ.
6. 20/21+ requests ต่อกลุ่ม, tied submission dates, later-page empty และ back-to-first recovery.
7. APPROVED/STARTED → exact Patient Care Journey → existing authorized care workflow; ไม่มี automatic Program/assignment หรือ false completion claim.
8. Patient Personal services submit/history/withdraw และ Work Home shared request entry คงเดิม.

ยังไม่มี realistic-volume EXPLAIN/load benchmark และ causal linkage ไม่อยู่ใน query/read model. ไม่มี SLA/overdue inference จาก submission date.

## 10. Decision blockers / next phase

- **P-13:** request-to-delivery typed linkage, offering mapping, cardinality/START semantics และ verified legacy provenance ยัง PENDING.
- **P-14:** OSM assignment acceptance/effective authority ยัง PENDING; ไม่สร้าง acceptance หรือ pending proposal flow.
- **P-15:** preferred versus actual OSM/candidate selection ยัง PENDING; preference ไม่เป็น assignment evidence.

แนะนำ **UX-05 Patient Personal Experience** หลัง review/UAT UX-04. ไม่เริ่ม UX-05 อัตโนมัติ และไม่แก้ canonical business-gap statuses.
