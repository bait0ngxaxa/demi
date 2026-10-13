# UX-06 — Appointment & Cross-role Operational Handoff

วันที่: 2026-10-13 (Asia/Bangkok)

Starting commit: `1a4bac50c45e8aa1ec866a005a341741cfc888e1`, branch `main`, ตรง reviewed baseline; working tree สะอาดก่อนเริ่ม. ไม่พบ unrelated changes ระหว่างงาน.

Final commit: commit ที่เพิ่ม handoff นี้พร้อม implementation/tests; resolve full SHA ด้วย `git log -1 --format=%H -- docs/phases/UX_06_APPOINTMENT_CROSS_ROLE_HANDOFF.md`. Hash ของ commit ไม่สามารถฝังในเนื้อหาของ commit เดียวกันได้; delivery report ระบุ full SHA หลัง commit/push.

Disposition: IMPLEMENTED / FOCUSED AUTOMATED VERIFICATION PASS. Browser/Mobile UAT ยังต้องทำ; ไม่อ้าง clinical acceptance, production readiness, full Owner Workbook DoD หรือการปิด canonical business gaps. หยุดหลัง UX-06.

## 1. Context และ verified gaps

อ่าน AGENTS.md, CLAUDE.md, PRODUCT.md, DESIGN.md, relevant current appointment/self/family/LINE sections ของ docs/CONTEXT.md, UX-01–05 handoffs, Phase 17C, owner-approved closeout ใน 17D.0 และ implementation 17D.1. ใช้ 17F.2B exact delegated-read contract, current grant query/policy และ 17J.4A owner closeout / 17J.4B implementation เพื่อรักษาขอบเขต. ตรวจ canonical APT-01–17 / OSM-03 และ WB-00 pending register โดยไม่เปลี่ยน statuses.

ใช้ Impeccable context / Operate / clarify / craft floor และ detector, React component checklist, local Next.js Link guide. คง Quiet Clinical Access และ Thai UTF-8. อ่าน Canva richtexts `DAHSvdQ3gvU` และ `DAHW1jWjScY` ผ่าน connector โดยตรง: appointment/history, response/postponement และ cross-role care flow เป็น UX intent เท่านั้น. ไม่ตรวจ geometry/ลูกศรเพิ่มเติมหรือใช้ legacy wording เพื่ออนุมัติ authority ใหม่.

ปัญหาที่ตรวจพบจาก source:

- Work history เป็น flat list; terminal records แข่งกับ SCHEDULED, status ซ้ำใน badge และ metadata, empty creation CTA ซ้ำกับ header และแนะนำสร้างแม้ไม่มีสิทธิ์.
- Work detail แสดง acknowledgement ซ้ำสำหรับ OSM; แยกกำหนดการ/การรับทราบ/coordination/request review/operational outcome ได้ไม่ชัด. Completion handoff ไม่มีคำอธิบายว่าไม่ได้ยืนยัน Follow-up/Program record.
- Operational success ไม่มี visible feedback และ controls ถูกถอดเมื่อ readback เป็น terminal; cancellation review success อยู่ใน pending-request branch ซึ่งหายหลัง review.
- SELF แสดง request source แต่ไม่แสดง authorized persisted interaction timestamps; ไม่มี return actions ท้าย detail และ history ไม่มีคำอธิบายความหมาย interaction.
- SELF history อ่าน Hospital ที่ไม่ ACTIVE ได้ตาม policy แต่ scheduled detail ยังมี submit controls ที่ mutation access resolver จะปฏิเสธ. แก้ presentation ให้รักษาการอ่านพร้อม unavailable explanation โดยไม่แก้ server policy.

## 2. Before / after และ query cost

