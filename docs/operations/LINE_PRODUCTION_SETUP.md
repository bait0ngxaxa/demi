# LINE_PRODUCTION_SETUP — LINE provider และ channel สำหรับ production

สถานะ: runbook ยังไม่ได้ทำกับ LINE Console จริง ใช้คู่กับ [17J.1 runbook](../phases/PHASE_17J1_LINE_EXTERNAL_SETUP_RUNBOOK.md), [B2.4 §13](../phases/PHASE_LINE_QA_B2_4_CONFIGURATION_SIMPLIFICATION.md#owner-setup-th) และ [C3 §5](../phases/PHASE_LINE_QA_C3_CONVERSATIONAL_REPLIES.md) เอกสารนี้ระบุเฉพาะส่วนที่ต่างหรือเพิ่มสำหรับ production

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

## 4. MINI App (ทำทีหลังสุด ดู §7 ขั้น 4)

สร้าง channel ประเภท LINE MINI App ใต้ provider เดียวกัน, Endpoint URL = `<PROD_ORIGIN>/line/workflow` แล้วตั้งตัวแปร `DEMI_LINE_MINI_APP_*` ตาม B2.4 §13.B (keyring สร้างใหม่สำหรับ production ห้ามใช้ของ demo) ระหว่างยังไม่พร้อม ให้ค่า MINI ว่างทั้งหมดและ `DEMI_LINE_MINI_APP_DISABLED=true`

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

## 7. ลำดับการเปิด feature (ทำทีละขั้น ห้ามข้าม)

ทุกขั้นแก้ `/etc/demi/demi.env` แล้วทำ `DEPLOY_VPS.md` §4 จากนั้นรอสังเกตผลก่อนไปขั้นต่อไป

| ขั้น | ค่า | ตรวจก่อนไปต่อ |
| --- | --- | --- |
| 1. Account | ค่า §2–§3 ครบ; MINI ว่าง; `DEMI_LINE_MINI_APP_DISABLED=true`; `DEMI_LINE_MEDICATION_REMINDERS_DISABLED=true`; `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED=false` | webhook Verify ผ่าน, Rich Menu §6, เชื่อม/ยกเลิก/เชื่อมใหม่, keyword "นัด"/"เมนู" ตอบถูก (C3), device UAT (`RELEASE_GATE.md` T-10/T-11) |
| 2. Medication reminders | `DEMI_LINE_MEDICATION_REMINDERS_DISABLED=` (ว่าง) | รอ scheduler health `healthy: true` + `lastTickStatus=COMPLETED` (หรือ brief DEFERRED ตาม DEPLOY_VPS §1.11) และ HTTP 200 ต่อเนื่อง; log ทุก tick ต้องเป็น `OK` หรือ skip `LOCK_BUSY`/`TOO_SOON` ที่อธิบายได้ ไม่มี `FAILED`/`NOT_STARTED`; `DEFERRED` ชั่วคราวยอมรับได้เฉพาะเมื่อมี progress, readiness ผ่าน และ backlog กลับลงภายใน envelope ใน E1 §15; ตรวจ queue depth/age, retry และผล provider; triage `permanentFailure`/`unknownOutcome` ที่ยังไม่อธิบายและต้องไม่เกิด backlog ต่อเนื่อง; ผู้ทดสอบที่เปิดรับได้รับข้อความครั้งเดียวต่อเวลา |
| 3. Appointment notifications | `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_GENERATION` = UUID ใหม่ (`cat /proc/sys/kernel/random/uuid`) และ `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED=true` | ทำข้อ 2 เรื่อง scheduler health/log/backlog/provider outcomes ซ้ำ พร้อมตรวจข้อความเมื่อสร้าง/เลื่อน/ยกเลิกนัดของผู้ทดสอบที่ opt-in; ห้ามใช้ UUID ซ้ำกับรอบก่อนหรือกับ demo (17J.4B: แถวของ generation เก่าจะถูก suppress) |
| 4. MINI | ตั้งค่า §4 ครบ (`env:check` ผ่าน) แล้วตั้ง `DEMI_LINE_MINI_APP_DISABLED=` (ว่าง) | gateway `/line/workflow` เปิดได้ใน LINE, Verify ผ่าน, device UAT ของ MINI |

ปิดฉุกเฉิน: medication `DEMI_LINE_MEDICATION_REMINDERS_DISABLED=true`, appointment `DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED=false`, MINI `DEMI_LINE_MINI_APP_DISABLED=true` แล้วทำ `DEPLOY_VPS.md` §4 (preference ของผู้ใช้ไม่ถูกแตะ)

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

ตัวเลขผู้รับใช้จาก SQL ที่นับเฉพาะจำนวน (ไม่ดึงตัวตน) ก่อนเปิดขั้น 2/3 แล้วบันทึกผลประเมินใน `RELEASE_GATE.md` T-13

ก่อนเปิด proactive notification ต้องผ่าน capacity gate T-16 ด้วยข้อมูลสังเคราะห์ใน target topology: burst ยา 200 + appointment 200, วัด provider+DB ต่อรายการรวม revalidation และ contention, ตรวจ first attempts ไม่เกิน 15 นาทีและทั้ง queue มี progress ห้ามใช้ผล local synthetic เป็น production measurement Timer ใหม่ทุกนาทีต้องติดตั้งจริงและตรวจ unit version; ไม่มีการเปิด provider หรือโหลดข้อมูลผู้ป่วยจริงเป็นส่วนหนึ่งของการแก้โค้ดนี้ หากเกิด 429 ให้รักษา backoff/retry key เดิมและตรวจ quota/rate limit ไม่เพิ่ม workers เพื่อเร่งฝ่า limit
