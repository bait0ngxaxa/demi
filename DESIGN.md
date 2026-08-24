---
name: DEMI
description: ส่วนติดต่อระบบสุขภาพภาษาไทยที่สุภาพ เรียบง่าย และยืนยันสถานะอย่างชัดเจน
colors:
  canvas: "#f3f7f5"
  surface: "#ffffff"
  surface-muted: "#eef3f1"
  surface-raised: "#ffffff"
  ink: "#102620"
  muted: "#536b64"
  subtle: "#60736d"
  line: "#d5e0dc"
  line-strong: "#aebfba"
  brand: "#126759"
  brand-strong: "#0b5146"
  brand-muted: "#6e9c93"
  brand-soft: "#dceee9"
  brand-deep: "#0e3c35"
  brand-pale: "#cce2dc"
  brand-bright: "#6fd2ba"
  danger: "#a23a3a"
  danger-soft: "#f9e8e8"
  success: "#176b50"
  success-soft: "#e0f1e9"
  warning: "#805313"
  warning-soft: "#fff3d6"
  info: "#315f74"
  info-soft: "#e5f0f4"
  focus-ring: "#126759"
  navigation-background: "#0e3c35"
  navigation-hover: "#174d45"
  navigation-active: "#dceee9"
typography:
  heading:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  action:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  control: "12px"
  panel: "14px"
  dialog: "16px"
  pill: "9999px"
spacing:
  control-height: "48px"
  compact-control-height: "44px"
  app-sidebar: "272px"
  app-header: "72px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
    height: "48px"
  button-compact:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "44px"
  input-control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "48px"
  panel-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

# Design System: DEMI

## Overview

**Creative North Star: “Quiet Clinical Access.”** DEMI เป็นพื้นที่ทำงานด้านสุขภาพที่ให้ผู้ปฏิบัติงานอ่านสถานะและทำงานต่อได้ทันที พื้น canvas สีเขียวเทาอ่อนกับ surface สีขาวทำหน้าที่เป็นพื้นทำงาน ส่วนเขียวเข้มทำหน้าที่เป็นสี authority ของแบรนด์และ navigation

ระบบใช้ hierarchy แบบ operational: page header, local context, bounded sections และ status ที่มีข้อความกำกับ พื้นผิว flat ที่มีเส้นขอบชัดเจนสำคัญกว่าการสร้าง depth ด้วยเงา ไม่มีภาพตกแต่ง, gradient, glass หรือ claim ที่อยู่นอก product truth

**Key Characteristics:**

- พื้นที่ทำงานสว่าง ตัวอักษรเข้ม และการแบ่งส่วนอ่านได้เร็ว
- เขียวเข้มใช้กับ identity, primary action และ navigation authority
- Thai-first copy ที่สุภาพ ตรงไปตรงมา และเป็นกลางต่อทุกบทบาท
- Controls รองรับ touch, focus-visible, pending, disabled และ error state
- Mobile ใช้ information architecture เดียวกับ desktop ผ่าน compact header และ drawer

## Colors

Palette เป็น restrained clinical green: brand ทำหน้าที่เป็น action/authority, neutral ทำหน้าที่เป็นพื้นและเส้นแบ่ง, ส่วน status colors แยกความหมายของ success, warning, danger และ info อย่างชัดเจน

### Primary

- **DEMI Green:** `brand` สำหรับ primary action, active navigation และ identity
- **Deep Authority Green:** `brand-strong` และ `brand-deep` สำหรับ hover, text emphasis และ desktop navigation
- **Soft Green:** `brand-soft`, `brand-pale` และ `brand-muted` สำหรับ selected state, muted action และพื้นที่เน้นเบา

### Neutral

- **Clinical Canvas:** `canvas` เป็นพื้น application
- **Working Surface:** `surface` และ `surface-raised` เป็นพื้น form, panel และ content
- **Muted Surface:** `surface-muted` ใช้กับ secondary grouping และ neutral status
- **Operational Ink:** `ink` เป็น text หลัก; `muted` และ `subtle` ใช้ลดลำดับข้อมูล
- **Quiet Line:** `line` และ `line-strong` เป็น divider, border และ control outline

### Status

- `success` / `success-soft` สำหรับสถานะสำเร็จ
- `warning` / `warning-soft` สำหรับสถานะที่ต้องตรวจสอบหรือรอดำเนินการ
- `danger` / `danger-soft` สำหรับ error และ reconciliation block
- `info` / `info-soft` สำหรับข้อมูลประกอบที่ไม่ใช่ action

