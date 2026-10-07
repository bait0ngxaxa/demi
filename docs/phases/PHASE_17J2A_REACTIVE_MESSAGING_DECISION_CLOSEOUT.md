# Phase 17J.2A — Reactive Messaging Owner Decision Closeout

- **Phase 17J.2A — CLOSED / OWNER DECISION COMPLETE**
- Owner decision date: **2026-10-07**
- Newly closed owner decisions: **CLOSED / OWNER APPROVED — 2026-10-07**
- **Phase 17J.2B — NOT STARTED**; **Phase 17J.2 runtime — NOT IMPLEMENTED**

## 1. Decision authority and source

เอกสารนี้บันทึกคำสั่ง owner ในงาน “Phase 17J.2A — Owner Decision Closeout” วันที่ 2026-10-07 ซึ่งรับรอง corrected [decision pack](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_PACK.md) ที่ reviewed HEAD `2969f55b91799627d8b05a146801438f65d219c3` และระบุมติ Q01–Q14 โดยตรง ไม่อนุมาน approval จาก recommendation, commit หรือการ push. ทางเลือกและ source audit ใน pack คงเป็นหลักฐานประวัติ; เอกสารนี้เป็น authority ของผล owner closeout

คง [17J.0 architecture](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md) CLOSED, [17J.0B Option C](./PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md) CLOSED / OWNER APPROVED และ [17J.1 implementation](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION.md) IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE. ไม่เปิดมติเดิมใหม่; [17J.1 contract](./PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md) และ [ADR-0009](../adr/0009-demi-line-oa-liff-identity-and-messaging.md) ยังเป็น authority ของ foundation

## 2. Scope of approval

อนุมัติเฉพาะ first reactive business command: **PATIENT SELF appointment lookup, READ ONLY, deterministic Rich Menu business postback, 1:1 LINE, stateless**. เหตุผลคือมี authoritative SELF read path ที่มีประโยชน์และจำกัด privacy/authorization surface. ไม่อนุมัติคำสั่งอื่น, delegated authority, proactive delivery หรือ implementation ในงาน closeout นี้

## 3. Q01–Q14 final closeout table

| ID | Final decision / boundary | Final status |
| --- | --- | --- |
| J2-Q01 | A — PATIENT SELF appointment lookup only; no OSM/Hospital/ADMIN/Family or multi-domain chat | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q02 | A — known deterministic Rich Menu business postback only; no typed command/alias/parser | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q03 | D-NARROW — approved Thai date/time from scheduledAt + Hospital display name only; explicit privacy acknowledgement (§5) | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q04 | A — nearest future canonical SCHEDULED across all currently authorized own relationships; exact semantics §6 | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q05 | “ไม่พบนัดหมายที่กำลังจะมาถึง” only for authorized successful empty; no CTA/link | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q06 | C — no embedded appointment detail/list navigation; reconsider authenticated LIFF in 17J.3 | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q07 | A — generic private refusal + fail closed; silent group/room; separate infrastructure failure copy (§8) | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q08 | presentationRole != authorization; fresh current SELF authority independent of selected workspace | **CLOSED / EXISTING APPROVED ARCHITECTURE — NOT NEWLY DECIDED** |
| J2-Q09 | Transient single-use Reply token; no future-delivery credential, retry key, Push fallback or exactly-once claim | **CLOSED / EXISTING APPROVED ARCHITECTURE — NOT NEWLY DECIDED**; mechanics **OPEN / 17J.2B** |
| J2-Q10 | A — BEST-EFFORT product expectation; safe new tap = new current authorized read, no visible-reply promise | **CLOSED / OWNER APPROVED — 2026-10-07** (product only); mechanics **OPEN / 17J.2B TECHNICAL DESIGN REQUIRED** |
| J2-Q11 | Stateless tap → authorized lookup → reply → done; zero persisted conversation state | **CLOSED / EXISTING APPROVED ARCHITECTURE — NOT NEWLY DECIDED** |
| J2-Q12 | A — minimal sanitized operational telemetry; no ordinary successful SELF clinical-read AuditEvent | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q13 | A — unsupported events/messages sanitized-ignore; no text help reply; existing workspace switch unchanged | **CLOSED / OWNER APPROVED — 2026-10-07** |
| J2-Q14 | A — READ ONLY; no Appointment mutation or proxy/coordination action | **CLOSED / OWNER APPROVED — 2026-10-07** |

## 4. Exact approved Patient SELF command boundary

```text
Linked LINE user taps “ตรวจสอบนัดหมาย” deterministic Rich Menu action
  → verified LINE webhook, recognized business postback, 1:1 source only
  → current server-verified ACTIVE LINE binding
  → current ACTIVE DEMI User / Person actor
  → fresh current PATIENT SELF authorization
  → nearest future canonical SCHEDULED appointment across authorized own relationships
  → only approved Thai date/time + Hospital display name
  → best-effort Reply
  → done
```

