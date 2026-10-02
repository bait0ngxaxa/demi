# Phase 17F.4A — Family Re-audit / UAT Readiness

วันที่ 2026-10-02 · Repository `bait0ngxaxa/demi` · synthetic/demo only

## Baseline และขอบเขต

Actual starting HEAD: `011079b9eab3b17b80a65c5e4351606d75bbd83a` — `feat(phase-17f3): add family invitation QR transport`; working tree สะอาด ตรง expected baseline. อ่าน AGENTS.md ก่อนแก้ ไม่มี reset/revert/amend หรือ overwrite งานอื่น.

Final commit: commit ที่เพิ่มรายงานนี้ชื่อ `test(phase-17f4a): re-audit family delegation and prepare device UAT`. Resolve SHA ด้วย `git log --diff-filter=A -1 --format=%H -- docs/phases/PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md`; final delivery response ระบุ SHA จริง ไม่ฝัง self-referential hash ใน commit content.

งานนี้ตรวจ complete implemented Family 17F.1 relationship, 17F.2 appointment grant/read และ 17F.3 QR พร้อม auth/login, SELF/operator boundaries, audit, schema/migrations, cache และ PostgreSQL concurrency. เพิ่มหลักฐาน tests กับเอกสารเท่านั้น ไม่เปลี่ยน runtime, schema/migration, ADR, dependency, role, capability, disclosed field หรือ semantics. ไม่มี real Patient PII และไม่มี credentials ในเอกสาร.

**Phase 17F.4A automated/security/PostgreSQL re-audit = PASS**. P17F-L04 = **OPEN — AUTOMATED/INTEGRATION RE-AUDIT COMPLETE; REAL-DEVICE UAT PENDING** เมื่อ checks ด้านล่างผ่าน. Phase 17F overall = **NOT CLOSED**. ไม่รับรอง production readiness หรือ mobile compatibility.

## Source / decision evidence ที่ตรวจ

Current source เป็น authority สำหรับ runtime; history ใน handoff ไม่ใช้แทนการอ่าน implementation.

| Evidence key | Source / responsibility |
| --- | --- |
| R | `src/modules/family/services/caregiver-relationship-service.ts`: assertActiveUser/assertPatientSelf, create/preview/accept/reject/revoke pending, revoke relationship/withdraw, DB-clock expiry/audit |
| RM | `src/modules/family/services/caregiver-relationship-query-service.ts`: explicit management selects/DTO ทั้งสอง perspectives; `presentation/caregiver-relationship-presentation.ts` |
| RP | `src/modules/family/policies/caregiver-relationship-policy.ts`, `schemas/caregiver-relationship-schemas.ts`, `services/caregiver-invitation-token-service.ts` |
| G | `src/modules/family/services/appointment-grant-service.ts`: propose/accept/revoke, gate, clock, Serializable writes |
| GP | `src/modules/family/policies/appointment-grant-policy.ts`: appointmentGrantOwnerWhere/appointmentGrantCaregiverWhere; `domain/appointment-grant-contract.ts`, `schemas/appointment-grant-schemas.ts` |
| GM | `src/modules/family/services/appointment-grant-management-query-service.ts`: patientSelect/caregiverSelect/lifecycleSelect/DTO |
| D | `src/modules/family/services/delegated-appointment-query-service.ts`: delegatedAppointmentSelect/appointmentWhere/listDelegatedAppointments/getDelegatedAppointment |
| T | Family `transport/server-actions.ts`, `appointment-grant-actions.ts`, `family-management-page-context.ts`, `appointment-grant-page-context.ts`, `action-state.ts` และ tests |
| UI | `app/app/family/**`: management/sharing workspace, invitation page/preview, QR, list/detail/appointment-fields, refresh-delegated-read, loading/error/not-found และ tests |
| A | `src/modules/auth/**` actor-context/application-access/authentication/authorization/login-schema/server-actions และ tests; `app/login/**`; `app/app/layout.tsx` |
| SELF | `src/modules/patient-self/policies/patient-self-policy.ts`, `services/patient-self-query-service.ts`, appointment selectors/read functions ใน `patient-self-care-query-service.ts` |
| OP | `src/modules/auth/services/actor-workspace-service.ts`, `src/modules/patient-directory/policies/patient-directory-policy.ts`, appointment/operator policy; Hospital membership/OSM assignment ไม่ถูกนำมาเป็น Family predicate |
| DB | `prisma/schema.prisma`: Person/User/Role/PatientProfile/PHR/Family/AuditEvent; Family migrations `20261001120000`, `20261001130000`, `20261002120000` |
| INF | `src/lib/env/server.ts`, `src/lib/db/prisma.ts`, `src/lib/db/serializable-transaction.ts`, Supabase server/proxy boundaries, `next.config.ts`, audit service/schema |
| IR | `tests/integration/family-caregiver-relationship.integration.test.ts` |
| IG | `tests/integration/family-appointment-grant.integration.test.ts` |
| UNIT | tests ทั้งหมดใน `src/modules/family/**`, `app/app/family/**`; auth/login tests |

