import type { ScreeningScoreInput, ScreeningScoreResult } from "./types";

export const LEGACY_PROTOTYPE_SCORING_VERSION = "legacy-prototype-v1" as const;

export function calculateLegacyPrototypeResult(
  input: ScreeningScoreInput,
): ScreeningScoreResult {
  const pamValues = Object.values(input.pam);
  const promsValues = Object.values(input.proms);
  const pamTotal = pamValues.reduce((total, value) => total + value, 0);
  const promsTotal = promsValues.reduce((total, value) => total + value, 0);
  const promsMin = Math.min(...promsValues);
  const combinedTotal = pamTotal + promsTotal;

  if (pamTotal <= 5) {
    return {
      pamTotal,
      promsTotal,
      promsMin,
      combinedTotal,
      percentage: null,
      level: "L1",
      zone: "RED",
    };
  }

  if (promsMin <= 2) {
    return {
      pamTotal,
      promsTotal,
      promsMin,
      combinedTotal,
      percentage: null,
      level: "L1",
      zone: "RED",
    };
  }

  if (promsTotal <= 8) {
    return {
      pamTotal,
      promsTotal,
      promsMin,
      combinedTotal,
      percentage: null,
      level: "L1",
      zone: "RED",
    };
  }

  const percentage = (combinedTotal / 44) * 100;

  if (percentage >= 75) {
    return {
      pamTotal,
      promsTotal,
      promsMin,
      combinedTotal,
      percentage,
      level: "L4",
      zone: "GREEN",
    };
  }

  if (percentage >= 50) {
    return {
      pamTotal,
      promsTotal,
      promsMin,
      combinedTotal,
      percentage,
      level: "L3",
      zone: "YELLOW",
    };
  }

  return {
    pamTotal,
    promsTotal,
    promsMin,
    combinedTotal,
    percentage,
    level: "L2",
    zone: "GREEN",
  };
}
