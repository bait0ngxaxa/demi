# UX-07 — Hospital Staff & Owner Operational Workspaces

วันที่: 2026-10-13 (Asia/Bangkok)

Base / actual starting HEAD: `a1c170736bf74b2acfb90716bea2f7794f20e458`, branch `main`; working tree สะอาดก่อนเริ่ม ตรง reviewed baseline. ไม่มี unrelated changes ที่ต้องแก้หรือ stage.

Final SHA: commit ที่เพิ่มเอกสารนี้พร้อม source/tests; resolve full SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_07_HOSPITAL_OWNER_WORKSPACES_HANDOFF.md`. Hash ของ commit ไม่สามารถอยู่ในเนื้อหาของ commit เดียวกันได้; delivery report ระบุ full SHA หลัง commit/push.

Disposition: UX-07 IMPLEMENTED; automated results ด้านล่างเป็น evidence เฉพาะ checks ที่รันจริง. Browser/mobile UAT ยังต้องทำ ไม่อ้าง clinical acceptance, production readiness หรือ complete Owner Workbook DoD. ไม่เปลี่ยน canonical business-gap status และไม่เริ่ม UX-08.

## 1. Context และ verified gaps

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, relevant Hospital/workforce/reporting/self-access sections ใน docs/CONTEXT.md และ UX-01–06 handoffs. ตรวจ current canonical STAFF/OWNER/CONTENT/REPORTING requirements, Reporting Access Canonical, 4A workforce contract, 5B.2 activation, 12C/12D.0 Owner governance, 17I.0B approved contact/content decisions และ WB-00 pending register. Current source/policy/transport เป็น authority; historical provisional statements ไม่ขยาย capability.

ใช้ Impeccable context / Operate / clarify / craft floor / detector และ React component checklist โดยคง Quiet Clinical Access tokens/primitives. อ่าน local Next.js 16.3 Link documentation. Canva connector อ่าน richtexts ของ `DAHSvdQ3gvU` และ `DAHW1jWjScY` โดยตรง: แยกเจ้าหน้าที่ประสาน/จัดบริการจากผู้บริหารผู้ใช้และข้อมูลภาพรวม. ไม่ตรวจ geometry/ลูกศรเพิ่มเติม และไม่ถือ legacy login/password, assignment acceptance, area management หรือ Canva transitions เป็น approval.

Verified source problems:

- Work Home มี shared contact/content/report links พร้อมคำอธิบายเดียวกัน ทั้งที่ destination รองรับ exact authorized Hospital selection จริง.
- OWNER workforce entry ซ่อนใน disclosure แยกจากเครื่องมือบริหารอื่น ผู้มี OWNER แห่งหนึ่งและ MEMBER อีกแห่งต้องเลือก context อีกครั้งที่ปลายทาง.
- Directory, provision, activation และ Workforce breadcrumbs ไม่มี Work return link; contact/content/direct report กลับ Home แบบทั่วไปโดยไม่ระบุ Hospital context.
- Workforce วางสอง provisioning forms ก่อนรายชื่อเดิม; assisted activation มี error state แต่ไม่ได้ render ข้อผิดพลาดดังกล่าว.
- Content empty state มี create CTA ซ้ำกับ header.
- Access Requests มี Hospital selector สำหรับ lookup แต่ไม่มีคำอธิบายชัดว่า selector ไม่กรอง actor-wide queue; Catalog ยังไม่ระบุ multi-Hospital scope โดยตรง.

## 2. Before / after hierarchy

| Before | After |
| --- | --- |
| Hospital care + hidden workforce; management links อยู่กลุ่มร่วมท้ายหน้า | แต่ละ Hospital: identity/status/membership → งานผู้ป่วย → เครื่องมือบริหารที่ policy อนุญาต มองเห็นได้ทันที |
| Contact/content/report entry เลือก Hospital ที่ปลายทาง | exact `hospitalId` link จาก authorized Hospital card พร้อมคำอธิบายหน้าที่แต่ละเครื่องมือ |
| หลาย Hospital เป็นรายการต่อกัน | เพิ่ม named native jump navigation ไปแต่ละ context; เป็น hash anchor ไม่ใช่ global selected-Hospital filter |
| Request queues/catalog shared แต่ scope ต้องอนุมาน | คง shared entry ครั้งเดียว ไม่มี unsupported `hospitalId`; บอกว่าแต่ละ Hospital แยกกันและ lookup selector ไม่กรอง queue |
| Workforce add forms มาก่อน roster | Hospital selector/context → local roster/add anchors → activation feedback → roster → existing forms |
| Generic/missing Work return | breadcrumb ไป `/app#hospital-workspace-H` จาก exact context; Child report กลับ Parent context |
| Content empty state สอง create links | หนึ่ง header create action + empty-state guidance |

