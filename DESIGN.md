---
name: DEMI
description: ส่วนติดต่อระบบสุขภาพภาษาไทยที่สุภาพ เรียบง่าย และยืนยันสถานะอย่างชัดเจน
colors:
  brand: "#126759"
  brand-strong: "#0b5146"
  brand-deep: "#0e3c35"
  brand-soft: "#dceee9"
  canvas: "#f3f7f5"
  surface: "#ffffff"
  ink: "#102620"
  muted: "#536b64"
  line: "#d5e0dc"
  danger: "#a23a3a"
  success: "#176b50"
typography:
  heading:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Geist, Noto Sans Thai, Leelawadee UI, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: "normal"
rounded:
  control: "12px"
  container: "16px"
  pill: "9999px"
spacing:
  control-height: "48px"
  touch-minimum: "44px"
  field-gap: "20px"
  section-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line}"
    rounded: "{rounded.container}"
    padding: "28px"
---

## Overview

**Creative North Star: “Quiet Clinical Access.”** DEMI ใช้พื้นสว่างสำหรับการทำงานในสถานพยาบาลและเขียวเข้มเป็นสี authority ของระบบ การแสดงผลเน้นสถานะที่อ่านได้ทันที ไม่มีภาพตกแต่งหรือ claim ที่อยู่นอก product truth

**Key Characteristics:**

- พื้นที่ทำงานสว่างและตัวอักษรเข้มที่อ่านได้ชัด
- เขียวเข้มใช้กับ action และพื้นที่ยืนยันตัวตน ไม่กระจายเป็นสีตกแต่ง
- ลำดับข้อมูลสั้น ตรง และเป็นกลางต่อทุกบทบาท
- control รองรับ touch, keyboard focus, loading, disabled และ error state

## Colors

ใช้ restrained palette: canvas เขียวเทาอ่อน, surface สีขาว, ink เขียวเกือบดำ และ brand เขียวกลาง/เข้ม สถานะ error และ success มีสีเฉพาะและต้องมีข้อความกำกับเสมอ

**The Authority Color Rule.** ใช้ brand green เมื่อองค์ประกอบสื่อการยืนยันตัวตน primary action หรือสถานะที่เชื่อถือได้เท่านั้น

## Typography

ใช้ Geist สำหรับ Latin และ fallback ภาษาไทยตาม platform เพื่อให้ตัวอักษรอ่านง่ายและไม่เพิ่ม font download ที่ไม่จำเป็น Heading ใช้น้ำหนัก 600–700 และ tracking แคบเล็กน้อย; body ใช้ขนาด 16px และ line-height กว้างสำหรับข้อความไทย

## Layout

หน้า login เป็น mobile-first single column และเปลี่ยนเป็นสองพื้นที่เมื่อ viewport ถึง `lg` Application shell ใช้ container สูงสุด `72rem` พร้อม padding ที่เพิ่มจาก mobile ไป desktop ระยะห่างหลักใช้ 20px ภายใน form และ 40px ระหว่าง section

## Elevation & Depth

พื้นผิวเป็น flat-by-default โดยใช้ tonal layering และเส้นขอบ 1px เงาอ่อนมีเฉพาะ primary action เพื่อแยกลำดับการกด ไม่ใช้เงาร่วมกับเส้นขอบบน container เดียวกัน

## Shapes

Control ใช้มุมโค้ง 12px, content container ใช้ 16px และ pill ใช้เฉพาะ status/role chip รูปทรงวงกลมในหน้า login เป็น geometry ฉากหลังที่ไม่มีความหมายเชิงข้อมูล

## Components

### Buttons

- Primary สูง 48px พื้น brand และตัวอักษรขาว พร้อม hover, focus ring, active และ disabled state
- Secondary สูงอย่างน้อย 44px พื้นขาว เส้นขอบ line และเปลี่ยนเป็น brand เมื่อ hover/focus

### Cards / Containers

- ใช้ surface สีขาว เส้นขอบ line 1px มุม 16px และไม่มีเงา
- Padding 20px บน mobile และ 28px ตั้งแต่ small viewport

### Inputs / Fields

- สูง 48px พื้นขาว เส้นขอบ line มุม 12px
- Focus เปลี่ยน border เป็น brand และแสดง brand-soft ring 4px
- Error แสดงเป็นข้อความ danger ใต้ field group; disabled ต้องมองเห็นและป้องกัน duplicate submission

## Do's and Don'ts

### Do:

- **Do** ใช้ภาษาไทยที่ตรงไปตรงมาและระบุวิธี recovery ใน error state
- **Do** แสดง role จาก server-resolved `ActorContext` เท่านั้น
- **Do** รักษา touch target อย่างน้อย 44px และ focus-visible ที่ชัดเจน

### Don't:

- **Don't** ใช้ role selector หรือ browser state เป็น authority
- **Don't** เพิ่ม dashboard, imagery หรือ operational claim ที่ยังไม่มี requirement
- **Don't** ใช้ decorative gradient, glass หรือ nested cards แทนลำดับข้อมูล
