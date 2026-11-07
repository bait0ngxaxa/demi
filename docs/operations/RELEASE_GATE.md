# RELEASE_GATE — บันทึกปฏิบัติการและ governance

> เอกสารนี้เป็นบันทึกตรวจสอบเชิงปฏิบัติการ/ธรรมาภิบาลของผู้ดูแล ไม่ใช่อำนาจอนุญาตหรือปิด feature ใน runtime. Application code ไม่อ่านสถานะ เอกสารลงนาม ชื่อ environment หรือ release approval เพื่อเลือก business behavior. เจ้าของ deployment จัดการ provider, infrastructure และการใช้ข้อมูลจริงแยกจาก authorization ที่บังคับใช้ในระบบ.

ใช้บันทึกหลักฐานของ production topology (VPS + Supabase Pro + LINE provider production + Cloudflare) แบ่งเป็นสามส่วนตามเจ้าของงาน:

| ส่วน | เจ้าของ | ความหมายต่อทีม product |
| --- | --- | --- |
| **A. Product / technical** | ทีม product (ผู้ดูแลระบบ/owner ตามแถว) | รายการตรวจ implementation และการปฏิบัติการ ไม่ใช่ application feature gates |
| **B. Agency / hospital governance** | หน่วยงานพันธมิตรที่ประสานกับโรงพยาบาล | ข้อมูลประกอบสำหรับทีม product **ไม่ใช่** product backlog; product มี hook ไว้แล้ว หรือไม่ต้องทำอะไร |
| **C. Customer content inputs** | ลูกค้า (ผู้ให้เนื้อหา) | ลูกค้าส่งเนื้อหา; product มีฟีเจอร์และ placeholder ที่ระบุชัดแล้ว |

ทิศทางจาก Owner (final): DEMI เป็นงานสร้าง product การตัดสินด้านนโยบาย กฎหมาย และ data governance (PDPA/ก-25, data residency, ข้อความความยินยอม, ข้อความ Terms/Privacy, กฎการเปิดเผยข้อมูลจริง, การปกปิดจำนวนต่ำ, การส่งต่อข้อมูล) เป็นของหน่วยงานพันธมิตร จึงไม่นับเป็นงาน product ที่ค้าง ส่วนเนื้อหาที่หน่วยงานหรือลูกค้าจะส่งมาภายหลัง product มีฟีเจอร์และ placeholder ที่ระบุชัดไว้แล้ว

หลักฐานแยกเป็นสามสถานะที่ใช้แทนกันไม่ได้:

- **CODE VERIFIED** — implementation และ regression tests ใน repository ผ่านตามขอบเขตที่ระบุ; ไม่ยืนยันการตั้งค่า provider, infrastructure หรือ UAT ภายนอก
- **OPERATIONALLY VERIFIED** — deployment, provider configuration, scheduler/monitoring, restore drill และ infrastructure checks ผ่านใน target environment พร้อมหลักฐานลงวันที่
- **BUSINESS APPROVED** — คำตัดสินของหน่วยงานพันธมิตร (ส่วน B) หรือเนื้อหาจากลูกค้า (ส่วน C) ได้รับและบันทึกพร้อมหลักฐาน; การใช้ข้อมูลผู้ป่วยจริงเป็นการตัดสินของหน่วยงานพันธมิตรตามส่วน B

มี code artifact หรือ automated test อย่างเดียวไม่ทำให้แถวใดในส่วน A–C ผ่าน และการผ่านส่วน A ไม่ได้แทนคำตัดสินในส่วน B

สถานะ: `เปิด` / `ผ่าน` / `ไม่ผ่าน` / `N/A (เหตุผล)` ช่องหลักฐานให้ใส่ลิงก์หรือที่เก็บหลักฐาน (วันที่ + ผู้บันทึก) ห้ามใส่ secret, connection string หรือข้อมูลผู้ป่วย

บันทึกเดิม ณ วันที่ 2026-10-20 (historical ก่อน amendments ด้านล่าง): ทุก external gate ด้านล่างยังเป็น `เปิด`; ไม่มีหลักฐานจาก VPS, Cloudflare, Supabase, LINE Provider หรือ real-device UAT ใน repository นี้ สถานะ CODE VERIFIED ให้บันทึกแยกพร้อม commit SHA และผล checks ที่รันจริงเท่านั้น