| Before | After |
| --- | --- |
| Work flat latest list | SCHEDULED ก่อน; terminal history อยู่ native disclosure, เปิดไว้เมื่อไม่มี scheduled rows |
| Loaded length / status ซ้ำ | ไม่มี total/count claim; ระบุว่าแบ่งกลุ่มจากวันนัดล่าสุดไม่เกิน 50 รายการ ไม่ใช่ประวัติทั้งหมด |
| Duplicate create/acknowledgement presentation | หนึ่ง header create entry ตาม canCreate; หนึ่ง Work acknowledgement readback section |
| Generic operation section | แยก Hospital operational management, OSM proxy/coordination และ cancellation decision พร้อมผลจริง |
| Success หายเมื่อ record เปลี่ยน branch | Operational success และ review outcome อยู่เหนือ persisted-status/pending-request form gates |
| SELF history/detail ต้องตีความเอง | Shared Thai guidance, timestamps, visible detail link, exact-Hospital history/Home return |
| Non-ACTIVE SELF scheduled submits | Historical readback คงอยู่; ไม่มี submit buttons และมี unavailable copy |

ไม่มี query contract/index/schema changes. Work `getAppointmentHistory()` ยังใช้ exact R, `scheduledAt DESC, id DESC`, `take: 50`; grouping ทำบน bounded server-rendered read model เท่านั้น. ไม่มี client-side full-history filtering, lifetime totals, per-row detail/Program lookups หรือ N+1 ใหม่. Records เกิน latest 50 ยังไม่ถูกเปิดผ่าน Work pagination; grouping ไม่แก้ข้อจำกัดนี้และไม่อ้างว่า scheduled group ว่างหมายถึงไม่มี scheduled records ทั้งหมด. ต้องออกแบบ Work pagination แยกหากต้องการ complete historical discovery.

SELF history ยังคง bounded 50-item pages / lookahead เดิม; older-page links และ exact relationship retained. Work และ SELF cancellation requests เป็น latest 5 ตาม query เดิม จึงระบุ grain/limit ให้เห็น. Work coordination query latest 5 เดิม; ไม่แสดง all-time count. Work detail ยังคง independently authorized Program context และ optional Follow-up history query เดิมเพื่อ resolve existing handoff; ไม่เพิ่ม dashboard/history queries. Changed appointment links ใช้ prefetch=false. ไม่มี benchmark/EXPLAIN หรือ measured latency claim.

## 3. Actor / journey crosswalk

`R` = exact PatientHospitalRelationship, `A` = appointment, `P` = independently authorized active Program, `G` = accepted family grant; URLs encode locators.

| Actor | Entry / exact destination | Existing operation | Readback / return |
| --- | --- | --- | --- |
| Hospital direct active OWNER/MEMBER | Patient Detail → `/app/patients/R/appointments` → `/A` | create; eligible reschedule/cancel/complete/no-show; review pending cancellation request | persisted status, acknowledgement/request history; exact appointment history → Patient `#patient-care` |
| Exact actively assigned OSM | Assigned Patient Detail → same Work R/A routes | create, coordination, proxy acknowledgement/request-cancel; no direct manage through OSM alone | actor/source/time, request disposition, operational status; exact care return |
| Patient SELF | Personal Home → `/app/personal/appointments` → select R → `/R/A` | own eligible scheduled acknowledgement/request-cancel; reschedule by contacting Hospital | own allowlisted persisted state/time; exact Hospital history and Personal Home |
| Independent multi-role actor | Work and Personal remain separate entries | server evaluates direct Hospital/exact assignment/SELF for each action; roles do not imply arbitrary scope | no cross-Hospital or other-person Personal navigation |
| Delegated caregiver | `/app/family/grants/G/appointments` → `/A` | strictly read-only six-field projection and current grant/window checks | family grant-specific return; no SELF/Work mutation links |

Creation/reschedule forms, their server-selected context, validation, responsible selections, nonce/version handling and success navigation to exact A remain unchanged. Work history creation uses canCreate, not canManage, so permitted assigned OSM creation remains discoverable. Detail reschedule still requires canManage + SCHEDULED.

