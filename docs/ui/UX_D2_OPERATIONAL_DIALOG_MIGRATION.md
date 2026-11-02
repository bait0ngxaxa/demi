# บันทึกการย้าย Operational Dialog — UX-D2

สถานะเริ่มต้น: UX-D2.0 preflight, 2026-11-02

เอกสารนี้เป็น migration ledger ของ UX-D2 ระบุ interaction ปัจจุบัน, surface เป้าหมาย, ขอบเขต mutation/recovery และหลักฐานทดสอบที่ต้องเพิ่มหรือคงไว้ ทุกข้อความและป้ายกำกับของ interaction ใหม่ใช้ภาษาไทยและคำศัพท์เดิมของ DEMI

## Preflight

- Branch: `main`; baseline HEAD: `c95957471d05f2dfd752ac96fc6292bbb395088b`; worktree สะอาด และ HEAD ตรงกับ foundation ที่ระบุ ไม่มี commit ใหม่กว่าที่ต้องนำมาพิจารณา
- อ่าน `docs/ui/UX_D1_DIALOG_INTERACTION_STANDARD.md`, `DESIGN.md`, `ModalDialog`, `ConfirmDialog`, `ConfirmableActionForm` และ `mutation-action-state.ts` แล้ว
- UX-D1 ใช้ native `<dialog>`/`showModal()`; focus containment และ Escape เป็นของ browser, ใช้ `initialFocusRef`, คืน focus ไปยัง trigger หรือ logical target และไม่ปิด mutation ระหว่าง pending
- `ConfirmDialog` ให้ initial focus ที่ยกเลิก; `ConfirmableActionForm` เก็บ submitter แล้วใช้ `requestSubmit(submitter)`, ปิดเมื่อผลยืนยันแล้วเท่านั้น และล็อกพร้อมคำแนะนำ recovery เมื่อ unknown
- Baseline `npm run test -- src/components/ui/modal-dialog-lifecycle.test.ts src/components/ui/confirm-dialog.test.tsx src/components/ui/confirmable-action-form.test.tsx`: ผ่าน 3 files / 20 tests
- Baseline `npm run typecheck`: ผ่าน
- Baseline `npm run lint`: ผ่าน
- ยังไม่ได้ทำ browser QA; jsdom ไม่ยืนยัน native focus containment, layout, safe area หรือ virtual keyboard

## ความคืบหน้าตาม slice

- UX-D2.0 inventory: เสร็จใน commit `da2bcf9c`.
- UX-D2.1 เครือข่ายโรงพยาบาลและคำเชิญผู้ดูแล: เสร็จใน commit `ef31844d`; ตรวจ lint พบกฎ React เพิ่มเติม จึงแก้การปิด dialog และ submit handler ใน corrective commit `e18a3b3` โดยคง native form validation, submitter และการเก็บ draft ไว้.
- UX-D2.2 บุคลากรและบัญชีผู้ใช้: เปลี่ยนแก้วิชาชีพและเบอร์ติดต่อเป็น Edit Dialog; เปลี่ยนนำความสัมพันธ์ออก, ลบรายการ และ takeover เป็น destructive/security dialog; คงการระงับและคืนสถานะไว้กับ confirmation หรือ submit เดิมตาม semantics. Commit `56195201`.
- UX-D2.3 ครอบครัวและ caregiver: เปลี่ยน label เป็น Edit Dialog; ยืนยันการยกเลิกคำเชิญ, ยุติ/ถอนความสัมพันธ์, สร้าง QR/link ใหม่ และ revoke appointment/resource grants ด้วย `ConfirmableActionForm`; คงการสร้าง invitation แบบยาว, consent acceptance, grant proposal และ upgrade ไว้ inline. ลิงก์ใช้ครั้งเดียวหลัง reissue แสดงนอก dialog.
- D2.3 focused regression ล่าสุด: ผ่าน 5 files / 30 tests ครอบคลุม family recovery, relationship label/draft/version, revocation/withdrawal, QR handoff และ appointment/resource grant; targeted ESLint และ `npm run typecheck` ผ่าน.
- UX-D2.4 นัดหมาย: ย้ายขอเลื่อนและปฏิเสธพร้อมเหตุผลเป็น task dialog; แสดงโรงพยาบาล/เวลานัดปัจจุบันและรายละเอียดคำขอที่กำลังพิจารณา; ใช้ fullscreen เฉพาะมือถือ; ยืนยันผลแล้วอ่านสถานะจาก history ที่ revalidate. Commit `d7c8ebf0`.
- D2.4 focused regression: ผ่าน 2 files / 22 tests ครอบคลุม open/cancel/draft, initial/return focus, payload และ hidden fields, validation/conflict/forbidden feedback, double submit, unknown outcome และ resend `FormData` object เดิมทั้ง request/rejection; targeted ESLint และ `npm run typecheck` ผ่าน.
- Dialog ที่ยัง unknown ปิดไม่ได้ทั้ง Escape/ปุ่มปิด/ยกเลิกจนกว่าจะตรวจสอบด้วยคำขอเดิมสำเร็จหรือได้ผลที่ยืนยันแล้ว; recovery มี single-flight guard และไม่ปิดเมื่อ dispatch หรือเมื่อเกิด network exception.
- Browser QA: `npm run dev` พร้อมบน `localhost:3000` แต่ CUA รายงานว่าไม่มี browser/app surface และเปิด `iab` ไม่ได้; `@oai/sky` ตอบว่า native pipe ไม่มีอยู่. จึงยังไม่ได้ตรวจ browser layout, native focus containment, safe area, Escape/Tab ใน browser หรือ virtual keyboard.

