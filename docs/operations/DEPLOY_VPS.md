# DEPLOY_VPS — ติดตั้งและ deploy DEMI บน VPS เครื่องเดียว (PM2 + nginx หลัง Cloudflare)

สถานะ: runbook ยังไม่ได้รันบน VPS จริง (agent ไม่มีสิทธิ์เข้า VPS, Cloudflare, Supabase หรือ LINE Console)

## 0. Topology และ placeholder

```text
ผู้ใช้ / LINE ──HTTPS──▶ Cloudflare (proxy เมฆส้ม, SSL Full (strict))
                          │ mTLS (Authenticated Origin Pulls)
                          ▼
                        nginx :443 (Cloudflare Origin CA cert) ──▶ next start 127.0.0.1:3000 (PM2, fork, 1 instance)
                                                                       ▲
                        systemd timer ทุก 5 นาที ── scripts/scheduler-tick.mjs ┘ (เรียก 127.0.0.1 ตรง ไม่ผ่าน nginx)
                        Supabase Pro (project production ใหม่; region รอคำตอบด้านกฎหมาย)
```

| Placeholder | ความหมาย |
| --- | --- |
| `<PROD_ORIGIN>` | origin จริง เช่น `https://...` ไม่มี `/` ท้าย (ยังไม่กำหนด) ต้องตรงกับ `DEMI_LINE_PUBLIC_ORIGIN` |
| `<PROD_HOST>` | host ของ `<PROD_ORIGIN>` (ไม่มี `https://`) |
| `<GIT_SHA>` | commit ที่อนุมัติให้ขึ้น production |

`DEMI_LINE_PUBLIC_ORIGIN` ต้องเป็น origin สาธารณะจริงแบบตรงตัว (`https://` + host, ไม่มี path และไม่มี `/` ปิดท้าย) และต้องตรงกับ origin ที่ตั้งไว้ใน LINE Login, LIFF และ webhook ทุก endpoint ใน production Proxy จะตอบ 308 ไปยัง origin นี้โดยคง path และ query เมื่อ `Host` ไม่ตรง ค่า `Host` ของ request จะไม่ถูกนำไปใช้สร้าง URL ปลายทาง

ข้อยกเว้นของการเปลี่ยน canonical origin มีเฉพาะ `/api/health*` สำหรับ health probes และ `GET /api/internal/scheduler/tick`, `GET /api/internal/scheduler/readiness` ที่ systemd timer เรียกผ่าน `127.0.0.1:3000` เท่านั้น ตัว tick เรียกงาน drain ภายในเอง; timer ปัจจุบันไม่ได้เรียก HMAC drain routes โดยตรง nginx ยังคงตอบ 404 ให้ `/api/internal/*` จากภายนอก

ทุกคำสั่งด้านล่างคัดลอกไปวางได้ แต่ต้องตั้งตัวแปรนี้ก่อนในทุก shell ใหม่:

```sh
export PROD_HOST='<PROD_HOST>'
```

เครื่องที่สมมติไว้: Ubuntu 24.04 LTS, ผู้ดูแลมี `sudo`, DNS ของ `<PROD_HOST>` อยู่บน Cloudflare แบบ Proxied

## 1. ติดตั้งครั้งแรก

### 1.1 แพ็กเกจ, Node.js 22 LTS และ PM2

```sh
sudo apt-get update
sudo apt-get install -y nginx git ufw ca-certificates curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
sudo npm install -g pm2@6
```

`node --version` ต้องเป็น v22.x (Next.js 16 ต้องการ Node ≥ 20.9; `--env-file` ต้องการ Node ≥ 20.6) และ systemd unit ใช้ `/usr/bin/node`

### 1.2 ผู้ใช้ระบบและโฟลเดอร์

```sh
sudo adduser --system --group --home /srv/demi --shell /bin/bash demi
sudo install -d -o demi -g demi /srv/demi/releases /var/log/demi
sudo install -d -m 0750 -o root -g demi /etc/demi
```