อ่าน Context, Phase 17 UAT Backlog, 17F.0 contract, 17F.1 foundation, 17F.2 decision pack/17F.2B contract/implementation, 17F.3 decision pack/17F.3B contract/implementation; ADR-0001 identity, ADR-0002 capability/scope, ADR-0005 server boundary, ADR-0006 transactions. Historical approvals ไม่ถูกขยาย. Installed Next.js 16.3.0 `connection.md`, `caching-without-cache-components.md` และ redirect/navigation source evidence ใช้ตรวจ runtime-cache boundary.

## 17F.1 invitation re-audit

Patient SELF creation rechecks exact persisted ACTIVE User/Person/PATIENT/Profile. National ID เป็น transient validated server locator ผ่าน canonical identity hash; ต้องพบ existing ACTIVE account กับ authSubject. ไม่สร้าง account/role และ self invitation deny. Generic lookup failure ไม่บอก account state. Credentials ใช้ randomBytes(32), 256 bits, 43-char Base64URL; tokenHash SHA-256 เท่านั้น persist; plaintext issuance-only. IssuedAt/expiresAt มาจาก DB clock เดียวกัน +24h และ CHECK exact interval.

Recipient preview/accept/reject ผูก exact caregiverUserId AND caregiverPersonId พร้อม persisted ACTIVE User. ไม่ต้องมี PATIENT. Forwarded URL ไม่เปลี่ยน recipient. Preview เลือกเฉพาะ Patient names และ lifecycle/version; wrong/unknown/unavailable ภายนอกเหมือนกันผ่าน T แม้ internal typed errors ต่างกัน. Anonymous ได้ generic login guidance ไม่มีชื่อ Patient.

Explicit acceptance conditional PENDING และ expiresAt > clock_timestamp() ใน Serializable transaction เดียวกับ exact relationship และ accepted/activated audit. ACCEPTED/REJECTED/REVOKED/EXPIRED ไม่กลับ PENDING ผ่าน service. ไม่มี render/preview/scan mutation. Preview ใช้ application clock เป็น advisory; mutation expiry authoritative ที่ DB conditional write.

## 17F.1 management re-audit

ผู้ที่ดูแลคุณ / ผู้ที่คุณดูแล แสดง opposite participant givenName/familyName กับ opaque locator/lifecycle เท่านั้น. RM เลือก fields โดยตรง ไม่ fetch whole Person/Profile. ไม่มี National ID/hash/DOB/HN/contact/Hospital history/clinical/appointment/grant internals. Patient revoke ต้อง exact own ACTIVE parent; withdrawal ต้อง exact own caregiver ACTIVE parent. Conditional terminal writes + audit; ไม่เปลี่ยน account/Patient data/other participants. Rejoin ต้อง new invitation + acceptance; grants เดิมผูก parent เดิมตลอด.

## 17F.2 grant/read re-audit

Purpose-specific CaregiverAppointmentGrant ไม่ใช่ generic ACL. Composite FKs ผูก parent/PatientProfile/Patient Person/caregiver User+Person/proposing Patient User/exact same-Patient PHR. Immutable contract `family-appointment-read-v1` เท่านั้นมี authority; unknown version deny. `family-delegation-v1` alone ให้ ZERO Patient-resource access.

Proposal input มีเพียง caregiverRelationshipId กับ patientHospitalRelationshipId locators ภายใต้ strict schema. Server derive Patient/caregiver/version; own ACTIVE Family parent/accepted source, caregiver ACTIVE, own PHR และ Hospital ACTIVE. Acceptance conditional known PENDING + exact current caregiver/Person + ACTIVE parent/source + originating Patient ACTIVE/PATIENT + exact DB-bound Profile/PHR + Hospital ACTIVE + gate. Audit atomic. ไม่มี bearer grant token.

