# Phase 13B.0 — End-to-End Demo Continuity Working Prototype

## สถานะ

Implement แล้วที่ bounded prototype scope ของ Phase 13B.0 ต่อจาก [Phase 13A Demo Flow Gap Analysis](./PHASE_13A_DEMO_FLOW_GAP_ANALYSIS.md)

Phase นี้เชื่อมต่อ workflow ที่มีอยู่แล้วเพื่อใช้ใน customer requirement workshop ไม่ได้เพิ่ม business domain ใหม่ และไม่เปลี่ยน authorization model

## Scope ที่ implement

### P13-H1 — Actor-aware `/app` landing

- `/app` อ่าน Hospital name/code/status จาก Hospital IDs ที่อยู่ใน server-derived `ActorContext`
- ใช้ policy เดิมของ workforce, Patient directory, Patient provisioning และ Patient activation เพื่อสร้าง next-action projection
- Platform `ADMIN` เห็นเฉพาะ entry points ที่อยู่ใน governance navigation เดิม
- Hospital Owner เห็น workforce และ Patient actions แยกตาม Hospital context ที่ใช้ได้
- Hospital Member เห็นเฉพาะ Patient actions ตาม direct active membership เดิม
- OSM เห็น assigned Patient entry point และ Patient provisioning เฉพาะ Hospital relationship ที่ policy เดิมอนุญาต
- actor ที่มีเฉพาะ `PATIENT` เห็น active-account message และข้อความว่า Patient-facing features ยังไม่อยู่ใน prototype โดยไม่มี Patient data link
- active Hospital context ที่ไม่มี capability ใช้งานจะไม่ถูกแสดงเป็น operational workspace

### P13-H2 — Patient provisioning continuation

- `provisionPatientAction` ส่งต่อ `relationshipId` และ `hospitalId` ที่ service คืนมาโดยตรง
- single-record success แสดง `เปิดข้อมูลผู้ป่วย` ไปยัง `/app/patients/[relationshipId]` เฉพาะเมื่อ actor มี direct Hospital Patient read scope ใน Hospital เป้าหมาย
- แสดง activation-management continuation เฉพาะเมื่อ account status เป็น `PROVISIONED` และ actor มี existing Patient activation Hospital scope ใน Hospital เป้าหมาย
- OSM provisioning ไม่ imply Patient Detail access หรือ Patient activation authority และไม่ทำการ assign Patient ให้ OSM อัตโนมัติ; หากไม่มี continuation ที่ actor ใช้ได้ UI ยังคงแสดง success state ที่อธิบายตามสิทธิ์ปัจจุบัน
- `ACTIVE` User ที่ถูก reuse แสดง Patient Detail เป็น continuation หลักและไม่แสดง activation-required state
- bulk import ยังคงใช้ summary เดิมและมีเพียง link กลับ Patient directory ที่ผูกกับ `summary.targetHospitalId`; ไม่เพิ่ม per-row persistence หรือเดา relationship ID

### P13-H3 — Workforce / activation / Hospital workspace continuity

- Owner-side workforce provisioning แสดง link ไป workforce relationship detail, Patient workspace ของ Hospital เดิม และ workforce workspace ของ Hospital เดิม
- ทุก link ใช้ `hospitalId` หรือ `relationshipId` จากผลลัพธ์ authoritative ของ service
- target-user workforce activation ยังคงเป็น one-time activation ของ target user และ redirect กลับ login เดิม ไม่ auto-login หรือ impersonate
- selected Hospital ใช้ route query convention เดิม และ destination route/service ยังคงตรวจสิทธิ์เอง

### P13-H4 — Care-chain related record navigation

- Screening detail เพิ่ม link ไป Goal creation พร้อม `screeningId`
- Goal creation ใช้ Screening summary ที่ service ตรวจว่าอยู่ใน relationship เดียวกันและ actor มี `goal:plan`
- Goal Plan detail เพิ่ม link ไป Follow-up creation พร้อม `sourceGoalPlanId`
- Follow-up setup preselects Goal Plan เฉพาะจาก exact relationship-scoped Goal projection ที่ actor อ่านได้
- invalid หรือ unrelated context ถูกปฏิเสธเป็น `NotFoundError` ที่ destination setup; navigation ไม่สร้าง Goal หรือ Follow-up

### P13-M1 — Hospital onboarding approval continuation

- approved application detail แสดงข้อความว่า Hospital อนุมัติแล้วและ applicant ได้สถานะ Hospital Owner
- มี link ไป `/login` เพื่อให้ applicant เข้าสู่ระบบด้วยบัญชีของตนเอง
- Admin session ไม่ถูกเปลี่ยน context และไม่มี credential/invitation delivery ถูกเพิ่ม

