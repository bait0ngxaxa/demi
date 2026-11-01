# มาตรฐานการโต้ตอบกับ Dialog ของ DEMI — UX-D1.1

สถานะ: บันทึกผลตรวจ repo และข้อตกลงการโต้ตอบสำหรับ UX-D1.1 เอกสารนี้กำหนดพื้นฐานร่วมของ dialog โดยยังไม่อนุญาตให้ย้าย workflow แบบ inline

## ผลตรวจ repo (2026-11-01)

`ModalDialog` ปัจจุบันเป็น client component ที่ใช้ `<dialog>` และ `showModal()` มีหัวเรื่องสำหรับ accessible name, คำอธิบายที่เลือกใส่ได้, ปุ่มปิด, พื้นที่ header/content/footer, ความสูงสูงสุด และบริเวณเนื้อหาที่เลื่อนได้ เมื่อเปิดและทุกครั้งที่ `stepKey` เปลี่ยน component จะโฟกัสหัวเรื่อง วงจรชีวิตล็อก `document.body.style.overflow` และใช้ lock ร่วมกันระหว่าง dialog ที่เปิดอยู่ใน document เดียวกัน ตอน cleanup จะปิด dialog และคืน focus ไปยัง trigger เดิมหาก element ยังอยู่ใน DOM แต่ไม่มี fallback เมื่อ trigger ถูกลบ ขณะผู้ใช้แก้ field อยู่ focus effect ก็ยังทำงานเมื่อ `stepKey` เปลี่ยน

`ConfirmDialog` ประกอบด้วย `ModalDialog` รองรับข้อความเฉพาะการกระทำ รายละเอียดประกอบ ปุ่มยกเลิก/ยืนยัน รูปแบบ destructive และสถานะ pending มี ref ป้องกันการยืนยันซ้ำอย่างรวดเร็ว และปลด lock เมื่อปิด dialog ปัจจุบันหัวเรื่องได้รับ focus แรก แต่ confirmation แบบสั้นควรเริ่มที่การกระทำที่มีความเสี่ยงน้อยที่สุด เนื่องจาก lock ไม่มีสัญญาณระบุความล้มเหลวที่แก้ไขแล้ว ผู้ใช้ component ที่ยังคงเปิด dialog หลังความล้มเหลวที่ยืนยันได้จึงกดยืนยันซ้ำไม่ได้

`ConfirmableActionForm` คง semantics ของ native form โดยจำ submitter ไว้ แสดง confirmation ก่อน แล้วเรียก `requestSubmit(submitter)` เพื่อคง constraint validation และ semantics ของ submitter ไว้ component รอให้เกิด pending transition และผลลัพธ์เปลี่ยนจึงปิด dialog ข้อผิดพลาดที่ยืนยันแล้วแสดงผ่านเจ้าของ workflow ส่วน unknown outcome จะคง dialog ไว้ ป้องกัน mutation attempt ซ้ำ และแสดงแนวทางกู้คืน test shim ปัจจุบันจำลองสถานะเปิด/ปิดและ close event แต่ไม่ยืนยัน focus containment ใน browser หรือพฤติกรรมคีย์บอร์ดเสมือนบนมือถือ

ผู้ใช้ `ModalDialog` โดยตรงมีหน้า review การนำเข้าผู้ป่วย, ตัวแก้แผนรอบโปรแกรม และตัวควบคุมขั้นตอนรอบโปรแกรม ส่วน `ConfirmDialog` และ `ConfirmableActionForm` ถูกใช้ข้าม workflow ผู้ป่วย บุคลากร โรงพยาบาล นัดหมาย การส่งออก และ guard ก่อนเปลี่ยนหน้า หน้า review นำเข้าผู้ป่วยมี callback คืน focus ของตัวเองเพื่อกลับไปยังปุ่ม preview, ช่องเลือกไฟล์ หรือวันที่มีผล ควรแทนพฤติกรรมนี้ด้วย return target เดียวในวงจรชีวิตของ dialog ยังมีหน้าเปลี่ยนรหัสผ่านโดยเจ้าหน้าที่ที่ใช้ `<dialog>` โดยตรง และมี inline forms กับ `<details>` ที่เป็นของแต่ละ feature Phase นี้ไม่ย้าย surface เหล่านี้

