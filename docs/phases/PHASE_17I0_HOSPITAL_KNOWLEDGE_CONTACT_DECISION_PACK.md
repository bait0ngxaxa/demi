# Phase 17I.0 — Hospital Knowledge / Contact Decision Pack

วันที่: 2026-10-04 (Asia/Bangkok). Repository: `bait0ngxaxa/demi`.

## 1. Current status

**Phase 17I.0 — DECISION PACK COMPLETE / OWNER DECISIONS OPEN.**

- **Q84–Q111 — OPEN / NOT OWNER APPROVED** ทั้ง 28 คำถาม รวมตัวเลือกย่อยทุกข้อ
- **CONTENT-01 — REQUIREMENT-GATED**
- **CONTENT-02 — REQUIREMENT-GATED**
- **Phase 17I runtime — NOT CLEARED FOR IMPLEMENTATION** รวม 17I.1
- **Phase 17H.4A — PASS / AUTOMATED RE-AUDIT COMPLETE** สำหรับ approved bounded automated scope; manual browser/mobile/device/BFCache UAT เป็น separate tracking stream และไม่ block งานนี้

เอกสารนี้เป็น requirement analysis และ owner decision pack เท่านั้น ทุกข้อเสนอมีสถานะ **RECOMMENDATION — NOT OWNER APPROVED** การจัดทำเสร็จไม่ใช่การปิด owner decisions และไม่ใช่ implementation clearance ไม่มี runtime/schema/migration เปลี่ยน ไม่มี commit/push และไม่มี UAT acceptance claim

## 2. Scope และวิธีอ่านหลักฐาน

จัดทำข้อเลือกเรื่อง Hospital content/news/health knowledge และ canonical Hospital contact เพื่อให้เจ้าของผลิตภัณฑ์ตอบก่อนจัดทำ implementation contracts แยกข้อเท็จจริงดังนี้:

| ชั้นหลักฐาน | ใช้ตัดสินอะไร | ข้อจำกัด |
| --- | --- | --- |
| A — Current repo | สิ่งที่ schema/services/policies/routes/navigation มีจริง ณ baseline | การมี runtime ไม่ใช่ owner approval ของ domain ใหม่ |
| B — Customer / legacy | เจตนา คำศัพท์ และ behavior ที่ค้นพบ | legacy ไม่ใช่ target authentication/authorization/data architecture; preview ไม่เท่ากับ implemented workflow |
| C — Accepted architecture | trust boundary, identity, policy, transaction, transport | ข้อผูกพันเดิม ไม่เปิดใหม่เพราะเริ่ม domain นี้ |
| D — Owner decision | ownership, author/publisher, audience, fields/lifecycle/visibility | Q84–Q111 ยัง OPEN |
| E — Deferred/excluded | สิ่งที่ไม่รวมใน first slice ถ้ารับข้อเสนอ | การเลื่อน/ยกเว้นไม่ใช่อนุญาตให้ implement ภายหลังอัตโนมัติ |

อ่าน current-status addenda ก่อน historical entries ใน CONTEXT/backlog/decision packs ไม่ยกสถานะเก่ามาหักล้าง closeout ใหม่ ไม่ยืม Wellness SELF-only ownership, delete หรือ business semantics มาใช้กับ Hospital content/contact

## 3. Repository baseline / HEAD

- Branch: `main`
- Expected และ actual starting HEAD: `3f383afe0c15498093004435e7e475d26c89119e`
- Commit: `test(phase-17h4a): complete wellness privacy response matrix`
- Starting worktree: clean; `git diff` ว่าง ไม่มี user changes ที่ต้อง reconcile
- HEAD ของงานเอกสารนี้คงเดิม ไม่มี commit/push; intended diff มีเพียงเอกสาร pack นี้, CONTEXT และ Phase 17 backlog
- Legacy checkout ที่อ่านอย่างเดียวอยู่นอก current repository; pinned HEAD: `7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e` จาก `raviut-max/demi-plus-web-v2` ไม่มีการเชื่อม legacy database หรือคัดลอกโค้ดเข้าระบบ

## 4. Evidence reviewed

รหัสหลักฐานต่อไปนี้ใช้ในทุกคำถามเพื่อให้ตรวจกลับได้:

