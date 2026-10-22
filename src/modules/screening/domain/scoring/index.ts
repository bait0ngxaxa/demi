import type { ScreeningInstrumentCode } from "../question-sets/types";

import { LEGACY_PROTOTYPE_SCORING_VERSION } from "./legacy-prototype-v1";
import {
  calculatePamBookletResult,
  PAM_BOOKLET_SCORING_VERSION,
  type PamBookletResult,
} from "./pam-booklet-v1";
import {
  calculatePromsBookletResult,
  PROMS_BOOKLET_SCORING_VERSION,
  type PromsBookletResult,
} from "./proms-booklet-v1";

/** Scoring versions whose stored results can be read, by instrument (COMBINED = legacy PAM+PROMs). */
export const READABLE_SCORING_VERSIONS = {
  COMBINED: [LEGACY_PROTOTYPE_SCORING_VERSION],
  PAM: [PAM_BOOKLET_SCORING_VERSION],
  PROMS: [PROMS_BOOKLET_SCORING_VERSION],
} as const satisfies Record<"COMBINED" | ScreeningInstrumentCode, readonly string[]>;

export function isReadableScoringVersion(
  instrument: keyof typeof READABLE_SCORING_VERSIONS,
  version: string,
): boolean {
  return (READABLE_SCORING_VERSIONS[instrument] as readonly string[]).includes(version);
}

export type InstrumentScoringResults = {
  PAM: PamBookletResult;
  PROMS: PromsBookletResult;
};

/** R2-C: the scoring each instrument is submitted with today. */
export const CURRENT_INSTRUMENT_SCORING: {
  readonly [Code in ScreeningInstrumentCode]: {
    version: string;
    calculate(answers: Readonly<Record<string, number>>): InstrumentScoringResults[Code];
  };
} = {
  PAM: { version: PAM_BOOKLET_SCORING_VERSION, calculate: calculatePamBookletResult },
  PROMS: { version: PROMS_BOOKLET_SCORING_VERSION, calculate: calculatePromsBookletResult },
};

export { LEGACY_PROTOTYPE_SCORING_VERSION, calculateLegacyPrototypeResult } from "./legacy-prototype-v1";
export {
  PAM_BOOKLET_SCORING_VERSION,
  PAM_GROUPS,
  pamGroupDefinition,
  type PamBookletResult,
  type PamGroupCode,
  type PamGroupColour,
  type PamGroupDefinition,
} from "./pam-booklet-v1";
export {
  PROMS_BOOKLET_SCORING_VERSION,
  type PromsBookletResult,
} from "./proms-booklet-v1";

export type { ScreeningLevel, ScreeningScoreInput, ScreeningScoreResult, ScreeningZone } from "./types";