## Inventory

ระดับความเสี่ยงในตารางประเมินผลกระทบของ interaction และความผิดพลาดที่ผู้ใช้เห็น ไม่ได้เปลี่ยนการประเมินสิทธิ์ฝั่ง server

### โรงพยาบาลเครือข่ายและคำเชิญผู้ดูแล

| งาน / component | ปัจจุบัน → เป้าหมาย | Mutation, confirmation และ unknown outcome | คืน focus / ความเสี่ยง / หลักฐานทดสอบ |
| --- | --- | --- | --- |
| เปลี่ยนชื่อหน่วยบริการ — `ChildFacilityPanel` + `NetworkMutationForm` | `<details>` แก้ไข inline → Edit Dialog | `renameChildFacilityAction`; คง `parentHospitalId`, `childHospitalId`, `expectedUpdatedAt`; ไม่มี typed phrase; error/conflict อยู่ในฟอร์ม, unknown ใช้ reload | ปุ่มเปลี่ยนชื่อของการ์ดเดิม; กลางเพราะ optimistic concurrency. ทดสอบ prefill, payload, validation/conflict และไม่ปิดก่อน success |
| เชิญ/เปลี่ยนผู้ดูแลลูกข่าย — `ChildFacilityPanel` + `ChildOwnerInvitationForm` | `<details>` → Task Dialog; สร้างลูกข่ายใหม่คงเป็นฟอร์มบนหน้า | คง national ID 13 หลัก, ชื่อ, delivery mode, action/eligibility/nonce/expiry; การเปลี่ยนผู้ถูกเชิญอธิบายว่าคำเชิญและลิงก์เดิมหมดผล; `onSuccess` ยก `InvitationResult` และ one-time activation link ไปเก็บที่ panel หลัง dialog ปิด; unknown ใช้ resend เดิมเมื่อ idempotent หรือ reload | ปุ่มของ facility เดิม; สูงเพราะลิงก์แสดงครั้งเดียว. ทดสอบ recovery, validation, result คงอยู่หลัง refresh และไม่แสดง URL ใน log/storage |
| ออกลิงก์ใหม่/ยกเลิกลิงก์หรือคำเชิญ — `ChildFacilityPanel` | ปุ่มใน card → ยืนยันแบบ destructive ที่กระชับ | คง `issueChildOwnerLinkAction` / `revokeChildOwnerLinkAction`; ยกเลิกลิงก์ไม่เท่ากับยกเลิกคำเชิญ; ใช้ nonce เดิมและ recovery เดิม | ปุ่มที่ตรงกับรายการเชิญ; สูง. ทดสอบขอบเขต invitation/link และกันส่งซ้ำ |
| ยกเลิกลูกข่ายที่รอเปิดใช้งาน — `ChildFacilityPanel` | `<details>` มีเหตุผล แล้ว `ConfirmableActionForm` เปิดอีก dialog → Destructive Task Dialog เดียว | คง `cancelPendingChildFacilityAction`, reason, `confirm` และ parent/child IDs; อธิบายว่าลิงก์/คำเชิญที่เกี่ยวข้องใช้ไม่ได้ แต่ประวัติไม่จำเป็นต้องถูกลบ; unknown ใช้ reload | ปุ่มยกเลิกใน card; สูง. ทดสอบ required reason, payload, conflict, pending และ unknown |
| นำลูกข่ายออกจากเครือข่าย — `ChildFacilityPanel` | `<details>` มีเหตุผล แล้ว confirmation แยก → Destructive Task Dialog เดียว | คง `endServiceAreaAction`, `areaId`, parent scope, `endReason`, `confirm`; ข้อความแยกจากลบ/ระงับโรงพยาบาล; unknown ใช้ reload | ปุ่มของ facility; สูง. ทดสอบ reason, scope และแยกผลจาก cancel/delete/suspend |
| เชิญ/เปลี่ยน/ยกเลิกผู้ดูแลโรงพยาบาลแม่ข่าย — `ParentOwnerInvitationSection` | เชิญแรก inline, เปลี่ยนใน `<details>`, link/cancel ใช้ confirmation เดิม → Task/Destructive Dialog ตามงาน | คง Server Actions ของ Platform ADMIN, availability, ADMIN-specific recovery/eligibility และ submission nonce; ใช้ result holder ของ section เพื่อรักษา one-time link หลัง refresh | ปุ่มใน section ของโรงพยาบาลเดียวกัน; สูงเพราะ ADMIN authority และ one-time link. ทดสอบ availability, distinct authorization path, nonce, cancel/reissue และ result handoff |

