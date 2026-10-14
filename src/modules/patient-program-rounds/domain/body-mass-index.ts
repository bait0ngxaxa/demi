/**
 * WB-DF-04: BMI = weight(kg) / (height(m))^2, shown as a value only (no category or interpretation).
 * Returns null unless both inputs are positive finite numbers.
 */
export function calculateBodyMassIndex(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (
    typeof weightKg !== "number" ||
    typeof heightCm !== "number" ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }

  const heightMeters = heightCm / 100;
  const bmi = weightKg / (heightMeters * heightMeters);

  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}
