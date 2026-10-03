# Phase 17G.3A — Medication Reminder Occurrence & Adherence Decision Closeout

วันที่จัดทำ: 2026-10-03. Repository: `bait0ngxaxa/demi`.

**CLEARED FOR IMPLEMENTATION — bounded Reminder Occurrence Source only; runtime NOT IMPLEMENTED.** งานนี้เป็น analysis / requirement decision closeout เท่านั้น. Owner อนุมัติ scope และ source semantics ผ่าน interactive answers วันที่ 2026-10-03 ตาม register section 10; ไม่ใช่การอนุมัติจากคำสั่งเริ่ม analysis โดยปริยาย. **Adherence remains deferred and is not part of the cleared runtime slice.** Alternative adherence/materialization semantics ยังไม่อนุมัติ; ต้องจัดทำ 17G.3B contract ก่อน runtime 17G.3C และไม่ implement ในงานนี้.

## 1. Current repository / runtime truth และหลักฐาน

อ่าน [AGENTS.md](../../AGENTS.md) ก่อนตรวจ source. Starting HEAD: `9dc173f8a177aa4bf05ded98ee0e0cb14468bdf9` — `feat(phase-17g2): implement personal medication daily schedules`; local HEAD ตรงกับ remote main ที่ owner รายงาน แต่ไม่ได้ fetch/ยืนยัน remote independently. Starting working tree สะอาด.

| เรื่อง | ความจริงปัจจุบัน / แหล่งหลักฐาน |
| --- | --- |
| Foundation | **17G.1 IMPLEMENTED / CLOSED** สำหรับ MED-01; [contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md), [implementation handoff](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_HANDOFF.md) |
| Daily schedule | **17G.2 IMPLEMENTED / CLOSED**; [contract](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_CONTRACT.md), [implementation handoff](./PHASE_17G2_DAILY_MEDICATION_SCHEDULE_IMPLEMENTATION_HANDOFF.md) |
| Persistence | [schema](../../prisma/schema.prisma): PersonalMedication เป็นของ PatientProfile; ACTIVE/STOPPED; MedicationSchedule เป็น child, TIME(6), unique parent+time, immutable child values. ไม่มี occurrence/adherence/delivery model |
| DB defenses | [foundation migration](../../prisma/migrations/20261002120000_personal_medication_foundation/migration.sql): STOPPED UPDATE ถูกปฏิเสธ; [schedule migration](../../prisma/migrations/20261003120000_daily_medication_schedules/migration.sql): minute/range CHECK, FK RESTRICT, child UPDATE ทุกแบบถูกปฏิเสธ; INSERT/DELETE lock parent ก่อนตรวจ ACTIVE |
| Current schedule mutation | [service](../../src/modules/medications/services/personal-medication-service.ts) `replacePersonalMedicationSchedules`: atomic desired-set replacement, parent.updatedAt เป็น aggregate version, ลบเฉพาะเวลาที่เอาออก/เพิ่มเฉพาะเวลาใหม่; เวลาเดิมรักษา child id/createdAt; identical replacement ยังเพิ่ม version และ audit |
| Current read | [query service](../../src/modules/medications/services/personal-medication-query-service.ts): SELF detail อ่านใน consistent Serializable snapshot; child projection เฉพาะ localTime; ไม่มี child ID ใน Patient DTO; list ไม่ preload schedules |
| Authorization | [SELF policy](../../src/modules/medications/policies/personal-medication-policy.ts), [persisted owner resolver](../../src/modules/medications/services/personal-medication-access-service.ts): ACTIVE User + persisted PATIENT + exact User/Person/PatientProfile; owner มาจาก server ไม่ใช่ client |
| Clock representation | [local-time adapter](../../src/modules/medications/domain/medication-local-time.ts), [definitions](../../src/modules/medications/domain/personal-medication-definitions.ts), [schemas](../../src/modules/medications/schemas/personal-medication-schemas.ts): strict HH:mm; Date เป็น Prisma TIME carrier เท่านั้น ไม่ใช่ occurrence/recurrence instant |
| Boundary / UI | [Server Actions](../../src/modules/medications/transport/server-actions.ts), [bounded form parser](../../src/modules/medications/transport/schedule-form.ts), [Personal workspace](../../app/app/personal/medications/): บันทึกเวลาเท่านั้น; ไม่มี reminder/adherence controls; STOPPED อ่านเวลาที่เก็บไว้ได้ |
| Existing verification source | [PostgreSQL integration test](../../tests/integration/personal-medication.integration.test.ts) มี assertions เรื่อง retained identity, no-op version, STOPPED preservation, zero schedules on retracking, DB guards/races, SELF/deny matrix, audit rollback และ snapshot. ตรวจ source ในงานนี้เท่านั้น ไม่ได้รันทดสอบเหล่านี้ใหม่ |
| Operational infrastructure | [audit service](../../src/modules/audit/services/audit-service.ts), [audit schema](../../src/modules/audit/schemas/audit-schemas.ts), [Serializable helper](../../src/lib/db/serializable-transaction.ts) มีอยู่แล้ว; ไม่ใช่ occurrence ledger หรือ notification infrastructure |

ตรวจ `src`, `app`, `prisma`, `scripts`, package scripts/config และชื่อไฟล์ใน repository แล้ว **ไม่พบ implemented notification domain, medication reminder source, scheduled-job mechanism, queue/outbox หรือ generic event-source/event-bus abstraction** ในขอบเขต source ที่ตรวจ. Stream enqueue สำหรับ file upload และ AuditEvent ไม่ใช่ notification queue. ข้อสรุปนี้ไม่ใช่การยืนยัน infrastructure ภายนอก repository; ไม่สร้างระบบใดโดยอนุมานจากอนาคตของ 17J.