### 1.3 ไฟล์ environment

```sh
sudo install -m 0640 -o root -g demi /dev/null /etc/demi/demi.env
sudoedit /etc/demi/demi.env
```

คัดลอกเนื้อหาจาก `.env.production.example` แล้วแทนค่าทุกตัวที่มีคำว่า `placeholder` หรือเป็นเลขศูนย์ล้วน ค่า secret แบบสุ่มสร้างด้วย:

```sh
openssl rand -base64 48
```

กฎ:
- ห้ามวางไฟล์ `.env*` ไว้ในโฟลเดอร์ release (`next start` จะอ่าน `.env` ใน cwd เพิ่ม)
- `IDENTITY_HASH_SECRET` ตั้งครั้งเดียว ห้าม rotate (ดู §5)
- เริ่มต้นด้วย feature flag ตาม template: appointment notifications ปิด, `DEMI_LINE_MEDICATION_REMINDERS_DISABLED=true`, `DEMI_LINE_MINI_APP_DISABLED=true`

### 1.4 สิทธิ์อ่าน repository (deploy key แบบ read-only)

```sh
sudo -u demi -H ssh-keygen -t ed25519 -N '' -C demi-vps-deploy -f /srv/demi/.ssh/id_ed25519
sudo cat /srv/demi/.ssh/id_ed25519.pub
```

นำ public key ไปเพิ่มที่ GitHub → `bait0ngxaxa/demi` → Settings → Deploy keys (ไม่ติ๊ก Allow write access) แล้ว:

```sh
sudo -u demi -H git clone --bare git@github.com:bait0ngxaxa/demi.git /srv/demi/repo.git
```

### 1.5 Cloudflare (ทำใน dashboard ของ zone)

1. DNS: record ของ `<PROD_HOST>` ชี้ไป IP ของ VPS และเป็น **Proxied** (เมฆส้ม)
2. SSL/TLS → Overview: **Full (strict)**
3. SSL/TLS → Edge Certificates: **Always Use HTTPS** = On, **Minimum TLS Version** = 1.2
4. SSL/TLS → Origin Server → **Create Certificate** (RSA, hostname `<PROD_HOST>`, อายุตามนโยบาย) เก็บ certificate และ private key ไว้ชั่วคราว (key แสดงครั้งเดียว)
5. SSL/TLS → Origin Server → **Authenticated Origin Pulls** = On (zone-level)
6. Speed / Optimization: ปิด **Rocket Loader** และ HTML minify (ถ้ามี) เพราะแก้ JavaScript/HTML ของ Next.js
7. Caching: **ห้าม**ใช้ Cache Rule แบบ "Cache Everything" กับ HTML หรือ `/api/*` (หน้าและ API เป็นข้อมูลส่วนบุคคล) ค่า default ของ Cloudflare cache เฉพาะไฟล์ static ซึ่งรวม `/_next/static/*` ที่ Next.js ตั้งเป็น immutable อยู่แล้ว
8. Security → WAF → Custom rules: เพิ่มกฎ **Skip** (ข้าม Bot Fight Mode/Managed rules ที่บล็อกได้) สำหรับ `http.request.uri.path eq "/api/line/webhook"` และ method `POST` ถ้าไม่ทำ LINE อาจถูก challenge แล้ว webhook ไม่เข้า (ลายเซ็น `x-line-signature` ยังตรวจที่ app เสมอ)

### 1.6 Certificate ฝั่ง origin, mTLS CA และ real IP

