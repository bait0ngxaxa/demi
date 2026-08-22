# DEMI Phase 15E.3 — Demo Closeout / Full Journey Re-audit & Release Readiness

สถานะเอกสาร: **Closeout complete**
วันที่ตรวจ: **2026-08-22 (Asia/Bangkok)**
ขอบเขต: **Requirement-gathering demo เท่านั้น ไม่ใช่ Production Ready**

เอกสารนี้เป็นบันทึกปิด DEMI demo ที่ authoritative สำหรับ Phase 15E.3 โดยยึด
runtime ปัจจุบันและผล verification จริงเป็นหลัก ไม่ได้แก้ไขหรือ rewrite เอกสาร
ประวัติศาสตร์ของ phase ก่อนหน้า

## 1. Scope

การตรวจครั้งนี้ครอบคลุมเส้นทางตั้งแต่ authentication/application entry ไปจนถึง
Program factual report รวมทั้ง Hospital/workforce, patient provisioning และ
activation, patient relationship, OSM assignment, Screening, Baseline, Program
lifecycle, Service 1, Goal Plan, Follow-up, Final Assessment, Appointment และ
evidence ที่ยังเป็น business flow ในระบบปัจจุบัน

ตรวจทั้ง:

- server-side authorization และ exact Hospital/relationship/Program ownership;
- persistence, read-after-write, immutable/history behavior, cardinality,
  pagination, null handling และ date/time behavior;
- loading, success, validation error, conflict error และ empty state;
- primary navigation, wording และ mobile-oriented responsive implementation;
- Phase 15E.1/15E.2 Program factual report และ Program A/B isolation;
- current tests, integration tests, typecheck, lint, build และ static UI checks.

สิ่งที่อยู่นอกขอบเขตการทำ implementation ใน phase นี้ ได้แก่ Hospital dashboard,
cohort analytics, export, THAID/IAM ใหม่, clinical calculations, official
Before/During/After semantics, report persistence และ generic measurement or
analytics architecture

## 2. Starting branch / HEAD

| รายการ | ผลตรวจ |
| --- | --- |
| Branch | `main` |
| Expected starting HEAD | `5e8c02c5c83116155f1a5fe2020479bb10155e87` |
| Observed starting HEAD | `5e8c02c5c83116155f1a5fe2020479bb10155e87` |
| Starting commit | `feat(phase-15e2): integrate program factual report UI` |
| Starting worktree | สะอาด ไม่มี user change ที่ต้อง preserve |
| Newer commits | ไม่มี จึงไม่ต้อง adapt จาก commit หลัง baseline |
| Schema/migration policy | ไม่มีการแก้ `prisma/schema.prisma` หรือ `prisma/migrations/**` |
| Workbook | ตรวจแบบ read-only เท่านั้น ไม่ได้แก้ไข |

คำเตือนจาก Git เรื่อง global excludes ที่ `C:\Users\Bait0ng/.config/git/ignore`
ถูก permission deny เป็น environment warning นอก repository และไม่เปลี่ยนผล
`git status`

หลังแก้ไขมีเฉพาะ runtime wording fix ของ Screening และ closeout record นี้ใน
scope ของงาน ไม่มี diff ที่ไม่เกี่ยวข้อง

## 3. Closeout methodology

1. ตรวจ branch, HEAD, worktree และ package scripts ก่อนอ่านหรือแก้โค้ด
2. อ่าน `docs/CONTEXT.md`, architecture baseline, ADR index และ Phase 15A–15E2
   ที่เกี่ยวข้อง โดยให้ current implementation override stale historical gap
   statements
3. inventory routes, modules, server actions, access services, query services,
   UI states และ integration/unit tests
4. trace critical paths จาก route → current ActorContext → schema validation →
   policy/access service → transaction/query → read model/UI
5. ทำ scenario ตรวจ Program A/Program B ด้วยข้อมูลแยกกัน รวม Follow-up มากกว่า
   6 รอบ และ report pagination
6. ตรวจ wording/private metadata/clinical overclaim แบบ semantic ไม่ใช่
   mechanical replacement
7. แก้เฉพาะ defect ที่ deterministic และไม่ต้องมี customer/clinical decision
8. รัน verification จริงหลังแก้ไข และตรวจ diff/encoding อีกครั้ง

การจำแนกผลใช้เพียงห้าประเภทตาม closeout rule:

| ประเภท | ความหมาย |
| --- | --- |
| A. DEMO BLOCKER | flow หลักใช้ต่อไม่ได้หรือมี security/data defect ที่ทำให้ demo ปิดไม่ได้ |
| B. DEMO DEFECT — FIX NOW | behavior ผิดชัดเจน แก้แคบได้โดยไม่สร้าง requirement ใหม่ |
| C. ACCEPTABLE DEMO LIMITATION | ข้อจำกัดที่ตั้งใจให้ demo มีและไม่อ้างเป็น production contract |
| D. REQUIREMENT-GATED / DEFERRED | ต้องรอ customer/product/clinical/security decision |
| E. PRODUCTION-HARDENING FOLLOW-UP | ต้องทำเมื่อเตรียม production แต่ไม่จำเป็นต่อ demo contract ปัจจุบัน |

## 4. Evidence hierarchy

น้ำหนักหลักฐานเรียงจากมากไปน้อยดังนี้:

1. runtime ปัจจุบัน, source schema/query/policy และผล test ที่รันจริง;
2. accepted contract/ADR และ Phase 15A–15E2 ที่ยังสอดคล้องกับ runtime;
3. architecture baseline และ current route/navigation inventory;
4. customer workbook `docs/Dashboard App Demi.xlsx` ที่อ่านแบบ read-only;
5. legacy `raviut-max/demi-plus-web-v2` ในฐานะ discovery/reference เท่านั้น;
6. engineering recommendations และ open questions ซึ่งไม่ใช่ accepted
   requirement.

Workbook ปัจจุบันมี sheet `Dashboard ภาพรวม` และ `รายงานการจัดบริการ` แต่เป็น
แบบฟอร์มที่มี formatting/labels บางส่วน ไม่มี formula และไม่มี sample dataset
ที่ยืนยัน semantics ได้ (ตรวจพบ non-empty cells 59/102 และ formulas 0/0 ตามลำดับ)
จึงไม่ใช้ workbook เป็นเหตุผลในการสร้าง dashboard, export หรือ clinical formula

## 5. Current demo architecture summary

- Next.js App Router ใช้ server-rendered protected pages และ server actions/
  route handlers เป็น transport boundary