### บุคลากรและบัญชีผู้ใช้

| งาน / component | ปัจจุบัน → เป้าหมาย | Mutation, confirmation และ unknown outcome | คืน focus / ความเสี่ยง / หลักฐานทดสอบ |
| --- | --- | --- | --- |
| แก้วิชาชีพ — `StaffMembershipControls` | ฟอร์ม inline → Edit Dialog | คง `updateHospitalMembershipProfessionAction`, ค่า profession, relationship/hospital IDs และ `expectedUpdatedAt`; scoped mutation ปิดได้เมื่อ `SUCCESS` ที่ยืนยันแล้ว; unknown ให้ reload | ปุ่มแก้ไขวิชาชีพ; กลาง. ทดสอบค่าที่อนุญาต, payload, conflict และ MEMBER/OWNER policy เดิม |
| แก้เบอร์ติดต่อ — `WorkforceContactPhoneControl` | ฟอร์ม inline → Edit Dialog โดยยังแสดงเบอร์ปัจจุบัน | คง schema/custom validity, `kind`, relationship/hospital IDs, version, session lock, error และ unknown reload | ปุ่มแก้เบอร์; กลาง. ทดสอบเลขไม่ถูกต้อง, payload, refresh, conflict/unknown |
| ระงับ/คืนสถานะ — staff และ OSM controls | ระงับมี `ConfirmableActionForm`; คืนสถานะ submit ตรง → คง surface ที่เหมาะสมเดิม | คง action, eligibility, server authorization, payload/version และ scoped outcome; ไม่เพิ่ม modal รอบ confirmation เดิม; การคืนสถานะไม่ถูกจัดเป็น destructive โดยอัตโนมัติ | ปุ่ม action เดิม; สูงต่อ authority/assignment. ทดสอบไม่ซ้อน dialog, allowed/denied และสถานะ OSM assignment |
| นำความสัมพันธ์บุคลากรออก — `WorkforceReleaseControl` | `<details>` พร้อม typed phrase → Destructive Dialog | คง phrase, `relationshipId`, `targetHospitalId`, `kind`, `expectedUpdatedAt`, scoped session และ `lockOnSuccess`; unknown reload/reconcile เท่านั้น ห้าม retry อัตโนมัติ | trigger ของแผงควบคุม; หลัง terminal success คืนไปข้อความสถานะ/หัวข้อแทน trigger. สูง. ทดสอบ phrase, scope, rapid submit, unknown lock และ terminal lock |
| ลบ user record — `UserRecordDeleteControl` | `<details>` พร้อม typed phrase → Destructive Dialog | คง deletion blockers, strict server revalidation, expected version, scoped session, conflict และ navigation หลัง confirmed success; unknown reload | เมื่อสำเร็จไป directory ตามเดิม; หากยังอยู่ให้คืนไป directory link/status. สูง. ทดสอบ record เปลี่ยนหลังเปิด, blocker, phrase, conflict, navigation |
| จัดการบัญชีที่สงสัย takeover — `UserTakeoverControl` | `<details>` พร้อม typed phrase → Security/Destructive Dialog | คง lock/suspend/session revoke/LINE/recovery/audit และ reload reconciliation; `retry` ต้องยังหมายถึงทำ provider session revocation ซ้ำสำหรับ lock เดิมเท่านั้น | trigger หรือสถานะผล; สูงสุด. ทดสอบ initial lock แยกจาก retry และไม่ dispatch เมื่อเปิด/ยกเลิก |

