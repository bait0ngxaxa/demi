import type { ScreeningLevel, ScreeningZone } from "../domain/scoring/types";

export const SCREENING_LEVEL_LABELS: Record<ScreeningLevel, string> = {
  L1: "ระดับ 1",
  L2: "ระดับ 2",
  L3: "ระดับ 3",
  L4: "ระดับ 4",
};

export const SCREENING_ZONE_LABELS: Record<ScreeningZone, string> = {
  RED: "โซนสีแดง",
  YELLOW: "โซนสีเหลือง",
  GREEN: "โซนสีเขียว",
};

export const SCREENING_PROTOTYPE_NOTICE_TITLE = "แบบประเมินนี้ยังอยู่ระหว่างยืนยันข้อกำหนด";
export const SCREENING_PROTOTYPE_NOTICE_BODY =
  "คำถามและเกณฑ์ประเมินในหน้านี้อ้างอิงรูปแบบจากระบบ DEMI เดิม และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย";