- authentication ใช้ Supabase session แล้ว resolve current actor จาก database
  เป็น `ActorContext`; role, membership, Hospital status และ OSM assignment
  ถูกอ่านจาก authoritative state ฝั่ง server
- application/data flow ยังคงเป็น UI → transport/hooks → services/policies →
  Prisma data layer
- `PatientHospitalRelationship` เป็น tenant/Hospital boundary; `PatientProgram`
  เป็น episode ภายใต้ relationship เดิม ไม่ได้เป็น owner ใหม่ของ Patient
- Hospital care access ใช้ active direct `OWNER`/`MEMBER`; OSM ใช้ active exact
  `PatientOsmAssignment` และ active OSM–Hospital relationship; ADMIN-only และ
  PATIENT routine care/report ถูก deny
- Baseline เป็น relationship-owned record 0..1 และ Program เก็บเฉพาะ exact
  `initialBaselineId` ที่ถูกใช้เป็น initial context
- Program มี lifecycle `ACTIVE → COMPLETED`, active ได้ไม่เกินหนึ่งต่อ exact
  relationship, historical Program อ่านได้ และ completion ไม่แปลว่า clinical
  success
- Service 1, Goal Plan, Follow-up และ Final ใช้ exact Program + relationship
  scope ตาม contract; pre-Program Goal/Follow-up ยังคงแยก namespace เมื่อ flow
  นั้นตั้งใจรองรับ
- Program factual report เป็น read-only projection จาก source records เดิม ไม่
  เป็น second source of truth, ไม่คำนวณ clinical outcome และไม่แสดง HN/customer
  Patient ID หรือ private storage URL/key

## 6. Full business journey inventory

| Journey family | Current entry | Current disposition | Evidence |
| --- | --- | --- | --- |
| Authentication / application entry | `/login`, `/app` | **PASS**; unauthenticated, unmapped, inactive และ revoked access fail closed | actor-context tests, auth integration, runtime route guard |
| Hospital onboarding / governance | `/hospital/onboarding`, `/app/admin/hospital-onboarding`, `/app/admin/hospitals` | **PASS** สำหรับ current onboarding/governance contract; ไม่เพิ่ม hierarchy | onboarding/governance integration |
| Workforce provisioning / activation | `/app/workforce`, `/activate/workforce` | **PASS**; OWNER/MEMBER และ activation states แยกชัด | workforce integration |
| Patient provisioning / activation | `/app/patients/provision`, `/app/patients/activation`, `/activate/patient` | **PASS**; duplicate/conflict และ exact Hospital relationship ตรวจแล้ว | provisioning/activation integration |
| Directory / search | `/app/patients`, `/app/patients/assigned` | **PASS**; NAME และ operational HN search อยู่ใน current directory contract | directory integration |
| Patient detail hub | `/app/patients/[relationshipId]` | **PASS**; links ไป baseline, screening, program, goals, follow-up, appointment, evidence และ assignment ตามสิทธิ์ | patient detail transport/access tests |
| OSM assignment | `/app/patients/[relationshipId]/assignment` | **PASS**; assign/end/revocation มีผลจาก authoritative state | assignment integration |
| Screening | relationship screening routes | **PASS หลัง B-15E3-01**; scoring/question wording ยังคง provisional | screening integration + wording fix |
| Baseline | relationship baseline route | **PASS**; immutable 0..1, exact read และ no consumed-baseline fallback | baseline integration + schema |
| Program lifecycle | patient detail/program routes | **PASS**; open, complete, historical read, active-only mutation | program integration |
| Service 1 / evidence | Program detail, Service 1 workspace, protected evidence routes | **PASS**; four activities, exact Program, bounded artifact metadata และ protected content | patient-program/evidence integration |
| Goal Plan / Service 2 | relationship และ Program goal routes | **PASS**; pre-Program และ Program namespace แยก, multiple rounds, completed read-only | goals integration |
| Follow-up | relationship และ Program follow-up routes | **PASS**; 0..N, >6 rounds, exact source Goal Plan, nullable values | followups integration |
| Final Assessment | Program detail/final route | **PASS**; active-only create, exact Program 0..1, completed historical read | final assessment integration/unit tests |
| Appointment | relationship appointment routes | **PASS** สำหรับ legacy-derived flow ที่ current architecture รองรับ; ไม่ขยายเป็น report semantics | appointments integration |
| Program factual report | nested relationship + Program report route | **PASS**; narrow scope, factual-only, paginated และ no HN/private/clinical derived output | reporting integration + report unit/transport tests |
| Program A/B isolation | ทุก Program-scoped page และ report | **PASS**; A records ไม่ปรากฏใน B ยกเว้น relationship identity ที่ตั้งใจแชร์ | `program-reporting.integration.test.ts`, `patient-program.integration.test.ts` |
| Legacy-only dashboards/exports/clinical analytics | ไม่มี current accepted route | **D/C**; ไม่ใช่ missing demo flow ภายใต้ accepted Phase 15 contract | E0 register + workbook evidence |

## 7. Journey audit matrix