Patient directory ยังเป็น primary care entry. Request review อยู่ section ร่วมเดิม ไม่ทำซ้ำ UX-04; Personal/assigned OSM/platform governance ยังคงแยกตาม UX-02/03/05. ไม่มี workload, due/overdue, completion หรือ reporting metric ใหม่.

## 3. Capability crosswalk

| Actor / context | Existing operations ที่แสดง | Restrictions preserved |
| --- | --- | --- |
| Active direct HOSPITAL MEMBER + ACTIVE Hospital | Directory, provisioning/import, activation, access/service review ตามแต่ละ policy | ไม่แสดง Workforce/contact/content/report/catalog OWNER tools; clinical mutation ตรวจ resource/domain ที่ปลายทาง |
| Active direct HOSPITAL OWNER + ACTIVE Hospital | MEMBER-equivalent operations + Workforce, contact, content, direct reporting; shared Catalog | OWNER เป็น membership ไม่ใช่ technical role; profession ไม่เพิ่ม authority |
| OWNER of A / MEMBER of B | เครื่องมือบริหารเฉพาะ A; patient operations แยก A/B | ไม่รวม authority หรือ Patient relationships ข้าม Hospital |
| OSM association without direct membership | Assigned directory entry ตาม policy + single provisioning ใน exact association ที่อนุญาต | association ไม่พิสูจน์ Patient assignment; ไม่มี direct directory/import/activation/OWNER tools |
| HOSPITAL + OSM | แต่ละ scope independent; shared assigned entry ไม่ซ้ำ | OSM association ไม่แทน direct membership |
| HOSPITAL/OSM + PATIENT | Work เดิม + Personal switch | PATIENT SELF ไม่เพิ่ม Work authority; ไม่มี Patient PII เพิ่มบน Home |
| ADMIN-only | Existing platform governance/reporting | ไม่มี routine Hospital OWNER tools แม้รับ unrelated workspace metadata |
| ADMIN + independently scoped HOSPITAL | Workforce/contact/content/report/direct Patient operations ตาม existing policy | Access/Service review และ Catalog policies **exclude ADMIN holders**; ไม่ทำให้ทุก domain ใช้ multi-role rule เดียวกัน |
| Suspended/provisioned/invited membership, inactive association | Context/status visible จาก existing metadata | ไม่มี actions ที่ policy ปฏิเสธ; revocation/persisted actor checks ที่ server เดิม |
| SUSPENDED / PENDING_VERIFICATION Hospital | Accurate unavailable status/context | ไม่มี operational actions; URL/anchor ไม่ให้ authority |

Workforce detail เดิมยังแยก account/relationship status และ server-derived promote/demote/suspend/restore flags. OWNER Set/last eligible Owner, exact membership concurrency และ activation lifecycle ไม่เปลี่ยน. User/Person/role/membership/association/assignment ยังเป็นคนละขอบเขต.

## 4. Exact Hospital versus actor-wide route audit

ให้ `H` = Hospital ID, `R` = PatientHospitalRelationship ID.

