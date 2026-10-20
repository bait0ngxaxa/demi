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

ใช้เฉพาะ scratch project ใน region ที่อนุมัติและมี access จำกัด การ drill หลังมีข้อมูลจริงเป็นการประมวลผลข้อมูลส่วนบุคคล ห้ามชี้คำสั่ง restore ไปยัง production ห้าม reset/migrate production ระหว่าง drill และห้ามจบงานว่า pass หากคำสั่ง restore หรือ validation ใดล้มเหลว

ตรวจชนิด backup และขั้นตอนของ provider ตาม [Supabase backups](https://supabase.com/docs/guides/platform/backups) และ [Supabase restore/migration guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore); ใช้ตัวเลือก PostgreSQL ตามเอกสาร [`pg_dump`](https://www.postgresql.org/docs/current/app-pgdump.html), [`pg_restore`](https://www.postgresql.org/docs/current/app-pgrestore.html) และ [`psql`](https://www.postgresql.org/docs/current/app-psql.html) ที่ตรงกับ client/server version

1. เลือก backup และจด provider, backup ID, รูปแบบ, เวลาที่สร้าง, เวลาจุดกู้คืน และเวลาที่เริ่ม drill ก่อน restore ให้จัดเตรียม **backup-time reference** สำหรับตารางสำคัญ (`_prisma_migrations`, `User`, `Hospital`, `PatientProfile`, `PatientAppointment`) จากหลักฐานที่ผูกกับ snapshot เวลานั้น ไม่ใช้ counts จาก production ปัจจุบันแทน หากไม่มี reference ที่เชื่อถือได้ T-08 ยังไม่ผ่าน
2. แยก backup ตามรูปแบบจริงและเอกสารของแหล่งที่มา ไม่อนุมานจากนามสกุลไฟล์เพียงอย่างเดียว:
   - Physical/PITR backup ให้ใช้ Supabase **Restore to a new project / Restore to another project** ตามชนิด backup นั้น ไม่ป้อนเข้า `psql` หรือ `pg_restore` เอง
   - Plain SQL หรือ plain SQL ที่บีบอัด (`.sql`, `.sql.gz` หรือไฟล์ที่เอกสาร Supabase ระบุว่าเป็น SQL) ใช้ `psql` เท่านั้น; decompress ก่อนหรือ pipe โดยเปิด shell `pipefail` และหยุดเมื่อคำสั่งใดผิดพลาด
   - PostgreSQL custom, tar หรือ directory archive ใช้ `pg_restore` เท่านั้น ตรวจรายการ archive (`pg_restore --list`) ให้สำเร็จก่อน restore
   - หาก format ไม่ชัด, archive listing ไม่ผ่าน, client major version ไม่รองรับ หรือ dump มีคำสั่งที่ใช้กับ single transaction ไม่ได้ ให้หยุดและเลือกวิธี restore ที่ Supabase รองรับ; ห้ามลองหลาย tool แล้วถือ partial restore ว่าสำเร็จ
3. สำหรับ logical backup ให้สร้าง scratch project ว่างชื่อ `demi-restore-drill-<YYYYMMDD>` ใน region ที่อนุมัติ แล้วเตรียมไฟล์ใน directory สิทธิ์ `0700` โดยไม่เก็บ connection string ใน shell history/log. ใช้ PostgreSQL client รุ่นที่เข้ากันกับ server; ใน shell ของผู้ดูแลเปิด `set -euo pipefail`, `set +x` แล้วรับค่า URL ของ scratch แบบไม่ echo (`read -rsp 'Scratch DB URL: ' SCRATCH_DB_URL; printf '\n'; export SCRATCH_DB_URL; trap 'unset SCRATCH_DB_URL' EXIT`). ห้ามใช้ URL ของ production. คำสั่งตัวอย่างด้านล่างทำงานกับ scratch URL เท่านั้น:

   Plain SQL:

```sh
gzip -t -- ./<BACKUP_FILE>.sql.gz
set -o pipefail
gzip -dc -- ./<BACKUP_FILE>.sql.gz | psql --dbname="$SCRATCH_DB_URL" --single-transaction --set=ON_ERROR_STOP=1 --file=-
```

   หากเป็น `.sql` ที่ไม่บีบอัด ให้ใช้ `psql --dbname="$SCRATCH_DB_URL" --single-transaction --set=ON_ERROR_STOP=1 --file=./<BACKUP_FILE>.sql`.

   Custom/tar archive (directory archive ส่ง path ของ directory แทนไฟล์):

```sh
pg_restore --list ./<BACKUP_ARCHIVE> > ./<PRIVATE_DIR>/archive.list
pg_restore --dbname="$SCRATCH_DB_URL" --single-transaction --exit-on-error ./<BACKUP_ARCHIVE>
```

   `--single-transaction` และ `--exit-on-error` ทำให้ restore ที่มี error ไม่กลายเป็นสำเร็จบางส่วน หาก dump ชนกับ Supabase-managed role, extension, ownership หรือ grant ให้หยุด ตรวจเอกสาร backup และ object ที่เกี่ยวข้อง แล้วเริ่มใหม่บน scratch ที่สะอาดด้วยขั้นตอนที่รองรับและบันทึก mapping/validation ที่อนุมัติแล้ว อาจใช้ `--no-owner` หรือ `--no-privileges` กับ archive ได้เฉพาะเมื่อมีการทบทวน role/grant mapping แยกและตรวจสิทธิ์ที่ได้จริง; ห้ามปิด error handling หรือมอง error ว่า “ปกติ” โดยไม่ตรวจ
4. เมื่อ restore command จบ exit code 0 เท่านั้น จึงเริ่ม validation: เปรียบเทียบ counts ของตารางสำคัญกับ **backup-time reference** ของ snapshot เดียวกันและบันทึกค่าคาดหวัง/ค่าที่ restore ได้; ตรวจ `_prisma_migrations` ผ่าน SQL ใน §6 และ `prisma migrate status`; จาก release ที่ต้องการตรวจ รัน read-only schema diff:

```sh
cd /srv/demi/current
DATABASE_URL="$SCRATCH_DB_URL" DIRECT_URL="$SCRATCH_DB_URL" node_modules/.bin/prisma migrate status
DATABASE_URL="$SCRATCH_DB_URL" DIRECT_URL="$SCRATCH_DB_URL" node_modules/.bin/prisma migrate diff --from-url "$SCRATCH_DB_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

   ต้องได้ migration status `Database schema is up to date!`, schema diff exit code `0` (ไม่มี diff) และ checks ของ §6 ผ่านทั้งหมด สำหรับ RLS, grants, extensions, functions, triggers หรือ database objects ที่ Prisma diff ไม่ครอบคลุม ให้ตรวจด้วย query/assertion ใน §6 ที่เกี่ยวข้อง หากข้อใด fail, มี restore error ที่ยังไม่แก้ หรือไม่มี backup-time reference ให้ T-08 เป็น `ไม่ผ่าน`/`เปิด`; ห้ามอธิบาย count ที่ต่างด้วยการเทียบกับข้อมูลปัจจุบัน

   ใช้ query แบบ aggregate นี้บน scratch แล้วเทียบแต่ละค่า กับ backup-time reference ของ snapshot เดียวกัน:

```sql
select (select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null) as migrations,
       (select count(*) from "User") as users,
       (select count(*) from "Hospital") as hospitals,
       (select count(*) from "PatientProfile") as patients,
       (select count(*) from "PatientAppointment") as appointments,
       now() as measured_at;
```

   เก็บเฉพาะตัวเลขและเวลาวัด ห้ามแนบ row/sample data หรือข้อมูลระบุตัวบุคคล
5. วัด RTO ตั้งแต่เวลาที่เริ่ม recovery drill จน restore **และ validation** เสร็จ วัด RPO จากเวลา recovery point ของ backup เทียบเวลาที่เกิดเหตุ/จุดอ้างอิงที่กำหนด บันทึกเวลาจริงพร้อม timezone, restore exit status, validation results และการนับที่ไม่ระบุตัวบุคคล จากนั้นลบ scratch project และปิด IP ชั่วคราวใน network restrictions
6. บันทึกหลักฐานใน `RELEASE_GATE.md` T-08:

| หลักฐาน | ค่า |
| --- | --- |
| วันที่/ผู้ทำ/เขตเวลา | |
| backup ID, format, เวลาที่สร้างและ recovery point | |
| backup-time reference (ที่มาและเวลา; ไม่มีแล้ว T-08 ไม่ผ่าน) | |
| วิธี/tool/client version ที่ใช้ | |
| restore exit status และ error review | |
| count reference เทียบ scratch (เฉพาะ aggregate) | |
| ผล §6, `prisma migrate status`, schema diff exit code | |
| เวลาเริ่มถึง validation เสร็จ (RTO ที่วัดได้) | |
| อายุ recovery point ตามจุดอ้างอิง (RPO ที่วัดได้) | |
| ลบ scratch project แล้ว (เวลา) | |

ห้ามใส่ข้อมูลผู้ป่วย, connection string, token หรือรหัสผ่านลงในหลักฐาน