Grant PENDING = ZERO authority; ACTIVE ต้อง explicit accept; REVOKED terminal. Patient revoke PENDING/ACTIVE ได้ แยกจาก parent และ grant อื่น. ไม่มี EXPIRED/proposal TTL/automatic expiry/renewal/reacceptance. Partial unique index จำกัด actionable PENDING หรือ ACTIVE รวมหนึ่ง row ต่อ exact parent/PHR/version; revoked history เปิด new lifecycle ได้แต่ห้าม reactivate row.

ทุก read ใช้ GP current authority กับ exact PHR AND window/status ใน query และ detail reauthorizes ทุก request. หนึ่ง request-consistent serverNow: scheduledAt >= now และ < now+90*24h; SCHEDULED/CANCELLED only. Exactly now/upper-1ms include; past/upper/COMPLETED/NO_SHOW exclude. Same-PHR new eligible rows appear; new PHR ไม่ inherit. Order scheduledAt ASC/id ASC, max50, fetch51; cursor anchor ต้องผ่าน predicate เดียวกัน. Foreign/stale/revoked/out-of-window detail/cursor NOT_FOUND โดยไม่ enumeration.

## 17F.3 QR / login / privacy re-audit

QR encodes exact invitationLink เดียวกับ copy-link input: current-origin `/app/family/invitations#<43-char-token>`. Installed qrcode client effect: M, margin4, width240, opaque black/white, no logo. ไม่มี remote generation/backend endpoint/persistence/localStorage/sessionStorage/download/print/Web Share/scan audit/QR token/QR TTL. Image transient creation SUCCESS only, stale/unmounted result discarded; copy fallback คงอยู่เมื่อ generation fail. Alt ไม่มี token/Patient identity. Render/scan เพิ่ม ZERO authority และไม่ create/accept data grant.

Fragment validated strict 43-char และ strip ด้วย history.replaceState ใน client hydration. Invitation metadata no-referrer/noindex/nofollow; ไม่ใช่ authorization control. ไม่พบ intentional token logging/audit/analytics ใน reviewed source; deployment APM/scanners/extensions/clipboard/screenshots ไม่ถูก certify. Token ยังอยู่ใน transient client state/DOM/hidden action fields/login return body ตาม flow ที่อนุมัติ.

Login schema accepts exact `/app/family/invitations#<43-char-token>` only; arbitrary route/query token/path token/external absolute/malformed/extra token deny. Server loginAction revalidates returnTo และ fallback `/app`. **Unit tests ไม่พิสูจน์ browser fragment inheritance.** Anonymous `/app/family/invitations#token` อาจ server redirect `/login` ก่อน child hydration. Already-authorized `/login#token` อาจ redirect `/app` ก่อน client strip. ทั้งสองเป็น L04 containment/continuity evidence items; ไม่มี transport rewrite หรือ fabricated deterministic browser evidence.

## Identity / role matrix

| Account | Independent authority / Family outcome | Evidence |
| --- | --- | --- |
| PATIENT-only | own SELF invitation/proposal/revoke; ไม่ accept invitation/grant ที่ส่งให้คนอื่น | RP/R/G/GP; IR intended-account/own revoke; IG foreign-scope |
| caregiver-only, no PATIENT | own invitation/relationship management, accept own invitation/grant, exact granted reads; ไม่ใช่ SELF | IR `resolves an existing active account...`; IG `requires separate acceptance...` |
| OSM+caregiver | OSM path แยก; Family exact scope only | IR existing multi-role acceptance; IG `intended caregiver plus OSM...` |
| Hospital staff+caregiver | membership ไม่ widen Family | IG `intended caregiver plus MEMBER/OWNER...` |
| Patient+OSM | own SELF scope คงเดิม; role ไม่ authorize foreign Family | IR first happy path; IG `Patient owner plus OSM...` |
| Patient+Hospital | own SELF scope คงเดิม; membership ไม่ authorize foreign Family | IR `does not give...`; IG `Patient owner plus MEMBER/OWNER...` |
| Platform ADMIN | ไม่มี Family override | IR `does not give platform ADMIN...`; IG `independent ADMIN...` |

User↔Person exact binding authoritative; four top-level roles unchanged ไม่มี CAREGIVER, impersonation, act-as-Patient. Family ไม่ mutate roles/OSM assignments. Emergency contact/kinship/surname/address ไม่ปรากฏใน authorization predicate.

## Negative authorization matrix

Target คือ Patient A invitation to C / parent A-C / grant A-C-H1. ALLOW เฉพาะ eligible lifecycle และ gate; management หมายถึงเห็น target rows ไม่ใช่เปิด shared page (ทุก ACTIVE account เปิด page แล้วได้ own/empty results). Owner list/detail ใน matrix คือ delegated path ไม่ใช่ SELF path. Foreign Patient/PHR หมายถึง ungranted target.