Existing completed-appointment handoff is preserved: writable active Program → `/app/patients/R/programs/P/followups/new?appointmentId=A`; readable-only active Program → Program detail; no active Program → existing standalone Follow-up compatibility route. Destination authorization remains authoritative. This is optional navigation, not evidence that a Follow-up exists or a Program completed; no record is created by opening the link. No new causal link or automatic Program opening is introduced.

## 4. Operational status versus interaction matrix

| Persisted fact | Meaning / eligible actions | Must not imply |
| --- | --- | --- |
| SCHEDULED | Scheduled appointment; Hospital manages; eligible SELF/exact OSM may acknowledge/request cancellation | due/overdue, attendance commitment, delivered care |
| COMPLETED | Hospital-recorded terminal appointment outcome; operational controls unavailable | Follow-up created, Program completed, clinical success |
| CANCELLED | Terminal operational cancellation; historical readback | merely a submitted cancellation request |
| NO_SHOW | Terminal Hospital-recorded outcome under existing server-time rule | time-based automatic inference from a past schedule |
| Current acknowledgement | Receipt of current schedule information with source/time; immutable appointment-version fact | attendance confirmed, service delivered, OSM assignment accepted |
| Cancellation PENDING | Awaiting Hospital decision; appointment not immediately cancelled | Patient/OSM directly cancelled it |
| Cancellation APPROVED | Hospital approval performed canonical cancellation | new Patient cancellation authority |
| Cancellation REJECTED | Decision did not change operational appointment status | guaranteed attendance or future completion |
| Cancellation SUPERSEDED | Request lost effect after appointment/version changed | approved/rejected cancellation decision |
| OSM coordination | Separate actor/time record; existing permission also works on terminal appointments | acknowledgement, assignment acceptance, attendance or service completion |

Pending submit disables sibling actions within each existing interaction control, and operational controls retain their shared pending guard. Native confirmation prompts already present for destructive/terminal operations remain; no new modal. Server actions retain sanitization, success revalidation and useActionState. Components refresh on success; conflicts remain warning feedback with existing reopen-detail guidance, failures remain danger feedback. No automatic conflict refresh or new transaction semantics were added. Separate operational/interaction panels can still race; authoritative version checks/transactions resolve conflicts.

## 5. Authorization / privacy / notification boundaries

- Production policies, access/query/mutation services, server actions, authentication, schema/migrations and transactions are unchanged. Current ACTIVE actor, exact Hospital membership/status, current OSM association/assignment, persisted SELF binding, atomic conditional updates/audit/idempotency remain server-authoritative.
- Hospital OWNER/MEMBER require active direct exact-Hospital scope. ADMIN-only does not grant routine appointment access. ADMIN + valid Hospital/OSM and HOSPITAL + PATIENT use independently valid capabilities; profession/hierarchy/Personal navigation do not authorize an action.
- SELF read continues to permit own historical data across ACTIVE/SUSPENDED/PENDING_VERIFICATION Hospitals. UI suppresses submits for non-ACTIVE Hospital from authorized detail context, but this is convenience only: forged client state cannot bypass the mutation resolver. Other-person records remain denied even with professional roles.
- Current assignment authorizes OSM access/actions; osmAtCreationDisplayName is historical evidence only and never backfilled from the current assignment. New copy makes this distinction visible.
- Names/location/status already in allowlists remain; no phone, creator/internal note/assignment ID is added to SELF. No family fields/actions expanded. Delegated read still requires exact accepted current grant, account binding, active relationship/Hospital, server rolling 90-day window, SCHEDULED/CANCELLED only, default gate and revocation checks. Real-data delegated governance Q5 remains separate.
- LINE outbox/provider/retries/recipients/consent/account binding/default flags untouched. Synthetic/demo J4 approved scope and real-provider activation boundaries unchanged; P17D-NOTIF-01 remains open. No UI notification delivery promise.

## 6. Changed files

Production (7):

