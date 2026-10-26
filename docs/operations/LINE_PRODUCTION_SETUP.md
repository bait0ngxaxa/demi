# LINE_PRODUCTION_SETUP — LINE provider และ channel สำหรับ production

สถานะ: runbook ยังไม่ได้ทำกับ LINE Console จริง ใช้คู่กับ [17J.1 runbook](../phases/PHASE_17J1_LINE_EXTERNAL_SETUP_RUNBOOK.md), [B2.4 §13](../phases/PHASE_LINE_QA_B2_4_CONFIGURATION_SIMPLIFICATION.md#owner-setup-th) และ [C3 §5](../phases/PHASE_LINE_QA_C3_CONVERSATIONAL_REPLIES.md) เอกสารนี้เป็นบันทึกการตั้งค่า provider โดยผู้ดูแล ไม่ใช่ release approval หรือ application feature gate. Business behavior ถูกกำหนดจาก auth, grants, preference, lifecycle และข้อมูลปัจจุบันตาม [ADR-0010](../adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md).

## 0. กฎที่ย้อนกลับไม่ได้

- LINE user ID แยกตาม **provider** และ channel **ย้าย provider ไม่ได้** (ADR-0009) production ต้องเป็น **provider ใหม่** ห้ามใช้ provider ของ demo
- binding ของ demo **ไม่ถูกย้าย** ผู้ใช้ทุกคนต้องเชื่อม LINE ใหม่กับ OA ของ production
- Account LINE Login, Messaging API และ MINI (ถ้าใช้) ต้องอยู่ใต้ provider production **เดียวกัน**
- ห้ามนำ NHFapp หรือแอปอื่นเข้า provider นี้

`<PROD_ORIGIN>` = origin ของ production (ตรงกับ `DEMI_LINE_PUBLIC_ORIGIN`)

## 1. Provider

1. LINE Developers Console → Create provider: ชื่อ `DEMI` (ชื่อที่ผู้ใช้เห็นบนหน้าขอสิทธิ์)
2. Roles: ให้ admin อย่างน้อย 2 คนที่เป็นบุคลากรของผู้ให้บริการ (กันบัญชีหาย) ไม่เพิ่มคนนอก

## 2. Messaging API channel (OA)

1. สร้าง LINE Official Account (LINE Official Account Manager) แล้วเปิด Messaging API โดยเลือก provider ข้อ 1 (**เลือกผิดแก้ไม่ได้**)
2. LINE Developers → channel → Messaging API:
   - **Channel access token (long-lived)** → Issue → `DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
   - Basic settings → **Channel secret** → `DEMI_LINE_MESSAGING_CHANNEL_SECRET`
3. Bot user ID (`DEMI_LINE_MESSAGING_BOT_USER_ID`) บน VPS (พิมพ์ token แบบซ่อนค่า):

```sh
read -rs LINE_TOKEN && curl -fsS -H "Authorization: Bearer $LINE_TOKEN" https://api.line.me/v2/bot/info; unset LINE_TOKEN
```

   ใช้ค่า `userId` (ขึ้นต้นด้วย `U` ตามด้วย hex 32 ตัว)
4. Webhook (ทำหลัง deploy production และ `/api/health` ตอบ ok แล้ว):
   - Webhook URL: `<PROD_ORIGIN>/api/line/webhook`
   - กด **Verify** ต้องได้ Success (ถ้า Cloudflare บล็อก ให้ตรวจ WAF skip rule ใน `DEPLOY_VPS.md` §1.5 ข้อ 8)
   - **Use webhook**: On
   - Webhook redelivery: Off (ค่า default; reply token ของ event ที่ส่งซ้ำมักหมดอายุแล้ว และ DEMI กันซ้ำด้วย `webhookEventId` อยู่แล้ว)
5. Response settings ของ OA (C3 §5):

| ตั้งค่า | ค่า |
| --- | --- |
| Webhook | On |
| Auto-response messages | **Off** (ไม่งั้นจะตอบซ้ำสองข้อความ) |
| Greeting message | เลือกเองตามที่ owner ต้องการ |
| Chat (แชตด้วยคน) | เลือกเองตามที่ owner ต้องการ ถ้าเปิด เจ้าหน้าที่และ DEMI อาจตอบข้อความเดียวกันทั้งคู่ |

## 3. LINE Login channel และ Account LIFF

1. Create channel → LINE Login, provider ข้อ 1, App type: Web app
   - Channel ID → `DEMI_LINE_LOGIN_CHANNEL_ID`
   - Channel secret → `DEMI_LINE_LOGIN_CHANNEL_SECRET` (ใช้ยืนยัน remote deauthorization หลัง Unlink)
2. **Linked OA**: เลือก OA ข้อ 2
3. LIFF → Add:
   - Size: **Full**
   - Endpoint URL: `<PROD_ORIGIN>/line/account`
   - Scopes: **openid** และ **profile**
   - Add friend option: **Normal**
   - LIFF ID → `NEXT_PUBLIC_DEMI_LINE_LIFF_ID` (ฝังตอน build ถ้าเปลี่ยนต้อง build ใหม่)
4. Rich Menu URI ของหน้าเชื่อมบัญชีคือ `https://liff.line.me/<LIFF_ID>` ไม่ต้องต่อ path (17J.1)
5. เปลี่ยนสถานะ channel จาก **Developing เป็น Published** เมื่อพร้อมให้ผู้ใช้จริงใช้ (ตอน Developing จะมีแต่ admin/tester ที่เปิด LIFF ได้)

## 4. MINI App (optional provider integration)

สร้าง channel ประเภท LINE MINI App ใต้ provider เดียวกัน, Endpoint URL = `<PROD_ORIGIN>/line/workflow` แล้วตั้งตัวแปร `DEMI_LINE_MINI_APP_*` ตาม B2.4 §13.B (keyring สร้างใหม่สำหรับแต่ละ database environment ห้ามใช้ของ demo ร่วมกับข้อมูลจริง). ถ้าไม่ได้ provision integration นี้ ให้ค่า MINI ทั้งหมดว่าง; endpoint จะ fail closed สำหรับ MINI เท่านั้น. สถานะ DEVELOPING / REVIEW / PUBLISHED เป็นสถานะ channel ที่ LINE กำหนด ไม่ใช่ DEMI deployment stage.

## 5. ใส่ค่าใน server

ใส่ค่าจาก §2–§3 ลง `/etc/demi/demi.env` แล้วทำ `DEPLOY_VPS.md` §4 (`LIFF ID` เป็น `NEXT_PUBLIC_*` จึงต้องทำ §2 build ใหม่ด้วย) จากนั้นตรวจ:

```sh
sudo -u demi -H sh -c 'cd /srv/demi/current && npm run env:check -- --strict /etc/demi/demi.env'
```

## 6. Rich Menu

ชุดเมนูมี 18 รายการ (`public/line/rich-menus/` + `LINE_RICH_MENU_CATALOG`) คำสั่ง reconcile จะสร้างเมนูที่ยังไม่มี → อัปโหลดรูปและอ่านกลับมาตรวจ → สร้าง/ปรับ alias → ตั้งเมนูเริ่มต้นเป็น `UNLINKED` ตามลำดับนี้ในคำสั่งเดียว ชื่อเมนูมาจาก hash ของ definition และรูป จึงรันซ้ำได้อย่างปลอดภัย และ**ไม่ลบ**เมนูเก่า

### 6.1 Dry-run

```sh
sudo -u demi -H sh -c 'cd /srv/demi/current && node --env-file=/etc/demi/demi.env scripts/line-rich-menu-reconcile.mjs'
```

### 6.2 Apply

```sh
sudo -u demi -H sh -c 'cd /srv/demi/current && node --env-file=/etc/demi/demi.env scripts/line-rich-menu-reconcile.mjs --apply'
```

### 6.3 ตรวจ

- รันข้อ 6.1 ซ้ำ ต้องได้ `สร้าง 0, ใช้ซ้ำ 18, อัปโหลดภาพ 0, สร้าง alias 0, ปรับ alias 0, เปลี่ยนเมนูเริ่มต้น ไม่`
- ใน LINE app (บัญชีที่ยังไม่เชื่อม) ต้องเห็นเมนู UNLINKED
- หลังมีผู้ใช้เชื่อมบัญชีแล้วและต้องการซ่อมเมนูรายคน: ดูก่อนด้วย `--repair --limit=50` แล้วค่อยใส่ `--apply` เพิ่ม และทำต่อด้วย `--after=<UUID>` ตามที่คำสั่งพิมพ์ออกมา (17J.1)

### 6.4 Rollback Rich Menu

เมนูชุดเก่ายังอยู่ที่ LINE (reconcile ไม่ลบ) ให้รันข้อ 6.2 จากโฟลเดอร์ของ release ที่ rollback ไป (alias และเมนูเริ่มต้นจะชี้กลับไปที่ชุดนั้น) แล้วซ่อมเมนูรายคนด้วย `--repair --apply` ถ้าเมนูชุดเก่าถูกลบไปแล้ว คำสั่งจะสร้างใหม่จาก asset ของ release นั้นเอง

### 6.5 เปลี่ยนปุ่ม “ตรวจสอบนัดหมาย” เป็น message action (2026-10-26)

ปุ่มนี้ในเมนู Patient ทั้ง 4 แบบ (`PATIENT_DIRECT`, `PATIENT_PATIENT_OSM`, `PATIENT_PATIENT_HOSPITAL`, `PATIENT_PATIENT_OSM_HOSPITAL`) เปลี่ยนจาก postback เป็น `{"type":"message","label":"ตรวจสอบนัดหมาย","text":"นัด"}` ภาพไม่เปลี่ยน แต่ hash ของ definition เปลี่ยน การ deploy โค้ดอย่างเดียว**ไม่**เปลี่ยนเมนูที่ LINE ต้องทำตามลำดับนี้หลัง deploy release ที่มีการเปลี่ยนนี้

1. Dry-run ตามข้อ 6.1 ผลที่คาดไว้: `สร้าง 4, ใช้ซ้ำ 14, อัปโหลดภาพ 0, สร้าง alias 0, ปรับ alias 4, เปลี่ยนเมนูเริ่มต้น ไม่` ถ้าตัวเลขต่างจากนี้ให้หยุดและตรวจก่อน
2. Apply ตามข้อ 6.2 (ต้องได้รับอนุมัติก่อน)
3. รันข้อ 6.1 ซ้ำ ต้องได้ `สร้าง 0, ใช้ซ้ำ 18, ...` ตามข้อ 6.3
4. ผู้ใช้ที่เชื่อมบัญชีแล้วถูกผูกเมนูรายคนไว้กับ richMenuId เดิม ให้ย้ายไปเมนูใหม่ด้วย `--repair --limit=50` (ดูก่อน) แล้ว `--repair --apply --limit=50` ต่อด้วย `--after=<UUID>` จนครบ
5. ตรวจในแอป LINE ด้วยบัญชี Patient จริง: แตะ “ตรวจสอบนัดหมาย” ต้องเห็นข้อความ “นัด” ของตัวเองขึ้นทันที แล้วได้คำตอบนัดหมายถัดไป (หรือข้อความว่าไม่มีนัด) ทดสอบปุ่ม Quick Reply เดียวกันหลังพิมพ์ “เมนู” ด้วย

webhook ยังรับ postback `DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1` เดิมต่อไป เมนูเก่าที่ยังผูกอยู่ระหว่างทางจึงใช้งานได้ ห้ามลบ handler นี้

## 7. Runtime behavior and operational control

ไม่มี application activation flags. Account link/recovery ใช้ Account Login configuration และ permanent proof/security rules. Appointment notifications and medication reminders are queued and delivered only for currently eligible recipients with active bindings and their own enabled preferences; caregiver appointment messages additionally require a current accepted appointment grant. MINI operations require complete valid provider configuration, signed LINE context, and current scope/lifecycle checks. Missing optional provider configuration fails only the relevant integration.

หากผู้ดูแลต้องหยุดงานส่ง notification ชั่วคราว ให้หยุด external scheduler trigger (systemd timer, Vercel Cron หรือ worker ที่เรียก `/api/internal/scheduler/tick`) แล้วรอ tick ที่ทำงานอยู่จบก่อนหยุด process. Pending outbox rows and retry keys remain persisted; เมื่อกลับมาเริ่ม scheduler ระบบจะตรวจ source, recipient, preference, binding, lease และ delivery window ตาม business rules ก่อนส่ง. ห้ามแก้สถานะ outbox ด้วย SQL หรือเปลี่ยน user preference แทนผู้ใช้.

หากต้องหยุด MINI ให้ถอน route `/line/workflow` ผ่าน hosting/routing ของ operator หรือปรับ provider channel availability ใน LINE Console. การเอา provider credentials ออกจาก configuration จะทำให้ MINI ปฏิเสธการทำงานอย่างปลอดภัย แต่ไม่เปลี่ยน authority ของ Account Login หรือระบบส่วนอื่น.

ใช้ `/api/health`, scheduler readiness และ queue depth/age เพื่อการปฏิบัติการ; หลักฐานในเอกสารนี้ไม่ใช่เงื่อนไขที่ application ตรวจเพื่ออนุญาต feature.

## 8. ประเมิน quota ข้อความ

นับเฉพาะ **push** (reply ที่ตอบ keyword/postback ไม่นับ quota) ค่าต่อเดือน:

```text
medication = Σ ผู้รับที่เปิดรับ (จำนวนเวลาแจ้งเตือนต่อวันของผู้รับคนนั้น) × 30
appointment = (จำนวนครั้งที่สร้าง + เลื่อน + ยกเลิกนัดต่อเดือน ของผู้ป่วยที่ opt-in)
รวม = medication + appointment   (เผื่อ retry อีก 10%)
```

ตัวอย่างวิธีคิด: ผู้รับ 200 คน คนละ 2 เวลาต่อวัน = 200 × 2 × 30 = 12,000 + นัด 300 ครั้ง = 12,300 → เผื่อ 10% ≈ 13,530 ข้อความต่อเดือน

ให้เทียบกับ quota ของแพ็กเกจ OA ที่ใช้อยู่ (LINE Official Account Manager → Settings → Plan ราคาและ quota เปลี่ยนตามประเทศและเวลา จึงไม่ระบุตัวเลขไว้ที่นี่) ถ้าเกิน quota LINE จะปฏิเสธ push และ outbox จะบันทึกเป็น failure ตามจริง ดู quota และยอดใช้จริงได้ที่:

```sh
read -rs LINE_TOKEN && curl -fsS -H "Authorization: Bearer $LINE_TOKEN" https://api.line.me/v2/bot/message/quota && echo && curl -fsS -H "Authorization: Bearer $LINE_TOKEN" https://api.line.me/v2/bot/message/quota/consumption; unset LINE_TOKEN
```

ตัวเลขผู้รับสำหรับ capacity planning อาจนับด้วย SQL ที่คืนเฉพาะจำนวน (ไม่ดึงตัวตน) และบันทึกผลใน operational record; ไม่ใช่ข้อกำหนดเปิดหรือปิด business behavior

การทดสอบ capacity ด้วยข้อมูลสังเคราะห์เป็นแนวทางวางแผนของ operator ไม่ใช่ runtime gate; ห้ามนำผล local synthetic มาอ้างเป็น production measurement. ติดตั้งและ monitor timer ตาม topology ที่เลือก. หากเกิด 429 ให้รักษา backoff/retry key เดิมและตรวจ quota/rate limit ไม่เพิ่ม workers เพื่อเร่งฝ่า limit

## การเปิดบัญชีครั้งแรกและเชื่อม LINE (UX-A + UX-B)

UX-C.1 เพิ่ม explicit status check ที่ `/api/line/account/status` บน verified session + LINE proof เดิม โดยรอ leased reconciler ก่อนอ่าน persisted summary; ไม่ถือ scheduling acceptance จาก `after()` ว่าเสร็จ และไม่ polling หากติด lease ให้รอแล้วตรวจใหม่ UNKNOWN, MISMATCH/UNAVAILABLE, NOT_FRIEND และพร้อมจริงแสดงแยกกัน ไม่มีการแก้ provider configuration หรือ scheduler ดู [flow/ข้อจำกัด](./ACTIVATION_LINE_ONBOARDING.md) และ [mobile audit/UAT ที่ยัง pending](./MOBILE_ONBOARDING_AUDIT_UAT.md) การ abort บน browser ไม่รับรองว่างาน provider ฝั่ง server ถูกยกเลิกแล้ว

หน้า activation ใช้ LIFF root จาก configuration ข้อ 3 ผ่าน deep-link builder เดิม และมีทางเข้าสู่เว็บเมื่อ integration ยังไม่พร้อม การตั้งรหัสผ่านไม่สร้าง session หรือ binding; LINE อาจต้อง login DEMI ใหม่เพราะเบราว์เซอร์ไม่แชร์ cookies จากนั้นยังต้องยืนยันรหัสผ่านเพื่อเชื่อมบัญชี การเป็นเพื่อนและ Rich Menu พร้อมเป็นคนละสถานะ การแจ้งเตือนนัดหมายยังต้อง opt-in เอง ดู [เส้นทางและ UAT](./ACTIVATION_LINE_ONBOARDING.md) การปรับ UX ไม่ต้องเปลี่ยน provider configuration หรือรันคำสั่ง reconcile เพิ่มเป็นขั้นตอน deploy