```sh
sudo install -d -m 0750 -o root -g root /etc/ssl/cloudflare
sudoedit "/etc/ssl/cloudflare/$PROD_HOST.origin.pem"
sudoedit "/etc/ssl/cloudflare/$PROD_HOST.origin.key"
sudo chmod 0600 "/etc/ssl/cloudflare/$PROD_HOST.origin.key"
sudo curl -fsSL -o /etc/ssl/cloudflare/origin-pull-ca.pem https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

วาง Origin Certificate ลงไฟล์ `.origin.pem` และ private key ลงไฟล์ `.origin.key` ส่วน `origin-pull-ca.pem` เป็น CA ของ client certificate ที่ Cloudflare ใช้ตอนต่อเข้ามา (Authenticated Origin Pulls)

สร้าง snippet คืน IP จริงของผู้ใช้จาก `CF-Connecting-IP` (เชื่อเฉพาะช่วง IP ของ Cloudflare):

```sh
{ for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do echo "set_real_ip_from $ip;"; done; echo "real_ip_header CF-Connecting-IP;"; } | sudo tee /etc/nginx/snippets/cloudflare-real-ip.conf
```

รันคำสั่งนี้ซ้ำแล้ว `sudo nginx -t && sudo systemctl reload nginx` เมื่อ Cloudflare ประกาศเปลี่ยนช่วง IP (ทบทวนอย่างน้อยไตรมาสละครั้ง)

### 1.7 Firewall

```sh
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

พอร์ต 3000 bind อยู่ที่ 127.0.0.1 จึงเข้าจากภายนอกไม่ได้ ถึง 443 จะเปิดอยู่ nginx ก็ตอบเฉพาะ connection ที่มี client certificate ของ Cloudflare (ที่อื่นได้ 400) จะจำกัด 80/443 ให้รับเฉพาะ IP ของ Cloudflare ด้วย ufw ซ้อนอีกชั้นก็ได้ (ไม่บังคับ)

ต้องให้ Next.js listen เฉพาะ `127.0.0.1` หลัง nginx และห้ามเปิดพอร์ต 3000 สู่เครือข่ายสาธารณะ เพราะ public self-registration rate limit ใช้ `X-Real-IP` หรือค่าแรกของ `X-Forwarded-For` เป็น client IP โดยเชื่อค่าที่ nginx เขียนทับหลังตรวจ real IP จาก Cloudflare ranges แล้วเท่านั้น

### 1.8 Release แรก

ทำ §2.1–§2.4 แล้วสร้าง symlink ครั้งแรก (ยังไม่มี process และ timer จึงข้ามคำสั่งหยุด/reload):

```sh
sudo -u demi -H ln -sfn "$REL" /srv/demi/current
```

จากนั้นทำ §1.9–§1.11 ต่อ

### 1.9 nginx

```sh
sudo sed "s/<PROD_HOST>/$PROD_HOST/g" /srv/demi/current/deploy/nginx/demi.conf.example | sudo tee /etc/nginx/sites-available/demi.conf >/dev/null
sudo ln -sfn /etc/nginx/sites-available/demi.conf /etc/nginx/sites-enabled/demi.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

ขนาด body ที่อนุญาตตรงกับ validator ในโค้ด (อ้างอิงอยู่ใน comment ของไฟล์และ `deploy/deploy-artifacts.test.mjs`) เปลี่ยน validator เมื่อไหร่ต้องแก้ไฟล์นี้ตามด้วย

### 1.10 PM2 (ให้รันในฐานะผู้ใช้ `demi` และเริ่มเองหลัง reboot)

```sh
sudo -u demi -H pm2 start /srv/demi/current/deploy/pm2/ecosystem.config.cjs
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u demi --hp /srv/demi
sudo -u demi -H pm2 save
sudo -u demi -H pm2 install pm2-logrotate
sudo -u demi -H pm2 set pm2-logrotate:max_size 50M
sudo -u demi -H pm2 set pm2-logrotate:retain 14
sudo -u demi -H pm2 set pm2-logrotate:compress true
```

เหตุผลของค่าใน `ecosystem.config.cjs`:
- **1 instance, fork mode**: ถ้ามีหลาย process แต่ละตัวจะสร้าง Server Action encryption key และ action ID ของตัวเอง ฟอร์มที่ process หนึ่ง render จะใช้กับอีก process ไม่ได้ ถ้าจะรันหลายตัวต้องมี `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `deploymentId` และ cache ที่ใช้ร่วมกัน ซึ่ง MVP ยังไม่มี
- **`kill_timeout: 30000`**: LINE reactive reply และ Rich Menu reconciliation รันใน `after()` และไม่มี durable retry Next.js จะรัน callback ที่ค้างให้เสร็จเมื่อได้ SIGINT/SIGTERM ถ้ามีเวลา drain แต่ค่า default ของ PM2 ให้แค่ 1.6 วินาทีแล้ว SIGKILL
- secret **ไม่**ผ่าน env ของ PM2 (ไม่ไปอยู่ใน `~/.pm2/dump.pm2`) Node โหลดเองด้วย `--env-file=/etc/demi/demi.env` และถ้าไม่มีไฟล์ process จะไม่ start