## Amendment — 2026-11-07: Product Owner acceptance and evidence boundaries

ที่มา: คำยืนยัน Product Owner ในงาน Final Engineering Cleanup; [WB amendment EC-2026-11-07](../requirements/WB_ALIGNMENT_DECISIONS.md#ec-2026-11-07)

| เรื่อง | BUSINESS APPROVED / attestation | CODE VERIFIED | OPERATIONALLY VERIFIED |
| --- | --- | --- | --- |
| Work navigation / role UI | ยอมรับปัจจุบัน ไม่รอ Canva redesign | หลักฐาน NAV-01/03/04 ใน canonical; ผลที่รันจริงของ cleanup แยกใน closure report | ไม่ได้ยืนยัน deployment จากคำยอมรับ |
| Clinical approach/defaults | ยอมรับ behavior ที่ implement อยู่ รวม R2 defaults | CARE-12/25 และ named tests; ไม่อ้างว่าได้รับ official content ใน CARE-01/02 | ไม่ได้ยืนยัน clinical source delivery หรือ provider |
| Cross-role | Product Owner รายงานว่าทดสอบผ่าน | ไม่ใช่ผลรัน automated tests ใน session นี้ | ไม่มี logs/environment/timestamps รายกรณีแนบ ไม่ปิด operational checks อัตโนมัติ |
| Mobile / LINE | Product Owner รายงานว่าใช้งาน/ทดสอบจริงผ่าน | Repository tests ยืนยันได้เฉพาะขอบเขตของแต่ละ test | ยังไม่มี device/LINE versions, OA/provider/environment, เวลาและ artifacts ที่ T-10/11/14/15 ต้องใช้ จึงคงสถานะเปิดเพื่อแนบหลักฐาน ไม่ใช่อ้างว่าไม่เคยทดสอบ |
| Reporting | รับ behavior ปัจจุบัน; C-02 “ผลลัพธ์ที่ได้” ยังรอรายการคำ/ค่า | RPT-01 vitals/PAM/PROMs มีแล้ว; ไม่สร้างค่าผลลัพธ์เอง | ไม่มีหลักฐาน production เพิ่มเติม |

คำยืนยันนี้ไม่ปิด T-01..T-21: production configuration, scheduler/queue progress, backup/restore, rollback, provider, monitoring และ security ยังต้องมีหลักฐานตามแถวเดิม G-01..G-06 ยังคงเป็น governance ภายนอก ไม่ใช่ runtime feature gates ข้อความ “ยังไม่มีหลักฐาน” ในเอกสารหมายถึงยังไม่มี artifacts ที่ตรวจตาม checklist ได้ ไม่ได้ปฏิเสธคำรายงานการทดสอบของ Product Owner

## A. Product / technical — เจ้าของ: ทีม product

### A.1 Operational gates (T-01..T-21)


| ID | รายการ | Owner | หลักฐานที่ต้องมี | สถานะ |
| --- | --- | --- | --- | --- |
| T-01 | `npm run env:check -- --strict /etc/demi/demi.env` ผ่าน ไม่มี placeholder ไม่มีค่าจาก demo | ผู้ดูแลระบบ | output ของคำสั่ง (มีแค่ชื่อกับสถานะ) | เปิด |
| T-02 | nginx ตาม `deploy/nginx/demi.conf.example`: `sudo nginx -t` ผ่าน; Cloudflare SSL **Full (strict)** + Authenticated Origin Pulls; request ที่ต่อ IP ของ VPS ตรงได้ 400 (`curl -sk -o /dev/null -w '%{http_code}' --resolve <PROD_HOST>:443:<VPS_PUBLIC_IP> https://<PROD_HOST>/`) | ผู้ดูแลระบบ | output ของ `nginx -t` และ curl | เปิด |
| T-03 | Cloudflare: WAF skip rule สำหรับ `POST /api/line/webhook`, ไม่มี Cache Everything กับ HTML/API, Rocket Loader ปิด, Always Use HTTPS เปิด | ผู้ดูแลระบบ | screenshot การตั้งค่า | เปิด |
| T-04 | PM2: `pm2 describe demi` เป็น fork, 1 instance; **ทดสอบ drain**: ส่งคำว่า "นัด" ใน OA แล้วรัน `sudo -u demi -H pm2 reload demi` ทันที ต้องได้รับคำตอบ | ผู้ดูแลระบบ | เวลาที่ส่ง/ได้รับ + log `line_reactive_reply_summary` | เปิด |
| T-05 | `https://<PROD_HOST>/api/health` ได้ 200 และ checks เป็น true ทั้งหมด; `https://<PROD_HOST>/api/internal/scheduler/readiness` ได้ 404 จากภายนอก; ตั้ง uptime monitor ที่ `/api/health` | ผู้ดูแลระบบ | output curl + ชื่อ monitor | เปิด |
| T-06 | Migration ครบ (รวม `20261029120000_notification_scheduler_tick_status`): `prisma migrate status` = up to date และ SQL ใน `SUPABASE_PRODUCTION.md` §6 ได้ `failed = 0` | ผู้ดูแลระบบ | output | เปิด |
| T-07 | Supabase Security Advisor และ Performance Advisor: **0 ERROR, 0 WARN** (INFO บันทึกเหตุผล) | ผู้ดูแลระบบ | export หรือ screenshot พร้อมวันที่ | เปิด |
| T-08 | Restore drill เข้า scratch project สำเร็จตาม `SUPABASE_PRODUCTION.md` §7.2: เลือก restore tool ตาม format, ไม่มี restore/SQL errors ที่ยังไม่อธิบายและตรวจยืนยัน, migration history และ schema diff ตรง, critical table counts ตรงกับ backup-time reference; validation ล้มเหลวข้อใดให้ drill ไม่ผ่าน | ผู้ดูแลระบบ | ตารางหลักฐาน §7.2 รวม backup-time reference, restore exit status, count comparison, migration/schema checks และ RTO/RPO ที่วัดได้ | เปิด |
| T-09 | นโยบาย backup อนุมัติแล้ว: PITR ซื้อหรือไม่, วิธีสำรอง Storage objects (ไม่รวมใน DB backup) | owner | บันทึกการตัดสินใจ | เปิด |
| T-10 | Device UAT ตาม [D §11](../phases/PHASE_LINE_QA_D_PATIENT_WORKFLOW_INTEGRATION_AUDIT.md) ข้อ 1–5 บน iPhone และ Android ด้วย OA production | owner / ผู้ทดสอบ | ผลรายข้อ + รุ่นเครื่อง/เวอร์ชัน LINE | เปิด |
| T-11 | Device UAT ตาม [C3 §7](../phases/PHASE_LINE_QA_C3_CONVERSATIONAL_REPLIES.md): Quick Reply บน iOS/Android, การ echo ของปุ่ม postback, auto-response ปิดแล้วไม่ตอบซ้ำ | owner / ผู้ทดสอบ | ผลรายข้อ | เปิด |
| T-12 | Leaked-password protection เปิดแล้ว และทดสอบตั้งรหัสที่รั่วไหลตอน activation/เปลี่ยนรหัส: ถูกปฏิเสธ และข้อความที่ผู้ใช้เห็นยอมรับได้ (ปัจจุบันเป็นข้อความปฏิเสธทั่วไป) | owner | ผลทดสอบ + ตัดสินใจเรื่องข้อความ | เปิด |
| T-13 | ประเมิน quota push ตาม `LINE_PRODUCTION_SETUP.md` §8 แล้วไม่เกินแพ็กเกจ OA | owner | ตัวเลขประเมิน + แพ็กเกจ | เปิด |
| T-14 | LINE provider production ใหม่, OA/Messaging, LINE Login (Published), LIFF ตาม `LINE_PRODUCTION_SETUP.md` §1–§3; webhook Verify ผ่าน | owner | screenshot การตั้งค่า (ไม่ใส่ secret) | เปิด |
| T-15 | Rich Menu reconcile ตาม `LINE_PRODUCTION_SETUP.md` §6 รันซ้ำแล้วได้ใช้ซ้ำ 18 และไม่มีการเปลี่ยนแปลง | ผู้ดูแลระบบ | output ของคำสั่ง | เปิด |
| T-16 | **Scheduler บน production ทำงานต่อเนื่อง 24 ชั่วโมง**: timer active; readiness เก็บตัวอย่างต่อเนื่องทุกนาทีตลอด 24 ชั่วโมง โดยภาวะปกติได้ HTTP 200 + `healthy: true`, `lastTickAgeSeconds` 0–600, `lastTickStatus=COMPLETED` หรือ brief `DEFERRED` ที่มี progress และคลี่คลาย (slow burst อาจได้ 503 จาก conservative age threshold ต้องอธิบายด้วย positive settlement progress, ไม่มี deadline miss และกลับมา 200 หลังเคลียร์; 503 ต่อเนื่อง/ไม่ทราบสาเหตุไม่ผ่าน); journal ไม่มี `FAILED`, `NOT_STARTED`, `INVALID_RESPONSE`, `HTTP_ERROR` หรือ `UNREACHABLE` ที่ยังไม่แก้ (skip `LOCK_BUSY`/`TOO_SOON` อธิบายได้); timer เป็นรุ่นทุกนาที; burst สังเคราะห์ 200 ยา + 200 appointment บน target topology ผ่าน deadline 15 นาทีและมี progress ทั้งสอง queue; วัด provider+DB latency/connection contention และ duration มี headroom ก่อน 290s; queue depth/oldestDueAgeSeconds และ provider outcome counts แสดงว่าไม่มี backlog โตหรือ deferral ต่อเนื่อง, ไม่มี DELIVERY_WINDOW_EXPIRED, readiness ไม่ถูกทำให้ผ่านด้วย timestamp อย่างเดียว และ `permanentFailure`/`unknownOutcome` ทุกยอดได้รับการ triage ตามนโยบายแล้ว | ผู้ดูแลระบบ | readiness snapshots พร้อมเวลา, timer state, สรุป outcome counts/journal, queue depth/due-age/progress trend, burst timing/accounting เทียบ E1 §15 และ provider delivery outcomes โดยไม่มี identifiers | เปิด |
| T-17 | Log: pm2-logrotate ตั้งค่าแล้ว; สุ่มตรวจ `/var/log/demi/*.log`, journal และ nginx access log แบบ `demi_redacted` ไม่มี token, secret, LINE user ID, ข้อความผู้ใช้ หรือ query string (ทดสอบ URL สังเคราะห์ที่มี `liff.state`) | ผู้ดูแลระบบ | ผลการตรวจ | เปิด |
| T-18 | Rotation และการเก็บ secret ตาม `DEPLOY_VPS.md` §5 ทำความเข้าใจแล้ว; `IDENTITY_HASH_SECRET` เก็บสำรองใน password manager ของทีม; Cloudflare Origin certificate มีวันหมดอายุที่บันทึกไว้ | owner | รายการ (ไม่ใส่ค่า) | เปิด |
| T-19 | ข้อมูลตั้งต้นของ production: (1) Platform ADMIN คนแรกผ่าน `node --env-file=/etc/demi/demi.env scripts/admin-bootstrap.mjs`; (2) ข้อมูล Hospital ของ production มาจากการที่ Platform ADMIN ลงทะเบียนทีละแห่งที่ `/app/admin/hospitals` เท่านั้น (ADR-0017: ไม่มี Hospital Master, seed หรือ `npm run db:seed` แล้ว); (3) บนฐานข้อมูล demo เดิมที่ยังมี Hospital จาก Master เดิมสถานะรอขึ้นทะเบียน ADMIN ตรวจรายชื่อที่ `/app/admin/hospitals?status=pending` แล้วใช้ “ถอนออกจากรายชื่อ” แบบหลายแห่ง (ครั้งละไม่เกิน 100 แห่ง พร้อมเหตุผล) กับแห่งที่ลูกค้าจะไม่ใช้ ห้ามทำผ่าน migration หรือ SQL ตรง; (4) ลำดับงานหลัง ADR-0018: ADMIN ดาวน์โหลดไฟล์ตัวอย่างแล้วนำเข้าโรงพยาบาลแม่ข่ายจากไฟล์ CSV (คอลัมน์ `name` เดียว, UTF-8; ระบบสร้างรหัสให้) ที่ `/app/admin/hospitals` ตรวจผลพรีวิวและยืนยันรายการชื่อใกล้เคียงก่อนเพิ่ม → ผู้ดูแลคนแรกของแม่ข่ายมาจากทางใดทางหนึ่ง: ผู้รับผิดชอบสมัครผ่านหน้าขึ้นทะเบียนและ ADMIN อนุมัติ หรือ ADMIN เชิญผู้ดูแลคนแรกที่ `/app/admin/hospitals/[hospitalId]` (ADR-0024; เชิญไม่ได้ขณะมีคำขอรออนุมัติ) → OWNER แม่ข่ายสร้างลูกข่ายและเชิญผู้ดูแลคนแรกที่ `/app/hospitals/network` → ADMIN ถอนแถว PENDING จาก Master เดิมที่ไม่ใช้ตาม (3) | owner | รายชื่อ Hospital ที่ลงทะเบียน/นำเข้า, จำนวนที่ถอนพร้อมเหตุผล และ audit `hospital.retired`, `hospital.bulk_registered`, `hospital.parent_owner_invited`, `hospital.parent_onboarded`, `hospital.child_created` | เปิด |
| T-20 | Rollback ซ้อมแล้วหนึ่งครั้ง (`DEPLOY_VPS.md` §3) ด้วย release ที่มีแต่ migration แบบ expand-only | ผู้ดูแลระบบ | เวลาและผล `/api/health` | เปิด |
| T-21 | Supabase password settings match [ADR-0030](../adr/0030-password-policy-length-8.md) (Minimum password length = 8, Password Requirements = No required characters ตาม `SUPABASE_PRODUCTION.md` §4) และบน production รหัสผ่านตัวอักษรล้วน 8 ตัวที่ไม่อยู่ใน blocklist ตั้งได้ทั้งตอน activation และตอนเปลี่ยนรหัสผ่าน; รหัสที่อยู่ใน blocklist (เช่น `password1`) ถูกปฏิเสธพร้อมเหตุผล | owner | screenshot การตั้งค่า + ผลทดสอบ (ไม่ใส่รหัสผ่านจริงของผู้ใช้) | เปิด |

### A.2 Product feature gaps (product backlog)

| ID | รายการ | Owner | หลักฐานที่ต้องมี | สถานะ |
| --- | --- | --- | --- | --- |
| F-01 (เดิม B-03) | **ACCOUNT-04 account recovery**: REC-1 mediated reset และ REC-2B LINE recovery implement ตาม proof, throttling, single-use capability และ reconciliation ใน ADR-0012; อดีต rollout gate ถูกถอดออก | ทีม product + Security | code/tests อ้างอิงตาม ADR-0012; สถานะ provider เป็นเรื่อง configuration ของ operator | ปิด (runtime gate superseded) |
| F-02 | **หน้าจอ Terms / Privacy / ความยินยอม พร้อมบันทึกการยอมรับแบบมีเวอร์ชัน — ปิดโดย product (LG-1/LG-2, 2026-11-03, [ADR-0028](../adr/0028-legal-documents-and-consent-records.md))**: เอกสาร 4 ประเภทแบบมีเวอร์ชัน (ฉบับที่ประกาศใช้แล้วแก้ไม่ได้) ที่ `/legal/*`; checkbox ยอมรับข้อกำหนด + รับทราบนโยบายในทุกขั้นตอนสร้าง/เปิดใช้งานบัญชี บันทึก `LegalAcceptance` (ผู้ใช้, เวอร์ชัน, เวลา, ช่องทาง, ที่มา) ใน transaction เดียวกัน; ความยินยอม 2 รายการแยกกัน ไม่บังคับ ถอนได้ (`ConsentEvent`) สำหรับผู้ป่วย; Platform ADMIN ประกาศฉบับใหม่ที่ `/app/admin/legal`. ข้อความปัจจุบันเป็น placeholder ที่ระบุชัด — ข้อความจริงและฐานทางกฎหมายยังรอ G-01 | ทีม product | หน้าจอ + บันทึกการยอมรับ + tests (`tests/integration/legal-consent.integration.test.ts` และ LG-1 ใน integration ของทุก flow) | ปิด (product); G-01 ยังเปิด |

ดูรายการงาน product ทั้งหมดที่เหลือใน [REMAINING_GAPS.md](../requirements/REMAINING_GAPS.md)

## B. Agency / hospital governance — เจ้าของ: หน่วยงานพันธมิตร (ข้อมูลประกอบ ไม่ใช่ product backlog)

| ID | รายการ | Owner | สิ่งที่ product มีแล้ว / hook | สถานะ |
| --- | --- | --- | --- | --- |
| G-01 (เดิม B-01) | **ก-25 PDPA**: ฐานทางกฎหมายและการประมวลผลข้อมูลสุขภาพ รวม **จ-6** (ฐานความยินยอมของค่าเฉลี่ยเวลาออกกำลังกายในรายงาน), ข้อความ consent/Terms/Privacy (WB-PD-06), และการรับทราบความเสี่ยงของ self-registration ตาม [ADR-0020](../adr/0020-self-registration-by-national-id.md): ผล found/not-found เปิดเผยข้อมูลการลงทะเบียนผู้ป่วยในโครงการ NCD (ข้อมูลสุขภาพ ม.26); รวมการให้ญาติดูแผนสุขภาพและยาของผู้ป่วย (AF-5, FAM-04/05) | หน่วยงานพันธมิตร + DPO/ที่ปรึกษากฎหมาย | บันทึกคำตัดสินและข้อความตามกระบวนการของหน่วยงาน. ข้อความ Terms, Privacy Policy และความยินยอมทั้งสองรายการประกาศใช้เป็นฉบับใหม่ได้โดย Platform ADMIN ที่ `/app/admin/legal` (ADR-0028); ระบบบันทึกความยินยอมเท่านั้นและยังไม่มี feature ใดอ่านค่าความยินยอม (LG-D5). Runtime caregiver disclosure ยังคงต้องมีความสัมพันธ์ที่ valid และ resource-specific consent/grant ที่ผู้ป่วยยอมรับ; เอกสารนี้ไม่เปิดหรือปิดสิทธิ์นั้น และไม่มี rollout flag | เปิด |
| G-02 (เดิม B-02) | **Data residency** (ส่วนหนึ่งของ ก-25): region ของ Supabase (`<SUPABASE_REGION>`), Cloudflare ที่ถอดรหัส TLS และประมวลผล request ที่ edge นอกประเทศได้, LINE และที่เก็บ backup/restore drill | หน่วยงานพันธมิตร + DPO/ที่ปรึกษากฎหมาย | ไม่ต้องทำอะไรใน product; region เป็นการตั้งค่า infrastructure (`SUPABASE_PRODUCTION.md`) | เปิด |
| G-03 | **Record-time disclosure** ของ Parent summary view/export (REPORTING_ACCESS_CANONICAL §5): Parent OWNER ปัจจุบันเห็น 9 ค่า active-cohort ที่อาจรวม record ก่อน Parent–Child link ปัจจุบันได้หรือไม่ | หน่วยงานพันธมิตร | Query ใช้ current hierarchy; ไม่สร้าง effective date ขึ้นเอง | เปิด |
| G-04 | **Small-count aggregate privacy**: ต้องปกปิดหรือทบทวนจำนวนต่ำใน Parent summary หรือไม่ (§5) | หน่วยงานพันธมิตร | ไม่มี suppression threshold ใน product จนกว่าจะได้รับกฎ | เปิด |
| G-05 | **Onward distribution**: ผู้รับปลายทาง ชุดข้อมูล และกระบวนการส่งต่อไฟล์ที่ Global ADMIN/โรงพยาบาลดาวน์โหลด (§5) | หน่วยงานพันธมิตร | ทุกการส่งออกบันทึก audit event แล้ว | เปิด |
| G-06 | **ประกาศการกู้คืนบัญชีทาง LINE**: หน่วยงานพันธมิตรอาจบันทึกคำตัดสิน/ข้อเสนอแนะต่อข้อความ generic anti-enumeration และช่องทางติดต่อเมื่อไม่ได้รับลิงก์ | หน่วยงานพันธมิตร + DPO/ผู้รับผิดชอบสื่อสาร | บันทึกข้อความและคำตัดสินเพื่อการปฏิบัติการ; ไม่ใช่ runtime activation condition ของ REC-2B ตาม ADR-0012 | เปิด |

## C. Customer content inputs — เจ้าของ: ลูกค้า (product มี placeholder แล้ว)

| ID | รายการ | Owner | Placeholder ใน product | สถานะ |
| --- | --- | --- | --- | --- |
| C-01 (เดิม B-04) | **WB-PD-01** health path: requirement เก่าที่รอแบบฟอร์มถูกแทนที่สำหรับ behavior ปัจจุบันโดย SR-D9/CARE-25 | ลูกค้า | Timeline สัญญาณชีพครั้งที่ 1–6 และ review มีแล้วและ Product Owner ยอมรับ 2026-11-07; ไม่มี “รอแบบฟอร์ม” ใน src/app ไม่อ้างว่าได้รับเอกสารภายนอก | N/A (form requirement superseded; current behavior accepted) |
| C-02 (เดิม B-05) | **WB-PD-02** รายการคำ “ผลลัพธ์ที่ได้” (ก-9 / BR-05) | ลูกค้า | คอลัมน์ผลลัพธ์ในรายงานการจัดบริการแสดง “ไม่มีแหล่งข้อมูลในระบบ” | เปิด |
| C-03 | **ก-8** official PAM/PROMs source content/คำแนะนำผู้ประเมินที่ยังไม่มีหลักฐานรับมอบ | ลูกค้า | ยอมรับ clinical approach/defaults ปัจจุบัน 2026-11-07 รวม Q1/Q6; software รองรับ booklet และ legacy instrument การยอมรับ behavior ไม่ใช่การส่ง official wording/scoring ใหม่; CARE-01/02 ยัง CONTENT_PENDING เฉพาะเนื้อหา | เปิด |
| C-04 (เดิม B-06) | **WB-PD-03** CVD risk score ปิดแล้วโดย D7 → WB-DF-17 และคำตอบ จ-8 | ลูกค้า | ยืนยันให้เจ้าหน้าที่กรอก % ที่ Baseline/Final ไม่คำนวณ; ไม่ต้องขอยืนยันซ้ำ ไม่ใช่ผลตรวจ production | ผ่าน |

## หมายเหตุ: สิ่งที่ repository มีแล้ว (ไม่ใช่หลักฐานของ production)

บันทึกสถานะ code closure แยกจากตาราง external gates:

| สถานะ | ความหมาย / หลักฐาน |
| --- | --- |
| CODE VERIFIED | commit SHA, focused regression tests, lint/typecheck และ integration checks ที่รันจริง; ถ้าไม่รันให้ระบุเหตุผลและห้ามอ้างว่าผ่าน |
| OPERATIONALLY VERIFIED | ต้องมีหลักฐานจาก target environment สำหรับ T-01–T-21 ที่เกี่ยวข้อง; repository artifacts ไม่เพียงพอ |
| BUSINESS APPROVED | คำตัดสินของหน่วยงานพันธมิตรตาม G-01–G-06 และเนื้อหาจากลูกค้าตาม C-01–C-04; ยังเป็น `เปิด` จนมีหลักฐาน |

- `deploy/pm2/ecosystem.config.cjs`, `deploy/nginx/demi.conf.example`, `deploy/systemd/demi-scheduler.{service,timer}`, `scripts/scheduler-tick.mjs`, `.env.production.example`, `npm run env:check`, `/api/health` + `/api/health/live`
- การทดสอบอัตโนมัติ: `deploy/deploy-artifacts.test.mjs` (PM2 1 instance/`kill_timeout` ≥ 30000, ขนาด body ตรงกับ validator, header ของ proxy, Cloudflare mTLS, timeout < 100 s, timer), `scripts/env-check.test.mjs`, `scripts/scheduler-tick.test.mjs`, unit/integration ของ readiness
- `nginx -t` ผ่านบน `nginx:1.27-alpine` ใน container ด้วย certificate ทดสอบ และทดสอบ routing แล้ว (ไม่มี client cert ได้ 400, `/api/internal/*` ได้ 404, body เกินได้ 413) แต่ไม่ได้ทดสอบกับ Cloudflare จริง