Design system มี semantic token สำหรับพื้นผิว ข้อความ เส้นขอบ focus radius และ elevation ปุ่มมี focus ring ที่มองเห็นได้และ touch target อย่างน้อย 44px mobile bottom navigation ใช้พื้นที่ safe area ด้านล่างที่ z-40 ส่วน native modal อยู่ใน top layer จึงแสดงเหนือ navigation ได้ dialog ปัจจุบันจัดกึ่งกลางและเว้นขอบบนมือถือ header กับ footer อยู่นอกบริเวณเนื้อหาที่เลื่อน พื้นฐานควรเพิ่มตัวเลือกแสดงเต็มจอบนมือถือสำหรับงานแก้ไข/review ที่มีเนื้อหามาก โดยคง confirmation แบบกะทัดรัดเป็นกล่องลอย

ทดสอบเฉพาะที่มีอยู่ก่อนแก้ไขแล้ว: `npm run test -- src/components/ui/modal-dialog-lifecycle.test.ts src/components/ui/confirm-dialog.test.tsx src/components/ui/confirmable-action-form.test.tsx` — ผ่าน 3 ไฟล์ รวม 16 tests

## การเลือก surface

- **Edit dialog:** งานสร้างหรือแก้ไขที่สั้น ขอบเขตชัด และมี field ไม่มาก เช่น เปลี่ยน label เบอร์โทรศัพท์ ชื่อ หรือ classification
- **Confirm dialog:** การตัดสินใจหนึ่งเรื่องที่ระบุ resource และผลกระทบชัดเจน บอกให้ทราบว่ากลับคืนได้หรือไม่ และต้องระบุเหตุผลหรือไม่ งาน destructive ใช้รูปแบบ destructive และให้ focus เริ่มที่ปุ่มยกเลิก
- **Review dialog:** สรุปผลหรือรายการ entity ที่ได้รับผลกระทบอย่างเป็นโครงสร้างก่อนบันทึก พร้อมปุ่มยืนยัน/ยกเลิกที่ชัดเจน เมื่อย้อนกลับไปแก้ต้องรักษา draft เดิมไว้
- **Dedicated page หรือ long-form workflow:** งานหลายส่วน หลายขั้นตอน งานคลินิกที่ซับซ้อน หรือแบบเก็บข้อมูลที่ยาวควรอยู่บนหน้าโดยเฉพาะ dialog อาจใช้แสดงขั้น review ที่มีขอบเขตชัดใน workflow ดังกล่าวได้ แต่ไม่ใช้แทน workflow ทั้งหมด

คง interaction ไว้แบบ inline เมื่อเป็นงานเฉพาะจุด ความเสี่ยงต่ำ ได้ประโยชน์จากบริบทข้างเคียง และไม่ต้องมีขอบเขตการตัดสินใจแยก เช่น เลือก classification เล็ก ๆ เปิดดูรายละเอียดเสริม หรือคำสั่งที่ผูกกับแถวเดียว ใช้ `<details>` สำหรับเนื้อหาประกอบที่เลือกเปิดได้ ไม่ใช้แทน confirmation ของการกระทำที่มีผลสำคัญ

## ข้อตกลงการโต้ตอบร่วม

ทุก dialog มีหัวเรื่องภาษาไทยที่ระบุงานได้ชัด มีคำอธิบายเพิ่มเติมเมื่อจำเป็น และมีลำดับ heading ที่สมเหตุผล ใช้ native `<dialog>` กับ `showModal()` เพื่อให้ browser จัดการ semantics, inert background และ focus containment ไม่เพิ่ม focus trap แข่งขันกันหรือ `role="dialog"` / `aria-modal` ที่ซ้ำกับ semantics ของ native

