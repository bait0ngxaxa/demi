# RELEASE_GATE — เงื่อนไขก่อนเปิด production

ใช้ตัดสินว่า production (VPS + Supabase Pro + LINE provider production + Cloudflare) พร้อมแค่ไหน มีสองส่วนแยกกัน:

- **A. Technical** ต้องผ่านทั้งหมดก่อนเปิดให้ผู้ใช้ทดสอบบน production
- **B. Business gates** ต้องผ่านทั้งหมดก่อนนำ**ข้อมูลผู้ป่วยจริง**เข้าระบบ ระหว่างที่ยังไม่ผ่าน production ใช้ได้เฉพาะข้อมูลสังเคราะห์ การที่ A ผ่านครบไม่ได้แปลว่าอนุมัติ B

สถานะ: `เปิด` / `ผ่าน` / `ไม่ผ่าน` / `N/A (เหตุผล)` ช่องหลักฐานให้ใส่ลิงก์หรือที่เก็บหลักฐาน (วันที่ + ผู้บันทึก) ห้ามใส่ secret, connection string หรือข้อมูลผู้ป่วย

ณ วันที่สร้างเอกสาร (2026-10-19) ทุกข้อยังเป็น `เปิด` ในฝั่ง repository มี artifact และการทดสอบอัตโนมัติแล้ว (ดูหมายเหตุท้ายเอกสาร) แต่ยังไม่ได้ทำบนเครื่องหรือบริการจริง

## A. Technical