นี่คือ product boundary ไม่ใช่ receipt/query/Reply/HTTP 2xx execution order. Exact intent marker/parser และ runtime design เป็นหน้าที่ 17J.2B; งานนี้ไม่เพิ่ม Rich Menu action/assets

LINE source identity เป็น locator ไม่ใช่ authorization. ACTIVE binding ใช้ resolve current DEMI identity; current persisted server authority เป็นผู้ตัดสินทุก command. Multi-role ผู้มี PATIENT SELF ปัจจุบันใช้คำสั่งได้แม้เลือก OSM/HOSPITAL presentation workspace; ไม่มี role precedence หรือ authority จากเมนู. Stale/copied postback ต้องผ่าน binding/actor/SELF ใหม่ ถ้ายัง authorized ให้อ่านข้อมูลปัจจุบัน มิฉะนั้น generic refusal

Appointment/Patient SELF เป็นเจ้าของ facts/policy/query; LINE เป็น transport/presentation. Reuse domain boundary และ explicit narrow projection/mapper; **ห้ามส่ง whole PatientSelfAppointmentItem** หรือสร้าง appointment domain ซ้ำใน LINE

## 5. Exact disclosure projection and privacy acknowledgement

Owner อนุมัติ **D-NARROW** เพียงสอง field:

1. `scheduledAt` rendered as approved Thai date/time
2. Hospital display name ของ own authorized relationship

ไม่อนุมัติ AppointmentStatus label, type, duration, locationType/locationDetail, responsible staff name/profession, OSM identity, acknowledgement, cancellation request/history, audit/version metadata, appointment/PatientHospitalRelationship/User/Person/internal database IDs, Patient/legal name, National ID, HN, phone/address, diagnosis, clinical note, medication หรือ clinical data ใด ๆ. Internal id tie-break เป็น server-only ไม่เปิดเผยใน reply/postback/link/ordinary telemetry

**OWNER PRIVACY ACKNOWLEDGEMENT — CLOSED / OWNER APPROVED — 2026-10-07:** owner ยอมรับโดยชัดแจ้งว่า date/time + Hospital display name ใน 1:1 LINE อาจเปิดเผยการมีอยู่/เวลาของ healthcare activity และ Hospital relationship ผ่าน chat history, notifications/previews, screenshots หรือ shared/unlocked device. Approval จำกัดเฉพาะ reactive Patient SELF command นี้ ไม่ขยายเป็น proactive Push/reminder field approval; **P17D-NOTIF-01 remains OPEN**

## 6. Exact upcoming-selection semantics

- Capture หนึ่ง current server query instant; ไม่ใช้ webhook event timestamp หรือ start of today
- Canonical `status = SCHEDULED` และ `scheduledAt >= captured server query instant`; boundary inclusive
- Order `scheduledAt ASC`, deterministic internal appointment `id ASC`; take exactly 1 (หรือ zero เมื่อไม่มี candidate)
- Query across **all currently authorized own Patient-Hospital relationships** ตาม existing SELF authorization/read model; ไม่เพิ่ม Hospital ACTIVE filter และไม่ใช้ Family 90-day grant window
- นัดที่เริ่มก่อน captured instant ไม่ upcoming แม้ duration ยังไม่จบ; exclude CANCELLED, COMPLETED, NO_SHOW
- Acknowledgement ไม่เปลี่ยน AppointmentStatus. Pending/rejected/superseded cancellation request ไม่ตัด SCHEDULED candidate ออกเอง; canonical AppointmentStatus เท่านั้นควบคุม selection
- Display timezone **Asia/Bangkok**, Thai date/time. เป็น display rule ของ absolute scheduledAt instant ไม่อ้างว่า database เก็บ Bangkok-local business timezone

Semantics สอดคล้อง [17D.0 owner-approved appointment contract](./PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md), [17D.1 implementation](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md) และ Patient SELF evidence E07–E09 ใน pack. ไม่เปลี่ยน canonical status หรือ web interaction permissions

## 7. Approved Thai copy and navigation boundary

Approved content pattern; actual date/Hospital มาจาก authoritative current data:

```text
นัดหมายถัดไปของคุณ
วันที่ 15 ตุลาคม 2569 เวลา 09:00 น.
โรงพยาบาล ...
```

ไม่มี status line และไม่สื่อ attendance confirmation/acknowledgement. Authorized successful empty ใช้ exact copy:

```text
ไม่พบนัดหมายที่กำลังจะมาถึง
```

ใช้เฉพาะ successful identity/binding resolution + current SELF authorization + successful query + zero Q04 candidate. ไม่สื่อว่าไม่มี appointment history/ลบข้อมูล และห้ามใช้แทน authorization, account/context, binding conflict, database/provider/infrastructure failure

