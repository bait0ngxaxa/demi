import type { InstrumentQuestionSet } from "./types";

/** Q1 (default, pending customer confirmation): a 1-5 scale shown as five faces, worst to best. */
const promsOptions = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
] as const;

/**
 * R2-B: PROMs from the customer patient booklet (Product Owner, 2026-10-22). Statements are verbatim;
 * the assessor guidance is transcribed and proofread by the Product Owner before merge.
 */
export const promsBookletV1QuestionSet = {
  key: "demi-proms",
  version: "booklet-v1",
  instrument: "PROMS",
  title: "แบบประเมินความทุกข์และปัญหา (Patient Reported Outcome Measure: PROMs)",
  intro: [],
  scaleLabel: "1 = แย่ที่สุด, 5 = ดีที่สุด",
  questions: [
    {
      key: "proms-1",
      prompt:
        "สุขภาพโดยรวมตอนนี้ดี สามารถใช้ชีวิตประจำวันได้สบายๆ ทำอะไรได้ตามที่ต้องการ โดยไม่มีอาการเหนื่อยหรือหมดแรง",
      guidance:
        "อาการ “เหนื่อย/หมดแรง” แสดงถึงระดับน้ำตาลในเลือดที่ไม่สมดุลกับพฤติกรรมและปริมาณยาในปัจจุบัน เป็นข้อบ่งชี้ที่ควรเข้ารับการพบแพทย์ เช่น ผู้รับบริการทำพฤติกรรมลดน้ำหนักที่หนักเกิน",
      minAnswer: 1,
      maxAnswer: 5,
      required: true,
      options: promsOptions,
    },
    {
      key: "proms-2",
      prompt: "ช่วงนี้ฉันค่อนข้างสบายใจ ไม่ค่อยกังวลในเรื่องต่างๆ ทั้งเรื่องโรค และเรื่องอื่นๆในชีวิต",
      guidance:
        "ถามถึง “ความเครียด” ของผู้รับบริการ โดยอาจสอบถามเพิ่มเติมว่ามีประเด็นใดที่ผู้รับบริการมีความเครียดหรือกังวล ซึ่ง “ความเครียด” ของผู้รับบริการ ไม่เกี่ยวกับ “สถานะทางสุขภาพ” ผู้ป่วยมีสิทธิ์หรือจะเครียดหรือไม่เครียดก็ได้ ถึงจะน้ำตาลสูงแต่อาจจะยังไม่เครียด หรือเครียดเรื่องอื่นๆ ที่อาจส่งผลต่อสุขภาพ",
      minAnswer: 1,
      maxAnswer: 5,
      required: true,
      options: promsOptions,
    },
    {
      key: "proms-3",
      prompt: "ฉันสามารถดูแลตัวเองตามแผนการรักษาได้",
      guidance:
        "ตามที่คนไข้เข้าใจ ถ้าคนไข้เข้าใจว่า กินยาอย่างเดียว ไม่ออกกำลังกาย/คุมอาหาร ก็ตามที่คนไข้เข้าใจ ไม่ต้องบังคับ ว่าออกกำลังกาย/คุมอาหาร หรือยัง เป็นการวัด “ความทุกข์” ของผู้ป่วยเพียงเท่านั้น",
      minAnswer: 1,
      maxAnswer: 5,
      required: true,
      options: promsOptions,
    },
    {
      key: "proms-4",
      prompt: "ฉันไม่มีอาการหรือความผิดปกติที่ตา(ตาพร่ามัว) หรือเท้าเป็นแผล",
      guidance: "ดูตามเท่าที่ผู้ป่วย “รู้สึก” ว่าเป็นปัญหา",
      minAnswer: 1,
      maxAnswer: 5,
      required: true,
      options: promsOptions,
    },
  ],
} as const satisfies InstrumentQuestionSet;

/** The booklet's result rule, shown verbatim with the result. */
export const PROMS_RESULT_RULE_NOTE =
  "คะแนนข้อใดข้อหนึ่ง น้อยกว่าหรือเท่ากับ 2 จัดว่า “มีปัญหา” ทันที (ไม่มีการวัดจากคะแนนรวม)";