| FLOW | ACTOR | ENTRY ROUTE | PRECONDITIONS | MAIN ACTION | EXPECTED PERSISTENCE | READ-BACK | AUTH BOUNDARY | EMPTY/ERROR STATE | MOBILE STATUS | DEMO STATUS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication / entry | ทุก role ที่มี account | `/login` → `/app` | valid provider session, mapped active User | login/logout, open protected app | session/provider state; no client role authority | `/app` resolves current ActorContext again | inactive/unmapped/subject mismatch denied; logout redirects `/login` | safe credential/access/infrastructure messages; global error has retry | form controls use full-width/min-height 44–48 | **PASS** |
| Hospital onboarding | applicant, Platform ADMIN | `/hospital/onboarding`, admin review routes | public application or authorized review actor | submit, review, approve/reject | onboarding application and audit transaction | status/result and continuation links | admin governance capability; no routine care bypass | validation, duplicate/conflict, pending and review states | responsive form/grid; no required desktop-only control | **PASS** |
| Workforce onboarding | Hospital OWNER/MEMBER as allowed, ADMIN governance | `/app/workforce`, `/activate/workforce` | active Hospital scope, valid activation token where applicable | provision staff/OSM, activate, suspend/restore | User, membership/OSM relationship, activation state | row/detail/activation handoff and QR/link state | exact Hospital and OWNER governance checks; stale membership reloaded | pending disabled, conflict/error Alert, empty staff/OSM lists | stackable forms and long activation URL wraps | **PASS** |
| Patient provisioning | authorized Hospital/OSM provisioning actor | `/app/patients/provision` | selected authorized Hospital; valid person input | create one or preview/confirm Excel import | Person/User/PatientProfile/relationship in transaction; no operator password | success result links to exact relationship/directory/activation | client Hospital ID is lookup only; server derives authorized Hospital | duplicate, invalid row, conflict and partial import summary are explicit | import tables use `overflow-x-auto`; single form stacks | **PASS** |
| Patient activation | Hospital activation scope | `/app/patients/activation`, `/activate/patient` | provisioned patient and valid token/handoff | search NAME/National ID/HN, issue/reissue/use token | activation issue/use and User status | candidate/result state and login handoff | selected Hospital must be authorized; token is server-validated | no-match, too-many, expired/reconciliation and pending states | search grid collapses; touch controls visible | **PASS** |
| Patient directory | direct Hospital or exact assigned OSM | `/app/patients`, `/app/patients/assigned` | active Hospital/OSM relationship | search by NAME or operational HN, page, open detail | read-only | stable list, count, page and exact detail route | direct Hospital scope or active exact OSM assignment; cross-Hospital denied | empty result explains search and clear action; invalid lookup safe | bounded rows, wrapped names, min-height controls | **PASS** |
| Patient detail hub | Hospital OWNER/MEMBER or assigned OSM | `/app/patients/[relationshipId]` | exact relationship accessible | navigate to assignment, screening, Baseline, Program, goals, follow-up, appointments, evidence | no hub write itself | relationship identity/Hospital/operational HN and current states | relationship ID cannot manufacture Hospital authority | not-found/denied uses neutral safe page with return directory link | grid stacks and actions wrap | **PASS** |
| OSM assignment | Hospital owner/authorized assignment manager; OSM read path | `/app/patients/[relationshipId]/assignment` | exact Hospital relationship; selected active OSM | assign or end assignment | assignment row with ended state/audit | assigned OSM shown on detail; revocation reflected in access | only exact Hospital manager can mutate; OSM not self-authorized | pending, conflict, no staff and ended/unassigned messages | assignment form uses stacked layout | **PASS** |
| Screening | Hospital OWNER/MEMBER or exact assigned OSM | `/app/patients/[relationshipId]/screenings`, `/new`, detail | exact relationship and screening capability | answer source-defined PAM/PROMs/Confidence and submit | serializable ScreeningAssessment + audit; nonce retry semantics | redirect to persisted detail/history | exact relationship; ADMIN-only/PATIENT/wrong Hospital denied | incomplete validation, duplicate nonce conflict, safe server error, empty history | radio cards, counters and full-width submit fit phone | **PASS + B fixed; C provisional** |
| Baseline | Hospital care actor or assigned OSM per policy | `/app/patients/[relationshipId]/baseline` | exact relationship; no existing Baseline for create | record raw values and `recordedOn` | one relationship-owned immutable Baseline; optional current ACTIVE Program link in same transaction | read-only Baseline and exact Program link | exact relationship ownership; server recorder/time | no data neutral view, duplicate conflict, validation error | measurement grid/form stacks; nulls remain blank/neutral | **PASS** |
| Program lifecycle | Hospital care actor or assigned OSM | patient detail Program card and `/programs/[programId]` | exact relationship; open only if no active Program | open, record, complete | Program + audit in serializable transaction; server timestamps | active/history cards and completed detail | direct Hospital or exact OSM; one active per relationship | pending, active conflict, completed read-only, stale transition conflict | actions wrap; detail sections stack | **PASS** |
| Service 1 | active Program manager; assigned OSM within exact Program | Program detail/Service 1 workspace | exact active Program for create | record Routine, Floating Chart, Dream Card, Confidence; optional evidence | one activity per Program plus protected artifact association | exact activity presence/provenance and evidence preview | Program + relationship exact; storage key never UI authority | missing activity, upload pending/error, association conflict, completed read-only | cards stack; upload pending and protected image/link fit | **PASS** |
| Goal Plan / Service 2 | Hospital care actor or assigned OSM | relationship goals and Program goals routes | pre-Program route or exact ACTIVE Program for create | create immutable round, select template, set days/value/unit/notes | Goal Plan + item snapshots + audit; Program ID nullable only for pre-Program | history/detail with stored template/targets; completed Program read-only | exact relationship/Program; source Screening optional and separately scoped | no history, invalid template/source, pending/conflict, completed read-only | item cards and form grids stack; long notes wrap | **PASS** |
| Follow-up | Hospital care actor or assigned OSM | relationship and Program follow-up routes | exact relationship; ACTIVE Program for Program create | create round, optional Goal Plan/appointment, progress/raw values/notes | Follow-up + progress + audit; round allocated transactionally | normalized history/detail, including >6 rounds | exact Program+relationship; source Goal Plan must match namespace | no history, null measurement neutral, conflict/validation, completed read-only | form sections stack; history uses cards not fixed six columns | **PASS** |
| Final Assessment | Hospital care actor or assigned OSM | Program detail Final workspace | exact ACTIVE Program and manage capability | record at least one raw measurement | immutable one-per-Program Final + audit; recorder/time server-derived | saved read-only state and missing neutral state | exact Program+relationship; completed create fails closed | active/no-final, active/final, completed/no-final, completed/final all explicit | five raw fields stack; pending/error visible | **PASS** |
| Appointment / evidence | authorized relationship actor | relationship appointment/evidence routes | exact relationship and relevant mutation capability | create/update appointment; upload/view protected evidence | relationship-owned records, protected object storage flow | history/detail/read-back; private content via authorized short-lived route | exact relationship and role policy; artifact route rechecks access | no appointments/evidence, upload conflict/error, pending and missing states | appointment forms stack; evidence image lazy and bounded | **PASS** |
| Program factual report | active direct Hospital OWNER/MEMBER or exact assigned OSM | `/app/patients/[relationshipId]/programs/[programId]/report` | both UUIDs valid; exact nested Program access | open/read and paginate Goal Plans/Follow-ups | no report persistence; projection reads source records | lifecycle, linked Baseline, Service 1 facts, normalized pages, Final facts | capability `report:program:read`; ADMIN-only/PATIENT/wrong scope denied | skeleton, neutral missing facts, invalid cursor/not-found, safe forbidden | cards/grid, no wide table, next links min-height 44 | **PASS** |

### Final Assessment four-state check

| Program state | Final state | Current UI/read behavior | Result |
| --- | --- | --- | --- |
| `ACTIVE` | no Final | shows neutral missing state plus active-only create form for authorized manager | **PASS** |
| `ACTIVE` | Final exists | shows factual read-only Final and no second create path | **PASS** |
| `COMPLETED` | no Final | shows neutral historical missing state; create is disabled/denied | **PASS** |
| `COMPLETED` | Final exists | shows factual historical read-only Final; completion remains independent of Final | **PASS** |