### ครอบครัว ผู้ดูแล และ consent

| งาน / component | ปัจจุบัน → เป้าหมาย | Mutation, confirmation และ unknown outcome | คืน focus / ความเสี่ยง / หลักฐานทดสอบ |
| --- | --- | --- | --- |
| แก้ relationship label — `EditRelationshipLabel` | conditional inline form → Edit Dialog | คง `relationshipId`, `expectedVersion` ที่ snapshot เมื่อเปิด, schema/choices และ `dispatchFormDataPreservingInput`; confirmed error คง draft, unknown ใช้ reload; success ปิดและแสดงผล | ปุ่ม edit ใน relationship row; เมื่อ row หายใช้หัวข้อความสัมพันธ์. กลาง. ทดสอบค่า/OTHER draft, version, error และ return target |
| ถอนตัวจากความสัมพันธ์ — `WithdrawCaregiverRelationship` | conditional confirmation → Destructive Dialog | คง `withdrawOwnCaregiverRelationshipAction`, relationship ID และข้อความว่าเชื่อมใหม่ต้องมี invitation ใหม่; unknown reload | ปุ่มใน relationship row; สูง. ทดสอบ identity, cancel ไม่มี mutation, pending/unknown |
| ยกเลิกคำเชิญ/ยุติความสัมพันธ์ — `RevokePendingInvitation`, `RevokeRelationship` | direct submit → Destructive Dialog | คง invitation/relationship IDs, eligible status, actions และ reload recovery; อธิบายประวัติและการเชื่อมใหม่ด้วยคำเชิญใหม่; การเลือกแถวไม่อิง array index | ปุ่มของรายการเดิม; สูง. ทดสอบชื่อคู่สัมพันธ์, status guard, cancel, ID และ unknown |
| สร้างคำเชิญ caregiver — `CreateCaregiverInvitationForm` | inline form และ QR handoff → คง inline | แบบฟอร์มเลือก label, scope/consent หลายรายการและส่งมอบ one-time URL/QR; คงอยู่ในหน้าเพื่อให้กรอกและ handoff บนมือถือได้ครบ | ไม่มี dialog. กลาง/สูง. คง tests ของ scope, QR และ unknown reload; ห้ามลิงก์หายก่อนส่งมอบ |
| สร้างลิงก์/QR ใหม่ — `ShowPendingInvitationQr` | direct submit → destructive confirmation เดียว แล้วแสดง handoff นอก dialog | คง invitation ID และ `reissueCaregiverInvitationLinkAction`; ยืนยันว่าลิงก์เดิมใช้ไม่ได้, คำเชิญเดิมยังรออยู่; unknown reload, ไม่มี resend อัตโนมัติ; one-time URL/QR อยู่ใน stable handoff หลัง success | trigger ของคำเชิญ; สูง. ทดสอบ cancel, payload, link replacement, unknown และการเข้าถึง URL หลัง dialog ปิด |
| ถอน appointment/resource grant | direct destructive submit ใน row → Destructive Dialog | คง grant ID, resource type, scope, consent contract/version, eligibility, action และ recovery; ระบุว่าต้องเสนอใหม่และ caregiver ยอมรับ; acceptance ไม่เปลี่ยนเป็น destructive | trigger ใน grant row; ถ้า row หายคืนไป heading ของ grant list. สูง. ทดสอบ patient/caregiver perspective, scope, status, cancel และ double submit |
| ยอมรับ grant / เสนอ grant / upgrade — `GrantRow`, `ResourceGrantRow`, `ProposeForm`, `UpgradeGrant` | inline consent และ proposal → คง inline | คงข้อความยินยอม, resource/scope, contract version และ action; acceptance เป็น consent ที่ต้องอ่านข้อความเดิม และ upgrade เป็นการเสนอขอบเขตใหม่ | ไม่มี dialog. สูง. ทดสอบ consent wording และ payload โดยตรง |