| Destination | Actual selection and authority | UX-07 link / return |
| --- | --- | --- |
| `/app/patients` | `hospitalId` → authorized direct scopes → exact directory query; unknown selection redirects to directory selection | exact H from card; breadcrumb กลับ Hospital H; row ยังคง exact R |
| `/app/patients/provision` | `hospitalId` → provisioning scopes; unknown ID defaults first eligible scope; direct import กับ OSM single แยก | exact H; breadcrumb กลับ context ที่ server resolve จริง ไม่มี OSM general-directory shortcut ใหม่ |
| `/app/patients/activation` | `hospitalId` → authorized activation scopes; unknown defaults eligible scope | exact H; breadcrumb directory H + Work H |
| `/app/workforce` | `hospitalId` → direct eligible Owner Hospitals; unknown defaults first eligible; service ตรวจ exact target | exact H; return Work H; roster detail uses exact membership/association ID |
| `/app/workforce/{staff,osm}/ID` | exact persisted relationship → owning Hospital + Owner authority | existing detail return `/app/workforce?hospitalId=H` unchanged |
| `/app/patients/access-requests` | actor-wide eligible active direct memberships; **page ไม่มี Hospital filter** | shared link ครั้งเดียว ไม่มี H; lookup POST มี exact H แยกจาก list |
| `/app/patients/service-requests` | actor-wide scope + UX-04 status-group/cursor pagination; **ไม่มี Hospital filter** | shared link ครั้งเดียว ไม่มี H; approved/started exact R care handoff เดิม |
| `/app/patients/service-catalog` | all authorized direct OWNER catalogs; **page ไม่มี Hospital filter** | shared link ครั้งเดียว; separate Hospital identity/controls; return Work root |
| `/app/hospitals/contact` | validated H from eligible direct Owners; missing defaults first; invalid/unowned → notFound | exact H from card; return Work H; revoked state generic safe Work return unchanged |
| `/app/hospitals/knowledge` + `/new` | validated H + eligible Owner; list has cursor; detail resolves content ID → exact owning Hospital | exact H list link; return Work H; existing create/detail return and draft-exit guards unchanged |
| `/app/hospitals/reporting` | H = direct OWNER report; distinct `target` = authorized exact Parent/Child; cannot combine H and target; invalid denied | exact direct H from card; existing selector retains Parent/Child; direct return H, Child-summary return Parent H |
| `/app/admin/reporting` | current ADMIN exact selected Hospital policy independent from OWNER | governance entry unchanged; no Hospital OWNER breadcrumb introduced |
| `/app/patients/R` → Program/appointments | relationship-scoped server authorization; current direct membership/current assignment | UX-01/03/06 care links and persisted readback untouched |

No route parameter becomes authority. Existing fallback selection differences above are preserved, not silently changed to a new selection contract. Unsupported request/catalog filters are not appended. Mismatch corrected is presentation/return context, not authorization.

## 5. Reporting, privacy and business boundaries

- Direct OWNER reporting/export remains exact-Hospital. Existing global ADMIN reporting/export retains its independent gate and safe projection. Export endpoint/fields/workbook/calculations unchanged.
- Parent reporting still lists eligible **direct** children under exact active Parent OWNER and returns only authorized Child identity + nine summary values. No Child Patient rows/identifiers/clinical details, Program links or Parent export added. Child report return goes to Parent Work context, not Child patient directory.
- No network/global merged dashboard or new report grain. Record presence never becomes delivery/completion evidence.
- Request STARTED still writes request status/audit only. No automatic Program, appointment, OSM assignment, acceptance or Follow-up.
- Every destination/action retains authoritative server checks, persisted actor rechecks, exact Hospital resource resolution, atomic writes, audit, stale-version/idempotency protection and sanitized feedback. No production policy/service/action/schema/transaction changed.
- Home remains navigation-only: no Patient identifiers or generic notifications added. LINE reconciliation scheduling on Work Home unchanged; provider/outbox/consent/feature defaults unchanged. Family/privacy boundaries unchanged.

## 6. Source and tests changed

Source (12 files):

```text
app/app/page.tsx
src/components/app-shell/application-workspace.ts
app/app/workforce/workforce-workspace.tsx
app/app/hospitals/contact/hospital-contact-workspace.tsx
app/app/hospitals/knowledge/hospital-content-list-workspace.tsx
app/app/hospitals/reporting/hospital-report-workspace.tsx
app/app/hospitals/reporting/parent-child-hospital-report-workspace.tsx
app/app/patients/patient-directory-view.tsx
app/app/patients/provision/patient-provisioning-workspace.tsx
app/app/patients/activation/patient-activation-actions-workspace.tsx
app/app/patients/access-requests/patient-access-requests-workspace.tsx
app/app/patients/service-catalog/hospital-service-catalog-workspace.tsx
```

Tests (8 files): Home/projection tests; new Workforce static-render/action-state tests; new Hospital patient-operations navigation tests; Contact, Content, direct report and Parent/Child report presentation tests. Handoff = this file. Existing policy/service/transport tests executed without modifying their contracts.

```text
app/app/page.test.ts
src/components/app-shell/application-workspace.test.ts
app/app/workforce/workforce-workspace.test.tsx
app/app/patients/hospital-operations-navigation.test.tsx
app/app/hospitals/contact/hospital-contact-workspace.test.tsx
app/app/hospitals/knowledge/hospital-content-ui.test.tsx
app/app/hospitals/reporting/hospital-report-workspace.test.tsx
app/app/hospitals/reporting/parent-child-hospital-report-workspace.test.tsx
```

Checks cover OWNER/MEMBER A/B isolation, ADMIN-specific exclusions, inactive memberships, unrelated IDs, exact versus shared links, roster order, empty states, native return/section anchors, pending disabled siblings, persisted success relationship/Hospital, conflict/assisted failure feedback, content single creation CTA, Parent return and no export/Patient fields. Static tests are not browser evidence or PostgreSQL race proof.