## 8. Role / access matrix

| Actor state | Hospital/workforce | Patient operational scope | Program/clinical demo scope | Program factual report |
| --- | --- | --- | --- | --- |
| `HOSPITAL` OWNER, active direct membership, active Hospital | Hospital governance/workforce and OWNER mutations where policy allows | direct Hospital directory/provisioning/activation; exact relationships in that Hospital | read/mutate accepted current flows for exact relationship; active-only mutations | allowed for exact nested Program |
| `HOSPITAL` MEMBER, active direct membership, active Hospital | read and policy-approved workforce/patient operations | direct Hospital scope | read/mutate accepted current flows where capability allows; no OWNER-only governance | allowed for exact nested Program |
| `OSM`, active account + active OSM–Hospital relationship + active assignment | assigned-patient operational path; no broad Hospital directory | exact assigned patients only | read/mutate accepted current flows for exact assigned relationship/Program | allowed only for exact assigned Program |
| `ADMIN` only | platform governance/onboarding/recovery routes | no routine patient care scope | denied | denied |
| `PATIENT` | no Hospital operator scope | self-service expansion is deferred | denied in current demo contract | denied |
| multi-role `ADMIN` + valid `HOSPITAL`/`OSM` scope | evaluated through the valid care scope, not ADMIN alone | exact valid scope only | valid scoped path remains allowed by accepted policy | same exact scoped path; no platform-wide bypass |
| unauthenticated, unmapped, inactive/revoked user, suspended membership, inactive Hospital, ended OSM assignment | denied or redirected safely | denied | denied | denied |

The server re-reads current actor/membership/assignment state for critical
resource access. Browser role labels, URL Hospital IDs, relationship IDs and
Program IDs are not authority evidence.

## 9. Program A / Program B isolation audit

Deterministic scenario used by the reporting integration coverage:

```text
Relationship R
  Program A: own Baseline link, Routine, two Goal Plans, seven Follow-ups,
             Final Assessment, COMPLETED
  Program B: no consumed Baseline link, own Dream Card, own Goal Plan,
             own Follow-up, own Final Assessment, ACTIVE/independent state
```

| Surface | Expected | Observed evidence |
| --- | --- | --- |
| Program detail | A and B show only their own status, Baseline link and Service 1 records | exact Program+relationship queries and integration assertions pass |
| Service 1 | A Routine/evidence is absent from B; B own activity remains readable | `patient-program` query/service tests and integration pass |
| Goal Plan | A two rounds do not appear in B; pre-Program rows are excluded from Program report | Program `where` includes exact Program+relationship; integration pass |
| Follow-up | all seven A rounds are available through normalized pages; B sees only B rounds | report and follow-up integration pass, including >6 rounds |
| Final Assessment | A Final never appears in B and vice versa | unique Program FK + exact query/access test pass |
| Factual report | A report contains A facts only; B report contains B facts only, with neutral missing states | `program-reporting.integration.test.ts` passes cross-surface assertions |

Relationship-level Patient/Hospital identity is intentionally shared between A
and B and is not considered Program leakage. No latest relationship-wide Goal
Plan, Follow-up or Final fallback is used by Program-scoped read paths.

## 10. Data correctness / silent bug audit

ผลตรวจไม่พบ deterministic silent data bug ใน accepted demo paths:

- Program open/complete, Baseline create, Screening submit, Goal Plan create,
  Follow-up create, Final create, Service 1 persistence และ evidence association
  use transactional persistence or the accepted atomic flow and return only
  after the write/read contract succeeds
- active Program cardinality, Baseline 0..1, Final 0..1 และ Program-scoped
  Goal/Follow-up ownership have database/application constraints in addition to
  UI checks
- Program open checks whether the relationship Baseline has already been used;
  a new Program does not silently inherit a consumed Baseline
- Baseline created after an active Program links only the current active Program
  with no initial context, and never retroactively changes completed history
- Program A/B and wrong relationship/Program accesses use exact nested filters;
  mismatch fails closed as not found/forbidden rather than returning another
  record
- Goal Plan and Follow-up source links are namespace-checked; pre-Program rows
  are not substituted into Program report/read paths
- nullable raw measurements and absent Baseline/Final/Service 1 facts remain
  neutral; null is not coerced to zero or a clinical interpretation
- report Goal Plan/Follow-up pagination is bounded and ordered by
  `(roundNumber, id)` with exact Program/relationship `where` clauses; opaque
  unsigned cursors are accepted as a demo limitation because server scope is
  re-enforced
- Baseline uses date-only storage; server derives mutation recorder/timestamps,
  while UI formats dates for `Asia/Bangkok` where the flow requires it
- client-supplied Hospital, actor, recorder, status, timestamps and clinical
  derived values are not accepted as authority

No schema change was necessary or introduced.

## 11. UX / UI closeout audit

การตรวจ application-wide พบว่า current UI already has reusable `PageHeader`,
`Panel`, `Alert`, `StatusBadge`, `Button`, skeleton และ mobile navigation
primitives. ไม่ได้สร้าง design system ใหม่

จุดที่ตรวจแล้วและผล:

- route title/breadcrumb/action links มีทางกลับจาก Patient → Program → report
  และ history/detail surfaces; denied relationship uses a safe not-found page
  with return link
- primary actions are visible, pending buttons are disabled where the existing
  action model supports it, and success/error feedback is placed near the action
- empty directories/histories distinguish “ไม่มีข้อมูล” from “อ่านไม่ได้” and
  provide a next action where the actor can continue
- internal UUIDs, storage object keys, signed URLs, stack traces และ SQL/path
  details are not shown in customer-facing UI; operational HN remains only in
  directory/relationship workflows where that is the current operational
  contract
- report uses cards/grids rather than a wide dashboard table and renders only
  factual values/neutral missing states
- Screening wording was the only deterministic UX/semantic defect found; it is
  fixed in B-15E3-01 below
- Impeccable static detector run for the changed Screening surfaces returned
  `[]` with no detector finding

## 12. Loading / success / error / empty-state audit