log: `/var/log/demi/app-out.log` และ `app-error.log` (pm2-logrotate หมุนให้), log ของ nginx หมุนโดย logrotate ของระบบ, log ของ scheduler อยู่ใน journald (`journalctl -u demi-scheduler.service`)

### 1.11 Scheduler timer

```sh
sudo install -m 0644 /srv/demi/current/deploy/systemd/demi-scheduler.service /srv/demi/current/deploy/systemd/demi-scheduler.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now demi-scheduler.timer
systemctl list-timers demi-scheduler.timer
```

timer ยิงทุก 1 นาที (`OnCalendar=*-*-* *:*:00`, `AccuracySec=1s`) (`Persistent=true` จะรันรอบที่พลาดหนึ่งครั้งหลังเครื่องกลับมา) ตัว tick เองจะข้ามถ้า tick อื่นถือ lock อยู่ หรือ tick ล่าสุดจบไม่ถึง 60 วินาที (E1 §2) `/api/internal/*` ถูก nginx ตอบ 404 เสมอ timer จึงเรียก `127.0.0.1:3000` ตรง

บน self-hosted Node process ค่า route `maxDuration=300` เป็น metadata ของ deployment platform ไม่ใช่ตัวตัด request ของ systemd/PM2 เอง; tick จึงมี Prisma transaction timeout 290 วินาที, CLI timeout 320 วินาที และ systemd `TimeoutStartSec=330` เป็นขอบเขตแยกกัน ห้ามเพิ่มเวลาใดเวลาหนึ่งโดยไม่ทบทวนลำดับ deadline ทั้งชุด

ตรวจ readiness ของ scheduler (บน VPS เท่านั้น):

```sh
sudo -u demi -H node --env-file=/etc/demi/demi.env -e 'fetch("http://127.0.0.1:3000/api/internal/scheduler/readiness",{headers:{authorization:`Bearer ${process.env.DEMI_SCHEDULER_SECRET}`}}).then(async(r)=>console.log(r.status,await r.text()))'
journalctl -u demi-scheduler.service -n 20 --no-pager
```

ผลปกติต้องเป็น HTTP `200` และ JSON มี `healthy: true`; `lastTickAgeSeconds` ต้องอยู่ระหว่าง 0–600 วินาที และ `lastTickStatus=COMPLETED` หรือ `DEFERRED` ชั่วคราวตามเกณฑ์ด้านล่าง; `healthy: false` ตอบ HTTP `503` แม้ endpoint ยังส่ง aggregate queue counts/age ได้ การข้าม `LOCK_BUSY` และ `TOO_SOON` เป็นผลปกติของ tick; `FAILED`, `DEFERRED`, `NOT_STARTED`, `INVALID_RESPONSE`, `HTTP_ERROR` หรือ `UNREACHABLE` ทำให้ systemd unit ล้มเหลวและต้องตรวจ log ห้ามสรุปว่า health ผ่านจาก HTTP 200 ของ tick เพียงอย่างเดียว

`OK`/`COMPLETED` ยืนยันว่าแต่ละ bounded step จบและผล delivery ถูกบันทึกตาม service contract ไม่ได้ยืนยันว่า LINE ยอมรับทุกข้อความ ตรวจ aggregate `providerAccepted`, `retryScheduled`, `suppressed`, `permanentFailure` และ `unknownOutcome` ใน log; triage `permanentFailure`/`unknownOutcome` ที่ยังไม่อธิบาย และติดตาม retry/backlog จนคลี่คลาย

