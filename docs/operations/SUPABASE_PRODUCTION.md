# SUPABASE_PRODUCTION — project production บน Supabase Pro

สถานะ: runbook ยังไม่ได้ทำกับ project จริง (agent ไม่มีสิทธิ์สร้างหรือแก้ Supabase project) `Demi-dev` ยังเป็น demo บน Free ต่อไป และ**ห้าม**ใช้กับข้อมูลผู้ป่วยจริง: Free project จะ pause เมื่อไม่มีการใช้งานนาน 7 วัน, ไม่มี backup ให้ดาวน์โหลด และเปิด leaked-password protection ไม่ได้

| Placeholder | ความหมาย |
| --- | --- |
| `<SUPABASE_REGION>` | region ของ project **รอคำตอบด้านกฎหมาย** (การส่งข้อมูลข้ามประเทศ ก-25) ห้ามสร้าง project ก่อนได้คำตอบ เพราะเปลี่ยน region ภายหลังไม่ได้ |
| `<PROJECT_REF>` | project ref ของ production |
| `<PROD_ORIGIN>` | origin ของ DEMI production |
| `<VPS_PUBLIC_IP>` | IP ขาออกของ VPS |

## 1. สร้าง project

1. Organization ที่เป็น **Pro plan** → New project
2. Name: `demi-production`; Region: `<SUPABASE_REGION>`; Database password: สุ่มยาว ≥ 32 ตัว เก็บใน password manager ของทีม (ไม่ส่งในแชต)
3. Compute: เริ่มที่ค่า default ของ Pro แล้วดูการใช้งานจริงก่อนปรับ
4. บันทึก `<PROJECT_REF>` ลงหลักฐานใน `RELEASE_GATE.md`

## 2. Database connection และ network

- Project Settings → Database → **SSL enforcement**: On
- **Network restrictions**: อนุญาตเฉพาะ `<VPS_PUBLIC_IP>/32` (และ IP ของผู้ดูแลชั่วคราวเฉพาะตอนทำ restore drill)
- connection string ที่ใช้ใน `/etc/demi/demi.env`:
  - `DATABASE_URL`: **Session pooler** (port 5432, host `aws-0-<SUPABASE_REGION>.pooler.supabase.com`, user `postgres.<PROJECT_REF>`) ต่อท้าย `?connection_limit=5` server เป็น process เดียวที่รันยาว ไม่ต้องใช้ transaction pooler (6543) ต้องให้ pool ≥ 2 เพราะ scheduler tick ถือ connection หนึ่งไว้สำหรับ lock (E1 §2)
  - `DIRECT_URL`: Session pooler ตัวเดียวกัน (ไม่ต้องมี `connection_limit`) หรือ Direct connection ถ้า VPS มี IPv6
- app ต่อด้วย role `postgres` ผ่าน Prisma ต้องอ่าน `_prisma_migrations` ได้ (readiness และ LINE disconnection readiness ใช้ตารางนี้)

## 3. API และ Data API

- Project Settings → API Keys: คัดลอก Project URL → `NEXT_PUBLIC_SUPABASE_URL`, publishable/anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, secret/service_role key → `SUPABASE_SERVICE_ROLE_KEY` (server-only ห้ามซ้ำกับ anon)
- DEMI อ่านเขียนข้อมูลผ่าน Prisma ตรง และใช้ Supabase เฉพาะ Auth กับ Storage ไม่เรียก Data API (PostgREST) เลย ให้ **ปิด Data API** (Project Settings → Data API → Enable Data API = Off) หรืออย่างน้อยเอา `public` ออกจาก Exposed schemas เพื่อไม่ให้ตารางใน `public` เข้าถึงได้ด้วย anon key

## 4. Auth

DEMI สร้างผู้ใช้ผ่าน admin API (`auth.admin.createUser` ด้วยอีเมล alias ภายในและ `email_confirm: true`) และ login ด้วย `signInWithPassword` ไม่มี OAuth, magic link, OTP หรือ signup สาธารณะ