| High-value action/read | Loading/pending | Success/read-back | Error/conflict | Result |
| --- | --- | --- | --- | --- |
| Login/logout | `useActionState`, disabled submit and visible pending text | redirect only after auth result; protected shell re-resolves actor | sanitized invalid credential/access/infrastructure message | **PASS** |
| Patient provision/import | pending button, preview/import transition and stale-preview invalidation | persisted result links to detail/directory/activation; import summary per row | validation, duplicate, conflict and failed-row messages | **PASS** |
| Patient activation/search | pending search and visible `กำลังค้นหา...` | candidate list/status/handoff | no-match, too-many, expired/reconciliation and safe errors | **PASS** |
| Workforce/OSM mutation | disabled controls and action-local pending state | success Alert plus continuation/detail | conflict and authorization messages | **PASS** |
| Screening submit | disabled question groups/submit and `กำลังตรวจสอบและบันทึก...` | redirect to persisted detail | incomplete, nonce conflict and server-safe error | **PASS** |
| Baseline/Program/Goal/Follow-up/Final mutation | `useActionState`/loading controls and disabled forms | refresh/read-back from source query | validation/conflict/closed-program errors | **PASS** |
| Service 1 evidence upload | local pending, disabled file action and upload message | image/metadata read-back after protected route | upload/association error and retry guidance | **PASS** |
| Directory/history/report reads | route `loading.tsx` skeletons and global protected shell skeleton | independent sections render from their own source | safe not-found/forbidden/global retry boundary | **PASS** |
| Missing one report source | not applicable after read completes | neutral `ไม่มีข้อมูล`/source-specific missing reason | does not mark whole Patient/Program broken | **PASS** |

## 13. Mobile / responsive audit

ไม่มี authenticated browser connector/session ใน environment นี้ จึง **ไม่ได้อ้าง
ว่าได้ทำ manual screenshot/browser verification** ที่ 390px หรือ desktop จริง

หลักฐาน static/component-level ที่ตรวจแทน:

- mobile navigation มี focus containment, Escape close, desktop transition,
  body-scroll restore และมี unit tests ของ lifecycle
- primary controls ใช้ `min-h-10`/`min-h-11`/`min-h-12` และ forms stack ด้วย
  responsive grid classes
- Patient directory, report, Goal Plan, Follow-up และ history ใช้ wrapped cards
  แทนการบังคับ table กว้าง; ตาราง import มี `overflow-x-auto`
- report measurement/metadata cards ใช้ `sm:grid-cols-*`, `break-words` และ
  pagination link ที่แตะได้บนมือถือ
- evidence image เป็น lazy/protected content และ Service 1 upload state ไม่ซ่อน
  ขณะ pending
- ไทยข้อความยาวใน report, notes, activation URL และ Patient name มี wrapping
  classes หรือ bounded overflow ตามบริบท

ข้อจำกัดการไม่มี manual browser เป็น **C. ACCEPTABLE DEMO LIMITATION (closeout
evidence limitation)** ไม่ใช่หลักฐานของ runtime blocker; ควรทำ manual authenticated
walkthrough ก่อน production handoff

## 14. Program factual reporting audit

| Contract check | Result |
| --- | --- |
| Entry point from Program detail | มี link ไป nested report route สำหรับ ACTIVE และ COMPLETED |
| Route boundary | รับ exact `relationshipId` + `programId`; invalid/mismatch เป็น not-found |
| Access capability | server-side `report:program:read`; active direct Hospital OWNER/MEMBER และ exact assigned OSM เท่านั้น |
| Denied actors/scopes | ADMIN-only, PATIENT, unrelated Hospital, unassigned/ended OSM, suspended membership, inactive Hospital denied |
| Patient identity | แสดง display name/Hospital name ตาม safe projection; ไม่มี customer-facing HN/Patient ID |
| Lifecycle wording | แสดง `กำลังดำเนินการ`/`เสร็จสิ้นแล้ว`; ไม่ใช้ completion เป็น clinical success |
| Baseline | exact `initialBaselineId` + exact relationship; ไม่มี latest Baseline fallback |
| Service 1 | Routine/Floating Chart/Dream Card/Confidence เป็น factual presence/provenance; evidence แสดง bounded media metadata เท่านั้น |
| Goal Plan | exact Program+relationship, normalized source facts, bounded cursor pagination, stored targets/units/notes, no achievement |
| Follow-up | exact Program+relationship, normalized 0..N history, >6 rounds and pagination, raw nullable measurements/progress/notes |
| Final | exact Program+relationship 0..1, neutral missing state, factual fields only |
| Prohibited report output | ไม่มี HN, `storageObjectKey`, signed/private URL, Before/After comparison, BMI/HbA1c/Height/CVD, achievement/success/failure calculation |
| Cursor | opaque unsigned base64 is retained for demo; exact server-side scope remains enforced and signed cursor is E follow-up |
| Read model | no report persistence/materialized view/second source of truth |

## 15. Security / authorization sanity re-audit

| Boundary | Evidence/result |
| --- | --- |
| Cross-Hospital patient/Program/report | exact authorized Hospital predicates and integration denial pass |
| Wrong relationship with valid Program ID | nested relationship predicate and not-found behavior pass |
| Wrong Program under valid relationship | Program+relationship filters and report access mismatch pass |
| Unassigned OSM | exact assignment required; integration denies |
| Revoked/ended OSM assignment | authoritative assignment reload denies after end; integration pass |
| Suspended OSM-Hospital relationship | policy/unit/integration denial pass |
| Suspended Hospital membership | direct scope denial pass |
| Inactive Hospital | target Hospital status checked; denial pass |
| ADMIN-only/PATIENT report or care access | deny under narrow current contract; multi-role only works through valid care scope |
| Client-supplied Hospital ID | treated as lookup/input; server resolves Hospital/relationship authority |
| Client-supplied actor/recorder/role/status/timestamp | ignored or rejected; server derives authoritative values |
| Nested private evidence content | relationship access checked before short-lived storage redirect |
| Error disclosure | client receives safe messages; no stack trace, SQL error, internal path or storage key |

## 16. Fixes applied during closeout

### B-15E3-01 — Missing Screening prototype disclaimer — FIXED

**Finding:** accepted Phase 7B.0 contract says the Screening UI must make clear
that temporary wording and scoring are for requirement validation, but current
history/new/detail surfaces showed `L1–L4`, Zone and calculated results without
that notice.

**User impact:** a customer could reasonably read provisional Screening output as
an approved clinical or DM/Pre-DM contract.

**Fix:** added one authoritative title/body constant and displayed the existing
accepted Thai notice on Screening history, new form and detail result pages.
The notice is:

> ต้นแบบเพื่อเก็บ Requirement
>
> ข้อคำถามและเกณฑ์การประเมินในหน้านี้เป็นต้นแบบอ้างอิงรูปแบบจากระบบ DEMI เดิม และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย

Files changed for this fix:

- `app/app/patients/[relationshipId]/screenings/[screeningId]/page.tsx`
- `app/app/patients/[relationshipId]/screenings/new/screening-form.tsx`
- `app/app/patients/[relationshipId]/screenings/screening-history-view.tsx`
- `src/modules/screening/presentation/screening-labels.ts`