เอกสารกำกับที่ตรวจเพิ่ม: [CONTEXT](../CONTEXT.md), [UAT backlog](./PHASE_17_UAT_BACKLOG.md), [17G.0 decision pack](./PHASE_17G0_MEDICATION_DECISION_PACK.md), [17G.0B owner closeout](./PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md), [17D.0 appointment contract](./PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md), [17D.1 implementation](./PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md). Appointment acknowledgement แยกจาก attendance เป็นตัวอย่าง boundary ที่มีอยู่ ไม่ใช่ authority ให้เพิ่ม medication proxy actions. **P17D-NOTIF-01 OPEN; NOTIF-01 REQUIREMENT-GATED; 17J future / requirement-gated.**

### Owner-confirmed migration evidence

Owner รายงานจากภายนอกหลัง implementation review ว่า migration **`20261003120000_daily_medication_schedules`** apply สำเร็จแล้ว: **Migration application was confirmed externally by the owner; no deployment command output is attributed to this agent.** ไม่ระบุ environment, ไม่อ้าง production PASS, ไม่อ้าง agent execute deployed migration และไม่มี command output ที่ยืนยัน deployment ในงานนี้. ไม่ได้ imply browser/device UAT PASS. ข้อความ deployment-not-executed ใน handoff 17G.2 เป็นหลักฐาน ณ งานเดิมและรักษาไว้; current addendum ใน CONTEXT/backlog บันทึกหลักฐานใหม่แยกกัน.

## 2. Existing approved decisions — ใช้ต่อ ไม่เปิดใหม่

**17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED** ตาม 17G.0B. G2-OD01/G2-OD02 CLOSED / OWNER APPROVED ตาม 17G.2 contract.

- MED-01 คือ Patient-maintained personal medication tracking; exact Patient SELF เท่านั้น. Patient อื่น, OSM/assigned OSM, Hospital MEMBER/OWNER, routine Platform ADMIN และ Family/caregiver DENY. Multi-role Patient ใช้ได้เฉพาะ own SELF.
- PersonalMedication ACTIVE / STOPPED; STOPPED terminal และไม่ใช่คำสั่งหยุดรับประทานยา. ติดตามใหม่สร้าง PersonalMedication ใหม่ที่เริ่มด้วย **zero schedules** ไม่ copy จากรายการเก่า.
- PersonalMedication 1→N MedicationSchedule; 0..1,440 unique daily minutes, canonical HH:mm, Asia/Bangkok. ไม่มี timezone setting, weekdays, complex recurrence, date ranges, PRN หรือ meal ontology.
- Schedule mutation เฉพาะ ACTIVE; STOPPED เก็บชุด schedule สุดท้าย read-only. Parent.updatedAt เป็น aggregate optimistic version ร่วมกับ text edit/stop.
- Q44: adherence ต้องตัดสินแยกใน 17G.3; ไม่มี adherence events ใน 17G.1/17G.2. การ defer เดิมไม่ใช่ requirement ให้ implement adherence ตอนนี้.
- Q45: 17G owns approved schedule/reminder **SOURCE**; 17J owns notification **DELIVERY**.
- Medication independent from Goal Plan; MED-02 ยัง REQUIREMENT-GATED. Family appointment grants ให้ MED-01 authority **ZERO**.

## 3. Reminder source กับ delivery เป็นคนละ domain

Occurrence คือ deterministic scheduled tracking point ที่อาจ eligible ให้ 17J ใช้ในอนาคต. ไม่ใช่ notification, delivery request, consent หรือ intake fact.

```text
PersonalMedication
    │ exact SELF / ACTIVE lifecycle
    └── MedicationSchedule
            │ localTime + Asia/Bangkok local calendar date
            ▼
    17G.3 Reminder Occurrence Source (proposed; not implemented)
            │ source contract only / minimum internal projection
            ▼
    17J Notification Delivery (future / requirement-gated)
            ├── preference / opt-in / consent
            ├── recipient / address / device
            ├── channel / provider / content disclosure
            ├── quiet hours
            ├── duplicate suppression
            ├── retries / delivery attempts
            └── delivery status
```

17G ไม่เลือก LINE/push/email/SMS, recipients, delivery consent, quiet hours, retry/escalation, device tokens หรือ provider payload. Source records ต้องไม่กลายเป็น generic notification queue. ไม่มีเหตุให้สร้าง generic event bus/outbox เพื่อให้ diagram สมมาตร.

**Delivered/opened ไม่เท่ากับ taken; not delivered ไม่เท่ากับ missed. Silence ไม่เป็น assertion.** ไม่สร้าง clinical inference จาก schedule, occurrence, clock หรือ delivery.

## 4. Occurrence model analysis — derived vs materialized

### 4.1 Identity และ time semantics ที่เสนอ

Conceptual identity: **`MedicationSchedule.id + Asia/Bangkok YYYY-MM-DD`**. ตัวอย่าง child S เวลา `08:00` กับวันที่ `2026-10-04` แทน source หนึ่งจุด; S วันที่ถัดไปเป็นคนละจุด. Parent.updatedAt, medicationName และ query execution time **ไม่เป็นส่วนของ identity**: no-op replacement/text edit ไม่ควรสร้าง duplicate source identity. คนละ medication ที่ชื่อ/เวลาเหมือนกันยังเป็นคนละ source.

17G.3B ควรระบุ canonical, versioned namespace/encoding และ opaque deterministic source-key representation สำหรับ server-to-server use ที่สร้างจาก tuple นี้; encoding/hash choice และ collision handling เป็น engineering detail ที่ต้องทำให้ชัดใน contract ไม่ใช่ delivery ID. ไม่จำเป็นต้องเพิ่ม key column, secret/env หรือเปิด child UUID ใน Patient DTO. Source key ไม่ใช่ bearer credential และไม่ grant access; การรู้ key ไม่ทำให้ resolve medication ได้. อย่าออกแบบ delivery attempt ID ใน 17G.