### P13-M2 — Hospital lifecycle visibility

- `/app` แสดง Hospital ที่ `SUSPENDED` เป็นสถานะ `ถูกระงับ`
- แสดงข้อความว่าไม่สามารถดำเนินงานภายใต้ Hospital นี้ได้และไม่ render operational links
- ไม่แสดง suspension reason, appeal, restore request, notification หรือ session revocation
- route/service authorization เดิมยังเป็น authority และยัง fail closed เมื่อ Hospital ถูก suspend

## Routes, components และ service ที่เปลี่ยน

- `app/app/page.tsx`
- `src/modules/auth/services/actor-workspace-service.ts`
- `src/components/app-shell/application-workspace.ts`
- Patient provisioning action state, Server Action และ provisioning workspace
- workforce provisioning workspace
- Screening detail, Goal Plan detail, Goal creation และ Follow-up creation/form
- Hospital onboarding approved continuation component
- focused tests ใต้ `src/components/app-shell`, patient provisioning, goals, followups และ onboarding detail

## Authorization และ Hospital context

- UI projection ใช้ `ActorContext` และ existing capability policy เท่านั้น; top-level Role เพียงอย่างเดียวไม่สร้าง link
- Hospital IDs ที่ browser ส่งผ่าน query เป็น selection hint เท่านั้น ปลายทางยังใช้ existing scope resolver/service และ database state ตรวจซ้ำ
- `/app` ไม่รับ Hospital ID จาก browser เป็น input ในการสร้าง workspace; query ของ Hospital-specific routes ยังถูก validate ที่ route เดิม
- relationship IDs และ Goal/Screening IDs มาจาก service result หรือ route detail ที่ผ่าน authorization แล้ว ไม่ถูก derive จากชื่อ, National ID, HN หรือ client state
- ไม่มี direct Prisma access จาก Client Component และไม่มี global tenant state, localStorage authority หรือ workflow engine

## Tests

เพิ่ม regression coverage สำหรับ:

- actor projection ของ ADMIN, Hospital Owner, Hospital Member, OSM, PATIENT และ suspended Hospital
- authoritative Patient provisioning relationship ID, capability-aware Patient Detail continuation และ activation เฉพาะ `PROVISIONED` + existing activation scope
- provisioning/read/activation authority แยกกันสำหรับ Hospital, OSM-only, multi-role และ `ALREADY_PROVISIONED` cases
- ACTIVE User reuse ไม่แสดง activation-required link
- approved onboarding state แสดง separate-login continuation เฉพาะเมื่อ approved
- Screening context และ Goal Plan context ต้องอยู่ใน relationship projection เดียวกัน
- existing Hospital query selection test ยืนยัน stale/invalid `hospitalId` ไม่กลายเป็น workspace key

## Golden journey verification

ตรวจสอบ chain จาก route/service/test seam ของ prototype แล้ว:

- Journey A: Admin approve → application detail แสดง approved/next-login state → applicant ต้อง login แยก → `/app` derive Owner workspace จาก ActorContext
- Journey B: Owner `/app` → Workforce พร้อม selected Hospital → provision → activation presentation หรือ existing ACTIVE reuse → continuation links คง Hospital context; target activation ไม่สลับ session
- Journey C: provision Patient → authoritative Patient Detail → existing assignment/Screening/Goal/Appointment/Follow-up handoffs คงอยู่ และเพิ่ม Screening → Goal กับ Goal Plan → Follow-up โดยไม่ต้องค้น record ใหม่ในสองจุดนี้
- Journey D: Patient activation → existing login boundary → safe Patient-only `/app` message; ไม่มี Patient portal behavior เพิ่ม
- Journey E: governance links และ destination policy เดิมยังคงเป็น authority; ไม่มี lifecycle mutation จาก navigation

การยืนยันในระยะนี้เป็น route/service reasoning และ focused automated tests ใน repository; ไม่ได้เพิ่ม dev-server หรือ external notification step

## Explicit non-goals และรายการที่ยัง defer

- ไม่มี Prisma schema change หรือ migration
- ไม่ทำ `P13-D7` Admin data-quality/reconciliation, `correct-data`, identity merge หรือ duplicate cleanup
- ไม่ทำ account recovery, password reset, lost-Owner recovery หรือ User suspend/restore
- ไม่ทำ Patient self-service, Patient profile editing หรือ Patient portal
- ไม่กำหนด OSM geographic scope, Patient transfer/reassignment หรือ final clinical policy
- ไม่ทำ automatic Goal, care recommendation, analytics/reporting, notification, email, SMS, LINE/LIFF, native app หรือ background job
- ไม่มี invitation delivery infrastructure และไม่ expose credential

`P13-D7` ยังคง tracked และ unimplemented ตาม Phase 13A