The patch does not change question definitions, scoring, persistence, access
policy, schema, migration or business logic. It also corrects one indentation
line in the detail view within the same bounded diff.

## 17. Findings intentionally not fixed

| Finding ID | Classification | Current behavior | Why not fixed in 15E.3 |
| --- | --- | --- | --- |
| C-15E3-01 | **C. ACCEPTABLE DEMO LIMITATION** | Screening questions/scoring and Goal templates are source-defined provisional prototypes | already disclosed by accepted Phase contracts; changing them would invent customer/clinical semantics |
| C-15E3-02 | **C. ACCEPTABLE DEMO LIMITATION** | No authenticated manual browser/screenshot run was possible in this environment | evidence limitation only; static responsive audit and tests are available |
| D-15E3-01 | **D. REQUIREMENT-GATED / DEFERRED** | no Hospital-wide dashboard/cohort analytics/export | explicitly outside accepted demo contract; workbook does not establish enough semantics |
| D-15E3-02 | **D. REQUIREMENT-GATED / DEFERRED** | report excludes customer-facing HN/Patient ID and clinical derived fields | customer/clinical decision is unresolved; operational HN remains in directory only |
| D-15E3-03 | **D. REQUIREMENT-GATED / DEFERRED** | no official DM/Pre-DM, Before/During/After, outcome, achievement or >70% semantics | no accepted authority/formula/source exists |
| D-15E3-04 | **D. REQUIREMENT-GATED / DEFERRED** | report does not include Screening/Appointment or broader caregiver/cohort projections | projection scope requires product/clinical/security decision |
| E-15E3-01 | **E. PRODUCTION-HARDENING FOLLOW-UP** | report cursors remain opaque unsigned base64 | explicitly accepted for demo because exact server-side scope is enforced; signed/bound cursor is a production concern |
| E-15E3-02 | **E. PRODUCTION-HARDENING FOLLOW-UP** | no claim of production rate-limit, monitoring, backup, incident or operational SLO readiness | demo closeout is not a production hardening phase |

There are no remaining A-class Demo Blockers and no remaining B-class Demo
Defects after B-15E3-01.

## 18. Requirement-gated / deferred register

All rows below have `BLOCKS DEMO? = NO`. `BLOCKS PRODUCTION?` means the item must
be resolved before relying on that capability as a production contract, not that
it must be implemented immediately.

### 18.1 Customer / product requirement needed

| ID | TOPIC | CURRENT DEMO BEHAVIOR | WHY DEFERRED | DECISION NEEDED | OWNER / DECISION SOURCE | BLOCKS DEMO? | BLOCKS PRODUCTION? | SUGGESTED FUTURE PHASE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-01 | broader report actor/scope | exact direct Hospital or assigned OSM Program report only | broader multi-Program/cohort/admin/patient scope is not accepted | define actors, tenant scope, filters and PII boundary | Product/customer + Security | NO | YES | reporting requirements workshop |
| RPT-03 | customer-facing Patient ID / HN | operational HN works in directory/relationship screens; report omits it | customer-facing identity/display contract is unanswered | decide whether HN or another display ID is shown and to whom | Product + Hospital operations | NO | YES | identity/report contract workshop |
| RPT-05 | caregiver/OSM projection | report permits exact assigned OSM only and does not show broader caregiver history | current vs historical/aggregate caregiver semantics are open | define projection and historical attribution | Product + Security | NO | YES | caregiver/reporting workshop |
| RPT-22 | final/missing-value presentation | factual UI shows neutral missing states | contract beyond current neutral factual presentation is not approved | define blank/unknown/not-applicable and final card shape | Product + Data | NO | YES | reporting UX contract |
| RPT-23 | workbook shape | report uses flexible cards and paginated lists, not fixed workbook positions | workbook layout is evidence, not an accepted output schema | decide compatibility with fixed rows/columns | Product + customer | NO | YES | workbook/report contract |
| RPT-24 | Excel export | no report download/export | exact columns, scope, format and PII behavior are unspecified | approve Excel requirement and output contract | Product + customer | NO | YES if required | export requirements slice |
| RPT-25 | PDF export | no PDF output | no accepted layout, privacy and pagination contract | decide whether PDF is required and for which actor | Product + customer | NO | MAYBE | export requirements slice |
| RPT-28 | cohort filters/aggregates | no cohort dashboard or aggregate counts | cohort dimensions and permitted aggregation are not defined | approve filters, grouping, tenant scope and minimum counts | Product + Clinical + Security | NO | YES | dashboard requirements workshop |
| RPT-30 | Appointment in report | Appointment remains a relationship flow and is not projected into Program report | report relevance and Program linkage are unanswered | decide whether/how appointment facts enter report | Product | NO | MAYBE | reporting projection extension |

### 18.2 Clinical owner decision needed