Occurrence ประกอบจาก stored localTime + validated Asia/Bangkok calendar date ไม่อ่าน browser timezone, Patient timezone preference หรือ Date carrier's `1970-01-01`. แปลงเป็น due instant เฉพาะ boundary ที่ต้อง compare/query หรือส่งให้ 17J; ไม่เก็บ arbitrary UTC recurrence timestamps. Contract รอบถัดไปต้อง verify time conversion ที่ใช้จริงและตัวอย่างข้ามวัน; งานนี้ไม่เลือก API/library ใหม่.

เที่ยงคืน: วันที่ D เวลา `00:00` เป็น occurrence แรกของ D; `23:59` เป็นของ D; `00:00` วันถัดไปมี date/key ใหม่. ใช้ calendar-day iteration ไม่ใช้ browser date หรือ UTC date เป็น identity date. Window boundary และ equality ณ evaluation instant อยู่ G3-OD13; ไม่มี implicit overdue/missed state.

### 4.2 เปรียบเทียบ persistence

| ประเด็น | A — Deterministic derived | B — Pre-materialize | C — Hybrid / lazy materialize |
| --- | --- | --- | --- |
| Future storage | ไม่มี occurrence rows; bounded computation | rows โตตาม medications × times × days; ห้ามสร้างอนาคตไม่สิ้นสุด | rows ตามการใช้งาน แต่ยังต้องมี lifecycle/retention |
| Jobs | query on demand ไม่ต้องมี scheduler | ต้องมี horizon refill/cleanup หรือ explicit materialization process | lazy write ไม่จำเป็นต้อง cron แต่ query อาจกลายเป็น mutation |
| Edit/stop | fresh snapshot ใช้ current ACTIVE/current children; ไม่มี stale future rows ใน 17G | ต้อง invalidate/supersede future rows โดยรักษาหลักฐานที่อนุมัติ | ต้องจัดการ rows ที่สร้างแล้วและ consistency กับ current state |
| Identity / idempotency | tuple deterministic; repeated reads ได้ key เดิม ถ้า source ยังอยู่; ไม่รับประกัน exactly-once delivery | unique identity constraint + atomic insert/reconcile จำเป็น; random row id ลำพังไม่แก้ dedupe | unique tuple + concurrent lazy-create protection จำเป็น |
| 17J duplicate suppression | ให้ stable input key; 17J เก็บ suppression/attempt state เอง | 17J ยังต้อง dedupe เอง; occurrence row ไม่ใช่ delivery status | เหมือน B และต้องแยก materialization lifecycle จาก attempts |
| Historical traceability | **ไม่มี historical occurrence ledger**; child ที่ลบ reconstruct อย่างน่าเชื่อถือไม่ได้ | อาจรักษาหลักฐาน durable ได้ ถ้ามี approved snapshot/retention semantics; precreated row ไม่พิสูจน์ว่า notification ส่งหรือยา taken | หลักฐานเฉพาะจุดที่ materialize; ไม่ใช่ complete history |
| Adherence reference | FK ไป child ที่ลบไม่ได้เป็น durable historical binding | durable occurrence อาจรองรับ fact reference แต่ต้องกำหนด immutability/correction | มีได้เมื่อ materialize ก่อนรับ assertion แบบ atomic; เพิ่ม failure/race paths |
| Midnight | canonical local date + explicit window/asOf; deterministic ไม่พึ่ง job rollover | job rollover/late run/concurrent fill ต้องจัดการ | date calculation และ creation races ต้องจัดการ |
| Audit/storage | pure calculation ไม่เขียน AuditEvent | ต้องตัดสิน machine attribution, lifecycle audit/retention แยก; ไม่จำเป็นต้อง audit ทุก row | lazy query side effects/audit/privacy ต้องกำหนด ไม่อ้างว่าเป็น ordinary read |

**Approved bounded choice (G3-OD01/OD02/OD14=A): A derived, no historical ledger in first slice.** Owner อนุมัติจากคำถามชุด model/source โดยรับข้อจำกัดเรื่อง historical proof แล้ว. Stable child identity ใน 17G.2 ทำให้ไม่ต้องสร้าง table เพียงเพื่อมี duplicate-suppression key; ไม่มี future materialization, scheduler, stale rows, write idempotency หรือ retention framework ที่ยังไม่จำเป็น. Query complexity ต้อง bounded ตามจำนวน scoped schedules × local dates; horizon อย่างเดียวไม่พอเมื่อมีหลายรายการยา ต้องมี result/work bound และ deterministic paging โดยไม่ silently truncate.

ความเสี่ยง: current children ไม่ใช่ revision history; createdAt เป็น insertion instant ไม่ใช่ commit timestamp หรือ proof ว่าจุดนั้นเคย eligible. Schedule audit ไม่มี times/child IDs จึง rebuild ledger ไม่ได้. STOPPED เก็บชุดสุดท้าย ไม่ได้เก็บทุกชุดก่อนหน้า. การได้ key จากการคำนวณไม่พิสูจน์ว่าระบบเคย observe source ณ due time.

หาก owner ต้องการ proof of historical existence หรือ durable occurrence-bound adherence ต้องกลับมาประเมิน durable occurrence/schedule revision/snapshot design และ FK/retention ที่อนุมัติ. การผูก adherence กับ raw deleted child หรือ hash อย่างเดียวไม่เพียงพอ. Persistence กลายเป็นข้อจำเป็นเมื่อ approved facts ต้องคงอยู่หลัง source ถูกลบ ไม่ใช่เพราะอาจมี delivery ในอนาคต. อย่าย้อนสร้างประวัติจาก current schedules แล้วเรียกว่า historical evidence.

## 5. Schedule edits / STOPPED semantics

