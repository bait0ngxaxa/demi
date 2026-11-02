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

## Inventory

ระดับความเสี่ยงในตารางประเมินผลกระทบของ interaction และความผิดพลาดที่ผู้ใช้เห็น ไม่ได้เปลี่ยนการประเมินสิทธิ์ฝั่ง server

### โรงพยาบาลเครือข่ายและคำเชิญผู้ดูแล

| งาน / component | ปัจจุบัน → เป้าหมาย | Mutation, confirmation และ unknown outcome | คืน focus / ความเสี่ยง / หลักฐานทดสอบ |
| --- | --- | --- | --- |
| เปลี่ยนชื่อหน่วยบริการ — `ChildFacilityPanel` + `NetworkMutationForm` | `<details>` แก้ไข inline → Edit Dialog | `renameChildFacilityAction`; คง `parentHospitalId`, `childHospitalId`, `expectedUpdatedAt`; ไม่มี typed phrase; error/conflict อยู่ในฟอร์ม, unknown ใช้ reload | ปุ่มเปลี่ยนชื่อของการ์ดเดิม; กลางเพราะ optimistic concurrency. ทดสอบ prefill, payload, validation/conflict และไม่ปิดก่อน success |
| เชิญ/เปลี่ยนผู้ดูแลลูกข่าย — `ChildFacilityPanel` + `ChildOwnerInvitationForm` | `<details>` → Task Dialog; สร้างลูกข่ายใหม่คงเป็นฟอร์มบนหน้า | คง national ID 13 หลัก, ชื่อ, delivery mode, action/eligibility/nonce/expiry; การเปลี่ยนผู้ถูกเชิญอธิบายว่าคำเชิญและลิงก์เดิมหมดผล; `onSuccess` ยก `InvitationResult` และ one-time activation link ไปเก็บที่ panel หลัง dialog ปิด; unknown ใช้ resend เดิมเมื่อ idempotent หรือ reload | ปุ่มของ facility เดิม; สูงเพราะลิงก์แสดงครั้งเดียว. ทดสอบ recovery, validation, result คงอยู่หลัง refresh และไม่แสดง URL ใน log/storage |
| ออกลิงก์ใหม่/ยกเลิกลิงก์หรือคำเชิญ — `ChildFacilityPanel` | ปุ่มใน card → ยืนยันแบบ destructive ที่กระชับ | คง `issueChildOwnerLinkAction` / `revokeChildOwnerLinkAction`; ยกเลิกลิงก์ไม่เท่ากับยกเลิกคำเชิญ; ใช้ nonce เดิมและ recovery เดิม | ปุ่มที่ตรงกับรายการเชิญ; สูง. ทดสอบขอบเขต invitation/link และกันส่งซ้ำ |
| ยกเลิกลูกข่ายที่รอเปิดใช้งาน — `ChildFacilityPanel` | `<details>` มีเหตุผล แล้ว `ConfirmableActionForm` เปิดอีก dialog → Destructive Task Dialog เดียว | คง `cancelPendingChildFacilityAction`, reason, `confirm`, parent/child IDs และ expected version; อธิบายว่าลิงก์/คำเชิญที่เกี่ยวข้องใช้ไม่ได้ แต่ประวัติไม่จำเป็นต้องถูกลบ; unknown ใช้ reload | ปุ่มยกเลิกใน card; สูง. ทดสอบ required reason, payload, conflict, pending และ unknown |
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
| แก้ relationship label — `EditRelationshipLabel` | conditional inline form → Edit Dialog | คง `relationshipId`, `expectedVersion`, schema/choices, `submitPreservingInput`; error คง draft, unknown reload | ปุ่ม edit ใน relationship row; เมื่อ row หายใช้หัวข้อรายการ/ส่วนที่เกี่ยวข้อง. กลาง. ทดสอบค่า/OTHER draft, conflict, validation และ return target |
| ถอนตัวจากความสัมพันธ์ — `WithdrawCaregiverRelationship` | conditional confirmation → Destructive Dialog | คง `withdrawOwnCaregiverRelationshipAction`, relationship ID และข้อความว่าเชื่อมใหม่ต้องมี invitation ใหม่; unknown reload | ปุ่มใน relationship row; สูง. ทดสอบ identity, cancel ไม่มี mutation, pending/unknown |
| ยกเลิกคำเชิญ/ยุติความสัมพันธ์ — `RevokePendingInvitation`, `RevokeRelationship` | direct submit → Destructive Dialog | คง invitation/relationship IDs, eligible status, actions และ reload recovery; การเลือกแถวไม่อิง array index | ปุ่มของรายการเดิม; สูง. ทดสอบชื่อคู่สัมพันธ์, status guard, rapid submit และ unknown |
| สร้างคำเชิญ caregiver / reissue QR — `CreateCaregiverInvitationForm`, `ShowPendingInvitationQr` | inline form และ QR handoff → คง inline | แบบฟอร์มต้องเลือก label, scope/consent หลายรายการ และส่งมอบ one-time URL/QR; คงอยู่ในหน้าเพื่อให้ใช้งานและ handoff บนมือถือได้ครบ; reissue แสดงผลว่าลิงก์เดิมใช้ไม่ได้ | ไม่มี dialog. กลาง/สูง. คง tests ของ scope, QR และ unknown reload; ห้ามลิงก์หายก่อนส่งมอบ |
| ถอน appointment/resource grant | direct destructive submit ใน row → Destructive Dialog | คง grant ID, resource type, scope, consent contract/version, eligibility, action และ recovery; acceptance ไม่เปลี่ยนเป็น destructive | trigger ใน grant row; ถ้า row หายคืนไป heading ของ grant list. สูง. ทดสอบ patient/caregiver perspective, scope, status และ double submit |
| ยอมรับ grant / เสนอ grant upgrade | inline consent และ proposal → คง inline | คงข้อความยินยอม, resource/scope, contract version และ action; acceptance เป็น consent ที่ต้องอ่านข้อความเดิม และ upgrade เป็นการเสนอขอบเขตใหม่ | ไม่มี dialog. สูง. คง consent/contract tests และตรวจ payload |