| ID | TOPIC | CURRENT DEMO BEHAVIOR | WHY DEFERRED | DECISION NEEDED | OWNER / DECISION SOURCE | BLOCKS DEMO? | BLOCKS PRODUCTION? | SUGGESTED FUTURE PHASE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-04 | illness duration | no field/source in report | source and definition are absent | define source, unit, timing and correction policy | Clinical owner + Product | NO | YES if used | clinical semantics workshop |
| RPT-06 | DM/Pre-DM authority | no official classification | no accepted clinical authority or threshold source | approve classification owner, rule/version and display scope | Clinical owner | NO | YES | clinical authority slice |
| RPT-07 | official Before | exact linked Baseline is factual only | baseline timing/window and official label are unresolved | approve Before source, timing, labels and units | Clinical owner + Product | NO | YES | clinical semantics slice |
| RPT-08 | official During | Follow-ups are factual rounds only | stage meaning and timing are unresolved | define During semantics and allowed sources | Clinical owner + Product | NO | YES | clinical semantics slice |
| RPT-09 | official After | Final is raw exact-Program data only | final timing and official After meaning are unresolved | approve After semantic and completion relationship | Clinical owner | NO | YES | clinical semantics slice |
| RPT-10 | HbA1c | no HbA1c persistence/report field | no accepted source or measurement contract | decide source, unit, timing and authority | Clinical owner + Data | NO | YES | measurement requirements |
| RPT-11 | Height | no Height field | no owner/source/usage contract | approve source, units and lifecycle | Clinical owner + Architecture | NO | YES if required | measurement requirements |
| RPT-12 | BMI | no BMI calculation | formula and required Height/Weight semantics are unapproved | approve calculation, version and missing-value behavior | Clinical owner + Data | NO | YES | derived clinical metrics |
| RPT-13 | CVD risk | no CVD calculation | algorithm, inputs, owner and version are absent | approve algorithm, source and display authority | Clinical owner | NO | YES | derived clinical metrics |
| RPT-14 | DTX context/unit | raw DTX is shown with provisional label only | fasting/random/context and unit are unresolved | approve context, unit and provenance | Clinical owner + Product | NO | YES | measurement semantics |
| RPT-15 | BP/waist/weight units | raw values use current prototype labels | customer/clinical unit contract is not approved | approve units, validation and display | Clinical owner | NO | YES | measurement semantics |
| RPT-16 | observation time / late entry | server recorded timestamps exist; no clinical observation-time model | adding observation semantics would be a new domain decision | decide observation vs entry time and late-entry rules | Clinical owner + Architecture | NO | YES if clinically used | measurement semantics |
| RPT-17 | achievement | no achievement percentage | no formula or denominator is accepted | define numerator, denominator, missing and time window | Clinical owner + Product | NO | YES | outcome/achievement workshop |
| RPT-18 | >70% count | no success-count calculation | threshold population and formula are unspecified | approve count definition and cohort scope | Clinical owner | NO | YES | dashboard requirements |
| RPT-19 | outcome vocabulary | no structured success/failure/outcome field | vocabulary and authority are not approved | define allowed terms and actor visibility | Clinical owner | NO | YES | outcome semantics |
| RPT-20 | plan adjustment | notes are factual only; no structured adjustment source | no accepted source or rule | define whether and how adjustments are recorded/reported | Clinical owner + Product | NO | YES if required | care-plan semantics |
| RPT-21 | obstacle reporting | raw notes/fields remain factual; no official obstacle metric | taxonomy and reporting use are unresolved | approve vocabulary, source and privacy rules | Clinical owner | NO | YES if required | care-plan semantics |
| RPT-29 | Screening/PAM/PROMs in report | Screening is not in Program factual report | clinical relevance, timing and authority are unresolved | decide whether source results are reportable and how labeled | Clinical owner | NO | YES if required | clinical reporting extension |

### 18.3 Security / governance decision needed

| ID | TOPIC | CURRENT DEMO BEHAVIOR | WHY DEFERRED | DECISION NEEDED | OWNER / DECISION SOURCE | BLOCKS DEMO? | BLOCKS PRODUCTION? | SUGGESTED FUTURE PHASE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-02 | export authorization | no export endpoint or download capability | actor/scope/PII/download/audit policy is absent | define export permissions, scope and abuse controls | Security + Product | NO | YES if export ships | export authorization slice |
| RPT-26 | report/export audit | mutation audit exists; no separate report/export audit workflow | governance retention and read/download audit needs decision | define events, retention, actor and review process | Security/Governance + Product | NO | YES | audit/governance hardening |

### 18.4 Production infrastructure / hardening

| ID | TOPIC | CURRENT DEMO BEHAVIOR | WHY DEFERRED | DECISION NEEDED | OWNER / DECISION SOURCE | BLOCKS DEMO? | BLOCKS PRODUCTION? | SUGGESTED FUTURE PHASE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-27 | projection version/reproducibility | source versions exist for Screening/Goal templates; report cursor is opaque unsigned base64 | production reproducibility and tamper-resistance policy is not needed for demo | define projection/version pinning, cursor binding/signing and replay expectations | Architecture + Security + Product | NO | YES | reporting hardening |
| HARD-01 | rate limiting / abuse controls | no dedicated production rate-limit evidence in this demo audit | production traffic and threat model are outside demo closeout | set per-route limits, retry/backoff and monitoring | Security + Infrastructure | NO | YES | production hardening |
| HARD-02 | observability / operations | safe client errors and audit events exist; production SLO/alert/runbook is not claimed | infrastructure readiness is not a demo requirement | define logs, metrics, alerting, backup, restore and incident runbooks | Infrastructure + Security | NO | YES | production readiness |
| HARD-03 | authenticated end-to-end browser evidence | static/component evidence only in this environment | browser connector/session was unavailable | establish repeatable 390px/desktop authenticated smoke run | QA/Product + Infrastructure | NO | NO, but required before production sign-off | QA/release hardening |

### 18.5 Nice-to-have UX

| ID | TOPIC | CURRENT DEMO BEHAVIOR | WHY DEFERRED | DECISION NEEDED | OWNER / DECISION SOURCE | BLOCKS DEMO? | BLOCKS PRODUCTION? | SUGGESTED FUTURE PHASE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | authenticated visual regression coverage | responsive behavior is statically inspected and component tests cover mobile navigation lifecycle | no browser session was available during closeout | choose screenshot/smoke coverage and supported breakpoints | Product + QA | NO | NO | UX/QA improvement |
| UX-02 | report pagination affordance | forward `next` links work; browser back returns to prior page; no explicit previous link | current demo journey is traversable and no product requirement asks for previous links | decide whether direct deep-page navigation needs explicit previous control | Product | NO | NO | bounded UX improvement |

## 19. Production-hardening follow-ups

These are not part of DEMI demo closure:

- establish rate limits, abuse protection, idempotency monitoring and operational
  alerting for every mutation route;
- define Supabase session revocation behavior, cache invalidation, secret
  rotation, database backup/restore, object-storage lifecycle and incident
  response;
- add authenticated browser smoke/E2E coverage at approximately 390px and
  desktop widths, including critical error/empty/read-only states;
- decide whether report cursors must be signed/bound and whether report reads or
  exports require audit events/retention controls;
- perform a production threat model and privacy review before broadening report
  actors, HN/customer IDs or exports;
- resolve clinical source/version/observation semantics before any derived
  calculation or official Before/During/After implementation;
- validate migration/connection pooling/performance behavior against real
  production-like data volumes; this demo closeout did not claim those results.

## 20. Verification commands / results

| Command | Result |
| --- | --- |
| `git status --short --branch` at start | **PASS** — `## main`, clean |
| `git branch --show-current` | **PASS** — `main` |
| `git rev-parse HEAD` | **PASS** — expected starting SHA |
| `npx tsc --noEmit` after fix | **PASS** |
| `npm run lint` after fix | **PASS** |
| `npm test` isolated rerun | **PASS** — 118 test files, 767 tests |
| `npm run test:integration` | **PASS** — 19 test files, 158 tests; 38.97s |
| `npx prisma validate` | **PASS** — schema valid; read-only check |
| `npm run build` | **PASS** — Next.js 16.3.0, TypeScript, static generation 17/17, all current app routes emitted |
| Impeccable detector on changed targets | **PASS** — JSON findings `[]` |
| `git diff --check` | **PASS** — no whitespace errors |