| ID | Source / ส่วนที่ตรวจ | ข้อค้นพบ |
| --- | --- | --- |
| E01 | [AGENTS.md](../../AGENTS.md), [PRODUCT.md](../../PRODUCT.md), [CONTEXT](../CONTEXT.md) | UTF-8/Thai, surgical scope, 4 roles, server authority, current Phase statuses; PRODUCT มีข้อความ prototype เก่าบางส่วน ต้องอ่านร่วมกับ current runtime/addenda |
| E02 | [Architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), [ADR index](../adr/README.md) และ accepted ADR-0001–0008: [identity](../adr/0001-person-and-user-identity.md), [authorization](../adr/0002-role-capability-scope-authorization.md), [onboarding](../adr/0003-hospital-led-onboarding.md), [Patient activation](../adr/0004-patient-provisioning-and-activation.md), [server boundary](../adr/0005-server-side-application-boundary.md), [transactions](../adr/0006-transactional-business-operations.md), [transport/mobile](../adr/0007-client-transport-and-mobile-ready-architecture.md), [workforce](../adr/0008-workforce-provisioning-and-activation.md) | accepted identity/trust/tenant/service/policy boundaries; external Master provider ยัง unresolved |
| E03 | [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md) §2, §4–5, CONTENT-01/02 matrix; [Phase 17 backlog](./PHASE_17_UAT_BACKLOG.md) current addenda + CONTENT rows | customer intent: Hospital news/health knowledge, NCD/food/exercise/other และ Hospital contact; ทั้งสองยัง REQUIREMENT-GATED |
| E04 | [17H.4A report](./PHASE_17H4A_WELLNESS_REAUDIT_UAT_READINESS.md), [17H.0 pack](./PHASE_17H0_WELLNESS_DECISION_PACK.md), [17H.0B closeout](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md) | automated PASS, separate manual UAT, evidence/decision/status conventions; global numbering ล่าสุด Q83; ไม่ใช้ Wellness business rules |
| E05 | [Prisma schema](../../prisma/schema.prisma): Hospital, HospitalMembership, PatientHospitalRelationship, PatientProfile, PatientHospitalProfile, PatientAppointment, HospitalServiceOffering, HospitalOnboardingApplication, AuditEvent และ model/enum inventory; [audit writer](../../src/modules/audit/services/audit-service.ts) | Hospital มี identity/lifecycle/hierarchy/timestamps/relations; ไม่มี CMS หรือ canonical Hospital contact fields; Patient contact กับ appointment location เป็นคนละ domain |
| E06 | [Master workbook](../demi_hospital_master_v2.xlsx): ตรวจ OOXML จริงทุก sheet header + HospitalMaster rows; [seed JSON](../../prisma/seed/hospital-master-v2.json); [seed script](../../scripts/seed-hospital-master.mjs) | 78 identity records, 43 MAIN/35 SUB; ไม่มี contact/geography columns ใน approved Master; script persist parentHospitalId ไม่ให้ authority |
| E07 | [Master service](../../src/modules/hospital-onboarding/services/hospital-master-service.ts), [onboarding service](../../src/modules/hospital-onboarding/services/hospital-onboarding-service.ts), [onboarding policy](../../src/modules/hospital-onboarding/policies/hospital-onboarding-policy.ts) | Master projection จาก Hospital; available lookup เฉพาะ PENDING_VERIFICATION; approval rechecks persisted ADMIN และ atomic Hospital/User/role/OWNER/audit |
| E08 | [Workforce service](../../src/modules/workforce/services/workforce-service.ts), [workforce policy](../../src/modules/workforce/policies/workforce-policy.ts), [OWNER policy](../../src/modules/workforce/policies/hospital-owner-policy.ts), [Hospital governance service](../../src/modules/hospital-governance/services/hospital-governance-service.ts), [governance policy](../../src/modules/hospital-governance/policies/hospital-governance-policy.ts) | direct ACTIVE OWNER/ACTIVE Hospital authority ตาม operation; ADMIN governance แยก; profession ไม่ให้ permission |
| E09 | [Patient SELF policy](../../src/modules/patient-self/policies/patient-self-policy.ts), [SELF query service](../../src/modules/patient-self/services/patient-self-query-service.ts), [SELF page context](../../src/modules/patient-self/transport/patient-self-page-context.ts), [Personal page](../../app/app/personal/page.tsx), [Personal Home](../../app/app/personal/patient-personal-home.tsx), [relationship list](../../app/app/personal/patient-self-relationship-list.tsx), [navigation](../../src/components/app-shell/application-navigation.ts) และ inventory ใต้ app/app/personal | persisted User ACTIVE/PATIENT → own Person/PatientProfile; relationship locator rechecked; existing Personal/Work navigation; ไม่มี content/contact destination |
| L01 | [Legacy knowledge page](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/knowledge/page.tsx), [settings entry](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/settings/page.tsx) | knowledge เป็น under-development preview; mention บทความ/วิดีโอ/PAM ไม่พิสูจน์ CMS persistence/approval/audience |
| L02 | [Legacy Hospital helpers](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/lib/supabase/queries.ts) ช่วง Hospital Management/createHospital, [Hospital list](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/page.tsx) HospitalCard, [edit](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/%5Bid%5D/edit/page.tsx), [new](https://github.com/raviut-max/demi-plus-web-v2/blob/7a5510ee1cb5c55b62ad62b0d49bbaa8295d228e/app/admin/hospitals/new/page.tsx) | helper รับ address/phone/province/district/subdistrict; edit อ่าน/แก้ address; list แสดง phone ถ้ามี; new form เน้น identity/type/parent; ไม่ยืนยันค่าใน DB จริงหรือ contact completeness |

ค้นด้วย `rg --files` และ `rg -n` ใน schema, app, src/modules, navigation, scripts, seed และเอกสารก่อนกล่าวว่า domain/field/capability ไม่พบ ตรวจทั้งชื่อ content/news/knowledge/CMS/publisher/contact และ HospitalMaster/parentHospitalId

คำว่า `content` มี route สำหรับ Patient evidence artifact อยู่จริง แต่ไม่ใช่ Hospital news/CMS; `contentSha256` และ `expiresAt` ใน artifact/activation/invitation ไม่ใช่ publication field ของ Hospital content ข้ออ้าง “ไม่มี content route” ในเอกสารเก่าต้องอ่านเป็น **ไม่มี Hospital CMS/content domain** ไม่ใช่ไม่มีคำว่า content ทั้ง repository

## 5. Current runtime / schema inventory

### Hospital identity และ Master

`Hospital` scalar fields ครบ ณ baseline: `id` UUID PK, `hospitalCode` unique VarChar(32), `name` VarChar(200), `status` default PENDING_VERIFICATION, nullable `parentHospitalId` UUID, `createdAt`, `updatedAt` พร้อม index `[status, name]`

Relations: `memberships`, `osmHospitalRelationships`, `patientRelationships`, `patientActivations`, `onboardingApplications`, `serviceOfferings`, `patientAccessRequests`, `parentHospital`, `childHospitals` Parent relation มี onDelete Restrict ไม่มี Hospital type หรือ geography/contact scalar

**ไม่มี Prisma model ชื่อ HospitalMaster**: `HospitalMasterRecord` เป็น service type `{ id, hospitalCode, name, parentHospitalCode }` ที่ query `Hospital` จริง `listAvailableHospitalMaster` เป็น onboarding candidate lookup เฉพาะ PENDING_VERIFICATION; `findHospitalMasterByCode` validates code และคืน identity ไม่ใช่ contact reader และไม่ใช่ Patient audience resolver

Workbook มี 5 sheets: Summary, HospitalMaster, MigrationDecisions, ReviewIssues, LegacySnapshot

- `HospitalMaster!A1:M1`: `legacyId`, `source`, `legacyCode`, `canonicalCode`, `nameTh`, `legacyNetworkType`, `legacyParentId`, `parentCanonicalCode`, `parentNameTh`, `legacyIsActive`, `importReady`, `migrationStatus`, `reviewNote`; 78 data rows
- `LegacySnapshot!A1:F1`: `id`, `code`, `name`, `type`, `parent_id`, `is_active`; 79 data rows
- MigrationDecisions ระบุ exclude HH/hh และ canonical corrections KANG/KHON; ReviewIssues ระบุ NONE
- JSON keys จริง: `canonicalCode`, `nameTh`, optional `parentCanonicalCode` เท่านั้น Seed validates 78 records/43 MAIN/35 SUB, upserts name/code และ resolves parent code เป็น `parentHospitalId`

`legacyNetworkType` เป็น reference classification ใน artifact ไม่ใช่ enum persisted ใน Hospital ไม่ควรอนุมานว่าทุก child เป็น รพ.สต. หรือทุก parent เป็น Hospital ประเภทเดียว ห้ามอนุมาน address/phone/email/website/geography จาก Master นี้ ไม่ได้เรียก external Master provider หรือ seed/database command ในงานนี้

### Membership / governance

`HospitalMembership`: `id`, `userId`, `hospitalId`, `membershipType` OWNER/MEMBER, nullable `profession`, `status`, timestamps; unique `[userId, hospitalId]` HOSPITAL OWNER ไม่ใช่ ADMIN; OSM ใช้ OsmHospitalRelationship แยก Onboarding approval activate existing Hospital row และสร้าง ACTIVE OWNER โดย atomic audit; workforce mutation ใช้ direct ACTIVE OWNER ใน ACTIVE Hospital ตาม policy ไม่มี content/contact permission ที่เกิดจาก membership โดยอัตโนมัติ

### Patient personal experience

SELF queries resolve persisted ACTIVE User + PATIENT role + own Person/PatientProfile; relationshipId เป็น locator แล้ว query ownership ใหม่ `PatientHospitalRelationship` มี unique `[patientProfileId, hospitalId]` และ **ไม่มี status/lifecycle field** ปัจจุบัน own relationship list แสดง Hospital identity/status ได้รวม non-ACTIVE Hospital เพื่อบอกความจริง ไม่เท่ากับอนุญาต Hospital content audience ใหม่

Personal routes มี home, care/relationship/detail, services, medications, wellness, appointments, profile/relationship, password/account flow Navigation หลัก: หน้าส่วนตัว (ตาม workspace), ข้อมูลการดูแล, บริการของฉัน, ยาของฉัน, สุขภาพ, นัดหมาย, ข้อมูลของฉัน; Home มีทางลัดและรายชื่อ Hospital ที่เชื่อมอยู่ แต่ไม่มี Hospital knowledge/contact destination ไม่มี selected Hospital ที่ client ส่งแล้วกลายเป็น authority

`PatientProfile.phoneNumber/addressText` และ `PatientHospitalProfile.phoneNumber/addressText` เป็น Patient data; `PatientAppointment.locationType/locationDetail` เป็นสถานที่นัด; `HospitalServiceOffering` เป็น service catalog ไม่ใช่ content taxonomy ไม่มีสิ่งใดเป็น canonical Hospital contact ส่วน Patient evidence upload/storage เป็น protected evidence domain ไม่ใช่ media library สำหรับ CMS

Audit service ที่ตรวจมี `recordAuditEvent` สำหรับเขียน event ไม่มี generic audit reader/Admin audit-history UI ใน inventory ที่ค้น การมี ADMIN role หรือ AuditEvent records ไม่พิสูจน์สิทธิ์อ่าน event/body ของ Hospital

## 6. Legacy / customer evidence และข้อจำกัด

E03 เป็น canonical customer intent สำหรับ CONTENT-01/02: Hospital knowledge/news, NCD/food/exercise/other และ Hospital contact ไม่พบ original whiteboard แยกใน repository; ไม่อ้างว่า Dashboard workbook ยืนยัน publication/medical rules

L01 preview แสดงคำศัพท์ article/video/PAM-topic categorization แต่ไม่มี create/edit/publish implementation ในหน้านั้น การมี admin menu/client checks ไม่อนุมัติ ADMIN authoring และไม่ให้ copy legacy authorization; PAM personalization/video uploads ไม่ได้รับอนุมัติจาก CONTENT-01

L02 ให้ evidence-backed candidate fields address/phone; province/district/subdistrict อยู่ใน helper input แต่ไม่ใช่ approved Master geography ไม่มีหลักฐาน Hospital email/website/hours/maps ที่ยืนยันได้จากแหล่งที่ตรวจนี้ Personal/staff email/phone และ support email ในหน้า placeholder ไม่ใช่ Hospital contact ไม่นำค่า legacy เข้า DEMI และไม่อ้างว่ามี legacy DB schema/data ที่ตรวจแล้ว

## 7. Already accepted architecture constraints

```text
Client / UI
  ↓
Server Action / Route Handler
  ↓
Application Service
  ↓
Policy / Authorization
  ↓
Prisma
  ↓
PostgreSQL / Supabase
```

- Role + Capability + Scope → server-side policy decision; fail closed; persisted actor/resource authority ทุก protected operation
- Person/User และ roles ADMIN/HOSPITAL/OSM/PATIENT คงเดิม Profession DOCTOR/NURSE ไม่ใช่ role/permission
- OWNER authority อยู่เฉพาะ direct Hospital ตาม capability; hierarchy ไม่ grant audience/edit/read scope ไม่มี parent-content/contact inheritance ที่ยืนยันแล้ว
- Route params, selected Hospital, request payload, workspace visibility เป็น locator/UX เท่านั้น
- Master identity controlled; external provider unresolved; contact ownership ไม่อนุญาตแก้ hospitalCode/name/status/parent โดยปริยาย
- Application Service เป็น business boundary; transport/policy reuse ตาม responsibility; ไม่เพิ่ม generic RBAC/workflow engine หรือ REST API ที่ไม่มี consumer
- Consistency-critical writes + successful audit ต้อง atomic; future contracts ต้องปิด retry/concurrency/validation/error semantics ก่อน runtime ไม่เลือก schema/isolation ล่วงหน้าใน pack นี้
- Thai UTF-8, responsive/accessibility, truthful missing/error states และ private scoped response handling คงอยู่ ไม่มี cross-domain secondary use โดยปริยาย

## 8. Gap analysis — CONTENT-01

| Requirement | มีจริง | สิ่งที่ยังเปิด |
| --- | --- | --- |
| Customer knowledge/news intent | E03; L01 vocabulary preview | source/medical meaning Q97, ownership Q84 |
| Authoring / moderation / publishing | ไม่มี Hospital CMS models/services/policies/actions/routes | Q85–Q87; routine moderation authority และ approval flow |
| Categories / article payload / media | มีตัวอย่าง NCD/food/exercise/other ใน intent เท่านั้น | Q88–Q90; bounded formats/fields ต้องปิดใน contract |
| Audience / temporal reads | มี SELF identity/relationship boundary สำหรับ domain เดิม | Q91–Q93; content permission ใหม่ยังไม่มี |
| Correction / deletion / attribution | มี AuditEvent infrastructure ไม่ใช่ article history | Q94–Q97 และ Q109–Q110 |
| Discovery / Personal navigation / mobile UAT | มี Personal shell/relationship UX | Q98, Q107–Q108; ยังไม่มี content UAT flow |

**CONTENT-01 — REQUIREMENT-GATED**: implementation ก่อนตอบจะเดา tenant ownership, health authority และการเผยแพร่ ไม่มี recommendation ข้อใดสร้าง permission จริง

## 9. Gap analysis — CONTENT-02

| Requirement | มีจริง | สิ่งที่ยังเปิด |
| --- | --- | --- |
| Hospital identity / linkage | Hospital + controlled 78-record Master | identity ไม่ใช่ contact; Q99 source/owner |
| Exact fields | local Master ไม่มี contact; L02 address/phone candidates | Q100 optionality/fields; ไม่มี verified values |
| Editor / trust | existing OWNER/ADMIN policies สำหรับ operations เดิม | Q101–Q102; contact update authority ยังไม่มี |
| Disclosure / hierarchy / missing | Hospital parent FK + Personal own relationships | Q103–Q105; ไม่มี approved projection/fallback |
| Reuse / UX / audit / corrections | appointment location และ Patient contact อยู่คนละ domain | Q106–Q110; future consumers ไม่ได้ถูก wire |

**CONTENT-02 — REQUIREMENT-GATED**: แยก master identity owner จาก contact value owner ก่อนเลือก persistence ไม่มี schema design/migration/duplicate contact page data ในงานนี้

## 10. Owner decision questions Q84–Q111

**ทุกหัวข้อต่อไปนี้: OPEN / NOT OWNER APPROVED.** ตัวเลือกเพิ่ม scope ต้องปิดรายละเอียดก่อน technical contract ไม่มีตัวเลือก “อื่น” ที่ถือว่าอนุมัติทั้งที่ owner ยังไม่ระบุ

คำถามที่มีแกนอิสระใช้ตัวเลือกย่อยใต้หมายเลขเดิม เช่น `Q93.schedule A; Q93.expiry B` เพื่อไม่บังคับซื้อหลาย business decisions ใน bundle เดียว `Qxx A` สำหรับหัวข้อย่อยหมายถึงเลือก A ทุกแกนที่แสดงชัดในข้อนั้น; override แยกแกนได้ ไม่สร้าง global Q ใหม่

### Q84 — Content ownership

Evidence: E02/E05/E08 แยก direct tenant scope; E03 ต้องการ Hospital content ไม่ยืนยัน global publisher; parent FK ไม่ให้ inheritance

Options:

- A — แต่ละ content record เป็นของ Hospital เดียว ไม่มี global content ใน first slice
- B — platform/global content เท่านั้น
- C — มีทั้ง Hospital-owned และ global โดย ownership ไม่ปะปนกัน
- D — owner ระบุ ownership model อื่นและ boundary ให้ครบก่อน closeout

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ตรง Hospital intent และ existing direct tenant boundary ลด nullable/mixed-owner authority

Impact: future contract ต้อง bind content กับ canonical Hospital; B/C ต้องกำหนด global publisher/audience แยก ไม่มี parent inheritance ทุกตัวเลือก

### Q85 — Who may create/edit content

Evidence: E08 มี direct ACTIVE OWNER pattern; MEMBER/profession ไม่ใช่ CMS grant; L01 admin preview ไม่เป็น target authority

Options:

- A — ACTIVE HOSPITAL OWNER ของ ACTIVE owning Hospital เท่านั้น
- B — OWNER และ HOSPITAL MEMBER ที่ได้รับ explicit authoring capability ใน direct owning Hospital
- C — Platform ADMIN เท่านั้น ใน ownership scope ที่ Q84 อนุมัติ
- D — Hospital authors และ Platform authors แยกตาม ownership โดย owner ระบุ permission matrix

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: มี tenant authority pattern พร้อม ไม่ต้องสร้าง delegation/assignment management ก่อนมี requirement

Impact: OWNER membership ไม่ grant CMS โดยอัตโนมัติ ต้องมี domain policy contract ใหม่; B ต้องระบุผู้ให้/ถอน capability; DOCTOR/NURSE/OSM ไม่ได้สิทธิ์เอง

### Q86 — Publishing / approval authority

Evidence: E03 ยังไม่ปิด author/reviewer/approval; L01 ไม่มี approval implementation

Options:

- A — authorized author ตาม Q85 publish ได้โดยตรง ไม่ต้องมี approval แยก
- B — Hospital OWNER ของ owning Hospital อนุมัติ; reviewer อาจเป็นผู้เขียนเดียวกันได้
- C — Hospital reviewer ที่มี explicit capability และต้องเป็นคนละผู้เขียนอนุมัติ
- D — Platform ADMIN review ก่อน publish ใน scope ที่ระบุชัด

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: เมื่อ Q85 A จำกัด OWNER แล้ว การเพิ่ม approval state/second reviewer ยังไม่มี requirement evidence

Impact: owner ต้องยืนยันว่า direct publication เหมาะกับ informational domain Q97; B/C/D ต้องปิด rejection/edit-after-review/reapproval semantics; authoring และ publishing เป็นคนละ operation แม้ actor เดียวกัน ไม่มี workflow engine อัตโนมัติ Routine withdrawal/moderation ใช้ publisher authority ตาม Q87/Q95 ไม่เพิ่ม ADMIN content override เอง

### Q87 — Publication lifecycle

Evidence: E03 ระบุ lifecycle gap; ไม่มี current article status enum (E05)

Options:

- A — DRAFT → PUBLISHED; PUBLISHED → DRAFT เพื่อถอนเผยแพร่/แก้ไข; DRAFT หรือ PUBLISHED → ARCHIVED; ARCHIVED terminal ใน first slice
- B — ไม่เก็บ draft: publish และ withdraw เท่านั้น โดย owner ปิดการเก็บงานก่อนเผยแพร่
- C — ระบุ lifecycle/transitions เพิ่มที่มีเหตุผลธุรกิจ เช่น review/rejected หรือ restore archived

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: แยกงานยังไม่เผยแพร่ งานอ่านได้ และงานยุติเผยแพร่ได้โดยไม่ต้องสร้าง generic CMS workflow

Impact: เป็นข้อเสนอ transitions เท่านั้น Q86 approval ถ้าเลือกจะต้อง integrate โดยชัด; schedule/expiry ตอบอิสระใน Q93 ไม่แฝงใน state choice

### Q88 — Content categories

Evidence: E03 มี NCD, food, exercise, other; L01 PAM categories เป็น preview และไม่ใช่ owner-approved taxonomy

Options:

- A — fixed single category ต่อ article: NCD / อาหาร / การออกกำลังกาย / อื่น ๆ
- B — seeded initial categories ตามรายการนี้ แล้ว Hospital จัดการหมวดหมู่เอง
- C — labels/tags หลายค่าต่อ article โดย owner ระบุ vocabulary และผู้จัดการ
- D — owner ให้ fixed vocabulary อื่นพร้อมชื่อไทยและความหมาย

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ใช้ customer-intent examples ที่มีจริงและไม่เพิ่ม taxonomy administration

Impact: ต้องยืนยันว่าตัวอย่างกลายเป็น fixed choices ได้; canonical codes/labels ปิดใน contract ไม่มี PAM personalization หรือ reuse Wellness categories

### Q89 — Minimum content fields

Evidence: E03 ต้องอ่านข่าว/ความรู้ แต่ไม่ให้ field contract; L01 article vocabulary ไม่พิสูจน์ summary/effective date

Options:

- Core A — required title, plain-text body, single category ตาม Q88; ownership/author actor identifiers เป็น internal authority/audit metadata; actual latest publishedAt เป็น server event instant เมื่อ publish ไม่ใช่ user-entered effective date
- Core B — owner ระบุ core fields อื่นและเหตุผล เช่น summary-only news; ต้องปิดว่า Patient อ่านอะไร
- Summary A — ไม่มี summary field แยกใน first slice
- Summary B — optional plain-text summary แยกจาก body
- References A — optional plain-text source/reference attribution; ไม่ต้องมี structured references model
- References B — ไม่มี source/reference field แยก; source governance ยังคงต้องตอบ Q97

RECOMMENDATION — NOT OWNER APPROVED: **core A / summary A / references A** (`Q89 A`)

Reason: title/body/category ทำให้อ่านได้จริง; actual publish instant ไม่สร้าง scheduling; source attribution รองรับความรับผิดชอบโดยไม่สร้าง reference framework

Impact: optional source text ไม่อนุมัติ external-link feature (Q90) หรือแสดง staff identity (Q96) Numeric/text bounds/format/validation ปิดก่อน implementation ไม่เพิ่ม effectiveFrom/expiresAt เว้น Q93 อนุมัติ

### Q90 — Rich content / media

Evidence: L01 กล่าวถึง video แต่เป็น preview; E03 ไม่ยืนยัน media; E05 existing evidence upload ไม่ใช่ Hospital CMS storage

Options:

- A — plain text เท่านั้น; ไม่มี upload/rich text/HTML/embedded media หรือ clickable external-link feature; reference URL ถ้าระบุเก็บเป็น text
- B — rich text แบบจำกัด โดย owner ระบุ elements ที่จำเป็นก่อนเลือก representation/editor
- C — owner ระบุเฉพาะ media ที่ต้องใช้: images, PDF/attachments, external links, embedded media; ตอบแยกชนิด ไม่รวมทุกชนิดอัตโนมัติ

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: UAT บทความไทยทำได้โดยไม่รับ arbitrary HTML หรือเพิ่ม storage/upload complexity

Impact: B/C ต้องปิด file limits, validation, access, provenance และ deletion ตามชนิดที่อนุมัติ ไม่ copy Patient evidence storage scope ไม่เพิ่ม WYSIWYG dependency ล่วงหน้า

### Q91 — Patient audience

Evidence: E09 มี exact persisted SELF + direct own PatientHospitalRelationship; E05 relationship ไม่มี ACTIVE status; E02 ไม่อนุมัติ network scope

Options:

- A — authenticated ACTIVE PATIENT ที่มี own persisted relationship กับ owning ACTIVE Hospital ขณะอ่านเท่านั้น; Hospital non-ACTIVE หรือไม่มี relationship ไม่อ่าน content
- B — authenticated ACTIVE PATIENT ทุกคน ไม่ต้องมี Hospital relationship
- C — Patients ใน network ที่ owner นิยาม explicit authoritative membership; parentHospitalId อย่างเดียวไม่พอ
- D — explicitly selected audience โดย owner ระบุ persisted grant/source และ revoke behavior
- E — public anonymous audience เฉพาะเมื่ออนุมัติ public-access contract แยก

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: มี relationship proof ปัจจุบันและตอบ Hospital-specific content โดยไม่สร้าง global/network/public access

Impact: นี่คือ proposed content read rule ใหม่ ไม่แก้ existing care/history visibility; “currently related” หมายถึง exact relationship ยังอยู่จริง + Hospital ACTIVE ไม่ invent relationship status; no relationship ต้อง empty/deny อย่างตรงไปตรงมา Multi-role ต้องผ่าน Patient SELF ไม่ union Work authority; audience loss ต้องตัด read ใหม่

### Q92 — Staff / OSM visibility

Evidence: E03 Patient-facing consumption; HOSPITAL/OSM role ไม่เท่ากับ Patient permission (E02/E09)

Options:

- A — first consumption scope เป็น Patient เท่านั้น; authorized publisher มี own publishing workspace preview เพื่อทำงาน แต่ไม่ใช่ staff feed
- B — direct HOSPITAL members อ่าน published feed ของ Hospital ที่มี authority; owner ปิด scope/lifecycle
- C — เพิ่ม OSM feed โดย owner ระบุว่าต้อง association, assignment หรือ explicit grant ใด

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ไม่เพิ่ม audience จาก role ที่ไม่มี customer evidence; preview จำเป็นต่อ authoring เท่านั้น

Impact: B/C เป็น read grant ใหม่ไม่ใช่ reuse care assignment อัตโนมัติ Multi-role staff+PATIENT ยังอ่านได้ผ่าน own Patient authority ตาม Q91

### Q93 — Effective / expiry behavior

Evidence: E03 unresolved effective/expiry; E05 ไม่มี article fields; E04 แสดงว่าต้องแยก civil date ออกจาก instant อย่างตั้งใจ

Options — schedule:

- A — publish effective ทันทีเมื่อ successful publication commit; ไม่มี future schedule/effectiveFrom
- B — scheduled publish instant; owner ระบุ timezone/input/activation behavior ก่อน contract
- C — effective civil date; owner ระบุ Bangkok day-boundary และการแปลงเป็น visibility instant แยกจาก publish event

Options — expiry:

- A — ไม่มี expiresAt/automatic expiry; authorized publisher ถอนด้วย DRAFT/ARCHIVED ตาม Q87
- B — optional expiry instant; excluded from Patient reads เมื่อ `now >= expiresAt`; publisher ที่ยังมี authority เห็น record ต่อ; ไม่ physical delete
- C — optional Bangkok expiry civil date แบบ inclusive day; อ่านได้จนถึงก่อน 00:00 ของวันถัดไป Asia/Bangkok; publisher เห็น record ต่อ; ไม่ physical delete

RECOMMENDATION — NOT OWNER APPROVED: **schedule A / expiry A** (`Q93 A`)

Reason: ไม่มี evidence ว่าต้อง schedule/expire; manual publish/withdraw เพียงพอสำหรับ bounded slice

Impact: ทุก choice Patient เห็นเฉพาะ PUBLISHED ที่ผ่าน audience และ temporal predicate; DRAFT/ARCHIVED ไม่แสดง; publisher เห็น historical/withdrawn records เฉพาะยังมี authority ตาม Q110; B/C temporal options ต้องปิด edit/cancel/race/effective-vs-publish semantics ไม่เก็บ Bangkok civil date เป็น fake UTC midnight; actual publishedAt เป็น instant แสดง Asia/Bangkok ไม่มี job อนุมัติใน pack นี้

### Q94 — Editing published content / versioning

Evidence: E03 versioning gap; ไม่มี content versions (E05); audit ไม่ใช่ full version history

Options:

- A — แก้ current PUBLISHED record แล้ว Patient เห็นใหม่ทันที ไม่มี full versions
- B — ถอน PUBLISHED เป็น DRAFT ก่อนแก้ current record แล้ว publish ใหม่; actual latest publishedAt เปลี่ยนเมื่อ republish; ไม่มี full versions
- C — new immutable revision ต่อ published edit โดย owner ระบุ previous-version visibility/retention

RECOMMENDATION — NOT OWNER APPROVED: **B**

Reason: ไม่แก้ข้อความ live ระหว่างจัดทำ correction และไม่ต้องสร้าง version archive ที่ยังไม่ยืนยัน

Impact: B ทำให้ article ไม่อยู่ใน Patient reads ระหว่างแก้; audit เก็บ event ไม่เก็บ old bodies; republish ต้องทำตาม Q86 เดิมเสมอ ถ้า approval required ต้อง reapprove ไม่ bypass; C ต้องปิด version/approval/read reference contracts เพิ่ม

### Q95 — Delete / archive / retention

Evidence: E03 unresolved; E02 atomic audit ไม่กำหนด legal retention period

Options:

- A — archive ทั้ง DRAFT และเคย PUBLISHED; first slice ไม่มี physical-delete operation
- B — physical delete ได้เฉพาะ draft ที่ไม่เคย published; published archive เท่านั้น
- C — อนุญาต physical delete published ด้วย โดย owner ระบุเหตุผล authority และ historical-link consequences

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ใช้ lifecycle เดียวและยังเก็บ publisher record สำหรับ correction trace โดยไม่อ้างว่าจะเก็บตลอดไปตามกฎหมาย

Impact: archive ไม่ใช่รับประกัน retention/restore/full versions; policy owner ต้องกำหนด operational retention/backup/erasure ก่อน real-data deployment ที่ต้องพึ่งเรื่องนี้ ไม่ invent จำนวนปี ไม่มี delete success audit ถ้าไม่มี delete operation

### Q96 — Attribution shown to Patient

Evidence: E03 Hospital publisher intent; E05 Person/User staff identity แยกจาก Hospital identity; E09 Patient read ใช้ minimized projection

Options — identity:

- A — Hospital name เท่านั้น ไม่เผยชื่อ human author/reviewer
- B — Hospital + human author display name
- C — Hospital + author + reviewer display names เมื่อมี reviewer จริง

Options — timestamp:

- A — แสดง actual latest publication timestamp ใน Asia/Bangkok พร้อมบอกว่าเป็นการเผยแพร่ล่าสุด
- B — ไม่แสดง publication timestamp ใน Patient projection

Options — source:

- A — แสดง source/reference text เมื่อมีจริง ไม่ fabricate และไม่อ้าง DEMI verified
- B — ไม่แสดง source/reference text แยกต่อ Patient

RECOMMENDATION — NOT OWNER APPROVED: **identity A / timestamp A / source A** (`Q96 A`)

Reason: บอกผู้รับผิดชอบ ความใหม่ และที่มาโดยไม่เผย staff personal identity โดย default

Impact: internal actor IDs สำหรับ audit ไม่ใช่ public attribution; B/C identity ต้องปิด lawful/consented display name handling และ changes after staff exit; source A ไม่มี clickable link feature เว้น Q90 อนุมัติ

### Q97 — Source / medical authority

Evidence: E03 health knowledge intent ไม่อนุมัติ clinical decision engine; L01 preview ไม่พิสูจน์ medical review process

Options:

- A — Hospital-owned informational knowledge/news; publisher รับผิดชอบความถูกต้องและ source attribution ถ้ามี; DEMI ไม่รับรองเป็น diagnosis/prescription/clinical truth
- B — centrally approved clinical content โดย owner ระบุ medical authority/reviewer/process และขอบเขต use
- C — external authoritative resources เท่านั้น โดย owner ระบุ source allowlist/curation responsibility; link behavior ตัดสิน Q90

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ตรง Hospital knowledge/news intent มากที่สุดโดยไม่ยืนยันกระบวนการ clinical approval ที่ไม่มีหลักฐาน

Impact: A ไม่ยกเว้น publisher จาก medical responsibility; Q86 ต้องสอดคล้องกับ governance ที่ owner เลือก ไม่เพิ่ม AI health advice, nutrition/clinical interpretation หรือ PAM-targeted recommendations; B/C ไม่ implement จน process/source explicit

### Q98 — Search / filter / ordering

Evidence: E03 category examples; ไม่มี search/pin contract หรือ corpus estimate

Options — category:

- A — filter ตาม single category Q88 พร้อมรายการทุกหมวด
- B — ไม่มี category filter ใน first slice

Options — ordering:

- A — newest actual latest publishedAt ก่อน; stable identifier tie-break ใน technical contract
- B — owner ระบุ ordering อื่นที่มี business meaning

Options — search:

- A — ไม่มี text search ใน first slice
- B — bounded text search โดย owner ระบุค้น title/body/source ส่วนใด

Options — pinning:

- A — ไม่มี pinned content
- B — pin ภายใน Hospital โดย owner ระบุ authority/order interaction

RECOMMENDATION — NOT OWNER APPROVED: **category A / ordering A / search A / pinning A** (`Q98 A`)

Reason: filter + newest-first ตอบ browsing intent ได้โดยไม่เพิ่ม generic search infrastructure

Impact: future contract ต้องกำหนด bounded pagination/stable ordering และ empty/error states; search/pin answers แยกจาก category filter ไม่เพิ่ม engine หรือ relevance ranking เอง

### Q99 — Authoritative source of Hospital contact data

Evidence: E06 approved Master ไม่มี contact; E02 external provider ยังไม่เลือก; L02 เป็น legacy field evidence ไม่ใช่ source of verified current values

Options:

- A — trusted Hospital Master เท่านั้น; contact ยังว่างจนมี approved Master source ที่ให้ค่าจริง
- B — DEMI-managed Hospital contact extension ที่ owning Hospital รับผิดชอบ; Master เป็น identity source เดิม
- C — external authoritative source synchronized into DEMI หลัง owner ระบุ provider/source contract
- D — hybrid มี authoritative owner ต่อ field และ precedence/correction rules ชัด

RECOMMENDATION — NOT OWNER APPROVED: **B**

Reason: identity artifact มีจริงแต่ไม่มี contact การอ้าง Master เป็น source ของ contact ตอนนี้จะไม่จริง; extension แยก responsibility โดยไม่ต้องเลือก provider/jobs

Impact: หนึ่ง canonical contact source ผูก Hospital identity; extension เป็น conceptual boundary ยังไม่เลือก table/columns ไม่มี duplicate per page ไม่มี legacy import หรือ synchronization job; editor/trust ตอบ Q101–Q102

### Q100 — Exact contact fields

Evidence: L02 address/phone ถูกใช้งานใน helper/edit/list; geography เป็น helper input เท่านั้น; E06 ไม่มี contact/geography ใน approved Master ไม่มีหลักฐาน email/website/hours/maps ที่ยืนยัน

Options — field set:

- A — address แบบ free text + organizational phone เท่านั้น; existing Hospital name/code แสดงจาก identity source ไม่ทำสำเนา
- B — address free text เท่านั้น
- C — organizational phone เท่านั้น
- D — owner ระบุ field additions พร้อม purpose และ source/value evidence ต่อ field; email/website/hours/map/geography ยังไม่อนุมัติโดยเลือก D เปล่า ๆ

Options — completeness:

- A — contact fields ที่เลือกเป็น optional; empty หมายถึงยังไม่มีข้อมูล ไม่ block onboarding/Patient journey เพียงเพราะ contact ไม่ครบ
- B — owner ระบุ fields ที่ required และเหตุผล พร้อม rollout สำหรับ records ที่ไม่มีค่า

RECOMMENDATION — NOT OWNER APPROVED: **field set A / completeness A** (`Q100 A`)

Reason: เลือกเฉพาะ evidence-backed candidates และรักษาความจริงว่าไม่มี verified Master values

Impact: phone เป็น organizational contact ไม่ใช่ staff/private phone; format/extensions/multiple-number need และ bounds ปิดใน contract ไม่เติม sample number/address ลง canonical data ไม่เพิ่ม structured address/latitude/longitude อัตโนมัติ

### Q101 — Who may edit contact information

Evidence: E08 มี OWNER routine operation และ ADMIN governance แยก; E06 ไม่มี contact synchronization

Options:

- A — ACTIVE HOSPITAL OWNER ใน direct ACTIVE owning Hospital
- B — OWNER และ HOSPITAL MEMBER ที่มี explicit contact-edit capability
- C — Platform ADMIN หรือ trusted platform operator ที่ owner ระบุ
- D — synchronized read-only source; ไม่มี Hospital edit ต้องมี source contract ตาม Q99

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: สอดคล้อง proposed Hospital-owned operational contact Q99 B โดยไม่เพิ่ม delegation

Impact: ไม่ใช้ profession เป็น authority; ไม่ grant parent access หรือ edit identity Master; B ต้องระบุการให้/ถอน capability; C/D ต้อง reconcile contact data owner ไม่ reuse hospital:approve เป็น contact permission

### Q102 — Verification / trust level

Evidence: L02 ไม่ยืนยัน verification process; E07 Hospital onboarding verification ไม่ใช่ proof ของ contact value

Options:

- A — authorized update effective เมื่อ commit; label/meaning เป็น Hospital-provided operational data ไม่มี platform-verified claim
- B — requires Platform review ก่อน effective โดย owner ระบุ evidence/reviewer/process
- C — trusted contact verification operator ตรวจ โดย owner ระบุ proof/authority และ pending-value handling

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ยังไม่มี business need สำหรับ verification workflow; ข้อมูลที่ Hospital ดูแลไม่ควรถูกนำเสนอเป็น centrally verified

Impact: truthful trust attribution และ minimized audit; A ไม่อนุญาต role bypass; B/C ต้องแยก proposed/current value และ failure/stale review contracts ไม่ reuse onboarding approval โดยเดา

### Q103 — Disclosure scope

Evidence: E03 unresolved public vs scoped; E09 มี persisted own relationships ไม่ใช่ public Hospital directory

Options:

- A — Patient อ่านเฉพาะ contact ของ own persisted relationship กับ ACTIVE Hospital; authorized contact editor อ่านของ direct Hospital เพื่อจัดการ
- B — authenticated ACTIVE Users ทุกบทบาทอ่าน organizational contact
- C — public organizational contact หลังปิด anonymous contract แยก
- D — mixed per-field scope โดย owner ระบุ field/reader matrix เช่นบางฟิลด์ staff only

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ตอบ Personal Hospital contact intent โดยใช้ scope proof ที่มี และไม่อนุมานว่าข้อมูลติดต่อ public

Impact: contact permission แยกจาก Q91 content audience แม้ recommendation เหมือนกัน; non-ACTIVE Hospital identity ยังคงแสดงตาม flow เดิมได้ แต่ proposed contact read denied; B/C/D ต้องปิด caching/disclosure/error boundary เพิ่ม

### Q104 — Hospital hierarchy behavior

Evidence: E05 parentHospitalId เป็น FK; E06 MAIN/SUB classification ไม่ได้ยืนยันทุก child เป็น รพ.สต.; E02 hierarchy ไม่ให้ authority

Options:

- A — Hospital/รพ.สต. แต่ละแห่งมี own contact ของ exact identity; ไม่มี inheritance หรือ parent fallback
- B — child ใช้ parent contact โดย owner ระบุ authoritative relationship/label และต้องได้รับอนุญาตให้อ่าน parent projection แยก
- C — แสดง own + parent contact โดยแยกชื่อ/source และ authorization ของแต่ละแห่ง

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: parent FK ไม่พิสูจน์ว่าบริการ/เบอร์ติดต่อเหมือนกัน และไม่ต้องเปิด authority inheritance

Impact: ชื่อแสดงจาก Hospital identity จริง ไม่สร้าง type/label ว่ารพ.สต.จาก parent เพียงอย่างเดียว B/C เป็น presentation contract ที่ต้องมี source และ permission ไม่ grant hierarchy edit/read อัตโนมัติ

### Q105 — Missing contact behavior

Evidence: E06 ไม่มีค่า contact; L02 list แสดง phone เฉพาะเมื่อมี; E01 truthful empty state

Options:

- A — field ว่างไม่แสดง; ถ้าทั้งชุดไม่มีค่าระบุ “ยังไม่มีข้อมูลติดต่อ” ไม่มี active contact action
- B — แสดง label ของทุก field พร้อม “ยังไม่มีข้อมูล” เป็นรายฟิลด์
- C — parent fallback เฉพาะเมื่อ Q104 อนุมัติและ owner ระบุ label/authority; มิฉะนั้นใช้ A หรือ B ที่เลือก

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: mobile อ่านง่ายและไม่ทำให้ค่าที่หายดูเหมือนมีช่องทางใช้งาน

Impact: ไม่ fabricate phone/address/email ไม่เอา appointment.locationDetail มา fallback; data load error ต้องไม่แสดงเหมือน confirmed missing

### Q106 — Contact use in other domains

Evidence: E05 appointment location และ identity attribution เป็นคนละ responsibility; E03 ยังไม่มี cross-domain contact projection

Options:

- A — ระบุ Patient Hospital contact card เป็น initial intended consumer; Appointment contact display, content publisher contact, notifications และ reports เป็น future candidates เท่านั้น
- B — owner จัดลำดับ future consumers เป็นราย domain พร้อม purpose; ยังไม่ wire ใน 17I.0
- C — จำกัด contact use ที่ destination ของตน ไม่มี secondary-use plan ในตอนนี้

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: มี Patient intent โดยตรง ส่วน domains อื่นยังไม่มี approved source/time/visibility semantics

Impact: ไม่มี current wiring ทุกตัวเลือก Future contract ต้องแยก live contact จาก historical snapshot และ contact จาก appointment location; content แสดง Hospital identity ได้โดยไม่ depend on contact values ไม่มี notification delivery/report integration

### Q107 — Navigation placement

Evidence: E09 Personal navigation มี “สุขภาพ” สำหรับ Wellness, care/services/appointments/profile และ Home relationship list; ไม่มี Hospital content/contact routes

Options — knowledge/news:

- A — dedicated Personal destination “ความรู้และข่าวสาร” แยกจาก Wellness, ใช้ Hospital relationship context ที่ server ตรวจ; path ยังไม่กำหนด
- B — subsection ใน existing care relationship destination โดย owner ยืนยัน information architecture

Options — contact:

- A — contact entry/card ในบริบท Hospital relationship จาก Personal Home; คง Hospital identity labels ชัด ไม่เพิ่ม global directory
- B — dedicated Personal contact destination; Hospital list ยังคงมาจาก authorized relationship scope

RECOMMENDATION — NOT OWNER APPROVED: **knowledge A / contact A** (`Q107 A`)

Reason: “สุขภาพ” ปัจจุบันหมายถึง personal Wellness ไม่ควรผสม Hospital publication; contact ตาม Hospital ที่เชื่อมเป็น mental context ที่มีแล้ว

Impact: navigation intent เท่านั้น ไม่มี path/route/UI เพิ่มในงานนี้ Content authoring destination ตัดสินใน technical contract ตาม Q85 ไม่สร้าง ADMIN/HOSPITAL nav ตอนนี้ Links/server reads ยังต้อง authorize ไม่ใช้ navigation เป็น boundary

### Q108 — Mobile-first presentation / UAT intent

Evidence: E01/E02 mobile/accessibility baseline, E09 Thai Personal shell; Impeccable context ใช้เฉพาะ planning ไม่มี final UI design

Options:

- A — bounded Thai mobile acceptance intent ตามรายการด้านล่าง
- B — owner เพิ่ม acceptance scenarios/device constraints ที่ต้องใช้จริง โดยคง existing accessibility floor

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: อ่านบทความและติดต่อ Hospital ได้จริงบน phone โดยไม่เพิ่ม visual system

Impact / proposed acceptance intent:

- list → detail → back รักษา Hospital/category context; ไม่มี layout overflow จากชื่อ Hospital/title ยาว
- category navigation ตาม Q98 ใช้งาน touch/keyboard/screen reader ได้; มี selected/empty/loading/error states ที่แยกความหมาย
- long Thai paragraphs/words อ่านได้และขยาย text ได้; ไม่มี arbitrary HTML; labels ไม่ตัดความหมายของ source/publication time
- contact card แยก Hospital identity/address/phone ที่มีจริง ไม่มี fake action ถ้าค่าว่าง; ถ้าจะมี call/link action ต้อง validate destination และ accessible label ตาม field/format contract ไม่แอบเพิ่ม media/maps
- session/authority loss หรือ withdrawn content ไม่คงข้อมูลใหม่ที่ไม่อนุญาต; ไม่มี client Hospital selector grant authority

เป็น acceptance intent ไม่ใช่ UAT executed/PASS; detailed device/browser cases เป็น implementation/UAT contract ภายหลัง Manual 17H UAT ไม่ block 17I.0

### Q109 — Audit requirements

Evidence: E05 AuditEvent/E02 atomic successful mutation audit; free-text body/contact payload ไม่จำเป็นต่อ proof of action

Options:

- A — atomic minimized audit ของ create/edit/publish/withdraw/archive/contact update ที่สำเร็จจริง; delete เฉพาะถ้า Q95 อนุมัติและ implement; actor/resource/Hospital/event/time + non-sensitive transition identifiers เท่านั้น
- B — เพิ่ม governance events ที่ owner ระบุว่าต้องตรวจ เช่น approval/rejection ถ้า Q86 เลือก workflow; คง minimized payload

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: ตรวจได้ว่าใครทำอะไรใน tenant ไหนโดยไม่เก็บ full article/contact text ซ้ำใน audit

Impact: ไม่มี article body/title/summary/source free text, phone/address values หรือ sensitive payload hashes ใน audit metadata; success event ต้อง rollback ร่วมกับ mutation ไม่สร้าง duplicate event สำหรับ confirmed retry/NOOP; exact action names/read-audit need ปิดก่อน runtime ไม่สร้าง audit schema ใน pack

### Q110 — History / correction semantics

Evidence: E03 unresolved versioning; E05 AuditEvent ไม่ใช่ content revisions; Q94 แยก current record correction จาก old-body history

Options — publisher:

- A — ผู้มี current publisher authority เห็น current records รวม drafts/archives และ minimized mutation chronology ใน own Hospital ไม่แสดง previous bodies/contact values
- B — full previous versions/contact-value history โดย owner ระบุ purpose/retention และต้องสอดคล้อง Q94/Q95

Options — Platform ADMIN:

- A — เก็บ minimized governance audit evidence ไว้ตาม Q109; first slice ไม่เพิ่ม ADMIN history reader/UI หรือ full content/contact access; การเรียกดูเพื่อ investigation ต้องปิด authorized retrieval contract แยก
- B — additional scoped investigation content/history access โดย owner ระบุ explicit purpose/permission

Options — Patient:

- A — current eligible PUBLISHED content/current contact เท่านั้น; ไม่มี previous versions หรือ publisher audit feed
- B — correction history/notice visible โดย owner ระบุว่าจะเผยอะไรและยังผ่าน audience/disclosure

RECOMMENDATION — NOT OWNER APPROVED: **publisher A / admin A / patient A** (`Q110 A`)

Reason: มี trace of action และ current truth โดยไม่อ้าง event audit ว่าเป็น version archive

Impact: publisher chronology เป็น scoped minimized projection ที่ยังไม่ implement ไม่มี generic audit reader ที่พิสูจน์แล้วให้ reuse; ห้ามสร้าง role-only audit access; Patient A ไม่สัญญาว่ารู้เหตุผลหรือเห็น old text ที่ถอนแล้ว ไม่มี automatic global Admin content permission Retention policy และ user-facing history เป็นคนละ decision

### Q111 — First implementation boundary / ordering

Evidence: E05/E06 contact identity มีอยู่แต่ fields ยังไม่มี; E03 content เป็น new bounded domain; Q91/Q103 audience ไม่ depend on contact values

Options:

- A — 17I.1 Hospital Contact → 17I.2 Content Publishing → 17I.3 Patient Consumption
- B — 17I.1 Content Publishing → 17I.2 Patient Consumption → 17I.3 Hospital Contact
- C — owner ระบุ sequence อื่น เช่น contract contact แล้ว publishing/read เป็น combined bounded slice พร้อมเหตุผลและ gate ต่อ slice

RECOMMENDATION — NOT OWNER APPROVED: **A**

Reason: contact slice แคบกว่าและตรวจ source/ownership/disclosure ได้ก่อน CMS persistence; publishing ต้องมี safe owner/lifecycle ก่อน Patient consumer จึงอ่านได้จริง

Impact: หลัง owner closeout และ separate technical contract เท่านั้น 17I.1 อาจให้ contact manage/read ใน agreed Patient relationship context (Q107); 17I.3 หมายถึง **content** Patient consumption ไม่เลื่อน contact UAT readerไปจนท้าย ไม่มี dependency ให้ content ต้องมี phone/address และไม่สร้าง content fields ใน contact migration Future contract แยก contact migration risk จาก content ownership/state payload risk ถ้า Q99 A/C ไม่มี source ให้ค่า contact จริง B อาจเหมาะกว่า ต้องบันทึก owner ordering ใหม่ก่อน implement

## 11. Recommendation summary — NOT OWNER APPROVED

ตารางนี้ช่วยตอบ ไม่ใช่ decision closeout; ทุกแถว **OPEN / NOT OWNER APPROVED**

| Question | Recommended option | Scope summary |
| --- | --- | --- |
| Q84 | A | one owning Hospital |
| Q85 | A | direct ACTIVE OWNER authoring |
| Q86 | A | direct publish by authorized author |
| Q87 | A | DRAFT/PUBLISHED/terminal ARCHIVED |
| Q88 | A | fixed single NCD/อาหาร/การออกกำลังกาย/อื่น ๆ |
| Q89 | A (core/summary/references A) | title/body/category + event metadata; no summary; optional source text |
| Q90 | A | plain text; media/link feature deferred |
| Q91 | A | exact own relationship + ACTIVE Hospital |
| Q92 | A | Patient consumption + publisher preview only |
| Q93 | A (schedule/expiry A) | immediate publish; no automatic expiry |
| Q94 | B | withdraw → edit current → republish |
| Q95 | A | archive; no physical-delete operation |
| Q96 | A (identity/timestamp/source A) | Hospital attribution, latest publish instant, source if present |
| Q97 | A | Hospital informational content |
| Q98 | A (category/ordering/search/pinning A) | category + newest-first; no search/pin |
| Q99 | B | Hospital-owned DEMI contact extension |
| Q100 | A (field set/completeness A) | optional organizational address/phone |
| Q101 | A | direct ACTIVE OWNER contact edit |
| Q102 | A | immediately effective; Hospital-provided |
| Q103 | A | own relationship contact + editor scope |
| Q104 | A | own contact; no inheritance |
| Q105 | A | hide absent fields; truthful fully empty state |
| Q106 | A | contact card first; future candidates only |
| Q107 | A (knowledge/contact A) | Personal knowledge destination + relationship contact context |
| Q108 | A | bounded Thai mobile UAT intent |
| Q109 | A | atomic minimized successful mutation audit |
| Q110 | A (publisher/admin/patient A) | scoped event chronology; no full versions |
| Q111 | A | contact → publishing → content consumption |

## 12. Explicit deferred / excluded scope

สิ่งต่อไปนี้ **ไม่ได้รับ owner approval ในงานนี้** และต้องมี explicit contract หาก owner ต้องการภายหลัง:

- generic enterprise CMS/workflow engine/taxonomy framework; WYSIWYG dependency; arbitrary HTML; media library/uploads/images/PDF/embedded media/external-link feature เว้น Q90 อนุมัติชนิดที่ชัด
- comments, likes, reactions, social sharing, recommendation/personalization engine, PAM audience targeting, AI health advice, nutrition/clinical interpretation
- Hospital hierarchy authorization inheritance, default parent content/contact fallback, global ownership/public anonymous content/contact access
- notification delivery, LINE/email/push, 17J delivery/system authority; contact synchronization jobs; new external Master provider binding
- generic tagging platform/search engine infrastructure, maps/geolocation/map provider integration/latitude-longitude, structured address/geography expansion ที่ยังไม่มี contract
- content translation workflow, reporting/dashboard integration, Family delegated access, Wellness sharing, new top-level roles, Doctor/Nurse authorization roles
- schedule/expiry/full versions/physical deletion/staff-OSM feed/contact review เป็น proposed deferrals ตาม recommendations; ถ้าตอบตัวเลือกที่เพิ่ม scope ต้องปิดรายละเอียดและ revise first-slice contract ก่อน runtime

ไม่เลื่อน accepted security/accessibility/transaction invariants และไม่อ้างว่าการ defer เป็น permission ให้ implement ภายหลัง

## 13. Risks if implementation begins before decisions

| Risk | ผลที่อาจเกิด | Required closure |
| --- | --- | --- |
| mixed tenant/global ownership | cross-Hospital publish/read หรือ authority จาก parent FK | Q84–Q86/Q91–Q92 |
| publication/approval ambiguity | Patient เห็น draft หรือ correction ที่ยังไม่อนุมัติ | Q86–Q87/Q93–Q95 |
| medical-source ambiguity | informational article ดูเหมือน DEMI clinical truth/AI advice | Q96–Q97 |
| invented master contact | duplicate/fake phone/address หรือ identity seed overwrite operational data | Q99–Q102 |
| unapproved disclosure/fallback | staff personal contact/public access/parent contact ที่ไม่มี scope | Q100/Q103–Q105 |
| timezone confusion | scheduled/expiry boundary ต่างจากวันที่ owner คิด | Q93 explicit civil/instant rules |
| audit mistaken for versions | เก็บ article/contact bodies ซ้ำหรือสัญญา history ที่ไม่มี | Q94–Q95/Q109–Q110 |
| premature migration/media/navigation | schema churn, storage surface, fake UAT-ready destination | Q89–Q90/Q107–Q108/Q111 + technical contracts |

ไม่พบ direct contradiction ที่ต้อง reopen accepted Phase 17 decisions พบ **historical wording imprecision** ใน backlog CONTENT-02 “name/code/status only”: scalar inventory มี parentHospitalId/timestamps ด้วย current addendum ชี้ E05 โดยไม่ rewrite historical row; PRODUCT/17A บางข้อความ “ยังไม่มี SELF” เป็นก่อน implementation ปัจจุบัน E09 supersedes implementation inventory เท่านั้น

ข้อไม่แน่นอนจริง: external Master provider/production update ownership ยัง unresolved; legacy DB/contact values และ medical governance ไม่ได้พิสูจน์; taxonomy examples ยังไม่ fixed choices; actual Patient relationship ไม่มี lifecycle status จึงห้ามเขียนว่า current ACTIVE relationship โดยเดา สิ่งเหล่านี้อยู่ใน options/gates ไม่ถูกปิดด้วย recommendation

## 14. Proposed post-closeout Phase 17I sequence

**RECOMMENDATION — NOT OWNER APPROVED: Q111 A** ขึ้นกับคำตอบที่สอดคล้องกันทั้ง pack

1. 17I.0B owner decision closeout: บันทึก explicit answers Q84–Q111/แกนย่อย, reconcile conflicting combinations, name source/data/governance owner และปิด technical contract สำหรับ slice แรก; pack complete ไม่เท่ากับ step นี้ complete
2. 17I.1 Hospital Contact: source/field/editor/trust/disclosure/missing/hierarchy contract; ประเมิน persistence/migration + existing Master seed preservation; minimal authorized contact manage/read สำหรับ UAT ไม่มี CMS fields/source sync
3. 17I.2 Content Publishing: separate owning-Hospital content contract, author/publish/withdraw/archive/source/audit rules และ persisted invariants; scope นี้ต้องจบก่อนเปิด Patient feed ไม่มี global/version/media framework ถ้าไม่อนุมัติ
4. 17I.3 Patient Content Consumption: use approved audience + actual publication state/time + bounded discovery/minimal attribution + Personal navigation/mobile acceptance; reuse canonical Hospital identity/contact boundaries โดยไม่ duplicate values หรือ require contact completeness
5. หลัง runtimes ที่อนุมัติแล้ว: bounded automated re-audit/UAT readiness; manual browser/mobile/device evidence ติดตามแยก ไม่ถือว่าเอกสาร pack หรือ prior 17H PASS พิสูจน์ 17I runtime

ไม่มี schema/migration design หรือ authorization capability vocabulary ใหม่ที่อนุมัติในขั้นนี้ ไม่ต้องรอ manual 17H UAT เพื่อ close decisions ถ้า owner เลือก sequence/ownership/source ต่างจาก recommendation ให้ปรับแผนเอกสารก่อน clearance ไม่แอบเปลี่ยน scope

## 15. Owner response template

ตอบ option ทีละข้อ ไม่จำเป็นต้องรับทั้งหมด มี 28 global question IDs ต่อจาก Q83; ทุกช่องยัง OPEN ด้านล่างไม่ได้ prefill approval

```text
Q84: <A/B/C/D>
Q85: <A/B/C/D>
Q86: <A/B/C/D>
Q87: <A/B/C>
Q88: <A/B/C/D>
Q89: <core A/B; summary A/B; references A/B>
Q90: <A/B/C + ชนิด/รายละเอียดเมื่อเลือก B/C>
Q91: <A/B/C/D/E>
Q92: <A/B/C>
Q93: <schedule A/B/C; expiry A/B/C>
Q94: <A/B/C>
Q95: <A/B/C>
Q96: <identity A/B/C; timestamp A/B; source A/B>
Q97: <A/B/C>
Q98: <category A/B; ordering A/B; search A/B; pinning A/B>
Q99: <A/B/C/D>
Q100: <field set A/B/C/D; completeness A/B>
Q101: <A/B/C/D>
Q102: <A/B/C>
Q103: <A/B/C/D>
Q104: <A/B/C>
Q105: <A/B/C>
Q106: <A/B/C>
Q107: <knowledge A/B; contact A/B>
Q108: <A/B>
Q109: <A/B>
Q110: <publisher A/B; admin A/B; patient A/B>
Q111: <A/B/C>
Data/source/governance owner และ additional constraints: <ระบุ>
Deferred/excluded changes ที่ต้องการ: <ระบุ scope ชัด>
```

ตัวอย่างรูปแบบคำตอบ: `Q84 A`, `Q99 B`, `Q94 B`; ข้อย่อยตอบ `Q93.schedule A; Q93.expiry C` ได้อิสระ ถ้าตอบ `Q93 A` หมายถึง schedule A และ expiry A ตามที่แสดง ไม่ใช่อนุมัติอย่างอื่น ตัวเลือกเพิ่ม scope ที่ยังขาดรายละเอียดคง pending จนปิดครบ การไม่ตอบไม่ใช่ approval

## 16. Documentation validation / handoff boundary

Required checks สำหรับ documentation-only diff: inspect final diff รวมไฟล์ใหม่, `git diff --check`, local Markdown path/anchor validation และ pinned legacy link targets เทียบ checkout, strict UTF-8/no replacement characters/Thai preservation, verify unique heading IDs Q84–Q111 และ recommendation marker ทุกข้อ, status consistency กับ CONTEXT/17A/backlog และ documentation-only file list

ไม่รัน unit suite, PostgreSQL integration, Prisma migrate/generate/validate, lint/typecheck/build หรือ dev server เพราะไม่มี runtime/schema/config เปลี่ยน Prior 17H.4A PASS เป็น historical accepted automated evidence ไม่ใช่ checks ที่รันซ้ำในงานนี้ ผลการตรวจเอกสารจริงรายงานใน final handoff ไม่อ้าง owner approval หรือ implementation/UAT PASS

**Final disposition: Phase 17I.0 — DECISION PACK COMPLETE / OWNER DECISIONS OPEN; CONTENT-01 — REQUIREMENT-GATED; CONTENT-02 — REQUIREMENT-GATED; Phase 17I runtime — NOT CLEARED FOR IMPLEMENTATION.**
