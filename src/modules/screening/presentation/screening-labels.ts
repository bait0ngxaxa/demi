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