### คำขอเลื่อนนัด

| งาน / component | ปัจจุบัน → เป้าหมาย | Mutation, confirmation และ unknown outcome | คืน focus / ความเสี่ยง / หลักฐานทดสอบ |
| --- | --- | --- | --- |
| ขอเลื่อนนัด — `RescheduleRequestSection` + `RescheduleRequestForm` | `<details>` → Task Dialog; fullscreen บนมือถือและกล่องมี content scroll บนจอใหญ่ | คง eligibility, appointment/relationship IDs, `preferredDatetimes`, reason, `expectedUpdatedAt`, server-rendered `submissionNonce`; error/conflict ยังคงใน dialog; unknown ล็อกการปิดและส่ง FormData เดิมได้จาก recovery เท่านั้น | ปุ่มของ appointment เดิม; กลาง/สูง. Initial focus ที่ datetime แรก; close คืน focus ไป trigger, success ไป status หรือ heading หาก trigger หาย. ทดสอบ draft, payload, duplicate, validation/conflict/forbidden, unknown resend เดิม |
| ปฏิเสธคำขอพร้อมเหตุผล — same | `<details>` → Destructive Task Dialog เดียว มีเหตุผลและ request context | คง `requestId`, required `rejectionReason`, action/status checks และ unknown resend เดิม; แจ้งว่าคำขอที่ปฏิเสธไม่กลับเป็น pending และไม่เปลี่ยนวันนัด; ไม่กระทบ approval navigation | ปุ่มของ request ID เดิม; สูง. Initial focus ที่ยกเลิก; focus กลับปุ่มหรือ heading เมื่อ trigger ถูกถอด. ทดสอบบริบท, reason, ID, unknown resend เดิม |
| อนุมัติคำขอ — same | link ไปหน้าแก้นัด → คง navigation | หน้าแก้นัดและ workflow approval ไม่ย้ายเข้า modal | คง link/target เดิม. สูง. ตรวจ URL และ request linkage |

## Invariants ที่ใช้กับทุก slice

- ไม่เปลี่ยน Server Action signature, schema, permissions, scope, version, nonce, eligibility, audit หรือ database contract
- Dialog ที่เป็น form ใช้ form เดียว; footer submit ใช้ `form` association หากจำเป็น และไม่ข้าม native validation
- Dialog ปิดหลังผลสำเร็จที่ยืนยันแล้วเท่านั้น; pending ปิดไม่ได้; unknown/conflict คงคำแนะนำและ recovery ของเจ้าของ mutation
- ไม่ซ้อน `ModalDialog` กับ `ConfirmDialog`/`ConfirmableActionForm`; เหตุผลและ typed phrase อยู่ใน destructive dialog เดียวเมื่อจำเป็น
- รายการผลลัพธ์ผูกกับ resource ID; ปุ่ม trigger หรือ logical target ใช้คืน focus หลัง row/action หาย
- ทดสอบที่ระดับ component สำหรับ open/cancel, submit/pending/success/error/conflict/unknown, payload/hidden fields, keyboard semantics ที่ jsdom รองรับ และทดสอบ role/eligibility ผ่าน existing server tests โดยไม่ใช้ UI เป็นขอบเขต authorization
- Browser QA ต้องตรวจ 320px, mobile portrait/landscape, tablet และ desktop รวม native focus containment, scroll, safe area และ keyboard เมื่อ environment พร้อม; หากทำไม่ได้ต้องรายงานเป็น unverified

## UX-D2.5 Regression และ closeout

### สรุป surface ที่ย้ายและที่คงไว้