During one initial `Promise.all` run of typecheck/lint/unit/prisma, the unit
contract test `server-action-module-contract.test.ts` timed out at 5 seconds
while 766/767 tests had passed. The test passed in isolation and the subsequent
full `npm test` run passed 767/767, so this was recorded as environment/resource
contention rather than a product regression. No test was changed or skipped.

## 21. Manual demo walkthrough

Developer/Product Owner can execute this happy path with a seeded or provisioned
demo dataset. The script deliberately does not require unresolved clinical
calculations:

1. Login as a Hospital OWNER or MEMBER.
2. Locate/create/activate a Patient in the selected Hospital.
3. Open Patient detail and verify the exact Patient–Hospital relationship and
   operational HN context.
4. Assign an OSM from the Hospital assignment flow.
5. Record or review the relationship-scoped Screening; point out the prototype
   notice and that it is not the final clinical contract.
6. Record Baseline raw values or review an existing Baseline.
7. Open Program A.
8. Record Routine, Floating Chart, Dream Card and Confidence as needed.
9. Create a Program-scoped Goal Plan.
10. Create multiple Program-scoped Follow-ups, including enough rows to verify
    history remains 0..N rather than fixed six rounds.
11. Record a factual Final Assessment with any available raw values.
12. Complete Program A.
13. Re-open Program A historical state and verify its workspaces are read-only
    where required.
14. Open the Program factual report and walk through neutral missing states,
    factual Service 1, Goal Plan/Follow-up pages and Final; explicitly point out
    that HN, private artifact URL/key and clinical derived output are absent.
15. Open Program B for the same relationship.
16. Demonstrate that Program B does not inherit Program A Baseline, Service 1,
    Goal Plan, Follow-up or Final records.
17. Login as the assigned OSM and demonstrate exact assigned-patient access.
18. If practical, end/revoke the assignment or use an unassigned OSM and
    demonstrate the access boundary fails closed.

## 22. Release / demo checklist

- [x] clean branch/worktree verified before closeout; post-audit changes are only the intended Phase 15E.3 fix and record
- [x] typecheck
- [x] lint
- [x] unit tests
- [x] integration tests
- [x] build
- [x] auth sanity
- [x] Hospital flow
- [x] OSM flow
- [x] patient flow
- [x] Baseline
- [x] Program open/complete/history
- [x] Service 1
- [x] Goal Plan
- [x] Follow-up
- [x] Final Assessment
- [x] Program report
- [x] Program A/B isolation
- [x] loading/error/success states
- [x] mobile sanity by static/component evidence
- [x] HN report gate preserved
- [x] no private artifact URL/key leak
- [x] clinical blockers remain gated
- [x] deferred requirements documented
- [x] demo script documented
- [x] no Demo Blockers remain

The first checklist item means no unrelated worktree change was found and the
only post-audit changes are the files listed in Section 16 plus this document;
an optional commit may make the physical worktree clean for delivery.

## 23. Post-demo requirement workshop handoff

ไม่สร้าง Phase 16 implementation work อัตโนมัติจากเอกสารนี้ กลุ่มงานหลัง demo
ควรเริ่มด้วยการตัดสินใจและ workshop ตามลำดับต่อไปนี้:

### A. CUSTOMER REQUIREMENT WORKSHOP

- ยืนยัน report actor/scope, customer-facing Patient ID/HN, workbook shape,
  missing-value presentation, cohort filters และ Appointment/Screening report
  inclusion
- ยืนยันว่าต้องการ Hospital dashboard จริงหรือเพียง Program factual report

### B. CLINICAL SEMANTICS

- Clinical owner ยืนยัน DM/Pre-DM authority, measurement units/context,
  observation time, illness duration, official Before/During/After, outcome
  vocabulary และ correction/approval semantics
- ตัดสินใจ HbA1c, Height, BMI, CVD, achievement และ >70% ตาม source/version ที่
  ตรวจสอบได้ ห้าม derive จาก demo values ก่อน approval

### C. REPORTING / DASHBOARD

- ออกแบบ cohort/report projection หลัง scope/PII/clinical decisions เสร็จ
- กำหนด report version/reproducibility, missing states, caregiver projection,
  pagination/filtering และ retention

### D. EXPORT

- แยกตัดสินใจ Excel/PDF/CSV, columns/layout, download authorization, PII,
  watermark/retention และ audit trail ก่อนเพิ่ม endpoint ใด ๆ

### E. AUTH / THAID / IAM

- ยืนยัน production identity/THAID/IAM integration, revocation, MFA/session
  policy, role lifecycle และ governance scope; ไม่สร้าง IAM ใหม่ใน closeout

### F. PRODUCTION HARDENING

- rate limit, monitoring, audit/report access, signed cursor policy, backups,
  object storage controls, deployment/migration runbook, performance and
  incident response

### G. UX IMPROVEMENTS

- authenticated visual walkthrough, mobile screenshot/E2E coverage, report
  pagination affordance และ wording polish หลัง customer/clinical contract
  ยืนยันแล้ว

## 24. Final Demo Readiness decision

เหตุผลที่ปิด demo ได้:

- core intended journeys เข้าได้และต่อเนื่องตั้งแต่ login → Patient → Program →
  factual report;
- accepted business flows ที่ current architecture ตั้งใจรองรับถูก inventory และ
  มี disposition ครบ รวม Appointment/evidence ที่ยังเกี่ยวข้อง;
- data ownership เป็น exact Hospital/relationship/Program และ persistence/read-
  back checks ผ่าน;
- Hospital และ OSM authorization boundaries fail closed รวม cross-Hospital,
  wrong relationship/Program, revoked assignment, suspended membership และ
  inactive Hospital;
- Program A/B isolation ผ่านทั้ง detail/workspaces/final/report และ Follow-up
  มากกว่า 6 รอบถูกอ่านแบบ normalized/paginated;
- raw reporting foundation ทำงานตาม Phase 15E.1/15E.2 และไม่มี HN/private
  artifact URL/key/clinical derived output ใน report UI;
- requirement-gated items ถูกแยกออกจาก implementation และมี register สำหรับ
  workshop โดยไม่ invent clinical answer;
- loading/error/success/empty state สำคัญมี evidence ที่ใช้ demo ได้;
- typecheck, lint, unit, integration, Prisma validation, build, detector และ
  diff check ผ่าน;
- ไม่พบ A-class Demo Blocker หรือ B-class Demo Defect ที่ยังค้างอยู่.

DEMO READY — CLOSED