| ตั้งค่า | ค่า |
| --- | --- |
| Authentication → Sign In / Providers → Allow new users to sign up | **Off** (admin API ยังสร้างผู้ใช้ได้) |
| Email provider | **On** (password login ใช้ email alias) |
| Phone, Anonymous sign-ins, OAuth providers ทั้งหมด | Off |
| Password → Minimum length | **12** (ตรงกับ `userOwnedPasswordSchema` ใน `src/modules/auth/schemas/password-schema.ts`) |
| Password → **Leaked password protection** | **On** (มีเฉพาะ Pro) |
| URL Configuration → Site URL | `<PROD_ORIGIN>` |
| URL Configuration → Redirect URLs | `<PROD_ORIGIN>` เท่านั้น (ไม่มี wildcard; DEMI ไม่มี redirect flow) |
| Attack protection / rate limits | ค่า default |

ข้อควรระวัง: เมื่อเปิด leaked-password protection ถ้าผู้ใช้ตั้งรหัสที่รั่วไหล Supabase จะปฏิเสธ แต่ปัจจุบัน DEMI แสดงข้อความปฏิเสธแบบทั่วไป ไม่ได้บอกว่ารหัสรั่ว ต้องทดสอบใน UAT (`RELEASE_GATE.md` T-12)

## 5. Storage

โค้ดใช้ bucket ส่วนตัว **หนึ่ง** bucket (`SUPABASE_PATIENT_EVIDENCE_BUCKET`) ร่วมกันสำหรับรูปหลักฐานผู้ป่วยและรูปในเนื้อหาของโรงพยาบาล เข้าถึงด้วย service role ฝั่ง server เท่านั้น และให้ผู้ใช้ดูผ่าน signed URL อายุสั้น

SQL Editor:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-evidence', 'patient-evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp']);
```

- `8388608` = `NORMALIZED_UPLOAD_MAX_BYTES` (8 MiB) ใน `src/modules/patient-evidence/policies/patient-evidence-image-policy.ts`
- **ห้าม**สร้าง policy บน `storage.objects` ให้ `anon` หรือ `authenticated` (service role ข้าม RLS อยู่แล้ว ถ้าไม่มี policy อื่นจะถูกปฏิเสธเป็นค่าเริ่มต้น)
- ตรวจ: `select id, public, file_size_limit, allowed_mime_types from storage.buckets;` ต้องได้แถวเดียวที่ `public = false`

## 6. Migration และ advisors

1. รัน migration จาก VPS ตาม `DEPLOY_VPS.md` §2.4 (ไม่รันจากเครื่องส่วนตัว)
2. ตรวจใน SQL Editor:

```sql
select count(*) filter (where finished_at is not null and rolled_back_at is null) as applied,
       count(*) filter (where finished_at is null and rolled_back_at is null) as failed