**No embedded appointment-list/detail navigation in first slice:** ไม่มี “ดูนัดหมายทั้งหมด”, `/app/personal/appointments`, detail routes, resource IDs, appointment navigation intent ใน builder หรือ authenticated browser-session assumptions. **LINE binding != active DEMI browser session**. Existing authenticated appointment UI valid/unchanged; omission เป็น UX/session-boundary decision ไม่ใช่ security finding. Detailed/list navigation พิจารณาใหม่ใน 17J.3 หลังมี authenticated LIFF lifecycle/auth/session/navigation contract; งานนี้ไม่ implement LIFF

## 8. Failure, refusal and unsupported events

Recognized 1:1 appointment command ที่ establish current eligibility/SELF authority ไม่ได้ ใช้ generic conceptual copy เดียว:

```text
ยังไม่สามารถตรวจสอบนัดหมายผ่าน LINE ได้ กรุณาเปิด “จัดการบัญชี DEMI” จากเมนู
```

17J.2B อาจ normalize punctuation/UI wording โดยคง product meaning. ไม่ embed appointment link; ให้ผู้ใช้เปิด existing account menu เอง. ไม่แยกเหตุ no ACTIVE binding, inactive User, missing PATIENT/PatientProfile, Person/User mismatch, missing own relationship, binding conflict, stale authority หรือข้อมูลบัญชีของผู้อื่น; fail closed ไม่ lookup/disclose appointment โดยไม่มี authority

Infrastructure/query failure หลัง valid authorization ใช้ conceptual copy แยก:

```text
ขณะนี้ยังตรวจสอบนัดหมายไม่ได้ กรุณาลองใหม่ภายหลัง
```

ไม่เผย stack trace/internal state และไม่แทน failure ด้วย empty copy. Missing/expired/unusable Reply token อาจไม่มี reply; no Push fallback/no delayed future-token response. User initiate ใหม่ได้; recovery mechanics remain 17J.2B

Sanitized-ignore arbitrary text, unknown/generic postback, image/audio/video/file/location/sticker, unsupported system events และ group/room Patient commands. Group/room **no Patient lookup/reply/account-status disclosure**. ไม่ส่ง text help ไม่เพิ่ม message/text command, typed “ตรวจสอบนัดหมาย”, alias/parser/fuzzy/NLU/LLM/chatbot/help state. Exact known business postback เท่านั้นเข้า first reactive path; existing 17J.1 workspace-switch postback behavior unchanged. Future exact-text alias ต้อง separately approved extension

## 9. Best-effort delivery product expectation

**CLOSED / OWNER APPROVED — 2026-10-07:** DEMI ไม่สัญญาว่าทุก accepted webhook มีหนึ่ง visible LINE reply. Provider/network/crash/transient transport failure อาจไม่มี visible reply; user กด read-only command ใหม่ได้อย่างปลอดภัย และ new tap เป็น new current authorized read

Owner ไม่อนุมัติ transport/database/recovery algorithm. แยก business-effect deduplication, query execution, Reply transport attempt และ provider-visible delivery. **Duplicate webhookEventId ไม่ได้แปลว่า Reply must never be attempted again**. Eligible redelivered unused token และ ambiguous provider outcome ต้องออกแบบใน 17J.2B; no guaranteed recovery/durable delivery queue/exactly-once visible delivery

