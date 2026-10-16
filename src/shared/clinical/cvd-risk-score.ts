import { z } from "zod";

/** Tolerance for comparing a float to its one-decimal rounding. */
const ONE_DECIMAL_EPSILON = 1e-9;

function hasAtMostOneDecimal(value: number): boolean {
  return Math.abs(value * 10 - Math.round(value * 10)) < ONE_DECIMAL_EPSILON;
}

/**
 * Customer decision D7 (WB-DF-17): CVD risk score entered by staff as a percentage 0-100 with at most
 * one decimal. Optional; no calculation. The range is also a DB CHECK on both owning tables.
 */
export const cvdRiskScoreSchema = z
  .number()
  .finite()
  .min(0)
  .max(100)
  .refine(hasAtMostOneDecimal, "The CVD risk score allows one decimal")
  .nullable()
  .optional();
