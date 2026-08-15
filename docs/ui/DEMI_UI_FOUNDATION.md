# DEMI UI Foundation

เอกสารนี้เป็น convention สำหรับ protected application UI ภายใต้ `/app/*` โดยต่อยอดจาก token เดิมใน `app/globals.css` และ visual direction “Quiet Clinical Access” ใน `DESIGN.md`

## Application shell

`app/app/layout.tsx` resolve `ActorContext` ด้วย `getProtectedApplicationActor()` แล้วประกอบ `AppShell` ซึ่งมี:

- desktop sidebar แบบคงที่สำหรับ viewport ตั้งแต่ `lg`;
- compact mobile header และ modal navigation drawer ที่ใช้โครงสร้างเมนูเดียวกัน;
- application header สำหรับ role context และ logout;
- `<main>` เดียว พร้อม content width และ page spacing มาตรฐาน

Public routes เช่น `/login` และ `/activate/patient` ไม่ใช้ protected shell

## Information architecture

```text
หน้าหลัก

บุคลากร
  จัดการบุคลากร

ผู้ป่วย
  เพิ่ม / นำเข้าผู้ป่วย
  เปิดใช้งานบัญชีผู้ป่วย

ผู้ดูแลระบบ
  คำขอขึ้นทะเบียนโรงพยาบาล
```

`application-navigation.ts` เป็น source เดียวสำหรับ navigation projection และ reuse policy/scope helpers ของ domain เมนูและกลุ่มที่ actor ใช้ไม่ได้ต้องถูก omit ทั้งกลุ่ม ห้าม render กลุ่มว่าง

Navigation visibility เป็น UX projection เท่านั้น ไม่ใช่ authorization ทุก page, Server Action และ service ต้องคงการตรวจ Role + Capability + Scope ฝั่ง server แบบ fail closed

Application navigation ใช้สำหรับเปลี่ยน domain/operation ส่วน local navigation ใช้สลับโหมดภายใน operation เดียว เช่น “เพิ่มรายบุคคล / นำเข้าจาก Excel” ห้ามแยกสองโหมดนี้เป็น sidebar entries และห้ามรวม Patient Provisioning กับ Patient Activation

## Page hierarchy

Protected feature page ใช้ลำดับต่อไปนี้:

1. `PageHeader`: breadcrumb/section context, ชื่อหน้า, คำอธิบาย และ optional primary action/status
2. optional local navigation
3. content sections: Hospital context, form, table, result/status

ใช้ heading, whitespace, separator และ table เป็น hierarchy หลัก ใช้ `Panel` เมื่อข้อมูลต้องมีขอบเขตชัด เช่น form, Hospital selector หรือ grouped result ไม่ครอบทุก heading/paragraph ด้วย card และไม่ซ้อน panel โดยไม่มีเหตุผล

## Design tokens

`app/globals.css` กำหนด semantic tokens ผ่าน CSS custom properties และ Tailwind 4 `@theme inline`:

- surface: `canvas`, `surface`, `surface-muted`, `surface-raised`;
- text: `text`, `text-muted`, `text-subtle`;
- border: `border`, `border-strong`;
- action: `action-primary`, `action-primary-hover`, `action-primary-muted`;
- status: `success`, `warning`, `danger`, `info` และ soft surfaces;
- navigation: `navigation-background`, `navigation-hover`, `navigation-active`;
- radius: `control`, `panel`, `dialog`;
- shadow: `surface`, `floating`;
- layout: application sidebar width, header height และ content max width

คง token ชื่อเดิม (`brand`, `ink`, `muted`, `line` ฯลฯ) เพื่อ compatibility ห้ามเพิ่ม feature-specific token หรือแทน Tailwind spacing scale ทั้งหมด

## UI primitives

Primitives ปัจจุบันอยู่ใน `src/components/ui/`:

- `Button`: primary, secondary, ghost, danger; default/compact
- `Input`, `Select`: control size, border, focus, disabled และ invalid state
- `PageHeader`
- `Panel`
- `StatusBadge`
- `Alert`
- `LocalNavigation`

Application chrome อยู่ใน `src/components/app-shell/`: `AppShell`, `AppHeader`, `AppSidebar`, `MobileNavigation`, navigation projection/list/types

ใช้ primitive เมื่อ pattern มีความหมายซ้ำทั้งแอป; ไม่สร้าง generic component framework, variant dependency หรือ wrapper ที่ไม่ลด duplication จริง Feature code ควรใช้ semantic token classes + primitives + Tailwind layout/spacing ปกติ และหลีกเลี่ยง arbitrary color/radius/shadow ใหม่

## Responsive and accessibility

- desktop sidebar และ mobile drawer ต้องใช้ information architecture เดียวกัน;
- drawer ต้องมี accessible open/close names, Escape handling, focus containment, focus restoration และคืน body scroll เมื่อปิด;
- active route ใช้ `aria-current="page"`;
- คง semantic `<header>`, `<nav>`, `<main>`, heading order, native `<button>`, `<input>`, `<select>` และ label association;
- error/status ที่เปลี่ยนตาม action ต้องประกาศด้วย role/aria-live ที่เหมาะสม;
- touch target และ focus-visible ต้องชัดเจน

## Rules for future feature pages

- เริ่มจาก shell/page hierarchy นี้และ reuse primitive เดิมก่อนสร้างใหม่
- รักษาข้อความภาษาไทยและ UTF-8; ห้ามแปลหรือทำ mojibake
- navigation condition ต้องรวมศูนย์และ reuse policy helper แต่ operation authorization ต้องอยู่ฝั่ง server เสมอ
- Hospital context คงเป็น local screen state จนกว่าจะมี requirement สำหรับ global context
- อย่าสร้าง metrics, workflow, global state, theme engine หรือ permission framework ที่ยังไม่มี requirement
- งาน UI/style ห้ามเปลี่ยน business logic, schema, transaction หรือ service contract โดยไม่ได้รับคำสั่ง