ข้อเท็จจริงด้านซ้ายมีอยู่แล้ว; behavior ของ occurrence ด้านขวาได้รับ **OWNER APPROVAL ใน 17G.3A (OD05/OD06/OD13)** แล้ว แต่ยัง NOT IMPLEMENTED. 17G.2 contract ไม่ได้อนุมัติ occurrence/backfill ในงานเดิม; approval ใหม่นี้บันทึกแยก ไม่เขียนทับ historical evidence.

| การกระทำ / source จริง | Occurrence recommendation สำหรับ source-only slice |
| --- | --- |
| ACTIVE มี schedules | ให้ derive เฉพาะ current committed ACTIVE + children ใน consistent snapshot; zero schedules → zero sources |
| เพิ่มเวลา | child ใหม่, identity ใหม่; eligible ครั้งแรกที่เวลาอนาคตหลัง commit และ ณ reference instant ของ query; ไม่ย้อนเติมเวลาที่ผ่านไป |
| เอาเวลาออก | row ถูก DELETE จริง; fresh calculation ไม่มี future source ของ row นั้น; ไม่มี historical occurrence rows ให้ลบ/แก้ |
| เปลี่ยน 08:00→09:00 | delete old + insert new (ไม่ UPDATE child); key family ใหม่; ไม่ย้าย old identity ไปเวลาใหม่ |
| แทนที่ชุดเดิม / เปลี่ยนลำดับ input | child IDs เดิม; parent version/audit เพิ่มตาม implementation; occurrence identity เดิม |
| ลบแล้วเพิ่มเวลาเดิมภายหลัง | child ใหม่แม้ HH:mm เท่ากัน; key ใหม่ ไม่ revive removed identity |
| แก้ก่อนเวลาเก่าวันนี้ | เช่น 07:00 เปลี่ยน 08:00→09:00: fresh query มี 09:00 วันนี้ถ้ายัง future; ไม่มี 08:00 เก่า |
| แก้หลังเวลาเก่าวันนี้ | เช่น 10:00 เปลี่ยน 08:00→11:00: 11:00 วันนี้ยัง future; ไม่ rebuild 08:00 วันนี้. เปลี่ยนเป็น 09:00 ที่ผ่านแล้ว: เริ่มวันถัดไป |
| เพิ่มเวลาที่ผ่านวันนี้ / แก้ตอนเที่ยงคืน | ไม่ backfill วันนี้; exact equality/first eligible boundary ต้องเลือก G3-OD13 ไม่ใช้ incidental timestamp rounding |
| ACTIVE→STOPPED | parent terminal; child set preserved read-only; เสนอ no future sources จาก STOPPED. ไม่ทำ schedule-history mutation; ไม่อ้าง cancellation ของ queued delivery |
| ติดตามใหม่ | new PersonalMedication + zero schedules; ไม่ derive จาก old STOPPED children และไม่ copy occurrence/adherence |

**No retroactive backfill** และใช้เฉพาะ current committed state เป็น product-visible source semantics ที่ owner อนุมัติผ่าน G3-OD05/G3-OD06/G3-OD13 ใน session นี้. Q39/17G.2 อนุมัติ lifecycle/history แล้ว แต่ไม่ได้ implement หรืออนุมัติรายละเอียด occurrence eligibility โดยอัตโนมัติ. Q45 กำหนด source/delivery ownership แล้ว; ไม่ต้องเปิด Q45 ใหม่.

Future read อาจเห็น coherent snapshot ก่อน concurrent edit/stop commit; snapshot ไม่ใช่ guarantee ว่า row ยัง eligible เมื่อส่งจริง. 17G.3B ต้องกำหนด fresh source revalidation และ returned aggregate version เป็น internal freshness evidence ที่ **ไม่เปลี่ยน key**; 17J ต้องตัดสิน timing/in-flight policy ของตนเอง. Source ที่ 17J เคยรับไปอาจ stale แม้ 17G ไม่มี persisted occurrence rows. ไม่ claim automatic cancellation หรือ exactly-once delivery.

Derived first slice ไม่ rebuild past/today elapsed points. Historical queries ไม่ให้ reconstruct arbitrary past dates จาก surviving schedules. การคำนวณวันพรุ่งนี้ไม่ใช่ persistence ของวันพรุ่งนี้ และ future query ไม่สร้าง intake facts.

## 6. Query horizon — product semantics vs technical bound

เสนอ server-only bounded `from/to` source query ภายใต้ authorized owner/parent scope, deterministic due-time/key order และ consistent current-state snapshot; next-occurrence convenience ไม่ต้องเพิ่มหาก interval primitive พอ. ชื่อ signature/DTO ในที่นี้เป็นแนวคิด ไม่ใช่ service ที่สร้างแล้ว.

Owner อนุมัติ future-only/no-backfill, strict future equality boundary และไม่มี elapsed source lookup/catch-up สำหรับ first slice แล้ว (OD06/OD07/OD13). Engineering เลือก half-open window `[from,to)`, strict validation, calendar-day/work/result bounds, cursor/error semantics, server-controlled reference instant และ conversion หลัง approval. Lookahead เช่นไม่เกินหลายวันเป็น technical safety bound ไม่ใช่ clinical frequency; **ยังไม่กำหนดจำนวนวันสุดท้าย**. ไม่มี worker cadence, dispatch deadline, reminder frequency หรือ recurring job ใน 17G.3A.

Owner-approved G3-OD13=A: ใช้ `dueAt > evaluationAsOf` ร่วมกับ `[from,to)` และไม่อนุญาต past-source catch-up ใน first slice; 17J อาจ consume future lookahead แล้วรอถึง due instant ภายใต้นโยบายที่อนุมัติแยก. ข้อจำกัด: ถ้า 17J ไม่เคยอ่านก่อน due point จะใช้ first-slice query เพื่อ reconstruct elapsed event ไม่ได้. หากต้องการ polling-at-due/late-source lookup ต้องตัดสิน source semantics เพิ่มก่อน implement; **delivery retry ไม่ใช่ source backfill**. ย้อน from เป็นอดีตโดยเงียบ ๆ เพื่อรองรับ worker ไม่ได้.