| Actor | Preview | Invite accept | Target management | Grant propose | Grant accept | Grant revoke | Delegated list | Detail | Foreign Patient | Foreign PHR/Hospital | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A Patient owner | DENY | DENY | ALLOW | ALLOW | DENY | ALLOW | DENY | DENY | DENY | DENY | R exact recipient; RM own; G/GP; IR own/recipient tests; IG separate acceptance/foreign scope |
| B Intended caregiver C | ALLOW | ALLOW | ALLOW | DENY | ALLOW | DENY | ALLOW | ALLOW | DENY | DENY | IR non-Patient happy path; IG separate acceptance/wrong caregiver/foreign cursor |
| C Wrong authenticated user | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | IR rejection/wrong account; T generic preview tests; IG wrong caregiver/Person |
| D Other caregiver | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | IR many-to-many/other caregiver withdraw; IG other fixture caregiver |
| E OSM-only | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | IR `does not give OSM-only...` actual assignment; IG `independent OSM...` |
| F Hospital MEMBER | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | IR `does not give Hospital MEMBER...`; IG `independent MEMBER...` |
| G Hospital OWNER | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | IR `does not give Hospital OWNER...`; IG `independent OWNER...` |
| H Platform ADMIN | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | DENY | IR `does not give platform ADMIN...`; IG `independent ADMIN...` |
| I C+OSM | ALLOW | ALLOW | ALLOW | DENY | ALLOW | DENY | ALLOW | ALLOW | DENY | DENY | IR OSM+Hospital recipient; IG `intended caregiver plus OSM...` |
| J C+Hospital staff | ALLOW | ALLOW | ALLOW | DENY | ALLOW | DENY | ALLOW | ALLOW | DENY | DENY | IR multi-role recipient; IG `intended caregiver plus MEMBER/OWNER...` |

Each cell mapped to the shared exact predicate plus named integration cases above; not every Cartesian cell is a separate browser journey. Roles alone never allow. A/B with an independently accepted foreign grant would be a different authorized target, not the ungranted negative target in this matrix. NOT APPLICABLE ใช้กับ unsupported resources (care/Goal/medication mutations/export) ซึ่งไม่มี Family capability/route; ไม่ใช้แทน DENY ใน implemented paths.

## Cross-Patient / cross-Hospital matrix

| Attempt with grant A-C-H1 | Outcome | Source / test evidence |
| --- | --- | --- |
| eligible A-H1 row | ALLOW six fields | D; IG separate acceptance/exact fields |
| B row or B PHR, even same Hospital | DENY | GP composite scope/D; IG foreign parent/PHR/FKs; `one caregiver serving two Patients in the same Hospital...` |
| A-H2/H3 row, newly created PHR | DENY | IG live same-PHR/new PHR; intended caregiver plus role cases |
| another caregiver/parent/grant | DENY | IG wrong caregiver/Person/other grant/FKs |
| foreign appointment or cursor/random UUID | generic NOT_FOUND | IG wrong caregiver/foreign appointment/cursor; pagination |
| replacement parent with same participants | old grants DENY | IG parent revoke/withdraw replacement inheritance |
| C is OSM/MEMBER/OWNER/PATIENT | same exact A-H1 only | IG intended caregiver plus role cases |
| C manages multiple Patients | each accepted grant stays distinct | IR many-to-many; GP exact grant; IG `one caregiver serving two Patients in the same Hospital...` |

## Lifecycle / temporary eligibility matrix

| Entity / transition | Result / enforcement | Evidence |
| --- | --- | --- |
| invitation PENDING preview | bounded metadata, no activation | IR no-authority status table; QR boundary unit |
| PENDING→ACCEPTED | exact recipient, DB unexpired, relationship+two audits atomic | R; IR concurrent acceptance/rollback |
| PENDING→REJECTED/REVOKED/EXPIRED | terminal, replay deny | IR status/revoke/reject/expiry cases |
| accept vs reject / accept vs revoke | one winner, exact final row/audit | IR named race tests |
| relationship ACTIVE→REVOKED/WITHDRAWN | own participant only, terminal service; children deny | IR terminal and revoke-vs-withdraw; IG parent cases |
| grant PENDING→ACTIVE | explicit caregiver acceptance | G/GP; IG separate acceptance |
| grant PENDING/ACTIVE→REVOKED | own Patient; terminal DB trigger + service | IG history/CHECK/immutability/revoke |
| grant duplicate proposal/accept | one successful transition/audit | IG concurrent proposals/accept |
| accept vs grant revoke | final REVOKED, no revival | IG accept/revoke race |
| parent terminate vs grant accept | acceptance may win first; after parent commit no read/accept authority | IG parent racing acceptance |