- `app/app/patients/[relationshipId]/appointments/appointment-history-view.tsx` — bounded status priority, historical disclosure, one create entry, accurate empties and exact links.
- `app/app/patients/[relationshipId]/appointments/[appointmentId]/page.tsx` — separated status/context/interactions, optional care handoff boundary, retained operational feedback and exact Patient return.
- `app/app/patients/[relationshipId]/appointments/[appointmentId]/appointment-interaction-controls.tsx` — shared meaning/readback, pending guard and review feedback outside pending branch.
- `app/app/patients/[relationshipId]/appointments/[appointmentId]/appointment-mutation-controls.tsx` — terminal read-only state and visible success after refresh.
- `app/app/personal/appointments/patient-appointment-interaction-controls.tsx` — shared copy, timestamps, pending guard and non-ACTIVE Hospital unavailable presentation.
- `app/app/personal/patient-self-record-detail-views.tsx` — appointment history guidance, status/evidence separation and safe return links; Goal/Follow-up views untouched.
- `src/modules/appointments/domain/appointment-interaction-definitions.ts` — two shared Thai guidance strings alongside existing labels/reschedule guidance; no business rule change.

Tests (8): Work appointment history test; new appointment interaction-controls and appointment-pages tests; existing Personal care-view, family appointment-sharing, appointment policy/query/server-action tests. Documentation: this handoff. No dependencies/lockfiles/canonical registers/LINE runtime files or unrelated work changed.

## 7. Verification actually executed

Stable cross-role regression: **24 files / 267 tests PASS** before final isolated non-ACTIVE Hospital presentation guard. Command:

```powershell
npm run test -- 'app/app/patients/[relationshipId]/appointments/appointment-history-view.test.tsx' 'app/app/patients/[relationshipId]/appointments/appointment-interaction-controls.test.tsx' 'app/app/patients/[relationshipId]/appointments/appointment-pages.test.tsx' app/app/personal/patient-self-care-views.test.tsx app/app/personal/personal-pages.test.ts src/modules/appointments/policies/appointment-policy.test.ts src/modules/appointments/services/appointment-query-service.test.ts src/modules/appointments/services/appointment-service.test.ts src/modules/appointments/transport/server-actions.test.ts src/modules/appointments/schemas/appointment-schemas.test.ts src/modules/appointments/domain/appointment-definitions.test.ts src/modules/appointments/presentation/appointment-followup-context.test.ts src/modules/patient-self/policies/patient-self-policy.test.ts src/modules/patient-self/services/patient-self-query-service.test.ts src/modules/patient-self/services/patient-self-care-query-service.test.ts src/modules/patient-self/transport/patient-self-page-context.test.ts app/app/family/appointment-sharing-pages.test.tsx src/modules/family/services/appointment-grant.test.ts src/modules/family/transport/appointment-grant-page-context.test.ts src/modules/family/transport/appointment-grant-actions.test.ts src/modules/appointments/domain/appointment-line-notifications.test.ts src/modules/appointments/services/appointment-line-notification-preference-service.test.ts src/modules/appointments/transport/appointment-line-notification-actions.test.ts src/components/app-shell/application-navigation.test.ts
npm run lint -- --max-warnings=0
npm run typecheck
git diff --check
```

After isolated Hospital presentation guard: **5 files / 89 tests PASS** (includes final two new inactive-Hospital cases), focused ESLint on affected 4 files zero warnings PASS, typecheck PASS after adding required typed Hospital context. Final small boolean naming split preserves contact-Hospital guidance independently of submit eligibility; affected tests/ESLint passed afterward. Full lint result above is the pre-guard repository baseline, followed by affected-file confirmation; no repeated full suite.

```powershell
npm run test -- 'app/app/patients/[relationshipId]/appointments/appointment-interaction-controls.test.tsx' app/app/personal/patient-self-care-views.test.tsx src/modules/patient-self/services/patient-self-care-query-service.test.ts src/modules/patient-self/policies/patient-self-policy.test.ts src/modules/appointments/policies/appointment-policy.test.ts
npx --no-install eslint app/app/personal/appointments/patient-appointment-interaction-controls.tsx app/app/personal/patient-self-record-detail-views.tsx app/app/personal/patient-self-care-views.test.tsx 'app/app/patients/[relationshipId]/appointments/appointment-interaction-controls.test.tsx' --max-warnings=0
```

