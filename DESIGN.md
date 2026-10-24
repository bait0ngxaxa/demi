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
    fontFamily: "Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  label:
    fontFamily: "Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  action:
    fontFamily: "Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
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
- Mobile ใช้ bottom tabs และหน้า `/app/more` โดยหน้า More แสดง navigation ที่ project จาก server เช่นเดียวกับ desktop

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

**Display Font:** ไม่มี display face แยก; ใช้ `Noto Sans Thai` (โหลดผ่าน `next/font`) โดยมี `Leelawadee UI` และ `Segoe UI` เป็น fallback

**Body Font:** `Noto Sans Thai` พร้อม fallback stack เดียวกัน

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

Application shell ใช้ layout แบบสองพื้นที่เมื่อ viewport ถึง `lg` (1024px): sidebar คงที่กว้าง 17rem หรือ 4.5rem เมื่อย่อ และ main workspace ยืดหยุ่นตามพื้นที่ที่เหลือ ส่วน mobile ใช้ header สูง 4.5rem, bottom tabs และหน้าเมนู `/app/more`

Main workspace เป็น fluid พร้อม horizontal padding 16px บน mobile, 24px ตั้งแต่ `sm` และ 32px ตั้งแต่ `lg`; vertical page rhythm คือ 32px, 40px และ 48px ตาม breakpoint หน้า feature จำกัด readable width ของตนเองได้เมื่อข้อมูลเป็น form, prose หรือ review detail ส่วน directory, report และ operational workspace ใช้พื้นที่ที่เหลือได้ตามความเหมาะสม

Page hierarchy คือ `PageHeader` → optional local navigation → bounded content sections ใช้ grid เฉพาะเมื่อข้อมูลสัมพันธ์กันจริง Form และ result stack บน mobile และเปลี่ยนเป็น row/grid เมื่อมีพื้นที่เพียงพอ

## Elevation & Depth

ระบบเป็น flat-by-default ใช้ tonal layering และ 1px border เป็น depth หลัก Standard panel ไม่ต้องมี shadow; shadow ใช้เฉพาะ surface ที่ต้องแยกจากพื้นเล็กน้อย และ dialog ที่ลอยเหนือ content

### Shadow Vocabulary

- **Surface:** `0 1px 2px rgb(16 38 32 / 0.06)` สำหรับ selected local navigation และ surface ที่ต้องยกขึ้นเล็กน้อย
- **Floating:** `0 18px 48px rgb(8 35 31 / 0.22)` สำหรับ dialog หรือ interaction ที่ลอยเหนือหน้า

Focus ใช้ 4px `focus-ring` พร้อม offset เพื่อให้เห็นได้ชัดโดยไม่พึ่ง shadow เป็น decoration บนพื้นเข้ม (`brand-deep` เช่น hero ของหน้า home และ desktop navigation) focus ring ใช้ `brand-bright` แทน เพราะ `focus-ring` ได้ contrast ต่ำกว่า 3:1 บนพื้นนั้น

**The Flat-By-Default Rule.** เริ่มจาก background + border + whitespace ก่อนเพิ่ม shadow; elevation ต้องสื่อ interaction hierarchy ไม่ใช่เพิ่มความสวยงามเฉย ๆ

## Shapes

Form controls ใช้ corner 12px (`control`), panel ใช้ 14px (`panel`) และ dialog ใช้ 16px (`dialog`) Status badge ใช้ pill เต็มรูปแบบเฉพาะเมื่อเป็น status/role chip

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

### Toast

Toast เป็น feedback ชั่วคราวสำหรับสรุปผลของ operation ที่ยืนยันแล้ว และใช้คู่กับ Alert เพื่อให้ Alert คงรายละเอียด validation, conflict และ recovery ไว้ในหน้า ใช้ข้อความภาษาไทยสั้น ๆ กับ semantic status icon/token; ห้ามใส่ข้อมูลส่วนบุคคลหรือรายละเอียดทางคลินิกใน Toast และผลที่ยังไม่ยืนยันห้ามแสดง success/error toast

### Navigation