| Temporary state | While ineligible | Same entity restored | Evidence |
| --- | --- | --- | --- |
| Hospital SUSPENDED/PENDING_VERIFICATION | acceptance/read DENY | unchanged ACTIVE parent/grant/same PHR may resume | IG temporary eligibility parameterized cases |
| caregiver User SUSPENDED | DENY | same User/Person ACTIVE may resume | IG temporary caregiver; IR active account |
| Patient User SUSPENDED | DENY | same Patient ACTIVE may resume | IG temporary patient |
| Patient PATIENT removed | DENY | same persisted role restored may resume | IG temporary role |
| revoked grant/terminal parent | DENY | account/Hospital restore does not revive | IG eligibility + revoke; parent replacement cases |
| new/foreign PHR or replacement parent | DENY | no inheritance | GP/DB; IG new PHR/parent cases |

## Field / privacy minimization matrix

Forbidden in all Patient-resource surfaces unless explicitly allowed below: National ID/hash/DOB/HN/contact/address, Hospital code/history beyond exact approved name, locationDetail/note/responsible staff/profession/OSM snapshot, acknowledgement/cancellation requests/creator/audit metadata, care/measurements/Goal/medication/other profile data.

| Surface | Allowed fields | Concrete select/DTO | Tests |
| --- | --- | --- | --- |
| Patient relationship management | opposite givenName/familyName; invitationId/status/issuedAt/expiresAt; relationshipId/status/activatedAt/revokedAt/withdrawnAt; pagination cursors | RM participantNameSelect + invitationManagementSelect/relationshipManagementSelect + as*Item | RM unit exact selects/keys; IR many-to-many exact DTO/privacy |
| Caregiver relationship management | same lifecycle; Patient givenName/familyName only | RM caregiverInvitationManagementSelect/caregiverRelationshipManagementSelect | same unit + IR |
| Invitation preview | Patient display name/status/expiry/family-delegation-v1 | R preview nested names select; T READY DTO | T action tests generic errors/READY; preview UI tests; IR recipient binding |
| QR payload | exact existing HTTPS-origin invitation URL+opaque fragment token | family-management-workspace invitationLink → FamilyInvitationQr | QR/success unit tests generator input/options/alt/failure; no actual decoded camera evidence |
| Grant proposal/acceptance management | names, exact Hospital.name, grant locator/status/proposedAt/acceptedAt/revokedAt; owner PHR choices locator/name | GM lifecycleSelect/patientSelect/caregiverSelect/AppointmentGrantManagementItem | IG exact management keys/no SECRET/HN/code/profile; sharing UI disclosure tests |
| Delegated list | hospitalName/type/scheduledAt/durationMinutes/locationType/status; appointmentId locator only | D delegatedAppointmentSelect explicitly id+five appointment fields; authorized grant PHR Hospital.name select; toAppointment | appointment-grant unit selector keys; IG exact list DTO/nulls/privacy/window |
| Delegated detail | identical six fields+locator | same D selector/policy; no SELF selector reuse | IG exact detail equals list; foreign/window cases; appointment-fields UI |
| Audit metadata | invitation/relationship status, invitation expiresAt/acceptanceContractVersion; grant contractVersion/priorStatus | R/G explicit recordAuditEvent literals; audit schema bounds | IR no token/hash/National ID; IG exact metadata/actors/rollback/no read audit |
| URLs | invitation token fragment; grant/appointment/cursor opaque UUIDs | QR construction/login return schema; delegated route params | login schema/action tests; QR exact-link; IG foreign cursor/detail |

Internal authorization selectors may fetch identity/status/roles needed for decision; these are not serialized Patient-resource payload. Preview selects bounded names before identity comparison but returns them only after match; it does not load whole Patient. No fetch-all-then-strip pattern in delegated appointment query.

## Cache / stale authority

List/detail explicitly await connection(), then resolve current provider/application actor and query Prisma. Installed Next docs establish request-time rendering below connection(); next.config does not enable Cache Components. No use-cache/unstable_cache/React shared wrapper/force-cache/SWR protected DTO or authorization decision in Family chain. Auth uses request cookies; DB singleton caches client connection, not results.