**The Authority Color Rule.** ใช้ brand green เมื่อองค์ประกอบสื่อ identity, primary action, active navigation หรือสถานะที่เชื่อถือได้เท่านั้น ไม่ใช้แทนทุกความหมายของ status

## Typography

**Display Font:** ไม่มี display face แยก; ใช้ Geist ร่วมกับ `Noto Sans Thai`, `Leelawadee UI` และ `Segoe UI`

**Body Font:** Geist พร้อม Thai fallback stack เดียวกัน

**Character:** ตัวอักษรมีโครงสร้างชัด สุภาพ และอ่านง่ายในงาน form/table ภาษาไทย น้ำหนัก heading หนักพอให้ scan ได้ แต่ไม่สร้างบุคลิก decorative

### Hierarchy

- **Page title** (700, 1.875rem และ 2.25rem ตั้งแต่ `sm`, line-height ราว 1.22, tracking -0.03em): ชื่อหน้าและจุดเริ่มต้นของการ scan
- **Section title** (600, 1.25rem–1.5rem, line-height ราว 1.35): ชื่อส่วน, panel และ bounded section ที่แบ่งงานเป็นกลุ่ม
- **Body** (400, 1rem, line-height ราว 1.65–1.75): คำอธิบายและข้อความการทำงาน โดยจำกัด prose ให้อ่านง่ายราว 68ch
- **Label / action** (500 สำหรับ label และ 600 สำหรับ primary action, 0.875rem, line-height ราว 1.5): form label, navigation label และข้อความบน control
- **Utility / status** (400–600, 0.75rem–0.875rem): metadata, helper text และ role/context badge โดยใช้สีและ tracking ช่วยลด/เพิ่มลำดับ

น้ำหนักของ `font-semibold` ใน utility layer ใช้เป็น label weight (500) เพื่อไม่ให้ทุกข้อความดูเท่ากัน ส่วน heading และสถานะสำคัญใช้ semantic type class หรือ heading selector ที่หนักขึ้นตามบทบาท

**The Thai-First Rule.** ใช้ภาษาไทยเป็นภาษาหลักของ UI; English ที่คงไว้ควรเป็นคำเทคนิคที่จำเป็นใน source หรือ provider boundary เท่านั้น

## Layout

Application shell ใช้ layout แบบสองพื้นที่เมื่อ viewport ถึง `lg` (1024px): sidebar คงที่กว้าง 17rem หรือ 4.5rem เมื่อย่อ และ main workspace ยืดหยุ่นตามพื้นที่ที่เหลือ ส่วน mobile ใช้ header สูง 4.5rem และ drawer ที่มี information architecture เดียวกันกับ sidebar

Main workspace เป็น fluid พร้อม horizontal padding 20px บน mobile, 32px ตั้งแต่ `sm` และ 40px ตั้งแต่ `lg`; vertical page rhythm คือ 32px, 40px และ 48px ตาม breakpoint หน้า feature จำกัด readable width ของตนเองได้เมื่อข้อมูลเป็น form, prose หรือ review detail ส่วน directory, report และ operational workspace ใช้พื้นที่ที่เหลือได้ตามความเหมาะสม

Page hierarchy คือ `PageHeader` → optional local navigation → bounded content sections ใช้ grid เฉพาะเมื่อข้อมูลสัมพันธ์กันจริง Form และ result stack บน mobile และเปลี่ยนเป็น row/grid เมื่อมีพื้นที่เพียงพอ

## Elevation & Depth

ระบบเป็น flat-by-default ใช้ tonal layering และ 1px border เป็น depth หลัก Standard panel ไม่ต้องมี shadow; shadow ใช้เฉพาะ surface ที่ต้องแยกจากพื้นเล็กน้อย และ drawer ที่ลอยเหนือ content

### Shadow Vocabulary

- **Surface:** `0 1px 2px rgb(16 38 32 / 0.06)` สำหรับ selected local navigation และ surface ที่ต้องยกขึ้นเล็กน้อย
- **Floating:** `0 18px 48px rgb(8 35 31 / 0.22)` สำหรับ mobile navigation drawer หรือ interaction ที่ลอยเหนือหน้า

Focus ใช้ 4px `focus-ring` พร้อม offset เพื่อให้เห็นได้ชัดโดยไม่พึ่ง shadow เป็น decoration

**The Flat-By-Default Rule.** เริ่มจาก background + border + whitespace ก่อนเพิ่ม shadow; elevation ต้องสื่อ interaction hierarchy ไม่ใช่เพิ่มความสวยงามเฉย ๆ

## Shapes