- **Task sections (UI-4, 2026-10-20):** navigation จัดตามงาน ไม่ใช่ตาม data module ลำดับคงที่ทุก role อยู่ใน `NAVIGATION_SECTION_ORDER` (`src/components/app-shell/navigation-sections.ts`) ซึ่งเป็นที่เดียวที่กำหนดลำดับและชื่อ section: `home` → `care` (ส่วนตัว “การดูแลของฉัน” / งาน “ดูแลผู้ป่วย”) → `health-records` (“บันทึกสุขภาพ”) → `registration` (“ลงทะเบียนผู้ป่วย”) → `review-queue` (“คำขอรอตรวจ”) → `reports-info` (งาน “รายงานและข้อมูล” / ส่วนตัว “ข่าวสารและความรู้”) → `administration` (OWNER “บริหารโรงพยาบาล”, ADMIN “กำกับดูแล”) → `account` (“บัญชีและช่วยเหลือ”). Section ว่างไม่แสดง; code อ้าง section ด้วย `id` เท่านั้น ห้ามเทียบชื่อภาษาไทย. แต่ละ section ไม่ควรเกิน 6 รายการ; ยกเว้น care ของบัญชี HOSPITAL+OSM ผสมที่คงรายการ OSM เดิมร่วมกับงาน Hospital ตาม Product Owner decision (NAV-FIX, 2026-10-24). Desktop sidebar และหน้า `/app/more` ใช้ projection และลำดับเดียวกัน; Work Home ใช้ปลายทางจาก projection เดียวกัน โดยจัดลำดับทางลัดตามกฎ Home ด้านล่าง
- **Desktop:** sidebar สี navigation-background กว้าง 17rem: ด้านบนเป็น segmented control สลับพื้นที่ส่วนตัว/งาน (เฉพาะบัญชีที่มีสองพื้นที่ ไม่ใช่ section), ตามด้วย section heading และรายการที่มีไอคอน (`getMoreNavigationIcon` ผูกกับ href, ปลายทางที่ไม่รู้จักใช้ไอคอนกลาง), active item ใช้ navigation-active; section `account` เป็น section สุดท้ายใน navigation ที่เลื่อนได้ ส่วนชื่อ บทบาท และปุ่มออกจากระบบอยู่ในแถว identity ที่ปักด้านล่าง
- **Desktop height budget (UI-4.1):** sidebar สูง `100svh` มี brand row 72px, workspace switch เฉพาะบัญชีที่มีสองพื้นที่, navigation เป็นบริเวณเลื่อนเพียงแห่งเดียว (`min-h-0`, `overflow-y-auto`) และ identity row ปักด้านล่าง (64px เมื่อขยาย). รายการ navigation สูงอย่างน้อย 40px, workspace switch สูงอย่างน้อย 36px และปุ่ม logout แบบไอคอน 40px เป็นข้อยกเว้นด้าน density เฉพาะ desktop; mobile คง touch target อย่างน้อย 44px. Scrollbar บางใช้สี navigation และกัน gutter ไว้คงที่; focus และ tooltip ต้องยังเข้าถึงได้เมื่อเลื่อน
- **Icon rail (sidebar ย่อ 4.5rem):** ทุกรายการยังแสดงเป็นไอคอนที่กดและ tab ถึงได้ มี `aria-label` เท่าชื่อรายการ และ tooltip ที่ไม่รับ focus (`aria-hidden`, `pointer-events-none`, จัดตำแหน่งแบบ fixed จึงไม่ถูก scroll ตัด) ซ่อนเมื่อ blur, เลื่อน หรือกด Escape; heading ของ section ซ่อนด้วย `sr-only`; ห้ามใช้ `inert` หรือซ่อนเมนูทั้งชุด; ค่าย่อ/ขยายยังจำใน browser storage เดิม
- **Sidebar preference (UI-4.1):** อ่านค่า `demi:desktop-sidebar` ก่อน paint แล้วใช้ `data-desktop-sidebar` บน `<html>` กำหนดความกว้างร่วมกันทั้ง shell และ skeleton; ถ้าอ่าน storage ไม่ได้ใช้สถานะขยาย การย่อ/ขยายและ storage event อัปเดตค่าเดียวกัน; เปิด width transition หลัง mount และเคารพ reduced motion
- **Header (UI-4.1):** sticky surface header สูง 72px แสดงเฉพาะ mobile/tablet พร้อมแบรนด์และ workspace ปัจจุบัน; ตั้งแต่ `lg` ซ่อน content header โดยแสดงแบรนด์และ identity ใน sidebar แทน การสลับ workspace บน mobile เข้าถึงได้จาก “เพิ่มเติม”
- **Mobile (2026-10-20):** bottom tabs ชุดเดียวสำหรับทุก role แสดงปลายทางหลักไม่เกินสี่รายการกับ “เพิ่มเติม”; “เพิ่มเติม” เป็นลิงก์ไปหน้า `/app/more` ที่แสดง server-projected navigation ชุดเดียวกับ desktop โดยไม่เปิด sidebar หรือ dialog; logout อยู่ด้านล่างของหน้า More
- **Mobile Patient Personal Home (2026-10-20):** หน้า `/app/personal` ใช้ hero เป็นแถบพื้นทึบ `brand-deep` สำหรับคำทักทายและบริบทโรงพยาบาลเท่านั้น นี่เป็นข้อยกเว้นเฉพาะ hero ของหน้า home (personal และ `/app` ของงาน ตั้งแต่ UI-3); ไม่ใช้ gradient และไม่ขยายรูปแบบนี้ไปหน้าอื่น
- Active route ใช้ `aria-current="page"` (รายการที่มี query เช่น `?task=screening` ชนะรายการ path เดียวกันที่ไม่มี query); workspace switch ใช้ `aria-current="location"`; group visibility เป็น projection จาก ActorContext ไม่ใช่ security boundary