### คำขอเลื่อนนัด

| งาน / component | ปัจจุบัน → เป้าหมาย | Mutation, confirmation และ unknown outcome | คืน focus / ความเสี่ยง / หลักฐานทดสอบ |
| --- | --- | --- | --- |
| ขอเลื่อนนัด — `RescheduleRequestSection` + `RescheduleRequestForm` | `<details>` → Task Dialog เต็มจอบนมือถือ | คง eligibility, appointment/relationship IDs, `preferredDatetimes`, reason, `expectedUpdatedAt`, server-rendered `submissionNonce`; unknown resend ต้องส่ง FormData เดิม ไม่สร้าง nonce ใหม่ | ปุ่มของ appointment เดิม; กลาง/สูง. ทดสอบ native required datetime, validation, conflict, unknown resend payload เดิม |
| ปฏิเสธคำขอพร้อมเหตุผล — same | `<details>` → Destructive/Task Dialog พร้อม request context | คง `requestId`, required `rejectionReason`, action/status checks และ unknown resend เดิม; ไม่กระทบ approval navigation | ปุ่มของ request ID เดิม; สูง. ทดสอบ context, required reason, requestId, pending/unknown |
| อนุมัติคำขอ — same | link ไปหน้าแก้นัด → คง navigation | หน้าแก้นัดและ workflow approval ไม่ย้ายเข้า modal | คง link/target เดิม. สูง. ตรวจ URL และ request linkage |

## Invariants ที่ใช้กับทุก slice

- ไม่เปลี่ยน Server Action signature, schema, permissions, scope, version, nonce, eligibility, audit หรือ database contract
- Dialog ที่เป็น form ใช้ form เดียว; footer submit ใช้ `form` association หากจำเป็น และไม่ข้าม native validation
- Dialog ปิดหลังผลสำเร็จที่ยืนยันแล้วเท่านั้น; pending ปิดไม่ได้; unknown/conflict คงคำแนะนำและ recovery ของเจ้าของ mutation
- ไม่ซ้อน `ModalDialog` กับ `ConfirmDialog`/`ConfirmableActionForm`; เหตุผลและ typed phrase อยู่ใน destructive dialog เดียวเมื่อจำเป็น
- รายการผลลัพธ์ผูกกับ resource ID; ปุ่ม trigger หรือ logical target ใช้คืน focus หลัง row/action หาย
- ทดสอบที่ระดับ component สำหรับ open/cancel, submit/pending/success/error/conflict/unknown, payload/hidden fields, keyboard semantics ที่ jsdom รองรับ และทดสอบ role/eligibility ผ่าน existing server tests โดยไม่ใช้ UI เป็นขอบเขต authorization
- Browser QA ต้องตรวจ 320px, mobile portrait/landscape, tablet และ desktop รวม native focus containment, scroll, safe area และ keyboard เมื่อ environment พร้อม; หากทำไม่ได้ต้องรายงานเป็น unverified