## 7. Query performance findings

No new query, dashboard aggregation, per-Hospital history fetch or per-card N+1 lookup. Home reuses existing server ActorContext and one metadata lookup over its membership/association Hospital IDs; policy projection remains in memory. Work Home action-list links now default `prefetch=false`; content item/create links disable eager destination fetches. Existing query behavior remains:

- Directory: bounded 25-row page + existing authoritative classification counts; no count inferred from loaded rows.
- Activation: existing maximum 25 candidates; provisioning/import bounds unchanged.
- Service Requests: existing UX-04 20-row status-group page + lookahead/cursor, no all-time loaded-row count.
- Content: existing signed keyset pagination; reporting: existing bounded Program page and authoritative summary queries; no calculations changed.
- Catalog: fixed supported service types per authorized Owner Hospital, fetched via existing joined projection; actor's eligible Hospitals not newly paginated.
- **Existing debt:** Workforce loads all exact-Hospital membership/OSM rows and batches activation lookup over their users without explicit pagination. Roster badges count loaded relationship rows by kind, not unique people or workload. Access Requests loads all eligible-Hospital request history without explicit take/pagination. Actor metadata/eligible Hospital lists are bounded by actor relationships, not an explicit hard row cap. These require separate narrowly scoped server-pagination contracts as volume grows; no benchmark or scalability acceptance claimed. UX-07 does not add history filtering over these collections or hide debt behind a fixed take.

## 8. Actual verification

- Initial focused UI/projection run: **5 files / 43 tests PASS**.
- Added navigation/Workforce/content/contact/Child UI run: **5 files / 19 tests PASS**; Workforce after local anchor/feedback placement check: **1 file / 6 tests PASS**.
- Stable regression: **35 files / 335 tests PASS**. Includes Home/projection/navigation, Workforce page/actions/governance/policies, Patient directory/detail/provision/activation/policies, Access/Service policy and UX-04 workspace, Contact context/interactions/policy, Content/policy, reporting UI/context/direct/Child policies/services, Personal Home and UX-06 Work appointment detail.
- Typecheck initially found a missing `patientProfileId` in the new directory test fixture. Added the required field without changing production behavior; affected file rerun **4 tests PASS**.
- `npm run lint -- --max-warnings=0`: **PASS**, repository-wide zero warnings. `npm run typecheck`: **PASS** after the fixture correction. `git diff --check`: **PASS**; final staged check and strict UTF-8 scan also executed before commit.
- Impeccable detector executed over eleven changed TSX sources; no output findings. React component checklist/source review completed. Complete source/test diff reviewed before broad checks; no new dependency/lower-layer UI import or generic dashboard framework.
- No full suite, production build, dev server or PostgreSQL integration run: production changes are presentation/capability projection over unchanged policies/queries/mutations. `architecture:check` script is unavailable; module import boundaries inspected.

## 9. Remaining manual UAT and decision-gated exclusions

Browser inventory contained ChatGPT/Claude tabs only; no authenticated DEMI test session. **Actual desktop/mobile UAT NOT EXECUTED.** With authorized non-production accounts/data, verify:

1. 320/375px, desktop and 200% zoom: long Thai Hospital/person names, badges and links; no horizontal overflow; native anchors offset/focus and keyboard Tab/Enter behavior.
2. OWNER A/MEMBER B, multiple Owners/Hospitals, inactive memberships, suspended/pending Hospital, OSM-only associations, HOSPITAL+OSM/PATIENT, ADMIN-only/independently scoped ADMIN+HOSPITAL.
3. Exact-directory → R care/Program/appointment → readback → Hospital return; request queues remain actor-wide after context jumps. Forged H/R/relationship/content/report target IDs fail closed at server.
4. Workforce add/reuse, remote/assisted activation, conflicts, errors and actual persisted list refresh via existing continuations; no loss of pending/draft state during selection.
5. Content create/publish/withdraw/archive and contact update/conflict/revocation with existing guards; direct reporting/export and exact Child summary/no Patient/export paths.

P-13–P-19, broader OWNER-01/general-user/deletion authority, responsibility-area management, Parent identifying/clinical/export disclosure, report temporal/metric governance, clinical definitions and notification activation remain independent decision/audit work. No canonical requirement closed and no Owner Set working prototype promoted to final customer policy.

Recommended next phase: **UX-08 Global Navigation & Responsive Polish**, after UX-07 review/UAT. Stop at UX-07; UX-08 not started.