### Content Width and Responsive Layout

- Header และ Main ใช้ gutters เดียวกัน: 16px บน mobile, 24px ตั้งแต่ `sm`, 32px ตั้งแต่ `lg`.
- Main เป็น named `workspace` container; grid ของ directory, Workforce, Patient Detail และ reporting ใช้พื้นที่จริงหลังหัก Sidebar แทน viewport เพียงอย่างเดียว.
- `content-workspace` ใช้เต็มพื้นที่จนถึง 90rem และจัดกึ่งกลางสำหรับ Work Home, directories, Workforce และ reporting. Work Home ใช้ auto-fit columns ขั้นต่ำ 28rem โดย card เดียวใช้เต็มแถว.
- `content-detail` จำกัด 72rem และจัดกึ่งกลางสำหรับ Patient Detail; บริบทและงานดูแลอยู่สองคอลัมน์เมื่อ container กว้างอย่างน้อย 64rem ส่วนประวัติใช้เต็มแถว. ลำดับ DOM และ mobile ยังคงบริบท → งานดูแล → ประวัติ.
- Reading forms, Contact, Content, Personal และรายละเอียดการบันทึกยังรักษา local max-width เดิม; prose ใช้ `type-readable` 68ch. ไม่ใช้ global override เพื่อยืดทุกหน้า.
- **2026-10-20:** `/app/more` เป็นหน้าเมนูปกติทั้งบน mobile และ desktop; ลิงก์ในหน้านำทางด้วย browser history และคง workspace ที่เลือกไว้ Bottom tabs และ Main เว้นพื้นที่ผ่าน shell token เดียวที่รวม safe-area inset; Skeleton ของ More ใช้ gutters และ width policy ของหน้า.
- **2026-10-20:** Patient Personal Home ใช้ hero, ตัวเลือกโรงพยาบาล, shortcut grid 4 คอลัมน์บน mobile และข่าวสาร/สื่อความรู้แยกตามโรงพยาบาล; ส่วน hero ใช้พื้นทึบ `brand-deep` เป็นข้อยกเว้นเฉพาะหน้านี้จาก canvas ปกติ.
- **2026-10-20 (UI-3):** Work Home (`/app`) ใช้ hero, chip เลือกโรงพยาบาล (`?hospitalId=`, จัดกลุ่มตามเครือข่าย) และ grid เมนูชุดเดียวกันทุกบทบาท โดยเมนูมาจาก server projection เท่านั้น. Hero เป็นลิงก์งานหลักไม่มีตัวเลข: action หมวด `care` แรกของโรงพยาบาลที่เลือก → `assignedPatientsAction` → governance แรก (ADMIN ที่ไม่มีงานโรงพยาบาล). Grid สูงสุด 8 ช่องตาม `WORK_HOME_TILE_ORDER` ใน `src/components/home/work-home-projection.ts` ช่องเกินเป็น "ทั้งหมด" ไป `/app/more`; งานที่ครอบคลุมทุกโรงพยาบาลแสดงเป็นแถวในส่วน "งานจากทุกโรงพยาบาล" ไม่อยู่ใน grid. Desktop ใช้ component เดียวกันใน `content-workspace`.
- **2026-10-20 (UI-3.1):** ช่อง อสม. ใน grid ของ Work Home แสดงเฉพาะโรงพยาบาลที่บัญชีเป็น อสม. อยู่ และส่ง `hospitalId` ไปกรองรายชื่อผู้ป่วยที่รับผิดชอบ (bottom tab ยังไม่กรอง). ส่วนเนื้อหาที่โหลดไม่สำเร็จแสดง Alert พร้อมลิงก์ "ลองอีกครั้ง" เฉพาะส่วนนั้น ส่วนอื่นของหน้ายังแสดงตามปกติ.
- **2026-10-20 (UI-4):** navigation จัดตาม task section ลำดับคงที่ (ดู Navigation). `WORK_HOME_TILE_ORDER` ถูกแทนด้วยลำดับของ Work navigation (`projectWorkNavigationOrder`) เพื่อให้ sidebar และ `/app/more` เรียงตรงกัน; ลำดับ grid ของ Work Home ปรับตามกฎ NAV-FIX ด้านล่าง; การสลับพื้นที่เป็น segmented control; sidebar ย่อเป็น icon rail แทนการซ่อนเมนู; “เปลี่ยนรหัสผ่าน” ย้ายจากเมนูไปหน้าตั้งค่า.