from _prisma_migrations;
```

   `failed` ต้องเป็น 0 และ `applied` ต้องเท่ากับจำนวนโฟลเดอร์ใน `prisma/migrations` ของ release (`/api/health` ตรวจเรื่องเดียวกันแล้วตอบเป็น `migrations: true/false`)
3. Advisors → **Security Advisor** และ **Performance Advisor** กด Rerun ทั้งสองตัว
   - **เกณฑ์ผ่าน: 0 ERROR และ 0 WARN ทั้งสองตัว** ส่วน INFO ให้ทบทวนและบันทึกเหตุผลที่คงไว้
   - การแก้ที่ต้องเปลี่ยน schema ให้ทำเป็น migration ใน phase แยก (เหมือน E1 §8 `function_search_path_mutable`) ห้ามแก้ใน dashboard ตรงๆ เพราะ migration history จะไม่ตรงกับ database
   - บันทึก screenshot หรือ export ผล advisor พร้อมวันที่ลงใน `RELEASE_GATE.md` T-07

## 7. Backup และ restore drill

### 7.1 นโยบาย (owner ต้องอนุมัติ)

| เรื่อง | Supabase Pro | ต้องตัดสินใจ |
| --- | --- | --- |
| Database | backup รายวันอัตโนมัติ เก็บ 7 วัน ดาวน์โหลดได้ ถ้าไม่มี PITR จะเสียข้อมูลได้สูงสุดราว 24 ชั่วโมง (RPO) | จะซื้อ PITR add-on หรือไม่ (RPO เป็นนาที) |
| Storage objects (รูปหลักฐาน) | **ไม่รวม**ใน database backup | วิธีสำรองรูปแยก หรือยอมรับความเสี่ยงเป็นลายลักษณ์อักษร |
| สำเนานอก Supabase | ไม่มีโดย default | ถ้าจะทำ `pg_dump` เก็บนอก Supabase ต้องอยู่ในประเทศ/ที่เก็บที่ผ่าน ก-25 และเข้ารหัส |

### 7.2 Restore drill (ทำก่อน go-live และซ้ำทุกไตรมาส)

ทำครั้งแรกตอน production ยังมีแต่ข้อมูลสังเคราะห์ หลังจากมีข้อมูลจริงแล้ว การ drill จะเป็นการประมวลผลข้อมูลส่วนบุคคล ต้องใช้ region เดียวกัน จำกัดคนเข้าถึง และลบ project ทิ้งทันทีที่เสร็จ

1. จด**เวลาเริ่ม** แล้วนับจำนวนแถวอ้างอิงใน production (SQL Editor):

```sql
select (select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null) as migrations,
       (select count(*) from "User") as users,
       (select count(*) from "Hospital") as hospitals,
       (select count(*) from "PatientProfile") as patients,
       (select count(*) from "PatientAppointment") as appointments,
       now() as counted_at;
```

2. Database → Backups → Scheduled backups เลือก backup ล่าสุด ถ้ามี **Restore to a new project** ให้ใช้ (ตั้งชื่อ `demi-restore-drill-<YYYYMMDD>`, region `<SUPABASE_REGION>`) ถ้าไม่มี ให้ **Download** แล้วสร้าง project เปล่าชื่อเดียวกันใน region เดียวกัน จากนั้น restore จาก VPS:

```sh
read -rs SCRATCH_DB_URL && export SCRATCH_DB_URL
gunzip -c ./<BACKUP_FILE>.backup.gz | psql "$SCRATCH_DB_URL" --set ON_ERROR_STOP=0 -q
```

   `SCRATCH_DB_URL` คือ Session pooler URL ของ project ที่ใช้ drill (พิมพ์แบบซ่อนค่า ไม่เก็บใน history) และต้องลง `postgresql-client` ที่ major version ตรงกับ Postgres ของ project ก่อน ข้อความ error เรื่อง role หรือ extension ที่มีอยู่แล้วเป็นเรื่องปกติของการ restore ลง Supabase project ใหม่
3. ตรวจผลบน scratch project ด้วย SQL ข้อ 1 ตัวเลขต้องตรงกับ production ณ เวลาที่ backup ถูกสร้าง (ส่วนต่างอธิบายได้ด้วยข้อมูลหลังเวลานั้น) แล้วตรวจ schema:

```sh
cd /srv/demi/current
DATABASE_URL="$SCRATCH_DB_URL" DIRECT_URL="$SCRATCH_DB_URL" node_modules/.bin/prisma migrate status
unset SCRATCH_DB_URL
```

   ต้องได้ `Database schema is up to date!`
4. ลบ scratch project (Project Settings → General → Delete project) และปิด IP ชั่วคราวใน network restrictions
5. บันทึกหลักฐานใน `RELEASE_GATE.md` T-08:

| หลักฐาน | ค่า |
| --- | --- |
| วันที่/ผู้ทำ | |
| backup ที่ใช้ (เวลาที่สร้าง) | |
| วิธี (Restore to new project / Download + psql) | |
| เวลาเริ่มถึง restore เสร็จ (RTO ที่วัดได้) | |
| อายุข้อมูลของ backup ตอนเริ่ม (RPO ที่วัดได้) | |
| ตัวเลขตรวจ production เทียบ scratch | |
| ผล `prisma migrate status` | |
| ลบ scratch project แล้ว (เวลา) | |

ห้ามใส่ข้อมูลผู้ป่วย, connection string หรือรหัสผ่านลงในหลักฐาน