## 7. Adherence decision analysis / safety

**OWNER APPROVED: defer adherence ทั้งหมดสำหรับ first occurrence-source slice (OD01=A / OD08=A exclusion).** ไม่พบ customer evidence ใน source/approved contracts ที่บังคับให้ persist intake now. Q44 เพียงกำหนดให้ตัดสินแยก ไม่ใช่ approval ของ taken/missed fields.

Schedule แทนสิ่งที่ Patient เลือกติดตาม; ไม่ใช่ prescription instruction, physician order หรือ clinical administration record. Occurrence แทน scheduled tracking point; ไม่พิสูจน์ clinical due, notification delivered หรือ taken. ถ้าอนุมัติ explicit action ภายหลัง นั่นคือ **Patient-entered personal assertion** ไม่ใช่ clinician-verified administration, reconciliation, compliance evidence หรือ outcome evidence โดยอัตโนมัติ.

| Vocabulary option | ผลต่อ product / engineering |
| --- | --- |
| A — none yet | ไม่มี adherence persistence/actions/history; source-only scope ชัดและเล็กที่สุด |
| B — explicit SELF TAKEN only | positive Patient assertion; ต้องแยก intended occurrence date/time จาก assertedAt และ actual intake time ถ้าจะเก็บ; ไม่ตีความ absence เป็น MISSED |
| C — explicit SELF TAKEN / SKIPPED | เพิ่ม intentional Patient vocabulary; ต้องกำหนดคำอธิบาย/correction และเหตุผล optional/required แยก; SKIPPED ไม่ใช่ advice ให้ข้ามยา |
| D — broader MISSED / DELAYED etc. | ต้องมี explicit meanings, reference time, cutoff และ correction; ไม่ให้ clock/delivery สร้าง MISSED อัตโนมัติ |

ถ้าเลือก adherence: G3-OD08 ถึง G3-OD11 ต้องปิดก่อน contract; ต้องกำหนด entry window (ย้อนหลัง/อนาคต), attribution/assertedAt, allowed multiplicity, correction reason/history/retention และ safe idempotency/concurrency. คำว่า minimal ไม่ทำให้ semantics เหล่านี้หายไป. Extra adherence decisions เก็บใน contract แยกหลัง scope approval ไม่แอบรวมใน source-only runtime.

Immutable assertions อาจคงประวัติแต่แก้ความผิดพลาดไม่ได้ถ้าไม่มี superseding event; append-only corrections ให้ history แต่ต้องกำหนด current interpretation/access/retention; mutable current status ง่ายกว่าแต่ไม่ควรอ้าง immutable history. ทุก mutation ต้องใช้ SELF server authorization และ transactional minimal audit; ต้องกำหนดว่าบันทึก/แก้กับ STOPPED ได้หรือไม่ใน adherence contract ใหม่ ไม่ใช้ schedule edit permission เป็นข้อสรุป.

Occurrence-bound fact เป็น architecture recommendation ที่สื่อ intended point ชัดกว่า medication-only หรือ schedule-only; ไม่ใช่ approved business rule. Medication-only รองรับ unscheduled assertions แต่ไม่รู้ว่าหมายถึงเวลาใด; schedule-only แยกแต่ละวันไม่ได้. Occurrence-bound approach ต้องรักษา historical binding หลัง schedule delete; ต้องมี durable design ไม่ผูก FK กับ deletable child โดยไม่แก้ invariants.

**ไม่มี automatic missed dose, percentages/compliance scoring, compliant/non-compliant labels, clinical adherence inference, staff/family alerts หรือ Goal Plan sync ใน phase นี้.**

## 8. Authorization / privacy / audit boundary

| Actor | MED-01 / proposed SELF source access | Adherence หากอนุมัติภายหลัง |
| --- | --- | --- |
| Exact eligible Patient SELF | own only; server-derived owner | เสนอ own SELF assertion only; G3-OD09 ยัง pending หากเปิด adherence |
| Another Patient | DENY | DENY |
| OSM / assigned OSM | DENY | DENY |
| Hospital MEMBER / OWNER | DENY | DENY |
| Routine Platform ADMIN | DENY | DENY |
| Family / caregiver / appointment grant | DENY | DENY; ไม่ใช้ appointment proxy grant |
| Eligible multi-role Patient | own SELF only | own SELF only; role อื่นไม่เพิ่ม scope |

17J future internal consumer ไม่ใช่ Patient actor และไม่ทำให้มี system-wide medication read authority วันนี้. First contract เสนอ reuse exact SELF gate/resolver สำหรับ exposed queries และไม่สร้าง global all-Patient scan/API. การใช้ system principal, delegated processing authority และ current account eligibility ของ 17J ต้องมี approved system/privacy contract ภายหลัง; ห้าม impersonate Patient หรือใช้ ADMIN bypass เพื่อส่งแจ้งเตือน. Source boundary ต้อง fail closed หาก authority ยังไม่มี.

Minimum internal source proposal: opaque sourceKey, source kind/version, Asia/Bangkok localDate/localTime, due instant เมื่อ boundary ต้องการ, internal owner reference จาก parent และ internal parent locator/version สำหรับ revalidation เท่าที่จำเป็น. Owner reference **ไม่ใช่ notification recipient**. ไม่ส่ง actor/profile ownership IDs ให้ browser เพิ่ม; ไม่ใช้ client owner เป็น authority.

Generic source payload ไม่ควรมี National ID, HN, Patient name, phone/address, caregiver data, Hospital membership, instructionText หรือ unnecessary medication content. **Medication name เองเป็น sensitive content**: default source projection ไม่รวมชื่อ; หาก 17J ต้องใช้ display name ให้แยก approved minimum projection/access boundary หลัง privacy decision ไม่ copy full medication DTO. Final notification disclosure, LINE/push lock-screen text และ provider content เป็น 17J gate ไม่กำหนดที่นี่.

