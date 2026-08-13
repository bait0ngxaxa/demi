# AGENTS.md

## 1. Priorities and Scope

* ลำดับความสำคัญ: **Correctness > Security > Maintainability > Performance > Speed**
* ทำการแก้ไขให้น้อยที่สุดเท่าที่จำเป็น และสอดคล้องกับ architecture เดิม
* อ่านโค้ดที่เกี่ยวข้องก่อนแก้ไข ห้ามคาดเดา behavior จากชื่อไฟล์หรือชื่อฟังก์ชัน
* ห้ามแก้ไฟล์นอก scope, rewrite โค้ดโดยไม่จำเป็น หรือ revert การเปลี่ยนแปลงเดิมของผู้ใช้
* งานปรับ UI/style ต้องไม่เปลี่ยน business logic เว้นแต่ได้รับคำสั่งโดยตรง

## 2. Thai Text and Encoding

* **ห้ามทำข้อความภาษาไทยเพี้ยน สูญหาย ถูกแปล หรือเกิด mojibake เด็ดขาด**
* รักษา encoding, BOM และ line endings เดิมของไฟล์
* ไฟล์ข้อความใหม่ให้ใช้ **UTF-8 without BOM** เว้นแต่ repository กำหนดไว้ต่างออกไป
* เมื่อใช้ PowerShell ต้องระบุ encoding ทุกครั้งที่อ่านหรือเขียน เช่น:

```powershell
Get-Content -Raw -Encoding UTF8
Set-Content -Encoding utf8NoBOM
```

* ห้ามเขียนทับไฟล์ภาษาไทยผ่านคำสั่งที่ใช้ default encoding
* ตรวจ `git diff` หลังแก้ไขเพื่อค้นหาอักขระเพี้ยน เช่น `�`, ข้อความไทยผิดรูป หรือการเปลี่ยน encoding ทั้งไฟล์
* ห้ามเปลี่ยนข้อความภาษาไทยเป็นภาษาอังกฤษโดยไม่ได้รับอนุญาต

## 3. Documentation and Repository Context

* ตรวจ project instructions, types, tests, schemas และ implementation เดิมก่อนสร้างของใหม่
* ใช้ implementation และ conventions ภายใน repository เป็นแหล่งอ้างอิงแรก
* เมื่อต้องใช้ API หรือ behavior จาก library ภายนอก ให้ตรวจเอกสารล่าสุดผ่าน **Context7 MCP** หรือ official documentation
* ห้ามเดา API, configuration option, framework behavior หรือ package version
* หากเอกสารไม่ชัดเจน ให้ระบุ assumption และเลือกแนวทางที่มีผลกระทบน้อยที่สุด
* งาน UI/UX ต้องใช้ **Impeccable skill** และปฏิบัติตาม design system เดิมของโปรเจกต์

## 4. Code Quality and Type Safety

* ส่งมอบ implementation ที่สมบูรณ์ ห้ามใช้ placeholder เช่น `// ...`, pseudo-code หรือฟังก์ชันว่าง
* เน้น reuse ก่อนสร้าง abstraction หรือ implementation ใหม่
* ใช้หลัก SRP, DRY, KISS, early return และ pure functions เมื่อเหมาะสม
* หลีกเลี่ยง mutation โดยไม่จำเป็น
* First-party code ที่แก้ไขใหม่ต้องไม่มี `any`
* ใช้ `unknown` ร่วมกับ schema validation หรือ type guard
* กำหนด return type ให้ฟังก์ชันที่ export, service, hook, action และ API handler
* จัดการ `null` และ `undefined` อย่างชัดเจน ห้ามใช้ non-null assertion โดยไม่มีหลักฐานรองรับ
* ห้ามเปลี่ยน generated code หรือ vendor code เพื่อหลบ type error

## 5. Validation, Security and Errors

* Validate input ทุกจุดที่ข้อมูลเข้าสู่ระบบ เช่น API, server action, form, webhook และ environment variables
* ใช้ schema เป็น Single Source of Truth และ derive types จาก schema เมื่อทำได้
* ตรวจ authentication และ authorization ฝั่ง server ทุก mutation
* ห้ามเชื่อ role, owner ID หรือ permission ที่ส่งมาจาก client
* ห้าม hardcode secrets, credentials, tokens หรือ sensitive configuration
* ห้ามส่ง stack trace, SQL error, internal path หรือ implementation detail กลับไปยัง client
* Client-facing errors ต้องปลอดภัยและเข้าใจได้ ส่วนรายละเอียดทางเทคนิคให้บันทึกใน server logs

ลำดับมาตรฐานสำหรับ server mutation:

1. Request size / abuse protection / rate limit
2. Authentication
3. Input parsing and schema validation
4. Resource-level authorization
5. Business rules
6. Transactional persistence
7. Cache invalidation or revalidation
8. Sanitized response

