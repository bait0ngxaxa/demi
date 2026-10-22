import type { ScreeningInstrument } from "@prisma/client";

import {
  pamResultSchema,
  promsResultSchema,
  screeningResultSchema,
} from "../schemas/screening-schemas";
import { isReadableScoringVersion, type PamGroupCode, type ScreeningLevel, type ScreeningZone } from "./scoring";

/**
 * R2-C: the stored result of a screening, by instrument. Only LEGACY carries a level and zone; the
 * booklet instruments never expose a zone, so no consumer can read one from them.
 */
export type ScreeningOutcome =
  | { kind: "LEGACY"; pamTotal: number; promsTotal: number; level: ScreeningLevel; zone: ScreeningZone }
  | { kind: "PAM"; total: number; group: PamGroupCode }
  | { kind: "PROMS"; hasProblem: boolean; problemItemKeys: string[]; itemScores: Record<string, number> };

/** Null when the stored result does not match its instrument and scoring version. */
export function parseScreeningOutcome(
  instrument: ScreeningInstrument,
  scoringVersion: string,
  result: unknown,
): ScreeningOutcome | null {
  if (!isReadableScoringVersion(instrument, scoringVersion)) {
    return null;
  }

  switch (instrument) {
    case "COMBINED": {
      const parsed = screeningResultSchema.safeParse(result);

      return parsed.success
        ? {
            kind: "LEGACY",
            pamTotal: parsed.data.pamTotal,
            promsTotal: parsed.data.promsTotal,
            level: parsed.data.level,
            zone: parsed.data.zone,
          }
        : null;
    }
    case "PAM": {
      const parsed = pamResultSchema.safeParse(result);

      return parsed.success ? { kind: "PAM", ...parsed.data } : null;
    }
    case "PROMS": {
      const parsed = promsResultSchema.safeParse(result);

      return parsed.success ? { kind: "PROMS", ...parsed.data } : null;
    }
  }
}

/** Which round steps a screening answers: a legacy combined row answers both (R2-C). */
export function screeningAnswersInstrument(
  instrument: ScreeningInstrument,
  step: "PAM" | "PROMS",
): boolean {
  return instrument === "COMBINED" || instrument === step;
}
