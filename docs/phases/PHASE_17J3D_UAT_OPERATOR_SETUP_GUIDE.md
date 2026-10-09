# คู่มือผู้ดูแล — เตรียม Account LINE Disconnection / Recovery UAT

วันที่ 2026-10-09 อ้างอิง source commit 53e0d0fa36254b3181b5e077d59e177f957f3e6d

**สถานะ: CONDITIONAL GO — ต้องตรวจข้อมูลและขออนุมัติการทดสอบก่อน ยังไม่เปิดใช้งาน** คู่มือนี้ใช้เตรียมข้อมูล ไม่อนุญาตให้ deploy, apply migration, เปลี่ยน env, เปิด gate หรือถอนสิทธิ์ LINE จริง ดูผลตรวจใน [รายงาน preflight](./PHASE_17J3D_UAT1_ACTIVATION_READINESS_PREFLIGHT.md) และกรณีทดสอบใน [UAT matrix](./PHASE_17J3D_UAT_TEST_MATRIX.md)

## 1. SAFE TO INSPECT NOW — ตรวจได้ตอนนี้โดยไม่เปลี่ยนระบบ

### 1.1 ระบุ environment ให้ชัด

1. เปิด deployment dashboard ที่เจ้าของใช้อยู่ ดูชื่อ project/team, domain, deployment ล่าสุด, Git commit, environment และสิทธิ์ของผู้ดูแล ห้ามกด deploy หรือแก้ค่า
2. ตรวจว่า URL ที่จะใช้บนมือถือเป็น HTTPS และตรงกับ DEMI_LINE_PUBLIC_ORIGIN ขณะนี้ origin ที่ตั้งในเครื่องตอบผ่าน Vercel ไป /login ได้ แต่ยังไม่ยืนยันว่าเป็น UAT หรือใช้ commit นี้
3. เปิดดูชื่อ Supabase project ที่ deployment ใช้ เปรียบเทียบกับ DATABASE_URL, DIRECT_URL และ NEXT_PUBLIC_SUPABASE_URL โดยดู project reference เท่านั้น ห้ามคัดลอก connection string ลงแชทหรือเอกสาร
4. ยืนยันเป็นลายลักษณ์อักษรว่ามีเฉพาะผู้ใช้/ข้อมูลผู้ป่วยจำลองที่จะใช้ทดสอบ ไม่มีการเชื่อมกับบัญชี LINE ของผู้ใช้จริง หากแยกไม่ได้ ให้เสนอ environment แยกและขออนุมัติเตรียมภายหลัง
5. บันทึก SHA, environment, ผู้รับผิดชอบ และชื่ออ้างอิงหลักฐานในพื้นที่ส่วนตัวที่ควบคุมสิทธิ์ แยกค่าจริงออกจากเอกสาร repository

ชื่อ Demi-dev หรือป้าย main / PRODUCTION ของ Supabase เพียงอย่างเดียวไม่พิสูจน์ว่าเป็น production หรือเป็น UAT ต้องตรวจเจ้าของ การใช้งานจริงและข้อมูล ปัจจุบันตรวจพบ Demi-dev ผ่าน connector แต่ยังไม่ได้รับรองข้อมูลทั้งหมดเป็น synthetic

### 1.2 LINE Developers Console — ดูอย่างเดียว