## 6. Architecture and Single Source of Truth

* Types, constants, validation schemas และ business rules ต้องมี authoritative source เพียงจุดเดียว
* Dependency direction:

```text
UI → Hooks → Services → Data Layer
```

* Layer ด้านล่างห้าม import จาก layer ด้านบน
* UI ห้ามเข้าถึง database หรือ persistence implementation โดยตรง
* Business logic ที่ใช้หลาย entry points ต้องอยู่ใน service/domain layer ไม่ duplicate ใน route หรือ component
* หลีกเลี่ยง circular dependencies และ hidden side effects

## 7. API and Database

* Public API ที่ต้องรองรับระยะยาวควรใช้ versioned endpoints
* Dataset ที่สามารถเติบโตมากให้ใช้ cursor-based pagination
* Mutation ที่อาจถูก retry, duplicate submission หรือมีผลกระทบสำคัญต้องออกแบบ idempotency semantics ให้ชัดเจน
* ห้ามประกอบ SQL จาก user input ด้วย string concatenation
* ใช้ parameterized queries หรือ ORM query APIs เท่านั้น
* Raw SQL ห้ามใช้ `SELECT *`; เลือกเฉพาะ field ที่ต้องใช้
* ใช้ transaction เมื่อหลาย operation ต้องสำเร็จหรือล้มเหลวพร้อมกัน
* Production schema changes ต้องผ่าน migration เท่านั้น
* ตรวจ uniqueness, foreign keys และ concurrency constraints ที่ database layer เมื่อเป็น business invariant

## 8. Performance and Reliability

* หลีกเลี่ยง accidental `O(n²)`, N+1 queries และ repeated database/network calls
* ใช้ `Map` หรือ `Set` เมื่อมี repeated lookup และข้อมูลมีขนาดที่เหมาะสม
* ใช้ `Promise.all` เฉพาะ operation ที่เป็นอิสระต่อกันและรองรับ concurrent execution
* ห้าม parallelize operation ที่มี dependency, transaction order หรือ shared mutable state
* ใช้ caching เมื่อกำหนด owner, TTL, invalidation และ consistency behavior ได้ชัดเจน
* ใช้ dynamic import เฉพาะ dependency ที่มีขนาดใหญ่ ไม่จำเป็นต่อ initial path และให้ประโยชน์ที่ตรวจสอบได้
* Retry เฉพาะ transient failures และ operation ที่ปลอดภัยต่อการ retry
* Retry ต้องมีจำนวนครั้งสูงสุด, exponential backoff และ jitter
* อย่า optimize จากการคาดเดาในเส้นทางที่ไม่ใช่ hot path

## 9. Testing and Verification

ให้รันเฉพาะ checks ที่เกี่ยวข้องกับการเปลี่ยนแปลง:

1. Lint
2. Typecheck
3. Targeted tests
4. Test suite ที่กว้างขึ้นเมื่อความเสี่ยงต่อ regression สูง

* ใช้ scripts ที่ repository กำหนดไว้เป็นหลัก
* ไม่ต้อง build หรือรัน dev server เว้นแต่ผู้ใช้สั่ง, ต้อง reproduce ปัญหา หรือไม่มีวิธีตรวจสอบอื่น
* Tests ต้องตรวจ behavior ไม่ผูกกับ implementation detail
* Unit tests สำหรับ business rules และ pure logic
* Integration tests สำหรับ database, authorization และ critical mutations
* E2E tests สำหรับ critical user flows ทั้ง happy path และ error path
* ห้ามแก้ test เพียงเพื่อให้ผ่านโดยไม่ตรวจว่า behavior ที่คาดหวังยังถูกต้อง
* หากรันคำสั่งใดไม่ได้ ต้องระบุคำสั่ง สาเหตุ และสิ่งที่ยังไม่ได้ verify

## 10. Git and Delivery

* ตรวจ `git status` และ `git diff` ก่อนและหลังแก้ไข
* ห้ามใช้ destructive Git commands, force push หรือ reset งานของผู้ใช้โดยไม่ได้รับอนุญาต
* ห้ามเปลี่ยน lockfile, generated files หรือ format ทั้ง repository หากไม่จำเป็นต่อ task
* รักษา diff ให้เล็ก อ่านง่าย และแยก concern ชัดเจน
* ก่อนจบงานให้สรุป:

  * ไฟล์ที่แก้ไข
  * Behavior ที่เปลี่ยน
  * Security หรือ architecture decisions ที่สำคัญ
  * Commands และ tests ที่รันพร้อมผลลัพธ์
  * ข้อจำกัด assumption หรือความเสี่ยงที่ยังเหลือ


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
