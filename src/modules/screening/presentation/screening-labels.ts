import type { ScreeningInstrument } from "@prisma/client";

import type { StatusVariant } from "@/components/ui/status-badge";

import { pamGroupDefinition, type PamGroupColour } from "../domain/scoring";
import type { ScreeningLevel, ScreeningZone } from "../domain/scoring/types";
import type { ScreeningOutcome } from "../domain/screening-outcome";

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

export const SCREENING_INSTRUMENT_LABELS: Record<ScreeningInstrument, string> = {
  COMBINED: "PAM และ PROMs (ชุดเดิม)",
  PAM: "PAM",
  PROMS: "PROMs",
};

/** Q6 (default, pending customer confirmation): PROMs is reported as a result only, never a total. */
export const PROMS_RESULT_LABELS = {
  problem: "มีปัญหา",
  noProblem: "ไม่มีปัญหา",
} as const;

export const SCREENING_PROTOTYPE_NOTICE_TITLE = "แบบประเมินนี้ยังอยู่ระหว่างยืนยันข้อกำหนด";
export const SCREENING_PROTOTYPE_NOTICE_BODY =
  "คำถามและเกณฑ์ประเมินในหน้านี้อ้างอิงรูปแบบจากระบบ DEMI เดิม และยังไม่ใช่ข้อกำหนดทางคลินิกฉบับสุดท้าย";

const ZONE_VARIANTS: Record<ScreeningZone, StatusVariant> = {
  RED: "danger",
  YELLOW: "warning",
  GREEN: "success",
};

export const PAM_GROUP_COLOUR_VARIANTS: Record<PamGroupColour, StatusVariant> = {
  RED: "danger",
  YELLOW: "warning",
  GREEN: "success",
  BLUE: "info",
};

export type ScreeningOutcomeBadge = { label: string; variant: StatusVariant };

/** The badges that summarize a stored result; each instrument version maps its own fields explicitly. */
export function screeningOutcomeBadges(outcome: ScreeningOutcome): ScreeningOutcomeBadge[] {
  switch (outcome.kind) {
    case "LEGACY":
      return [
        { label: SCREENING_LEVEL_LABELS[outcome.level], variant: "info" },
        { label: SCREENING_ZONE_LABELS[outcome.zone], variant: ZONE_VARIANTS[outcome.zone] },
      ];
    case "PAM": {
      const group = pamGroupDefinition(outcome.group);

      return [
        { label: `คะแนน ${outcome.total}`, variant: "neutral" },
        { label: group.name, variant: PAM_GROUP_COLOUR_VARIANTS[group.colour] },
      ];
    }
    case "PROMS":
      return [
        outcome.hasProblem
          ? { label: PROMS_RESULT_LABELS.problem, variant: "danger" }
          : { label: PROMS_RESULT_LABELS.noProblem, variant: "success" },
      ];
  }
}