Read transaction RepeatableRead couples grant/Hospital name/cursor/rows to one snapshot; appointment query contains current exact authority again. Request snapshot starting after grant revoke, parent revoke/withdraw, account/role/Hospital change denies; integration performs committed mutation then next read. Status/time changes immediately change subsequent reads. UI revalidatePath is UX only, not authority. Sensitive links prefetch=false; focus/visibility/pageshow persisted invokes router.refresh. Previously delivered/in-flight/browser-retained data cannot be recalled. BFCache restore timing and deployed HTTP/RSC/CDN/APM behavior remain manual UAT/environment evidence, not automated shared-cache PASS claims.

## Audit / PostgreSQL / concurrency review

Relationship durable events: caregiver_invitation.created/accepted/rejected/revoked/expired and caregiver_relationship.activated/revoked/withdrawn. Grant: caregiver_appointment_grant.proposed/accepted/revoked. Same transaction client used throughout; audit failure rolls back state. Metadata explicit bounded literals above, no names/Hospital name/HN/contact/token/hash/clinical/free text. No ordinary read/render/scan/page/preview business audit.

DB inspection distinguishes constraints from service invariants: invitation exact User/Person FK + 24h/lifecycle CHECK + one pending pair; relationship sourceInvitation/Patient/caregiver composite FK + one ACTIVE pair + lifecycle evidence CHECK. **Relationship terminal transition and source ACCEPTED status are service transaction invariants, not DB transition triggers.** No speculative corrective migration added. Grant composite FKs, one actionable scope/version, acceptance/revoker CHECK and immutable scope/terminal update trigger tested against actual PostgreSQL.

Real concurrent calls cover duplicate issuance, invitation accept-vs-accept/reject/Patient revoke, parent revoke-vs-withdraw; duplicate proposal, grant accept-vs-accept/revoke, parent terminate-vs-grant accept. Tests permit legal winner order and verify final authority/audit, not guaranteed all scheduling interleavings. DB-clock expiry at-or-after threshold plus strict SQL `>` source check verifies deny; no claim of controlling an exact wall-clock racing microsecond. Service terminal replay/history and DB grant reactivation denial verified. Postcommit next reads honor state; precommit in-flight reads explicitly excluded from recall guarantee.

## Synthetic journeys J1–J15

Automated evidence is service/policy/transport/component and real PostgreSQL, not browser E2E. IG fixtures seed accepted relationship evidence directly; J7 is grant journey, not a claim that the entire UI chain was browser-driven. IR invokes real create/accept service for relationship journeys. All manual browser/device columns remain PENDING.

| Journey | Automated evidence | PostgreSQL evidence | Remaining manual/device |
| --- | --- | --- | --- |
| J1 create→preview→accept→ACTIVE | token/policy/transport/preview tests | IR existing-account acceptance + bounded preview/status | actual login/device open/explicit UI accept |
| J2 wrong recipient | T identical generic INVALID, preview UI no identity | IR wrong role/account accept denied | wrong account scan/privacy observation |
| J3 pending revoke | service/transport terminal tests | IR owning Patient pending revoke + replay | old QR camera replay |
| J4 reject | explicit form / terminal tests | IR rejection + replay; accept/reject race | rejected QR reopened |
| J5 Patient parent revoke | current GP predicate | IG parent revoke denies ACTIVE+PENDING children | rendered view/refresh/back behavior |
| J6 caregiver withdrawal | same predicate/transport | IR own terminal; IG parent withdraw child deny | device withdraw/revisit |
| J7 exact H1 sharing | strict schema/selector/sharing UI | IG separate acceptance exact six fields/nulls | full visible disclosure+accept journey |
| J8 H1-only/H2 deny | GP/D exact scope | IG foreign PHR/new PHR/multi-role cases | browser H2 locator/deep link |
| J9 future same-PHR appointment | ongoing predicate | IG live same-PHR new row | visible refreshed list |
| J10 new Hospital | no inheritance | IG new PHR; separate exact grant | UI separate proposal/accept |
| J11 grant revoke | server current policy/route | IG revoke next read/continuation deny | old URL/browser restore |
| J12 temporary eligibility | current GP; gate/policy unit | IG caregiver/Patient/role/Hospital deny/restore | multi-device account/role/session behavior |
| J13 replacement parent | immutable scope | IG replacement old grant denied | new invite UI + old URL reopen |
| J14 flag off | strict parser + early deny | IG disabled all grant operations; relationship management/withdraw unaffected | deployed flag on/off test using synthetic data |
| J15 QR link equivalence/zero authority | QR input/options/success/failure + QR boundary service | underlying invitation lifecycle IR; no separate scan mutation | actual decode/camera scan/HTTPS/in-app browser reliability |

