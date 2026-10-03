import { describe, expect, it } from "vitest";
import { fromMedicationTimeCarrier, toMedicationTimeCarrier } from "./medication-local-time";

describe("medication TIME adapter", () => {
  it.each(["00:00", "08:00", "13:30", "23:59"])("round-trips %s with UTC carrier fields only", (time) => {
    const carrier = toMedicationTimeCarrier(time);
    expect(carrier.getUTCFullYear()).toBe(1970);
    expect(carrier.getUTCSeconds()).toBe(0);
    expect(carrier.getUTCMilliseconds()).toBe(0);
    expect(fromMedicationTimeCarrier(carrier)).toBe(time);
  });
  it.each(["8:00", "24:00", "12:60", "08:00:00", "08:00:00.000", "08:00Z", "08:00+07:00", " 08:00", "08:00 ", "08:00\n", "08:00\r\n", "๐๘:๐๐", "2026-10-03T08:00:00Z"])("rejects %s without normalization", (value) => {
    expect(() => toMedicationTimeCarrier(value)).toThrow("Invalid medication clock time");
  });
  it("fails closed on invalid/non-minute persisted carriers", () => {
    for (const carrier of [new Date(NaN), new Date(Date.UTC(1970, 0, 1, 8, 0, 1)), new Date(Date.UTC(1970, 0, 1, 8, 0, 0, 1))]) expect(() => fromMedicationTimeCarrier(carrier)).toThrow();
  });
});