แต่ละ tick สลับ medication → appointment ครั้งละไม่เกิน 5 claims แล้ววนต่อเมื่อ query ยืนยันว่ายังมี due work; queue ว่างออกจาก rotation ทันที จำกัด 80 batches / 400 claims ต่อ queue (รวม 800), materialize ยาสูงสุด 400 occurrences และ provider in-flight รวม 1 request จึงยังใช้ connection ของ scheduler สูงสุด 2 จาก pool 5 เดิม ไม่ต้องเพิ่ม pool ขณะ request เดิมยังทำงาน timer จะไม่สร้าง service ซ้อน และ advisory lock ป้องกัน caller อื่นอีกชั้น

หยุดเริ่ม claim/dispatch ที่ 180 วินาที รอ attempt ที่เริ่มแล้วบันทึกผลก่อนตอบกลับ; lease ของงานที่ยังไม่ได้ dispatch ถูกคืนพร้อมย้อน reservation ที่ยังไม่ได้ใช้ ไม่ทิ้ง promise ทำงานเบื้องหลัง LINE timeout ยังเป็น 8 วินาที; DB latency/connection contention ต้องวัดรวมในเวลาแต่ละรายการและตรวจ headroom ก่อน transaction 290 วินาทีตาม T-16 ห้ามอ้างว่า transaction timeout เป็นตัว cancel งานทุกอย่างใน callback

`remainingDue` เป็นจำนวน due rows ที่ claim ได้ ณ จบ batch (snapshot ไม่รวม active lease ของ worker อื่นหรืองานที่ยังไม่ materialize); ไม่บวกรวมข้ามรอบ batch พอดีเต็มแต่เหลือ 0 ถือว่าจบได้ `DEFERRED/BATCH_LIMIT` หมายถึงชนเพดาน 80 batches ขณะยังมีงาน; `DEFERRED/EXECUTION_BUDGET` หมายถึงหยุดเพราะเวลา ทั้งคู่ยังทำให้ CLI exit 1 เพื่อให้เห็น unfinished work

readiness อาจยัง healthy ในช่วง defer สั้น ๆ หาก last fully completed tick อายุไม่เกิน 600 วินาที โดยต้องไม่มี due ยาอายุ ≥300 วินาที, due appointment อายุ ≥600 วินาที, `deliveryWindowExpiredLast10Minutes` หรือ `terminalDeliveryFailuresLast10Minutes` มากกว่า 0 สถานะ `FAILED` ทำให้ unhealthy ทันที lastTickCompletedAt ไม่เลื่อนเมื่อ defer/fail; จึงไม่ซ่อน persistent saturation การเกิด 503 จาก buffer ของ burst เริ่มลดลงเป็นสัญญาณ capacity ให้ตรวจ ไม่ใช่หลักฐานว่าข้อความหาย

