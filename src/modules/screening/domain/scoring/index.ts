import {
  calculateLegacyPrototypeResult,
  LEGACY_PROTOTYPE_SCORING_VERSION,
} from "./legacy-prototype-v1";

import type { ScreeningScoreInput, ScreeningScoreResult } from "./types";

export type ScreeningScoringDefinition = {
  version: string;
  calculate(input: ScreeningScoreInput): ScreeningScoreResult;
};

const scoringDefinitions: readonly ScreeningScoringDefinition[] = [
  {
    version: LEGACY_PROTOTYPE_SCORING_VERSION,
    calculate: calculateLegacyPrototypeResult,
  },
];

export function getScoringDefinition(version: string): ScreeningScoringDefinition | null {
  return scoringDefinitions.find((definition) => definition.version === version) ?? null;
}

export function getPrototypeScoringDefinition(): ScreeningScoringDefinition {
  const definition = getScoringDefinition(LEGACY_PROTOTYPE_SCORING_VERSION);

  if (!definition) {
    throw new Error("The Screening prototype scoring definition is unavailable");
  }

  return definition;
}

export const scoringDefinitionRegistry = scoringDefinitions;

export { LEGACY_PROTOTYPE_SCORING_VERSION } from "./legacy-prototype-v1";

export type { ScreeningLevel, ScreeningScoreInput, ScreeningScoreResult, ScreeningZone } from "./types";