เมื่อเปิด ให้ focus เข้า dialog โดยไม่เลื่อนหน้าอย่างไม่คาดคิด ใช้หัวเรื่องกับ review ที่มีเนื้อหายาว และใช้การกระทำที่เสี่ยงน้อยที่สุดกับ confirmation แบบสั้น การเปลี่ยน step อาจตั้ง focus กลับไปที่หัวเรื่องโดยตั้งใจ แต่การแก้ field ตามปกติต้องไม่ทำให้ focus ถูกย้าย ระหว่างเปิดต้องเข้าถึง field และ validation feedback ด้วย keyboard ได้ เมื่อปิด ให้คืน focus ไป trigger เดิมหากยังใช้งานได้ มิฉะนั้นให้ใช้ logical return target ที่เจ้าของ workflow ระบุเพียงจุดเดียว หลีกเลี่ยง callback หลายชุดที่แย่งกันคืน focus

Escape และปุ่มปิด/ยกเลิกต้องปฏิบัติตามนโยบายเดียวกันที่เจ้าของ workflow กำหนด dialog ที่ idle ปิดได้ แบบฟอร์มที่แก้แล้วต้องถามก่อนทิ้งข้อมูล mutation ที่กำลังทำงานห้ามถูกขัดจังหวะจนผลลัพธ์หายไป unknown outcome และ conflict/reconciliation ต้องคงสถานะพร้อมแนวทางกู้คืนเดิม ห้าม retry เองหรือรายงานว่าสำเร็จเมื่อยังยืนยันไม่ได้ การแตะ backdrop ต้องไม่ทิ้ง draft

คง header และ footer ไว้ พร้อมให้มี content region ที่เลื่อนได้เพียงบริเวณเดียว จัด layout ให้อยู่ใน viewport ป้องกัน horizontal overflow คิดถึง safe area เมื่อแสดงเต็มจอบนมือถือ และคง touch target อย่างน้อย 44px confirmation แบบสั้นยังเป็นกล่องลอย ส่วนงานแก้ไขหรือ review ที่มีเนื้อหามากเลือกแสดงเต็มจอบนมือถือได้ native dialog top layer ต้องอยู่เหนือ navigation ของแอป

## การประกอบ Form และ Review

ประกอบเนื้อหา form เดิมไว้ภายใน `ModalDialog`; ให้ feature เจ้าของ form ดูแล field state และ business state ใช้ native form เพียงชุดเดียวและรักษา validation/submitter เดิม สำหรับ review-before-commit ให้คง draft แล้วส่งผ่าน action เดิมของ feature เมื่อผู้ใช้ยืนยันเท่านั้น แสดง pending, validation/error ที่ยืนยันแล้ว, success, unknown และ conflict ด้วย mutation state กับ alert primitive ที่มี ปิดเมื่อยืนยัน success แล้วเท่านั้น ห้ามสร้าง mutation state machine แข่งขันกัน, nested form, schema-driven builder หรือ backend action ใหม่เพื่องานแสดงผล

สำหรับการลองยืนยันใหม่ใน confirmation ทั่วไป ต้องรอให้เจ้าของ workflow ระบุว่าความล้มเหลวยืนยันแล้วและกู้คืนได้ การเปลี่ยน pending เพียงอย่างเดียวไม่ใช่สัญญาณให้ลองใหม่ เพราะอาจเป็น unknown outcome component กลางอาจรับ recovery key โดยเจ้าของจะเปลี่ยนค่าเมื่ออนุญาตให้กู้คืนอย่างปลอดภัยแล้วเท่านั้น

## ขอบเขตสำหรับ phase ถัดไป

UX-D1 ปรับ primitives และบันทึกวิธีประกอบ ไม่ได้แปลง inline actions, `<details>` หรือ conditional panels ทั้งระบบ UX-D2/UX-D3 จะย้ายเฉพาะ workflow ที่ผ่านการทบทวนและมีขอบเขตเหมาะสม โดยคง authorization กับ mutation contract ของ feature และให้ workflow คลินิก/onboarding แบบยาวอยู่บนหน้าโดยเฉพาะ