## Findings / corrections

| ID | Severity | Source / approved invariant | Condition / correction / evidence |
| --- | --- | --- | --- |
| F4A-01 | P3, corrected evidence gap | IG; cross-role isolation required | prior grant integration did not explicitly persist OSM/Hospital/ADMIN/multi-role actors. Added independent role DENY, intended multi-role exact scope, Patient+role own-only cases; no runtime change |
| F4A-02 | P3, corrected evidence gap | IR/IG; atomic terminal races | added invitation accept-vs-reject and parent revoke/withdraw-vs-grant accept with final row/audit/authority assertions |
| F4A-03 | P3, OPEN under L04 | app layout/login/client fragment stores; browser containment/continuity | anonymous/authorized login pre-hydration redirect, refresh/back/BFCache/deployed scan behavior have no device evidence; 17F.4B sheet prepared, no transport rewrite |

No validated P0/P1/P2 runtime defect found. Missing real-device evidence is not classified as proven privilege escalation. Existing distributed/shared abuse protection remains deployment hardening gate; in-process throttling, pair uniqueness and transactions do not establish production abuse protection. No L05 or real-data policy added.

## Commands / actual results

| Command | Result |
| --- | --- |
| git status --short / git rev-parse HEAD / read AGENTS.md | clean baseline, exact SHA above |
| npm run test -- src/modules/family app/app/family | PASS 13 files / 74 tests |
| npm run test -- src/modules/auth app/login | PASS 10 files / 92 tests |
| npm run test:db:status | healthy disposable local PostgreSQL 17 at 127.0.0.1:55432 |
| npm run prisma:generate | PASS Prisma Client 6.19.3; generated node_modules only |
| npm run prisma:migrate:test | PASS 30 migrations; no pending migrations; local demi_test |
| guarded direct installed Vitest run --config vitest.integration.config.mts <both Family files> | PASS initial 2 files / 65 tests; final strengthened set with --reporter=verbose PASS 2 files / 68 tests (IR 23, IG 45) |
| npm run lint -- --max-warnings=0 | PASS zero warnings/errors |
| npm run typecheck | PASS |
| npm run test | PASS 180 files / 1,285 tests; one final full run |
| npm run test:integration | PASS 27 files / 312 tests; one final full PostgreSQL integration run, generate+migrate complete, no pending migration |
| git diff --check / git diff --cached --check | PASS at final delivery; no whitespace defect |
| npm run build | NOT RUN: tests/docs only; 17F.3 runtime/build baseline unchanged, no framework/config/routing/build-time correction |

Targeted integration used `.env.integration` parsed in a child environment without printing values; guard required nonproduction, identical DATABASE_URL/DIRECT_URL/DEMI_TEST_DATABASE_URL, local PostgreSQL and database name demi_test before installed Vitest file execution. Repository integration script does not forward file arguments; none invented. Full integration script performs generate+migrate+sequential file suite. No DB reset/down or production DB used. No architecture:check/lint:strict script exists; source boundary review substitutes, not a fabricated executed script. Final test output/counts updated after execution only. After the last three additional DB-evidence cases, lint and typecheck were rerun successfully; unit/runtime source stayed unchanged. No full-suite iteration loop.

## Delivery manifest / verification boundary

Changed files exactly:

- `tests/integration/family-caregiver-relationship.integration.test.ts` — seven additional PostgreSQL cases (four cross-role negatives, accept/reject race, DB checks, expiry threshold).
- `tests/integration/family-appointment-grant.integration.test.ts` — fifteen additional PostgreSQL cases (independent/multi-role/Patient-owner role isolation, same-Hospital multi-Patient isolation, parent termination races) and necessary fixture cleanup.
- `docs/phases/PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md` — this source-backed report/matrices/results.
- `docs/phases/PHASE_17F4B_FAMILY_DEVICE_UAT_CHECKLIST.md` — unexecuted manual evidence sheet.
- `docs/CONTEXT.md`, `docs/phases/PHASE_17_UAT_BACKLOG.md`, `docs/phases/PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md`, `docs/phases/PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md`, `docs/phases/PHASE_17F3_FAMILY_INVITATION_QR_IMPLEMENTATION.md` — current-status addendum only; historical text preserved.