| ID | รายการ | Owner | หลักฐานที่ต้องมี | สถานะ |
| --- | --- | --- | --- | --- |
| T-01 | `npm run env:check -- --strict /etc/demi/demi.env` ผ่าน ไม่มี placeholder ไม่มีค่าจาก demo | ผู้ดูแลระบบ | output ของคำสั่ง (มีแค่ชื่อกับสถานะ) | เปิด |
| T-02 | nginx ตาม `deploy/nginx/demi.conf.example`: `sudo nginx -t` ผ่าน; Cloudflare SSL **Full (strict)** + Authenticated Origin Pulls; request ที่ต่อ IP ของ VPS ตรงได้ 400 (`curl -sk -o /dev/null -w '%{http_code}' --resolve <PROD_HOST>:443:<VPS_PUBLIC_IP> https://<PROD_HOST>/`) | ผู้ดูแลระบบ | output ของ `nginx -t` และ curl | เปิด |
| T-03 | Cloudflare: WAF skip rule สำหรับ `POST /api/line/webhook`, ไม่มี Cache Everything กับ HTML/API, Rocket Loader ปิด, Always Use HTTPS เปิด | ผู้ดูแลระบบ | screenshot การตั้งค่า | เปิด |
| T-04 | PM2: `pm2 describe demi` เป็น fork, 1 instance; **ทดสอบ drain**: ส่งคำว่า "นัด" ใน OA แล้วรัน `sudo -u demi -H pm2 reload demi` ทันที ต้องได้รับคำตอบ | ผู้ดูแลระบบ | เวลาที่ส่ง/ได้รับ + log `line_reactive_reply_summary` | เปิด |
| T-05 | `https://<PROD_HOST>/api/health` ได้ 200 และ checks เป็น true ทั้งหมด; `https://<PROD_HOST>/api/internal/scheduler/readiness` ได้ 404 จากภายนอก; ตั้ง uptime monitor ที่ `/api/health` | ผู้ดูแลระบบ | output curl + ชื่อ monitor | เปิด |
| T-06 | Migration ครบ: `prisma migrate status` = up to date และ SQL ใน `SUPABASE_PRODUCTION.md` §6 ได้ `failed = 0` | ผู้ดูแลระบบ | output | เปิด |
| T-07 | Supabase Security Advisor และ Performance Advisor: **0 ERROR, 0 WARN** (INFO บันทึกเหตุผล) | ผู้ดูแลระบบ | export หรือ screenshot พร้อมวันที่ | เปิด |
| T-08 | Restore drill เข้า scratch project สำเร็จตาม `SUPABASE_PRODUCTION.md` §7.2 | ผู้ดูแลระบบ | ตารางหลักฐาน §7.2 (RTO/RPO ที่วัดได้) | เปิด |
| T-09 | นโยบาย backup อนุมัติแล้ว: PITR ซื้อหรือไม่, วิธีสำรอง Storage objects (ไม่รวมใน DB backup) | owner | บันทึกการตัดสินใจ | เปิด |
| T-10 | Device UAT ตาม [D §11](../phases/PHASE_LINE_QA_D_PATIENT_WORKFLOW_INTEGRATION_AUDIT.md) ข้อ 1–5 บน iPhone และ Android ด้วย OA production | owner / ผู้ทดสอบ | ผลรายข้อ + รุ่นเครื่อง/เวอร์ชัน LINE | เปิด |
| T-11 | Device UAT ตาม [C3 §7](../phases/PHASE_LINE_QA_C3_CONVERSATIONAL_REPLIES.md): Quick Reply บน iOS/Android, การ echo ของปุ่ม postback, auto-response ปิดแล้วไม่ตอบซ้ำ | owner / ผู้ทดสอบ | ผลรายข้อ | เปิด |
| T-12 | Leaked-password protection เปิดแล้ว และทดสอบตั้งรหัสที่รั่วไหลตอน activation/เปลี่ยนรหัส: ถูกปฏิเสธ และข้อความที่ผู้ใช้เห็นยอมรับได้ (ปัจจุบันเป็นข้อความปฏิเสธทั่วไป) | owner | ผลทดสอบ + ตัดสินใจเรื่องข้อความ | เปิด |
| T-13 | ประเมิน quota push ตาม `LINE_PRODUCTION_SETUP.md` §8 แล้วไม่เกินแพ็กเกจ OA | owner | ตัวเลขประเมิน + แพ็กเกจ | เปิด |
| T-14 | LINE provider production ใหม่, OA/Messaging, LINE Login (Published), LIFF ตาม `LINE_PRODUCTION_SETUP.md` §1–§3; webhook Verify ผ่าน | owner | screenshot การตั้งค่า (ไม่ใส่ secret) | เปิด |
| T-15 | Rich Menu reconcile ตาม `LINE_PRODUCTION_SETUP.md` §6 รันซ้ำแล้วได้ใช้ซ้ำ 18 และไม่มีการเปลี่ยนแปลง | ผู้ดูแลระบบ | output ของคำสั่ง | เปิด |
| T-16 | **Scheduler บน production ทำงานต่อเนื่อง 24 ชั่วโมง**: `systemctl list-timers` active; readiness (`DEPLOY_VPS.md` §1.11) อ่านอย่างน้อย 4 ครั้งในช่วงนั้น `lastTickCompletedAt` ห่างจากเวลาที่อ่านไม่เกิน 10 นาทีทุกครั้ง; `journalctl -u demi-scheduler.service --since "24 hours ago"` ไม่มี `HTTP_ERROR`/`UNREACHABLE` ที่อธิบายไม่ได้; `oldestPendingAgeSeconds` ไม่โตต่อเนื่อง | ผู้ดูแลระบบ | ผล readiness พร้อมเวลา + สรุป journal | เปิด |
| T-17 | Log: pm2-logrotate ตั้งค่าแล้ว; สุ่มตรวจ `/var/log/demi/*.log`, journal และ access log ของ nginx ไม่มี token, secret, LINE user ID หรือข้อความของผู้ใช้ | ผู้ดูแลระบบ | ผลการตรวจ | เปิด |
| T-18 | Rotation และการเก็บ secret ตาม `DEPLOY_VPS.md` §5 ทำความเข้าใจแล้ว; `IDENTITY_HASH_SECRET` เก็บสำรองใน password manager ของทีม; Cloudflare Origin certificate มีวันหมดอายุที่บันทึกไว้ | owner | รายการ (ไม่ใส่ค่า) | เปิด |
| T-19 | ข้อมูลตั้งต้นของ production: Platform ADMIN ผ่าน `node --env-file=/etc/demi/demi.env scripts/admin-bootstrap.mjs` และวิธีนำเข้า Hospital master (`npm run db:seed -- --apply` ถูกออกแบบให้**ปฏิเสธ** production จึงต้องมีขั้นตอนที่อนุมัติแยก) | owner | วิธีที่อนุมัติ + ผล | เปิด |
| T-20 | Rollback ซ้อมแล้วหนึ่งครั้ง (`DEPLOY_VPS.md` §3) ด้วย release ที่มีแต่ migration แบบ expand-only | ผู้ดูแลระบบ | เวลาและผล `/api/health` | เปิด |