Earlier iterations: initial 3-file run 31 PASS / 1 FAIL because existing absence assertion matched the new negative explanation “ไม่ใช่การยืนยันว่าจะมา”; corrected to require the explanation and deny an attendance-confirmation button. Same affected 3 files then 35 PASS; new Work pages 8 PASS; expanded 4-file action/query/family run 47 PASS. No production capability was weakened to pass tests.

Final semantic-markup correction keeps historical OSM explanatory text inside definition-list `dd` elements. Affected Work page / SELF view confirmation: **2 files / 23 tests PASS**, targeted ESLint on both affected source files zero warnings PASS. No behavior or type contract changed; earlier typecheck baseline remains applicable.

Impeccable detector: all six changed TSX surfaces `[]`; affected SELF surfaces after guard also `[]`. Complete source/test diff reviewed before stable regression, late isolated guard separately reviewed; whitespace/UTF-8 inspection at delivery. Assertions cover persisted grouping/actions, receipt semantics, request outcomes, terminal readback, exact R/A paths, current versus historical OSM, suspended/pending SELF presentation, multi-role/multi-Hospital policy, crafted foreign resource predicates, bounded query and family six-field read-only projection, existing LINE defaults/generic content. Hook tests explicitly run mocked refresh effects; static render/route mocks do not establish browser hydration, real server-cache behavior or real database race outcomes.

No full suite, PostgreSQL integration, build/dev server or real browser/mobile UAT. Database behavior unchanged, so no DB-dependent correctness change requires new integration evidence. Existing service/policy/action tests provide focused regression, not a fresh real PostgreSQL concurrency audit. Repo has no architecture:check script; dependency direction inspected. Browser inventory showed no DEMI authenticated test tab; no existing user browser session was navigated or mutated.

## 8. Remaining UAT / excluded decisions / next phase

Authorized non-production synthetic accounts must verify:

1. Desktop and 320/375px, 200% zoom, long Thai Patient/Hospital/person/location strings; no overflow, disclosure reading, keyboard focus, native confirmations and screen-reader pending/results.
2. Active direct OWNER/MEMBER, inactive membership/suspended Hospital, assigned/unassigned/ended OSM, ADMIN-only, independently authorized multi-role and multiple Hospitals; forged R/A/request IDs must fail closed against real data.
3. SELF no/one/multiple relationships, ACTIVE/SUSPENDED/PENDING_VERIFICATION, missing optional data/records; preserve historical read while unavailable writes are explained.
4. Creation/reschedule → exact detail → status/readback; acknowledge versus cancellation request/review; repeated/stale/concurrent mutations; review feedback after request branch disappears and operational feedback after terminal transition.
5. Work Patient/Program return, SELF exact Hospital history/Home return, history disclosure/pagination, current assignment versus historical OSM identity; no automatic Follow-up/Program provenance inference.
6. Delegated synthetic read under exact grant/field/window/revocation boundaries; no response/management controls. Real Patient-data delegation still governance-gated. Existing LINE behavior only under its separate approved test/activation controls; no real-provider UAT performed here.

APT-04 whiteboard postponement/request intent, APT-07 responsibility choices and APT-17 contact disclosure remain canonical decision/audit work; UX-06 does not reinterpret them. P-13 request-to-delivery linkage, P-14 OSM assignment acceptance, P-15 preferred/actual OSM, P-16 Health Plan identity, P-17 six-round navigation, P-18 due/extra activities, P-19 atomic plan adjustment, clinical definitions and P17D-NOTIF-01 remain excluded. No canonical gap was closed.

Recommended next phase: **UX-07 Hospital Staff & Owner Workspaces** after UX-06 review/UAT. UX-07 not started.