Final targeted integration child command (after explicit `.env.integration` local/equality/nonproduction guard):

```text
node node_modules/vitest/vitest.mjs run --config vitest.integration.config.mts tests/integration/family-caregiver-relationship.integration.test.ts tests/integration/family-appointment-grant.integration.test.ts --reporter=verbose
```

Initial focused invocation used the identical file command without verbose reporter before the last three evidence cases were added. No integration script argument forwarding assumed. Current Family PostgreSQL totals: IR 23 + IG 45 = 68, up from baseline 16 + 30 = 46; 22 added cases, no existing assertion removed or relaxed.

Codex Security Standard scoped source scan completed and indexed with no source-validated vulnerability; independent baseline plus grant/DB investigation and independent architecture review were reconciled. That supplemental scan is scoped to `src/modules/family` with supporting code; the broader task evidence/matrices live in this report. External scans/APM/production deployment controls are not certified. No new role/capability/resource/field/contract/QR token/TTL/impersonation/kinship/expiry/legal semantics; no secrets/credentials/Patient PII added.

## Real-device evidence / exit gates

**ไม่มี real-device/browser UAT performed ในงานนี้** และไม่มีหลักฐาน deployed HTTPS camera/in-app-browser pass ที่ตรวจพบ. Manual sheet: [Phase 17F.4B Family device UAT checklist](./PHASE_17F4B_FAMILY_DEVICE_UAT_CHECKLIST.md). ต้องบันทึก tested SHA/environment/synthetic confirmation/actor/device/browser/version/steps/expected/actual/PASS or FAIL/evidence/timestamp จริง ห้าม prefill PASS.

L04 closure requires BOTH automated/security/PostgreSQL pass และ actual camera→HTTPS anonymous login/exact recipient/wrong account/terminal replay/fragment containment+removal/in-app browser/QR reliability evidence. Matrix ครอบคลุม iOS Safari, Android Chrome, LINE in-app, desktop Chrome control และ Facebook หากประกาศ support; refresh/back/BFCache/copy/second-device/login retry/authorized login hash/fallback/brightness-distance-zoom. Previously rendered data/clipboard/screenshots cannot be recalled; warnings ต้องสังเกตจริง.

Current statuses: 17F.0 CLOSED; 17F.1 IMPLEMENTED / CLOSED; 17F.2 IMPLEMENTED synthetic/demo only; 17F.3 IMPLEMENTED; L01/L02/L03/L06 CLOSED / OWNER APPROVED; **L04 OPEN — REAL-DEVICE UAT PENDING**; **L05 OPEN / FUTURE** expiry/renewal; **Q5 real-data delegated use GOVERNANCE BLOCKED**. Feature flag enablement ไม่ใช่ controller/privacy/legal approval. Phase 17F overall **NOT CLOSED**.

## Final automated verdict / evidence limits

**PASS** for all automated exit controls: exact recipient; cross-Patient/Hospital/role; terminal invitation/relationship/grant; child denial after revoke/withdraw; temporary eligibility deny/resume; unknown version and default-disabled feature gate; exact six-field projection; rolling window/status; foreign detail/cursor; QR zero authority; generic preview; atomic audit; DB constraints/concurrency; no stale shared server authority cache found. Focused 68 Family PostgreSQL cases, full 1,285 unit tests, full 312 integration tests, strict lint and typecheck passed. No unresolved P0/P1; no validated P2; P3 evidence gaps F4A-01/02 corrected by tests, F4A-03 browser/device evidence remains OPEN.

Final diff reviewed before broad suites; afterward only documentation/results changed. Strict UTF-8/no BOM/no replacement characters and local Markdown targets passed for all nine changed files; status addenda leave prior document bytes unchanged outside insertion. No test weakening, published migration edit, generated tracked file, secret/credential/PII or debug artifact. Build not rerun because runtime/build baseline unchanged.

Real device evidence actually available: **NONE performed or verified during this task**. J1–J14 have source/automated/PostgreSQL evidence as mapped; J15 has exact QR-input/transport/component evidence plus underlying invitation PostgreSQL semantics, but no camera decode or browser scan evidence. End-to-end browser execution and deployed HTTP/RSC/CDN/APM observations remain 17F.4B work.

**P17F-L04 = OPEN — AUTOMATED/INTEGRATION RE-AUDIT COMPLETE; REAL-DEVICE UAT PENDING. P17F-L05 = OPEN / FUTURE. Q5 = GOVERNANCE BLOCKED. Phase 17F overall = NOT CLOSED.**