ติดตาม snapshots ทุกนาที: `pending`, `oldestPendingAgeSeconds`, `oldestDueAgeSeconds`, `remainingDue`, claimed/accepted/retry/expired และ duration ต่อ queue เปรียบเทียบ trend อย่างน้อย 3 ticks; due backlog ที่ไม่ลดหรือ queue ไม่มี claims ทั้งที่มี eligible work ให้ตรวจทันที งานหมดหน้าต่างแยกนับ `deliveryWindowExpired` จาก suppression สาเหตุอื่น ถ้า queue มี progress แต่ backlog โตต่อเนื่อง ต้องลด rollout ให้กลับเข้า capacity envelope ก่อน ไม่ replay ข้อความที่หมดเวลา ดู model และผล synthetic ใน [E1 §15](../phases/PHASE_LINE_QA_E1_NOTIFICATION_OPERATIONS.md#15-current-throughput-and-fairness-remediation-2026-10-20)

release นี้เปลี่ยน timer artifact: ขณะ timer หยุดและ service เดิมจบแล้ว ต้องติดตั้งไฟล์ `.service`/`.timer` จาก release ใหม่ตาม §1.11 แล้ว `daemon-reload` ก่อนเปิด timer; rollback ต้องใช้ unit ของ release ที่ย้อนกลับด้วย การสลับ symlink อย่างเดียวไม่อัปเดต `/etc/systemd/system`

## 2. Deploy (ทุก release)

ลำดับ: build ใน release ใหม่ → migrate deploy → หยุด timer → สลับ symlink → `pm2 startOrReload` (drain 30 วินาที) → ตรวจ → เปิด timer ทุกคำสั่งรันจาก shell ของผู้ดูแล (`sudo`) โดยงานของแอปรันในฐานะ `demi` ผ่าน `sudo -u demi -H` (`-H` ให้ PM2 และ npm ใช้ home `/srv/demi`)

### 2.1 ดึง commit และแตกเป็น release ใหม่

```sh
export SHA='<GIT_SHA>'
export REL="/srv/demi/releases/$SHA"
sudo -u demi -H git -C /srv/demi/repo.git fetch origin '+refs/heads/*:refs/heads/*'
sudo -u demi -H git -C /srv/demi/repo.git cat-file -e "$SHA^{commit}"
sudo -u demi -H mkdir "$REL"
sudo -u demi -H sh -c 'git -C /srv/demi/repo.git archive "$1" | tar -x -C "$2"' sh "$SHA" "$REL"
```

### 2.2 ติดตั้ง dependency และตรวจ env

```sh
sudo -u demi -H sh -c 'cd "$1" && npm ci --include=dev && node_modules/.bin/prisma generate' sh "$REL"
sudo -u demi -H sh -c 'cd "$1" && npm run env:check -- --strict /etc/demi/demi.env' sh "$REL"
```

`env:check` แสดงแค่ชื่อตัวแปรกับสถานะ ไม่แสดงค่า ถ้าเห็น `FAILED` ให้หยุดทันที

### 2.3 Build

```sh
sudo -u demi -H sh -c 'cd "$1" && node --env-file=/etc/demi/demi.env node_modules/next/dist/bin/next build' sh "$REL"
```

ค่า `NEXT_PUBLIC_*` ถูกฝังตอน build ถ้าเปลี่ยนค่าเหล่านี้ต้องสร้าง release ใหม่

### 2.4 Database migration (forward-only)

```sh
sudo -u demi -H sh -c 'cd "$1" && node --env-file=/etc/demi/demi.env node_modules/prisma/build/index.js migrate status' sh "$REL"
sudo -u demi -H sh -c 'cd "$1" && node --env-file=/etc/demi/demi.env node_modules/prisma/build/index.js migrate deploy' sh "$REL"
```

migration รันก่อนสลับ app ระหว่างนั้น release เก่ายังทำงานบน schema ใหม่ release ต้องเป็นแบบ expand-only (เพิ่มได้ ห้ามลบหรือเปลี่ยนชื่อสิ่งที่ release เก่าใช้) ถ้า release ไหนมี migration แบบอื่น ให้ประกาศ maintenance และทำตาม `SUPABASE_PRODUCTION.md` §7 (ยืนยัน backup ล่าสุด) ก่อน

### 2.5 สลับ release และ reload

```sh
sudo systemctl stop demi-scheduler.timer
while systemctl is-active --quiet demi-scheduler.service; do sleep 5; done
sudo -u demi -H sh -c 'readlink -f /srv/demi/current > /srv/demi/previous-release || true'
sudo -u demi -H sh -c 'ln -sfn "$1" /srv/demi/current.next && mv -Tf /srv/demi/current.next /srv/demi/current' sh "$REL"
sudo -u demi -H pm2 startOrReload /srv/demi/current/deploy/pm2/ecosystem.config.cjs
sudo -u demi -H pm2 save
sudo install -m 0644 /srv/demi/current/deploy/systemd/demi-scheduler.service /srv/demi/current/deploy/systemd/demi-scheduler.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start demi-scheduler.timer
```

ใน fork mode reload คือหยุดแล้ว start ใหม่ PM2 ส่ง SIGINT แล้วรอได้ถึง 30 วินาทีให้ `after()` ทำงานจนจบ ระหว่างนั้นอาจมีช่วงสั้นๆ ที่ตอบ 502 (Cloudflare จะแสดงหน้า error ของตัวเอง) ควร deploy ช่วงที่มีผู้ใช้น้อย ส่วน timer หยุดไว้เพื่อไม่ให้ tick ที่กำลังรันถูกตัดกลางทาง (ถ้าถูกตัดก็ปลอดภัย เพราะ lock และ lease จะคลายเอง แต่จะเสียรอบนั้นไป)

### 2.6 ตรวจหลัง deploy

```sh
test "$(sudo readlink -f /proc/$(sudo -u demi -H pm2 pid demi)/cwd)" = "$(readlink -f /srv/demi/current)" && echo "running release OK"
curl -fsS http://127.0.0.1:3000/api/health/live
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS "https://$PROD_HOST/api/health"
```

`/api/health` ต้องได้ `{"status":"ok","checks":{"database":true,"migrations":true,"configuration":true}}` (ค่าใน checks เป็น boolean ล้วน) ถ้าได้ 503 ให้ดู check ที่เป็น `false` แล้ว rollback (§3) ส่วน uptime monitor ภายนอกให้ใช้ `https://<PROD_HOST>/api/health`

หลัง tick รอบถัดไป (timer ทุกนาที; `TOO_SOON` อาจทำให้รออีกหนึ่งรอบหลัง completed) ให้ตรวจ readiness ของ scheduler ตาม §1.11

### 2.7 ล้าง release เก่า (เก็บ 3 ล่าสุด)

```sh
ls -1dt /srv/demi/releases/*/ | tail -n +4 | grep -v -e "$(readlink -f /srv/demi/current)" -e "$(cat /srv/demi/previous-release)" | sudo xargs -r rm -rf
```

## 3. Rollback

ใช้เมื่อ release ใหม่มีปัญหาและ **migration ของ release ใหม่เป็น expand-only** (release เก่าใช้ schema ใหม่ได้):

```sh
sudo systemctl stop demi-scheduler.timer
while systemctl is-active --quiet demi-scheduler.service; do sleep 5; done
sudo -u demi -H sh -c 'ln -sfn "$(cat /srv/demi/previous-release)" /srv/demi/current.next && mv -Tf /srv/demi/current.next /srv/demi/current'
sudo -u demi -H pm2 startOrReload /srv/demi/current/deploy/pm2/ecosystem.config.cjs
sudo -u demi -H pm2 save
sudo install -m 0644 /srv/demi/current/deploy/systemd/demi-scheduler.service /srv/demi/current/deploy/systemd/demi-scheduler.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start demi-scheduler.timer
curl -fsS http://127.0.0.1:3000/api/health
```

- ไม่มีการ "migrate down" ถ้า schema ใหม่ใช้กับ release เก่าไม่ได้ ทางเดียวคือแก้ไปข้างหน้า (release ใหม่) หรือ restore database (`SUPABASE_PRODUCTION.md` §7) ซึ่งข้อมูลหลังเวลา backup จะหาย ต้องให้ owner ตัดสินใจ
- ถ้า release ที่ rollback มีชุด Rich Menu ต่างกัน ให้ทำ rollback Rich Menu ตาม `LINE_PRODUCTION_SETUP.md` §6.4
- ถ้าตัว nginx หรือ systemd unit เปลี่ยนใน release ให้ติดตั้งไฟล์ของ release ที่ rollback กลับไปด้วย (§1.9, §1.11)

## 4. เปลี่ยนค่า env โดยไม่ deploy โค้ด

```sh
sudoedit /etc/demi/demi.env
sudo -u demi -H sh -c 'cd /srv/demi/current && npm run env:check -- --strict /etc/demi/demi.env'
sudo -u demi -H pm2 reload demi
curl -fsS http://127.0.0.1:3000/api/health
```

process อ่าน env file ตอน start เท่านั้น ส่วน timer อ่านใหม่ทุกครั้งที่รัน ค่า `NEXT_PUBLIC_*` ต้อง build ใหม่ (§2)

## 5. Rotate secret

| ตัวแปร | วิธี | ผลระหว่างเปลี่ยน |
| --- | --- | --- |
| `IDENTITY_HASH_SECRET` | **ห้าม rotate** ถ้าไม่มีแผน migration ที่อนุมัติแล้ว (hash ของตัวตนจะเทียบกันไม่ได้) | — |
| `DEMI_SCHEDULER_SECRET` | สร้างค่าใหม่ → §4 timer กับ app อ่านไฟล์เดียวกัน | tick ที่ยิงระหว่าง reload อาจได้ 404 รอบถัดไปตามทัน |
| `DEMI_HOSPITAL_REPORTING_CURSOR_SECRET` | §4 | cursor แบ่งหน้าเดิมใช้ไม่ได้ ผู้ใช้โหลดรายงานใหม่ |
| `DATABASE_URL` / `DIRECT_URL` (รหัสผ่าน DB) | Supabase → Database → Reset password → แก้ทั้งสองค่า → §4 | ช่วงสั้นๆ ระหว่างเปลี่ยนรหัสจนถึง reload จะต่อ DB ไม่ได้ |
| `SUPABASE_SERVICE_ROLE_KEY` / anon key | สร้าง key ใหม่ใน Supabase API Keys → แก้ค่า → anon/publishable เป็น `NEXT_PUBLIC_*` ต้อง build ใหม่ (§2) → revoke key เก่า | ใช้ทั้งสอง key ได้จนกว่าจะ revoke |
| `DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | ออก long-lived token ใหม่ใน LINE Developers → §4 | token เดิมใช้ได้จนกด revoke |
| `DEMI_LINE_MESSAGING_CHANNEL_SECRET` | Reissue ใน LINE Developers → §4 **ทันที** | webhook ที่เข้ามาก่อน reload จะไม่ผ่านการตรวจลายเซ็น (401) |
| `DEMI_LINE_LOGIN_CHANNEL_SECRET`, `DEMI_LINE_MINI_APP_CHANNEL_SECRET` | Reissue → §4 | remote deauthorization ช่วงนั้นเป็น "unconfirmed" |
| `DEMI_LINE_MINI_APP_CONTEXT_KEYRING` | เพิ่ม key ใหม่เป็น `currentKid` แต่เก็บ key เก่าไว้ ≥ 900 วินาทีหลังออกใบสุดท้าย แล้วค่อยลบ (`line-workflow-context.ts`) | — |
| HMAC worker secrets | ดู E1 §3 (VPS ไม่ใช้ เพราะ timer เรียก tick) | — |
| Cloudflare Origin certificate | ออกใบใหม่ใน Cloudflare → แทนไฟล์ §1.6 → `sudo nginx -t && sudo systemctl reload nginx` ก่อนใบเดิมหมดอายุ | ไม่มี |

ห้ามใช้ค่าเดียวกันกับสองวัตถุประสงค์ และห้ามนำค่าจาก demo (Vercel / `Demi-dev`) มาใช้

## 6. หลักฐานที่ต้องบันทึก (ส่งเข้า `RELEASE_GATE.md`)

ทุกครั้งที่ deploy production ให้บันทึก: วันที่, `<GIT_SHA>`, ผล `env:check --strict`, ผล `migrate status` ก่อนและหลัง, ผล `/api/health`, ผล readiness ของ scheduler หลัง tick แรก และผู้ดำเนินการ ห้ามคัดลอกค่า secret หรือข้อมูลผู้ป่วยลงในหลักฐาน
