import { z } from "zod";

/** Tolerance for comparing a float to its one-decimal rounding. */
const ONE_DECIMAL_EPSILON = 1e-9;

function hasAtMostOneDecimal(value: number): boolean {
  return Math.abs(value * 10 - Math.round(value * 10)) < ONE_DECIMAL_EPSILON;
}

/** A staff-entered percentage 0-100 with at most one decimal (D7 CVD risk, AS-1 round Achieve score). */
export const oneDecimalPercentSchema = z
  .number()
  .finite()
  .min(0)
  .max(100)
  .refine(hasAtMostOneDecimal, "The percentage allows one decimal");

/**
 * Customer decision D7 (WB-DF-17): CVD risk score entered by staff as a percentage 0-100 with at most
 * one decimal. Optional; no calculation. The range is also a DB CHECK on both owning tables.
 */
export const cvdRiskScoreSchema = oneDecimalPercentSchema.nullable().optional();