## B. Business gates (ปิดกั้นข้อมูลผู้ป่วยจริง)

| ID | รายการ | Owner | หลักฐานที่ต้องมี | สถานะ |
| --- | --- | --- | --- | --- |
| B-01 | **ก-25 PDPA**: ฐานทางกฎหมายและการประมวลผลข้อมูลสุขภาพ รวม **จ-6** (ฐานความยินยอมของค่าเฉลี่ยเวลาออกกำลังกายในรายงาน) และ consent/Terms/Privacy ที่เกี่ยวข้อง (WB-PD-06) | owner + DPO/ที่ปรึกษากฎหมาย | เอกสารตัดสินใจที่ลงนาม | เปิด |
| B-02 | **Data residency** (ส่วนหนึ่งของ ก-25): region ของ Supabase (`<SUPABASE_REGION>`), Cloudflare ที่ถอดรหัส TLS และประมวลผล request ที่ edge นอกประเทศได้, LINE และที่เก็บ backup/restore drill | owner + DPO/ที่ปรึกษากฎหมาย | คำตอบด้านกฎหมาย + region ที่อนุมัติ | เปิด |
| B-03 | **ACCOUNT-04** การกู้คืนบัญชี: Phase I หรือขั้นตอนชั่วคราวที่อนุมัติแล้ว (ปัจจุบัน SECURITY_GATED ตาม ADR-0012) | owner + Security | ผลของ Phase I หรือขั้นตอนชั่วคราวที่ลงนาม | เปิด |
| B-04 | **WB-PD-01** แบบฟอร์ม "เส้นทางสุขภาพ" (ก-3) | ลูกค้า | แบบฟอร์มจริง | เปิด |
| B-05 | **WB-PD-02** รายการคำ "ผลลัพธ์ที่ได้" (BR-05) | ลูกค้า | รายการที่ยืนยันแล้ว | เปิด |
| B-06 | **WB-PD-03** CVD risk score: บันทึกว่าปิดแล้ว (D7 → WB-DF-17 เจ้าหน้าที่กรอก %) ให้ลูกค้ายืนยันการปิด | ลูกค้า | การยืนยัน | เปิด |

## หมายเหตุ: สิ่งที่ repository มีแล้ว (ไม่ใช่หลักฐานของ production)

- `deploy/pm2/ecosystem.config.cjs`, `deploy/nginx/demi.conf.example`, `deploy/systemd/demi-scheduler.{service,timer}`, `scripts/scheduler-tick.mjs`, `.env.production.example`, `npm run env:check`, `/api/health` + `/api/health/live`
- การทดสอบอัตโนมัติ: `deploy/deploy-artifacts.test.mjs` (PM2 1 instance/`kill_timeout` ≥ 30000, ขนาด body ตรงกับ validator, header ของ proxy, Cloudflare mTLS, timeout < 100 s, timer), `scripts/env-check.test.mjs`, `scripts/scheduler-tick.test.mjs`, unit/integration ของ readiness
- `nginx -t` ผ่านบน `nginx:1.27-alpine` ใน container ด้วย certificate ทดสอบ และทดสอบ routing แล้ว (ไม่มี client cert ได้ 400, `/api/internal/*` ได้ 404, body เกินได้ 413) แต่ไม่ได้ทดสอบกับ Cloudflare จริง