เปิด [LINE Developers Console](https://developers.line.biz/console/) ด้วยบัญชีผู้ดูแลที่มีสิทธิ์อยู่แล้ว:

1. เลือก Provider ของ DEMI ตรวจชื่อ/identifier และสมาชิก/บทบาท บันทึกหลักฐานว่าเป็น Provider ที่ตั้งใจใช้ร่วมกัน ไม่ใช้ Provider ของระบบอื่น
2. เลือกช่องชนิด LINE Login ที่ใช้กับ Account ไป Basic settings ดู Channel ID แล้วเทียบ DEMI_LINE_LOGIN_CHANNEL_ID ไม่เลือก Messaging API channel แทน
3. ไปแท็บ LIFF เปิดแอปเดิม ดู LIFF ID แล้วเทียบ NEXT_PUBLIC_DEMI_LINE_LIFF_ID และดู Endpoint URL ว่าตรงกับ HTTPS UAT origin และ /line/account ห้ามเดา Channel ID จากเลขหน้า LIFF ID
4. ดู LINE Login callback/redirect settings ที่เกี่ยวกับ flow นี้ เปรียบเทียบกับ fixed redirect ของ SDK: /line/account และ Recovery return ที่มี recovery=1 ซึ่งไม่ได้ให้สิทธิ์ใด ๆ ไม่เพิ่ม arbitrary redirect
5. ตรวจ scopes: ต้องมี openid สำหรับยืนยันตัวตน; flow ตรวจ friendship เดิมใช้ profile ไม่เพิ่ม scope หรือขอสิทธิ์ MINI เพียงเพื่อ Unlink
6. ดูสถานะ channel, tester/member roles และสิทธิ์ในการทดสอบ ยืนยันว่า LINE test identities ที่เลือกเปิดแอปได้ ถ้าอยู่ development ให้ผู้ดูแลตรวจ tester permission ตาม Console ปัจจุบัน
7. ตรวจว่า secret ที่จัดเก็บฝั่ง server เป็นของ Account Login channel นี้ โดยตรวจชื่อรายการ/เวอร์ชัน/ผู้ดูแลใน secret store ไม่เปิดเผยค่า ไม่ใช้ Messaging/MINI secret และไม่ regenerate
8. สำรวจ MINI App channels ภายใต้ Provider เดียวกัน เปิดดู DEVELOPING, REVIEW, PUBLISHED แยกกัน บันทึกแต่ละ channel/environment/deployment แม้ source ยังไม่มี MINI runtime
9. ถ้าไม่มี MINI ที่ provision/expose ต่อประชากรทดสอบจริง ให้เจ้าของลงหลักฐานตรวจรายการและขอบเขตว่าเหตุใดไม่เกี่ยวข้อง ห้ามใส่ exclusion เพียงเพราะไม่มี env หรือไม่มีแอปใน source

เก็บภาพเฉพาะข้อมูลจำเป็น ปิด/ตัด secret, token, รายชื่อบุคคลและข้อมูลส่วนตัวออกก่อนส่งต่อ ไม่เปิด MINI ที่ไม่เคยใช้เพื่อพิสูจน์ว่ามีหรือไม่มี grant การเปิดอาจสร้างสิทธิ์ใหม่ ดู [การเพิ่ม/ตรวจ LIFF](https://developers.line.biz/en/docs/liff/registering-liff-apps/) และ [รายการ Authorized apps](https://developers.line.biz/en/docs/line-login/managing-authorized-apps/) ของ LINE

### 1.3 Supabase — ตรวจ project และ Auth policies

1. เปิด [Supabase Dashboard](https://supabase.com/dashboard) เลือก project ที่ยืนยันตรงกับ UAT deployment อย่าสลับตามชื่อคล้ายกัน
2. ดู project reference, region, API URL และ database mapping ห้ามเปิดเผย database password หรือ service role key
3. ไป Auth settings ตรวจ JWT expiry/signing configuration, session time-box, inactivity timeout, single-session policy และ refresh-token reuse interval บันทึกค่าที่เห็นโดยไม่เปลี่ยน
4. หลักฐานเดิม B17J3-03 ของ Demi-dev ทดสอบ Auth v2.197.0: time-box/inactivity = never, single-session ปิด, JWT expiry 3600 วินาที, refresh reuse 10 วินาที รอบนี้ health ยังรายงาน version เดิม แต่ policy ปัจจุบันยังไม่ยืนยัน
5. ถ้าค่าหรือ project/provider behavior เปลี่ยนอย่างมีนัยสำคัญ ให้แจ้งเพื่อวาง focused validation ไม่ลด policy ให้ทดสอบง่าย และไม่รันทดลอง revoke session ยาวซ้ำโดยไม่มีเหตุจำเป็น
6. ดู Site URL/redirect allowlist ที่ใช้กับ DEMI Auth flow รวมถึง domain/cookie scope ของ deployment แยก Supabase redirect จาก LINE LIFF redirect ไม่อนุญาต wildcard เกินขอบเขตที่จำเป็น
7. เตรียมให้ QA ตรวจ actual cookies/cache/return หลัง login บนแต่ละ browser ภายหลัง โดยบันทึกเฉพาะชื่อ cookie/options และผลเปรียบเทียบ session ไม่บันทึก cookie value/JWT/session ID

Recovery จะตรวจ JWT ที่จับมาเพียงตัวเดียวกับ getClaims(jwt) และ getUser(jwt); หากหมดอายุหรือ provider ปฏิเสธ จะไม่เปลี่ยนเป็น JWT ใหม่ในรายการเดียวกัน ผู้ใช้ต้องเข้าสู่ระบบ DEMI ตามปกติแล้วเตรียม Recovery intent ใหม่ อ่าน [Supabase sessions](https://supabase.com/docs/guides/auth/sessions) และ [SSR cookies/cache](https://supabase.com/docs/guides/auth/server-side/advanced-guide) ไม่อ้างว่า /user ตรวจ nominal inactivity/time-box ได้ทันทีทุก policy

### 1.4 ตรวจ migration แบบอ่านอย่างเดียว

ต้องมี target UAT ที่เจ้าของอนุมัติและ connection profile แบบ read-only ก่อน รันเฉพาะคำสั่งอ่าน ไม่ใช้ .env ปัจจุบันโดยอัตโนมัติ ปัจจุบัน **TARGET UAT MIGRATION STATE — NOT VERIFIED**

ตรวจชื่อ migration และ checksum จาก checkout ที่จะ deploy:

~~~powershell
git rev-parse HEAD
Get-FileHash -Algorithm SHA256 -LiteralPath prisma/migrations/20261008120000_line_authorization_lifecycle/migration.sql
~~~

ตัวอย่างต่อไปนี้ใช้ชื่อ connection profile สมมติ demi_uat_readonly ที่ต้องชี้ไป target ที่อนุมัติจริงและเก็บ credential อย่างปลอดภัยอยู่แล้ว ห้ามแทนด้วย password ใน command line/history ห้ามสร้าง profile/credential ในงาน preflight นี้

~~~powershell
@'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SHOW transaction_read_only;
SELECT current_database() AS database_name, current_user AS db_role;
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS prisma_history_exists,
       to_regclass('public."LineAuthorizationLifecycle"') IS NOT NULL AS lifecycle_exists,
       to_regclass('public."LineAccountActionIntent"') IS NOT NULL AS intent_exists;
ROLLBACK;
'@ | psql 'service=demi_uat_readonly' -X -v ON_ERROR_STOP=1
~~~

ถ้าตารางไม่มี ให้หยุดและบันทึก MISSING อย่ารัน migrate เพื่อแก้ทันที ถ้ามีครบแล้วจึงใช้ connection เดิมตรวจ:

~~~powershell
@'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name IN ('20261006120000_line_account_linking_rich_menu',
                        '20261007120000_line_reactive_patient_appointment_receipt',
                        '20261008120000_line_authorization_lifecycle')
ORDER BY migration_name;
SELECT conname, contype, convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_catalog.pg_constraint
WHERE conrelid IN ('public."LineAuthorizationLifecycle"'::regclass,
                   'public."LineAccountActionIntent"'::regclass)
ORDER BY conname;
SELECT indexname, indexdef FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('LineAuthorizationLifecycle', 'LineAccountActionIntent')
ORDER BY indexname;
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
FROM pg_catalog.pg_trigger
WHERE tgrelid = 'public."LineAuthorizationLifecycle"'::regclass AND NOT tgisinternal;
SELECT p.proname, p.prosecdef, p.proconfig, p.proacl
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'line_lifecycle_evidence_guard';
SELECT relname, relrowsecurity, relacl FROM pg_catalog.pg_class
WHERE oid = 'public."LineAuthorizationLifecycle"'::regclass;
SELECT policyname, roles, cmd, qual, with_check FROM pg_catalog.pg_policies
WHERE schemaname = 'public' AND tablename = 'LineAuthorizationLifecycle';
SELECT grantee, privilege_type FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'LineAuthorizationLifecycle';
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'LineAccountActionIntent'
  AND column_name IN ('targetBindingId', 'targetBindingVersion', 'reviewedSetDigest');
ROLLBACK;
'@ | psql 'service=demi_uat_readonly' -X -v ON_ERROR_STOP=1
~~~

DBA ต้องตรวจว่า migration finished และไม่ rolled back, checksum ตรงไฟล์ของ build, unique generation/tuple/attempt ครบ, FK เป็น RESTRICT ตาม source, CHECK constraints ผ่าน/validated, trigger เปิดและ definition ตรง source, function เป็น invoker/search_path ตรงและไม่มี PUBLIC execute, RLS เปิด ไม่มี client policy/grant ที่ให้แก้ lifecycle รวมทั้ง inherited/default grants ไม่ใช่ดูเฉพาะแถว table_privileges ซึ่งอาจแสดงไม่ครบสิทธิ์ที่ได้รับผ่าน role

ใช้ชื่อ database/role จากผลในพื้นที่ส่วนตัวเพื่อยืนยัน target ก่อนเทียบ catalog ผล migration ใน disposable DB ของ phase ก่อนหน้าไม่แทนผล target นี้ เก็บเฉพาะ metadata/boolean/checksum ที่ลบข้อมูล private แล้ว ห้าม SELECT User/Patient/token เพื่อพิสูจน์ migration

ถ้าหลังเปิดจริงมี pending ต้องเก็บ lifecycle และ recovery audit ไว้ ห้าม drop table/enum/trigger หรือ clear rows เพื่อ rollback รุ่นใหม่ยังอาศัยตาราง lifecycle แม้ gate ปิด ขั้นตอน apply migration/backup/rollback deployment ต้องได้รับอนุมัติต่างหาก

### 1.5 ตรวจ token privacy ตลอด outbound path

Platform/security owner ต้องตรวจ Application → fetch → runtime → proxy/tunnel → egress → LINE และช่องทาง browser/analytics/CI:

- [ ] Application/error logging ไม่พิมพ์ URL query, request body, Authorization, cookies, provider response หรือ exception ที่เก็บ request object
- [ ] Next fetch logging/debugging ไม่เปิด full URL สำหรับ token-bearing requests; ตรวจ production และ development แยกกัน
- [ ] Vercel/runtime logs, log drains, APM/OpenTelemetry, Sentry/analytics และ network tracing มีการตัด query/header/body ก่อนส่งหรือเก็บ
- [ ] Forward proxy, TLS inspection, tunnel/request inspector และ outbound gateway ไม่บันทึก access_token หรือสามารถ redact ก่อน persistence ได้จริง
- [ ] Browser replay/analytics ไม่เก็บ POST bodies/storage/cookies; screenshot/console/HAR ที่ส่งออกไม่มี token/subject/ข้อมูลผู้ป่วย
- [ ] CI artifacts, test recordings และ support tooling มีสิทธิ์/retention/redaction ที่ตรวจแล้ว ไม่ใช้ credential จริงใน fixtures
- [ ] Privacy review ครอบคลุมทั้ง new deauthorization verifier และ verifyLineFriendship เดิม ซึ่งเรียก query endpoint ได้แม้ gate ใหม่เป็น false
- [ ] มีหลักฐานตรวจ configuration และผล canary ที่ไม่ใช่ secret ใน controlled non-LINE sink ภายใต้การอนุมัติแยก หากต้องเปิด diagnostic/test traffic

LINE กำหนด access token ใน query ของ GET verify ทางการ ส่วน POST verify ID token ใช้ body ได้ การอนุมัติข้อยกเว้นเดิมไม่ใช่ผลรับรอง infrastructure logs และไม่อนุญาตให้เปิด gate ในงานนี้ ถ้าเข้าถึง logging settings ไม่ได้ ให้ระบุ UNVERIFIED และหยุด token-bearing UAT ไม่ทดสอบด้วย token จริงเพื่อดูว่าจะรั่วหรือไม่

## 2. จัดทำ manifest โดยไม่ใช้ข้อมูลสมมติเปิดระบบ

DEMI_LINE_DISCONNECTION_MANIFEST เป็น JSON ที่ผู้ดูแลจัดทำ ไม่ใช่ secret หรือค่าที่ LINE แจกให้ทั้งก้อน

| Field | วิธีหาค่าจริง |
| --- | --- |
| inventory.revision | ชื่ออ้างอิง revision ของ inventory ที่ตรวจ/ลงชื่อแล้ว เปลี่ยนเมื่อชุดข้อมูลที่ reviewed เปลี่ยน |
| inventory.channels | Account จริงหนึ่ง tuple และ MINI tuples ที่ provision/เกี่ยวข้องจริง สูงสุดรวมแปด tuple |
| kind / environment | Account ใช้ ACCOUNT / ACCOUNT; MINI ใช้ MINI / DEVELOPING หรือ REVIEW หรือ PUBLISHED |
| providerReference | อ้างอิง Provider ที่ตรวจจาก Console และผูกกับหลักฐานส่วนตัว ห้ามเดาหรือเลือกจาก client |
| channelId | Account Login Channel ID หรือ MINI internal-channel ID จาก Console; string เลข 4–20 หลัก |
| deploymentReference | อ้างอิง deployment/environment ที่ตรวจแล้ว; Account ต้องตรง top-level value |
| inventory.miniExclusionReference | หลักฐานตรวจไม่ provision/expose MINI ในขอบเขตนี้เมื่อไม่มี MINI tuple; การขาด config ไม่ใช่หลักฐาน |
| channel.exclusionReference | ใช้เฉพาะ MINI ที่มีหลักฐาน exclusion จริง; ห้ามใช้ลบ historical obligations |
| accountLiffId | LIFF ID จาก Account channel ที่ตรวจแล้ว ตรง public env ไม่เดาจาก prefix |
| appNames | ชื่อแอปที่ผู้ใช้จะเห็น โดย key เป็น SHA-256 ของ tuple; ทุก tuple ที่ตั้งไว้ต้องมีชื่อ |
| migrationEvidence | อ้างอิงผลตรวจ target migration/catalog/checksum จริง |
| providerCredentialEvidence | อ้างอิงผลตรวจว่า secret ใน secure store เป็นของ Login channel นี้ ไม่ใส่ secret |
| exactSessionEvidence | อ้างอิง policy review + B17J3-03 หาก configuration เดิม หรือ focused validation เมื่อเปลี่ยน |
| recoveryUatEvidence | อ้างอิงหลักฐาน prerequisite Recovery ที่ทำแล้วและแผน UAT ที่ review พร้อมระบุ scope ไม่ใส่ PASS ของ device/provider ที่ยังไม่ได้ทดสอบ |

ก่อน UAT ครั้งแรก owner/security ต้องตกลงว่า automated Recovery + แผนที่ review เป็น prerequisite เพียงพอสำหรับ isolated UAT หรือไม่ ถ้านโยบายกำหนดว่าต้องมีผล device UAT เสร็จก่อนเปิด gate เพื่อทดสอบเอง ให้หยุดแก้ความหมาย evidence gate ให้ชัด ไม่แต่งหลักฐานผ่าน

ตัวอย่างนี้ **SYNTHETIC / NOT APPROVED / ห้ามใช้เปิด environment จริง** เลข channel และ LIFF เป็น fixture สมมติทั้งหมด รูปแบบผ่าน schema แต่ไม่มีหลักฐาน readiness จริง:

~~~json
{
  "inventory": {
    "revision": "SYNTHETIC-inventory-v1",
    "channels": [
      {
        "kind": "ACCOUNT",
        "providerReference": "SYNTHETIC-provider",
        "channelId": "1234567890",
        "environment": "ACCOUNT",
        "deploymentReference": "SYNTHETIC-uat"
      }
    ],
    "miniExclusionReference": "SYNTHETIC-not-real-exclusion"
  },
  "accountLiffId": "1234567890-Synthetic",
  "appNames": {
    "a5b280ab6612ba902f86741835825b7f6b0dc5d953dff64769d1a7f562b6a735": "DEMI ทดสอบจำลอง"
  },
  "migrationEvidence": "SYNTHETIC-not-real-migration-proof",
  "recoveryUatEvidence": "SYNTHETIC-not-real-UAT-proof",
  "providerCredentialEvidence": "SYNTHETIC-not-real-credential-proof",
  "exactSessionEvidence": "SYNTHETIC-not-real-session-proof",
  "deploymentReference": "SYNTHETIC-uat"
}
~~~

สูตร key ตรงกับ source: SHA-256 ของ UTF-8 JSON.stringify([providerReference, kind, channelId, environment, deploymentReference]) โดยไม่มี whitespace แทรก ตัวอย่างคำนวณได้อย่างปลอดภัยด้วยข้อมูลสมมติเท่านั้น:

~~~powershell
node -e "const c=require('node:crypto'); console.log(c.createHash('sha256').update(JSON.stringify(['SYNTHETIC-provider','ACCOUNT','1234567890','ACCOUNT','SYNTHETIC-uat'])).digest('hex'))"
~~~

Reference fields ใช้ ASCII [A-Za-z0-9._:/-] ยาว 1–128 ตัว; appNames เป็นชื่อที่ไม่ใช่ secret ยาว 1–100 ตัว env ต้องเก็บ JSON เป็น string โดยไม่ทำให้ quote/บรรทัดเสีย ใช้ env/secret UI ของ deployment และ validate ในงานเตรียมที่อนุมัติภายหลัง ไม่ paste ค่าจริงลงแชท อย่า commit manifest ของ environment ส่วนตัว

## 3. REQUIRES EXPLICIT AUTHORIZATION BEFORE EXECUTION

รายการต่อไปนี้เป็นแผนสำหรับงานถัดไป ยังไม่ทำตอนนี้:

1. เตรียมหรือ deploy isolated UAT environment, ตั้ง domain/LINE endpoint/callback และ apply migration ที่ขาด ต้องระบุ target/backup/เจ้าของ/ขอบเขตการเปลี่ยนก่อน
2. ใส่ manifest จริงและ secret ใน trusted server secret store ห้าม NEXT_PUBLIC_ สำหรับ secret; อนุญาต public เฉพาะ LIFF ID และค่าที่ตั้งใจเปิดเผย ไม่เก็บ secret ใน Git, browser, URL หรือ analytics
3. เตรียม DEMI disposable Users A/B ที่ ACTIVE และ LINE identities L-A/L-B ที่เจ้าของอนุญาต ห้ามส่งรหัสผ่านให้ agent ผ่านแชท เก็บใน password manager หรือระบบ credentials ที่อนุมัติ
4. เตรียม Patient fixtures จำลองตามสิทธิ์ SELF ปกติ แยกกรณี owner ไม่มี Patient authority ด้วย ห้าม import/คัดลอกข้อมูลผู้ป่วยจริงเพื่อให้ทดสอบครบ
5. ตรวจ gates ก่อนเปลี่ยน: ENABLED=true จะเปิด lifecycle-enabled unlink/status/Recovery และ legacy/pending Relink policy; QUERY_ENABLED=true จะยอมให้ new adapter ส่ง token query และต่อด้วย deauthorization เมื่อ targeting/credential/reservation ผ่าน ทั้งสองรวมกันทำให้ permission mutation จริงเกิดจาก Unlink ที่มี token ได้
6. เปิด bundle เฉพาะ target/ประชากรที่อนุมัติเมื่อ entry gates ครบ รวมถึง Recovery ที่พร้อมและ egress privacy; owner ต้องอนุมัติทั้ง gate changes และ actual LINE test mutations แยกจากรายงาน readiness
7. ทำ matrix ตามลำดับและเก็บ sanitized evidence ไม่ทำ load test เพื่อบังคับ 429 ไม่บังคับ real provider race และไม่ retry old deauthorization

การถอนสิทธิ์ test LINE อาจทำให้ LIFF/token ที่ใช้อยู่ใช้ไม่ได้ ต้อง consent ใหม่ในการ Relink/Recovery ที่ผู้ใช้เลือกเอง DEMI credentials และ Patient records เดิมไม่ถูกลบ การเปิดแอปเพื่อ proof อาจสร้าง grant ใหม่ จึงมีคำเตือนและไม่ link อัตโนมัติ

## 4. รับมือเมื่อมี pending แล้ว configuration/provider มีปัญหา

แต่งตั้ง platform owner ที่คืน reviewed manifest, Account LIFF mapping และ build/schema ที่ compatible ได้ พร้อมเก็บ revision/หลักฐานก่อนหน้าใน secure configuration history

- ขาด Channel Secret: local unlink/Recovery ยังทำได้ถ้า config/Auth/LIFF พร้อม remote removal จะไม่ยืนยัน ไม่ใช้ Messaging secret แทน
- Manifest หาย/เสียหรือปิด feature: pending ยังกัน Relink แต่ Recovery ใช้ไม่ได้ ให้คืน bundle ที่ตรวจแล้ว ห้ามปิด flag เพื่อปลดล็อกหรือ clear rows
- Inventory revision/session เปลี่ยน: intent เดิมอาจใช้ไม่ได้ ผู้ใช้เตรียมใหม่หลัง configuration ปกติ
- Account LIFF เข้าไม่ได้: normal DEMI login ยังเป็นทางเข้าปกติ แต่ Recovery ต้องรอ proof จาก channel ที่ถูกต้อง ให้ซ่อม mapping/provider access ไม่ใช้ LINE account อื่นหรือ decoded profile แทน
- Provider timeout: ใช้ self-service Recovery ตาม UI เมื่อ current proof ตรวจได้ ไม่มี retry worker/redispatch ของ attempt เดิม ไม่ต้องให้ admin ปลดล็อกผู้ใช้เป็นกิจวัตร
- Config readiness เสีย: source ปัจจุบันอาจซ่อนปุ่ม local unlink บนหน้า Account แม้ API ทำได้ ให้คืน config ก่อนใช้หน้า หรือขอ focused UX fix ต่างหาก ไม่ถือ API fallback เป็น UI ที่ใช้งานได้แล้ว
- Late provider loss หลัง Relink: ให้ผู้ใช้ยืนยัน identity และ reconnect อย่างชัดเจน ไม่ switch account/restore workflow context/เพิ่ม Patient scope อัตโนมัติ

ให้หยุด UAT ทันทีเมื่อพบข้อมูลจริงผิดขอบเขต, token ใน log, ผิด channel/owner, bypass authorization, remote removal ถูกแสดงสำเร็จโดยไม่มี204 หรือ Recovery unavailable จนไม่สามารถคืนเส้นทางปลอดภัยได้ เก็บหลักฐานแบบ sanitize แล้วส่ง incident ตามผู้รับผิดชอบ ห้ามแก้ด้วยการลด security guards

## OWNER / OPERATOR ACTION CHECKLIST

1. ยืนยัน isolated HTTPS target, deployment SHA, DB/Auth project และ synthetic-only population พร้อมเจ้าของที่คืนระบบได้
2. ตรวจ LINE Provider/Account/LIFF/endpoint/scopes/roles และ MINI inventory/exclusions จาก Console จริง
3. อนุมัติ read-only target DB profile ให้ DBA ตรวจ migration/catalog/checksum และรายงานผล ไม่ apply ใน preflight
4. ให้ Auth owner ยืนยัน policy ปัจจุบันเทียบ B17J3-03 และ platform/security owner ลงผล egress/log redaction ครบทั้ง flow ใหม่และ friendship เดิม
5. Review manifest/evidence scope, secure secret provenance และแผน Recovery/configuration restoration รวมทั้งข้อจำกัด unlink UI ตอน config เสีย
6. ยืนยัน disposable DEMI/LINE A/B และผู้ทดสอบ Android/iOS/external browser พร้อมขอบเขตการถอนสิทธิ์ที่ยินยอม
7. เมื่อหลักฐานครบ จึงอนุมัติงาน UAT execution แยก โดยระบุ gate changes/provider mutations/deployment/migration ที่อนุญาตและ stop conditions ไม่ถือคู่มือนี้เป็นการอนุมัติ