Audit: ordinary source query และ pure derivation **NO AuditEvent**, ไม่สร้าง audit ต่อ calculated occurrence และไม่เพิ่ม parent.updatedAt จาก read. Current schedule mutation audit มีหนึ่ง event ต่อ accepted replacement, ไม่มี metadata/time/name; ไม่ใช่ historical ledger. [audit schema](../../src/modules/audit/schemas/audit-schemas.ts) ไม่ได้บล็อก medicationName/times ทุกชื่อ จึงต้อง enforce allowlist ที่ callsite เช่นเดิม. หาก adherence อนุมัติ mutation/correction ต้อง auditable แบบ atomic/minimal; delivery attempts/state เป็น 17J. Materialization ถ้าเลือกต้องออกแบบ audit/storage/retention แยก ไม่ใช้ read-audit flood แทน durable domain facts.

## 9. Exact 17J handoff boundary ที่เสนอ

17G อาจให้ **stable source identity + currently eligible date/time/instant + internal owner/reference + approved minimum display projection เท่านั้น**. ต้องแยก key stability ออกจาก freshness/revalidation. ผล query ไม่เป็นคำสั่งส่ง, ไม่เลือก recipient, ไม่พิสูจน์ consent และไม่รับประกันว่า delivery ยัง permitted.

17J owns consent/opt-in/preferences, recipients/addresses/devices/channels, quiet hours, duplicate suppression, late/queued/in-flight handling, retries/attempt state/status, provider integration/payload และ disclosure. Source key เป็น input ของ suppression ไม่ใช่ suppression implementation ใน 17G. Delivery lifecycle/retention evidence ไม่ควรย้อนมากำหนด medication occurrence status โดยปริยาย. หาก 17J ต้องการ historical source proof ต้องกลับมาตัดสิน G3-OD14 ไม่อ้างว่าปัจจุบันมี ledger.

## 10. Numbered owner-decision register

Owner evidence วันที่ 2026-10-03 จาก interactive answers ใน session นี้:

1. **“A — Occurrence source เท่านั้น; defer adherence (แนะนำ)”** → OD01=A; OD08=A exclusion only; OD09–OD11 deferred/out of source slice. คำตอบนี้ลำพังไม่ได้ approve source semantics อื่น.
2. **“อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ)”** → approved A ทุก ID ในชุด: derived/no table, internal opaque scheduleId+Bangkok localDate key, localTime+Bangkok date/boundary instant, ACTIVE-only/no future STOPPED, current committed set/no backfill/stable unchanged child/new key on remove-re-add, no historical ledger. คำถามแสดงข้อจำกัดหลังลบ schedule และไม่กำหนด queued-delivery cancellation ชัดเจน.
3. **“อนุมัติชุด OD07/12/13 ตามนี้ (แนะนำ)”** → approved A ทุก ID ในชุด: bounded future from/to (numeric limits ใน 17G.3B), minimum internal projection/no default medication name/no 17J system authority now, dueAt>evaluationAsOf + [from,to), no elapsed/catch-up source lookup. คำถามแสดงข้อจำกัดกรณี 17J ไม่เคย prefetch ก่อน due time และแยก delivery policy ชัดเจน.

เหตุผล/ผลกระทบของแต่ละตัวเลือกอยู่ในตารางและ sections 4–9; owner ไม่ได้ส่ง rationale เพิ่มนอกเหนือจากการเลือกชุดตามที่แสดง จึงไม่แต่ง rationale ในนาม owner. Existing approved boundaries ถูกใช้ต่อ ไม่ reopen SELF/timezone/Q45. ตารางเก็บเหตุที่เดิม unresolved พร้อม options ไว้ให้ตรวจย้อนหลัง; status/answer columns คือ current closeout truth.