- **2026-10-20 (UI-4.1):** Home ทั้งส่วนตัวและงานลดความสูง hero บน desktop โดยวางชื่อหน้าและบริบทโรงพยาบาลในแถวเดียวกันเมื่อพื้นที่พอ และวางข้อมูลนัด/งานหลักแนวนอน. โรงพยาบาลเดียวหรือไม่มีตัวเลือกแสดงเป็นข้อความ; หลายโรงพยาบาลใช้ native select. Shortcut บน mobile ยังคง 4 คอลัมน์; ตั้งแต่ `lg` เป็น card แนวนอนแบบ auto-fill กว้างขั้นต่ำ 15rem พร้อมคำอธิบายเมื่อมี. ข่าวสาร/สื่อความรู้ของ Personal Home และงานจากทุกโรงพยาบาล/ข่าวสารของ Work Home แบ่งสองคอลัมน์เมื่อ `workspace` container กว้างอย่างน้อย 64rem. Anchor scroll และ Toast ใช้ `--app-sticky-top` ร่วมกัน (72px บน mobile/tablet, 0 บน desktop)
- **2026-10-24 (STAFF-NAV):** Work Home ใช้ลิงก์ดูแลผู้ป่วย ข่าวสาร ข้อมูลติดต่อ และ export ที่ได้จาก navigation projection เดียวกัน; grid รองรับได้ 8 ช่องเพื่อแสดงทางลัดของ MEMBER ครบโดยไม่ย้าย export ไปส่วนงานจากทุกโรงพยาบาล. ลิงก์ export คงปลายทางเดิมซึ่งตรวจ scope ของทุกโรงพยาบาลบน server.

- **2026-10-24 (NAV-FIX):** staff เปิดคัดกรองและติดตามผ่านรายละเอียดผู้ป่วยและรอบโปรแกรมตามลำดับ; care รวม จัดบริการ และ นัดหมายใหม่ ในหมวดเดียว. Work Home จำกัด 8 ช่อง (รายการเกินใช้ 7 ทางลัด + ทั้งหมด) และจัดลำดับเฉพาะปลายทางที่ actor ได้รับอนุญาตแล้ว: นัดหมาย → รายชื่อผู้ป่วย → รายงานโรงพยาบาล → จัดการบุคลากร → เผยแพร่ข่าวสาร → จัดบริการ → นัดหมายใหม่ → รายการที่เหลือตาม navigation. กฎนี้รักษางานบริหารหลักของ OWNER ไว้เป็น tile และให้ MEMBER มีนัดหมาย รายชื่อผู้ป่วย จัดบริการ นัดหมายใหม่ export ข่าวสาร และข้อมูลติดต่อครบ 7 ช่อง; OSM และ ADMIN ที่ไม่มี Hospital care ใช้รายการเดิม. Hero ของ Hospital ยังคงรายชื่อผู้ป่วยเมื่อมีสิทธิ์ตรง.

### Local Navigation

ใช้ segmented button group (`aria-pressed`) เมื่อ operation เดียวมีหลายมุมมองจริง ไม่สร้าง sidebar route ซ้ำ; การนำเข้าผู้ป่วยใช้ Excel เท่านั้น ไม่มีโหมดเพิ่มรายบุคคล

## Do's and Don'ts

### Do:

- **Do** ใช้ semantic tokens และ shared primitives แทน raw color, radius และ shadow ใหม่
- **Do** รักษา control touch target อย่างน้อย 44px บน mobile (desktop sidebar ใช้ข้อยกเว้น density ที่ระบุใน Navigation) และ focus-visible ที่มี contrast ชัดเจน
- **Do** ใช้ PageHeader, Panel, Alert และ StatusBadge เพื่อทำให้ hierarchy และ state สม่ำเสมอ
- **Do** ใช้ native form semantics, label association, `aria-current` และ navigation links ที่เข้าถึงได้ด้วย keyboard
- **Do** ใช้ border + whitespace + status text ก่อนเพิ่ม elevation

### Don't:

- **Don't** ใช้ hidden navigation หรือ hidden button เป็น authorization
- **Don't** เพิ่ม arbitrary color/radius/shadow เช่น hex หรือ pixel value ใหม่โดยไม่เพิ่ม token ที่มีความหมายร่วม
- **Don't** สร้าง dashboard metrics, clinical statistics, imagery หรือ claim ที่ยังไม่มี product requirement
- **Don't** รวม Patient Provisioning กับ Patient Activation หรือแยก Excel เป็น application-level destination ใหม่
- **Don't** ใช้ decorative gradient, glass, nested cards หรือ card ทุก section แทนข้อมูล hierarchy

### Hospital reporting — RPT-UX

OWNER สลับ “โรงพยาบาลของฉัน” / “ลูกข่าย (n)” ที่หัวรายงาน; hospital picker เปลี่ยนค่าได้โดยไม่ submit; กดปุ่ม “เปิดรายงาน” เพื่อยืนยัน ใช้ native form ได้ทั้งเมื่อมีและไม่มี JavaScript. Work Home ใช้ “รายงานลูกข่าย” ไป network scope ด้วย audience เดิมและไอคอนเครือข่าย โดยแยก key ของ network scope เพื่อคงลำดับทางลัดงานเดิม; จำนวนลูกข่ายทั้ง switcher และหน้า network ใช้ `children` จาก report target groups ชุดเดียวกัน (ไม่ใช่จำนวนรายงานที่โหลดสำเร็จ); นำเมนู “เขตความรับผิดชอบ” ออก; URL `/app/hospitals/areas` redirect ไป `/app/hospitals/reporting?scope=network`. ลูกข่ายใช้ตาราง 9 ค่าเดิมแยกรายโรงพยาบาลและลิงก์ชื่อไปสรุปเฉพาะแห่ง ไม่มี patient rows หรือ Program links; ลิงก์จากรายการใช้ `scope=network&target=...` เพื่อคง aggregate-only แม้ผู้ใช้จะเป็น OWNER ของลูกข่ายโดยตรงด้วย (รายงานของตนเองยังเข้าทาง own picker).

รายงานโรงพยาบาลของฉันเรียง KPI → ความคืบหน้ารอบที่ยืนยันเสร็จสิ้น → export preview → ตัวกรอง → รายการ Program แบบ `<details>`. กลุ่มความคืบหน้าไม่ซ้อนกันและรวมเท่ากับ Program ทั้งหมดของ cohort: ACTIVE ที่ยังไม่มี Final Assessment แบ่งเป็นรอบ 0–5 และ “ครบ 6 รอบ · รอ After” (`progress=6`); ACTIVE ที่มี Final Assessment อยู่ใน “บันทึก After แล้ว · รอจบ Program” (`progress=AFTER_RECORDED`) ไม่ว่ามีกี่รอบ; COMPLETED อยู่ใน “สิ้นสุด Program” เท่านั้น. Histogram ยังคงใช้ grouped RoundCompletion query โดยกรอง ACTIVE ที่ยังไม่มี After ก่อนจัดกลุ่ม; cursor version ใหม่ปฏิเสธ continuation ที่ลงนามก่อนเปลี่ยนนิยามตัวกรอง. ใช้ semantic tokens เดิม border-border / bg-surface / text-text / text-text-muted, rounded-control / rounded-panel, focus-ring และ touch target ≥44px. แถว Program เรียงซ้อนบนมือถือ; ตารางลูกข่ายแสดง label/value สองคอลัมน์บนจอเล็ก ไม่มี horizontal page scroll. Global ADMIN ใช้แถวขยายชุดเดียวกันโดยไม่มีลิงก์รายละเอียด Program; MEMBER export ไม่เปลี่ยน.