คง single-use transient Reply token ใช้ as soon as possible ไม่ persist เป็น future-delivery credential ไม่ใช้ token ที่ใช้แล้ว ไม่มี X-Line-Retry-Key semantics สำหรับ Reply และไม่มี Push fallback. Provider outcome ไม่เปลี่ยน DEMI domain truth; no duplicate domain mutation/effect. Official LINE evidence/timing caveats อยู่ใน [pack §11](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_PACK.md#11-reactive-reply-lifecycle-and-deduplication); closeout ไม่ตรวจ platform docs ใหม่หรือเปลี่ยน timing guarantees

## 10. Logging, privacy and security boundary

Permitted operational telemetry: correlation ID, webhookEventId ที่ permitted ตาม current event-retention policy, canonical intent identifier, sanitized processing outcome/category, safe provider/error category และ duration/latency. ไม่ขยาย retention policy

ห้าม log raw LINE subject/user ID, webhook body, message text, raw postback นอก safe canonical classification, replyToken/access token/profile token/data, Patient/User/Person/relationship/appointment IDs, Hospital internal IDs ที่ไม่จำเป็นเชิง operation, Patient name/National ID/HN, appointment date/time/content, Hospital relationship content ใน ordinary telemetry, diagnosis/medication/clinical data

**ไม่เพิ่ม ordinary successful Patient SELF clinical-read AuditEvent** สำหรับ first lookup. Existing security/lifecycle audits unchanged; future audit requirement ต้อง explicit approval แยก

Postback มี intent marker only ไม่มี IDs/PII/clinical data/token/role/scope authority. No National ID/HN chat lookup, chat OTP, Family expansion หรือ ADMIN operational Patient authority. No appointment mutation, generic NLU/chatbot, Push fallback หรือ exactly-once claim. Domain facts/current authorization authoritative ทุกครั้ง

## 11. Items already closed by prior architecture

Q08, Q09, Q11 **ไม่ได้ newly decided** ใน closeout: preserve presentationRole != authorization และ Option C (17J.0B/17J.1); Reply invariants (ADR-0009 Decision 5, 17J.0 §13); initial stateless UX (17J.0 §22). Menu preference, account lifecycle state และ webhook receipts ไม่ใช่ conversation sessions. ไม่เปิด architecture/identity/account-link decisions ใหม่

## 12. Technical questions intentionally deferred to 17J.2B

**OPEN / 17J.2B TECHNICAL DESIGN REQUIRED:**

- Redelivery-assisted Reply behavior; fresh authorized re-read vs reuse
- Durable receipt placement; exact query/Reply/HTTP 2xx ordering and foundation lifecycle tension
- Multi-event webhook handling; timeout/crash behavior
- Ambiguous provider result; already-used vs unknown/not-attempted outcome without false exactly-once semantics
- Concurrent redelivery handling and current authority guarantees
- Whether bounded receipt-state extension is actually required

Exact postback parser/marker, narrow application query/projection/presentation boundary, safe telemetry/error mapping และ focused verification contract เป็น technical contract obligations เช่นกัน. **ไม่มี migration, queue หรือ delivery-attempt table approved**. ไม่เลือก algorithm หรือเริ่ม technical contract ใน closeout นี้

## 13. Explicit non-goals and unchanged gates

งานนี้ documentation only: ไม่ implement Reply/Push/LIFF, runtime/application code, schema/migration, Rich Menu runtime/assets/catalog/new actions, provider resources/provisioning, persistent conversation/session/pending question/wizard/state machine หรือ appointment mutation (acknowledge/request cancel/direct cancel/reschedule/create/complete/no-show/coordination/proxy/Hospital review). Existing web actions ไม่กลายเป็น LINE approval

ไม่อนุมัติ OSM Patient lookup, Hospital roster, ADMIN operational Patient access, Family/caregiver access, multi-domain routing, medication/follow-up/clinical records/chatbot. ไม่ทำ reminders/notification preferences/consent/quiet hours/retry queues/delivery attempts/generic notification framework, deployment หรือ real-device UAT

Unchanged OPEN/deferred gates: **P17D-NOTIF-01**, proactive appointment event/reminder/content/privacy approval, preferences/consent/quiet hours/proactive retry/Push, medication reminder delivery, **MED-02**, adherence, Follow-up prospective reminder source, Family/caregiver LINE access, **P17F-L04/L05**, **Q5 real-data governance**, **Phase 17E.2 consent**, exact identity-history retention/erasure, future cross-account LINE reconciliation, real LINE provider provisioning, real mobile/device UAT และ production deployment. **17J.3 และ 17J.4 implementation ไม่เริ่ม/ไม่อนุมัติจาก closeout นี้**. Gates อื่นใน CONTEXT คงเดิม

## 14. GO / NO-GO and final status

**GO — drafting Phase 17J.2B — Deterministic Reactive Messaging Technical Contract** ภายใน approved product boundary นี้. **NO-GO — runtime/schema/provider/Rich Menu/LIFF implementation ในงานนี้**. GO สำหรับ technical drafting ไม่ใช่ approval ของ transport algorithm, migrations หรือ readiness/deployment

ลำดับ phase คงเดิม: 17J.0 → 17J.1 → 17J.2A closeout → 17J.2B contract → bounded 17J.2 runtime → 17J.3 → 17J.4 → 17J.5A automated integrated re-audit/UAT readiness → 17J.5B real LINE/mobile/device UAT

**Phase 17J.2A — CLOSED / OWNER DECISION COMPLETE; Phase 17J.2B — NOT STARTED; Phase 17J.2 runtime — NOT IMPLEMENTED.** Exact next step: **Phase 17J.2B — Deterministic Reactive Messaging Technical Contract**. หยุดงานนี้ที่ owner closeout

Documentation validation: strict UTF-8/Thai, preserved existing encoding/line endings, relative Markdown/closeout links, final statuses/approval scope, intended documentation-only diff และ `git diff --check`. ไม่รัน npm test/integration/Prisma migration/reset/Next.js build/dev server; ไม่มี runtime verification claim ใหม่