- โรงพยาบาลเครือข่าย: rename เป็น Edit Dialog; child owner invite/replace เป็น Task Dialog; cancel pending facility และ remove from network เป็น Destructive Task Dialog เดียวที่รวมเหตุผล/confirmation; parent owner invite ใช้สิทธิ์ Platform ADMIN และ result holder เดิม.
- Workforce/users: แก้วิชาชีพและเบอร์ติดต่อเป็น Edit Dialog; release, eligible user deletion และ takeover เป็น Destructive/Security Dialog; suspend/restore ยังคง confirmation/submission เดิมตาม semantics.
- Family/caregiver: แก้ label เป็น Edit Dialog; withdrawal, revoke, reissue link/QR และ appointment/resource grant revocation ใช้ confirmation dialog; one-time link แสดงใน owner presentation หลังปิด dialog.
- Appointments: request/reject ใช้ Task/Destructive Task Dialog และ contextual summary; approval คงลิงก์ไปหน้าแก้นัด.
- คง inline: child facility creation, caregiver invitation ที่ต้องเลือก consent/scope และ handoff QR, grant consent acceptance/proposal/upgrade, status/readback, search/filter/pagination, long clinical forms และ appointment editor.

### Invariant, focus และ responsive

- ไม่มี Server Action signature, server authorization, role/eligibility, network scope, consent, schema, database, nonce/version, audit หรือ recovery contract เปลี่ยนใน UX-D2.
- ไม่มี nested dialog หรือ nested form; footer submission ใช้ native form association; required fields และ typed confirmation เดิมยังอยู่.
- Pending ปิด dialog ไม่ได้; unknown ของ reschedule ต้องใช้ explicit resend ของ payload object เดิมและมี single-flight guard; terminal workforce release/takeover/deletion คง recovery model เดิม.
- การปิด dialog คืน focus ไป trigger; เมื่อ trigger หายใช้ status หรือ logical heading ตาม workflow. jsdom ตรวจ initial focus, status focus, cancel focus และ heading fallback ได้.
- task dialog นัดหมายใช้ `size="fullscreen"` บนมือถือเพื่อรองรับ datetime picker/keyboard และ content scroll แยก; surface อื่นใช้ขนาดตามความยาวงานเดิม.

### Verification

- Focused tests: D2.1–D2.2 ผ่าน 8 files / 99 tests; D2.3 ผ่าน 5 files / 30 tests; D2.4 ผ่าน 2 files / 22 tests.
- `npm run typecheck`: ผ่าน.
- `npm run lint`: ผ่าน.
- `npm test`: ผ่าน 569 files / 6,336 tests. Vitest stderr มี JSDOM `navigation (except hash changes)` logs จาก `app/line/account/line-account-client.tsx` ที่เรียก `Location.replace`; exit code เป็น 0 และไม่มี test fail.
- `impeccable.cmd detect --json` กับ production UI targets ที่เปลี่ยนใน UX-D2: ผ่านและไม่พบ findings (`[]`).
- ไม่ได้รัน `npm run test:integration` แยก: UX-D2 เปลี่ยนเฉพาะ interaction layer และไม่ได้แก้ service/database contract; full repository Vitest ผ่าน.
- Browser QA ไม่ได้ทำ: inventory ไม่มี browser/app surface, `iab` ไม่พร้อม และ native `@oai/sky` pipe ใช้ไม่ได้. `npm run dev` ขึ้น Ready ที่ `localhost:3000` แล้วหยุดโดยไม่ได้ sign in หรือส่ง mutation. ยังไม่ยืนยัน native focus containment, Tab/Escape ใน browser, viewport 320px/mobile portrait/landscape/tablet/desktop, safe area หรือ software keyboard.

### Findings และ readiness

- การทบทวนหลัง closeout พบ P2 สองรายการและแก้แล้ว: task-dialog draft/hidden payload ถูกผูกกับ context key และล้างเมื่อ context เปลี่ยน; takeover provider-session retry แสดงปุ่มและคำเตือนบนหน้า โดยผู้ใช้ต้องกดก่อน dialog เปิด.
- Focused regression follow-up ผ่าน 3 files / 12 tests; `npm run typecheck`, targeted ESLint และ Impeccable detector ผ่าน (`[]`). การ resend หลัง unknown invitation outcome ยังใช้ payload เดิมผ่าน recovery ที่ผู้ใช้กดเอง.
- พร้อมเริ่ม UX-D3 จากมุม code และ automated checks; ต้องทำ browser/device QA สำหรับรายการที่ยัง unverified ก่อนสรุป UX-D2 ว่าผ่าน visual/mobile accessibility validation.