| ID / decision | ทำไมเดิม unresolved | Options | Engineering consequence | Product / privacy consequence | Recommended bounded option / approved selection | Owner answer | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G3-OD01 — First slice scope | Q44 defer decision; ไม่มี customer requirement บังคับ adherence now | A source only/defer adherence; B source + minimal explicit adherence; C broader adherence lifecycle | A pure query; B/C ต้อง fact persistence/actions/corrections | B/C เพิ่ม personal intake/clinical interpretation risks | **A** | Owner เลือก A — Occurrence source เท่านั้น; defer adherence ผ่าน interactive question 2026-10-03 | CLOSED / OWNER APPROVED |
| G3-OD02 — Occurrence persistence | ไม่มี occurrence/history requirement ที่อนุมัติ | A deterministic derived; B ahead materialization; C hybrid/lazy | A ไม่มี table/job; B/C uniqueness/reconcile/storage/retention; deleted-child binding | A ไม่ให้ historical proof; B/C เก็บ sensitive history เพิ่ม | **A ถ้า OD01=A และ OD14=A** | Owner อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD03 — Canonical source identity | 17G.2 รักษา IDs แต่ไม่ได้อนุมัติ occurrence contract | A scheduleId+Bangkok localDate opaque key; B medication+time+date; C persisted occurrence identity เมื่อมี ledger | A stable unchanged child; B conflates remove/re-add; C persistence lifecycle | ไม่มี child-ID disclosure ใหม่; key ไม่เป็น authority | **A**, server-only versioned deterministic representation | Owner อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD04 — Local date/time | Q37 timezone ปิดแล้ว แต่ occurrence date/boundary ยังไม่มี | A localTime+Bangkok local date, boundary conversion only; B defer occurrence until date semantics chosen | A calendar dates canonical; ไม่เพิ่ม UTC recurrence/browser timezone | ยึด approved timezone; ไม่เปิด configurable timezone | **A**; timezone เดิมไม่เปิดใหม่ | Owner อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD05 — Eligible medications | ACTIVE/STOPPED approved แต่ source eligibility ยังไม่ implement | A current ACTIVE only/no future STOPPED; B defer source eligibility pending explicit rule | A current-state filter/revalidation; immutable history unchanged | STOPPED ไม่ใช่หยุด intake; ไม่สัญญา queued delivery cancellation | **A**; confirm source extension of lifecycle | Owner อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD06 — Schedule edits | 17G.2 ไม่อนุมัติ occurrence/backfill semantics | A current committed set, first future time, no backfill; B explicitly defined historical ledger/backfill; C defer | A removed child disappears/new key; B revisions/snapshots and stronger consistency | A elapsed today ไม่ถูกสร้างย้อนหลัง; B history meaning/retention เพิ่ม | **A** ตาม section 5 รวม identical replacement stable key | Owner อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD07 — Source query horizon | ไม่มี consumer contract/catch-up decision | A bounded future from/to; B next occurrence(s) only; C broader historical lookup | A flexible bounded interval/paging; B narrower consumer; C ledger requirement | ไม่ใช่ reminder clinical frequency; numeric safety cap เป็น engineering | **A**; exact max days/work/result bounds ใน 17G.3B | Owner อนุมัติชุด OD07/12/13 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD08 — Adherence vocabulary | Q44 ไม่ได้เลือก intake fact | A none; B explicit TAKEN; C explicit TAKEN/SKIPPED; D broader explicit states | B–D schema/actions/validation; no clock-generated MISSED | personal assertion เท่านั้น; no scoring/clinical evidence | **A** สำหรับ first slice | Owner explicitly defer adherence ในคำตอบ OD01=A (2026-10-03); ไม่มี fact vocabulary ใน slice นี้ | CLOSED / OWNER APPROVED exclusion only |
| G3-OD09 — Adherence actor | ไม่มี adherence operation approved; MED-01 SELF boundary immutable | A no adherence operation yet; B explicit SELF only if adherence approved | B independent SELF authorization; no proxy/role fallback | Family/OSM/Hospital/ADMIN ไม่ได้ grant intake-record authority | **A ตอนนี้; B ถ้าอนุมัติ adherence แยก** | Owner defer adherence ผ่าน OD01=A; actor semantics สำหรับ future adherence ยังไม่ได้เลือก | DEFERRED / OUT OF SOURCE SLICE |
| G3-OD10 — Correction/history | ไม่มี fact lifecycle/reason/history/retention choice | A immutable assertions; B append-only superseding corrections; C mutable current status; defer | ต้องเลือก history/current interpretation, reason, idempotency/audit; unanswered blocks adherence | sensitive correction/history visibility และ retention ต้องชัด | **Defer พร้อม adherence**; หากจำเป็นพิจารณา B ใน contract แยก | Owner defer adherence ผ่าน OD01=A; future adherence choice ยังไม่ได้เลือก | DEFERRED / BLOCKS FUTURE ADHERENCE |
| G3-OD11 — Adherence binding | intended event ยังไม่ถูกเลือก | A occurrence-bound; B medication-only; C schedule-only; defer | A durable binding หลัง child delete; B ambiguous time; C missing date | A explicit intended point แต่ไม่เท่ากับ clinical due | **Defer now; A หากอนุมัติ adherence พร้อม durable design** | Owner defer adherence ผ่าน OD01=A; future adherence choice ยังไม่ได้เลือก | DEFERRED / BLOCKS FUTURE ADHERENCE |
| G3-OD12 — 17J source projection | Q45 ownership ปิดแล้ว แต่ data projection/system processing authority ยังไม่ได้อนุมัติ | A minimum internal identity/time/owner/revalidation, no default name; B approved minimal name projection เมื่อจำเป็น; C defer handoff until privacy contract | A narrow source interface; B protected projection แยก; ไม่มี recipient/channel/job in 17G | owner ref ไม่ใช่ recipient; medication name disclosure ต้อง privacy approval | **A**; B ต้อง explicit later privacy approval; 17J system authority ยัง gated | Owner อนุมัติชุด OD07/12/13 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED (17J authority/delivery remains gated) |
| G3-OD13 — Equality / elapsed-source lookup | no-backfill ยังไม่บอก exact due boundary/late query | A strictly future dueAt>evaluationAsOf, no elapsed lookup; B inclusive dueAt=asOf; C bounded elapsed/catch-up source with explicit validity proof | กำหนด clock reference/window/midnight tests; C current rows ไม่พิสูจน์ historical existence | A อาจไม่พบจุดที่ไม่เคย prefetch; B/C ต้องกำหนด new-schedule-at-due semantics; ไม่มี MISSED inference | **A** กับ half-open query window; 17J late-delivery policy แยก | Owner อนุมัติชุด OD07/12/13 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |
| G3-OD14 — Historical source evidence | ไม่มี approved occurrence ledger/retention requirement | A no historical ledger first slice; B durable proof of source existence; C proof เฉพาะ observed/materialized source | A derived เพียงพอ; B/C snapshot/materialization/revision/retention semantics ต้อง contract ใหม่ | ไม่อ้าง reconstructed history เป็น evidence; ลด sensitive durable data ใน A | **A** หากไม่มี customer evidence ขัดกัน | Owner อนุมัติชุด OD02/03/04/05/06/14 ตามนี้ (แนะนำ), 2026-10-03; selected A | CLOSED / OWNER APPROVED |

## 11. Recommended bounded answer package

**CLOSED / OWNER APPROVED bounded package:** OD01=A; OD02=A; OD03=A; OD04=A; OD05=A; OD06=A; OD07=A; OD08=A exclusion only; OD09–OD11=DEFERRED with no adherence runtime; OD12=A; OD13=A; OD14=A ตามความหมายเต็มในตาราง/sections 4–9. ไม่มีการอนุมัติจำนวนวัน query, crypto encoding หรือ service signature จากการเลือก package นี้; engineering ต้องระบุใน implementation contract โดยไม่เปลี่ยน semantics.