Form controls ใช้ corner 12px (`control`), panel ใช้ 14px (`panel`) และ dialog/drawer ใช้ 16px (`dialog`) Status badge ใช้ pill เต็มรูปแบบเฉพาะเมื่อเป็น status/role chip

เส้นขอบ 1px เป็น recurring silhouette ของ form, panel, table และ list; ไม่มี clipping หรือ decorative geometry ใน protected shell รูปทรงทั้งหมดควรรู้สึก tactile แต่ไม่ playful

## Components

### Buttons

- **Shape:** มุมโค้ง control (12px), primary/default สูง 48px และ compact สูงอย่างน้อย 44px
- **Primary:** brand background, white text, padding 10px 20px, น้ำหนัก label 600
- **Secondary:** surface background, line-strong border และ ink text; hover เปลี่ยน border/text ไปทาง brand
- **Ghost:** ไม่มีพื้นเริ่มต้น ใช้ brand text และ soft hover surface
- **Danger:** danger background และ white text สำหรับ destructive/rejection action
- **Hover / Focus:** transition สีสั้น, focus-visible ring 4px จาก focus-ring และ offset 2px; disabled ต้องมองเห็นและป้องกัน action

### Inputs / Fields

- **Style:** สูง 48px, surface background, line border, control radius, padding แนวนอน 16px และ body text 16px
- **Focus:** border เปลี่ยนเป็น action-primary พร้อม focus-ring 4px
- **Error / Disabled:** aria-invalid ใช้ danger border/ring; disabled ใช้ muted surface และ muted text โดยยังรักษา native semantics
- **Select:** ใช้ native select และ label association เดิม ไม่มี custom dropdown layer

### Cards / Containers

- **Panel:** surface, 1px line border, panel radius และ padding 20px บน mobile/28px ตั้งแต่ `sm`
- **Use:** bounded form, Hospital context, grouped results และ critical status
- **Avoid:** ไม่ห่อทุก heading/paragraph ด้วย panel; ใช้ whitespace, heading และ divider เมื่อ containment ไม่ช่วยการอ่าน

### Status / Alerts

- **StatusBadge:** pill ขนาดเล็กสำหรับ role, count และสถานะที่ scan ได้เร็ว โดยใช้ semantic success/warning/danger/info/neutral variant
- **Alert:** panel-like bounded message สำหรับ result, warning, error, reconciliation และ info พร้อมข้อความที่อธิบายความหมาย
- Status color ต้องมีข้อความหรือ label เสมอ ไม่ใช้สีเพียงอย่างเดียว

### Navigation

- **Desktop:** sidebar สี navigation-background กว้าง 17rem มี group label, nested domain item และ active item ใช้ navigation-active
- **Header:** sticky surface header แสดง DEMI, role context และ logout; mobile เพิ่ม accessible menu trigger
- **Mobile:** drawer จากด้านซ้าย ใช้เมนูชุดเดียวกับ desktop รองรับ Escape, focus containment/restoration และ route navigation ปิด drawer
- Active route ใช้ `aria-current="page"`; group visibility เป็น projection จาก ActorContext ไม่ใช่ security boundary

### Local Navigation

ใช้ segmented button group (`aria-pressed`) สำหรับการเปลี่ยน execution mode ภายใน operation เดียว เช่น “เพิ่มรายบุคคล / นำเข้าจาก Excel” ไม่สร้าง sidebar route ซ้ำ

## Do's and Don'ts

### Do:

- **Do** ใช้ semantic tokens และ shared primitives แทน raw color, radius และ shadow ใหม่
- **Do** รักษา control touch target อย่างน้อย 44px และ focus-visible ที่มี contrast ชัดเจน
- **Do** ใช้ PageHeader, Panel, Alert และ StatusBadge เพื่อทำให้ hierarchy และ state สม่ำเสมอ
- **Do** ใช้ native form semantics, label association, `aria-current` และ accessible drawer controls
- **Do** ใช้ border + whitespace + status text ก่อนเพิ่ม elevation

### Don't:

- **Don't** ใช้ hidden navigation หรือ hidden button เป็น authorization
- **Don't** เพิ่ม arbitrary color/radius/shadow เช่น hex หรือ pixel value ใหม่โดยไม่เพิ่ม token ที่มีความหมายร่วม
- **Don't** สร้าง dashboard metrics, clinical statistics, imagery หรือ claim ที่ยังไม่มี product requirement
- **Don't** รวม Patient Provisioning กับ Patient Activation หรือแยก Excel เป็น application-level destination ใหม่
- **Don't** ใช้ decorative gradient, glass, nested cards หรือ card ทุก section แทนข้อมูล hierarchy