Owner ยืนยันทั้ง scope และสอง source-decision packages อย่างชัดเจนตาม section 10 แล้ว; ไม่มี unresolved business/product/privacy decision ที่จำเป็นต่อ bounded source-only slice นี้. Adherence actor/correction/history/binding ยัง deferred และไม่ได้เลือก future semantics; ไม่เป็น gate ของ source-only contract และต้องไม่รวมใน cleared scope. 17J system processing authority/content disclosure/delivery decisions ยัง requirement-gated แยก ไม่ได้อนุมัติจาก source package.

## 12. Possible implementation shape AFTER decisions

สำหรับ bounded source-only package ที่ owner อนุมัติแล้ว: 17G.3B จัดทำ contract สำหรับ focused server-only derivation/query ใน existing medication module, reuse SELF resolver/policy และ consistent snapshot conventions; validated calendar window/reference time, ACTIVE filter, canonical source key, bounded output/paging, minimal projection และ source revalidation. ไม่มีเหตุเพิ่ม schema/migration/occurrence persistence/adherence table สำหรับ package นี้; ไม่มี route/action/UI/job ที่ต้องเพิ่มเพียงเพื่อให้ source มีตัวตน.

17G.3B ต้องกำหนด acceptance signal: zero schedules/STOPPED→no future sources; same child same date→same key; date rollover→different key; no-op/text edit→same key; remove/replace/re-add→expected identity; before/after/equal due edits; no elapsed reconstruction; actor spoof/foreign/role denials; coherent snapshot/races/revalidation; bounds/paging/no audit/PII. เป็น future verification plan ไม่ใช่ tests ที่รันหรือผล PASS ใน 17G.3A.

System-wide 17J scanning, service principal, worker, queue และ delivery consent ไม่อยู่ใน source implementation โดยปริยาย. หาก future handoff ต้องการ cross-domain abstraction ให้กลับมา architecture/authorization review แยก ไม่สร้างล่วงหน้า.

## 13. Explicit non-goals / ADR assessment

17G.3A ไม่แก้ runtime source, schema, migrations, services, routes, Server Actions, UI, jobs/cron, adherence persistence หรือ delivery. ไม่เพิ่ม notification infrastructure, preferences/opt-in/consent, recipients/channels/devices/providers/retries/status, clinical medication/MED-02, weekdays/PRN/date ranges/timezone setting, Goal Plan coupling, sharing/export หรือ delegated medication authority. ไม่ execute migration/generate/test/lint/typecheck/build/dev server และไม่ commit/push.

**ADR: ยังไม่จำเป็นสำหรับ recommended bounded additive derivation** ภายใต้ existing MedicationSchedule domain, unchanged SELF authority และ 17J delivery ownership. ไม่สร้าง ADR ใหม่ในงานนี้. หากอนุมัติ generic event infrastructure, system-wide scheduler, cross-domain source abstraction หรือ authorization architecture ใหม่ต้องประเมิน ADR ใหม่ก่อนออกแบบ; table ใหม่เพียงอย่างเดียวไม่ได้บังคับ ADR.

## 14. Implementation gate / next phase / validation

**Exact final status: CLEARED FOR IMPLEMENTATION — bounded Reminder Occurrence Source only.** G3-OD01–OD08 (OD08 exclusion only) และ OD12–OD14 CLOSED / OWNER APPROVED ตามคำตอบจริง. ไม่มี unresolved decision ที่จำเป็นต่อ first source-only slice; OD09–OD11 DEFERRED / OUT OF SOURCE SLICE และ future adherence semantics ยังไม่ได้อนุมัติ. **Adherence remains deferred and is not part of the cleared runtime slice.** 17G.3 runtime **NOT IMPLEMENTED**; approval นี้ให้ readiness สำหรับ 17G.3B contract ไม่ใช่ให้ implement runtime ในงาน 17G.3A. 17J system-processing/delivery gates และ MED-02 คงเดิม.

ลำดับที่เสนอ: **17G.3A owner decision closeout → 17G.3B Reminder Occurrence Source Implementation Contract (หลัง required decisions approved) → 17G.3C Reminder Occurrence Source Implementation (หลัง contract cleared) → 17G.4A Automated security / DB / privacy re-audit หลัง approved 17G runtime slices.** Adherence defer หรือเปิด contract/slice แยกเมื่อมี explicit approval; 17J remains notification delivery และต้องปิด delivery/system-processing requirements ของตนเอง. ไม่รวม occurrence source กับ adherence persistence เพียงเพราะอยู่ใต้เลข phase เดียวกัน.

Validation งานเอกสารนี้: ตรวจ starting git status/HEAD/diff และ source/decision evidence; review complete documentation diff/source claims แล้ว. Local links ใน pack 29 จุดและ incoming links ใหม่ 2 จุดผ่าน; strict UTF-8/no-BOM/mojibake/whitespace checks ผ่านทั้ง 3 files; เทียบ historical contents กับ HEAD หลังตัด current addenda และย้อนเฉพาะ NOTIF-01 inventory correction แล้วตรงเดิม. Decision table 14 rows / 11 approved / 3 deferred ตรวจแล้ว; changed/untracked inventory มีเฉพาะเอกสาร 3 files. `git diff --check` ผ่าน; final git status ตรวจแล้ว ไม่มี runtime changes. Git มี line-ending normalization notices สำหรับ existing docs; ไม่มี whole-file encoding/line-ending rewrite. ไม่รัน runtime/database/test/build commands; automated PASS ใน handoff เดิมเป็น historical evidence เท่านั้น. การตรวจเอกสารไม่ imply runtime/browser/device UAT หรือ production PASS.
