import { describe, expect, it } from "vitest";

import {
  decideHospitalContactMutation,
  nextHospitalContactVersion,
} from "./hospital-contact-mutation";

const version = new Date("2026-10-05T02:03:04.005Z");
const token = version.toISOString();

describe("Hospital Contact expected-version decisions", () => {
  it("does not create or audit absent empty state", () => {
    expect(
      decideHospitalContactMutation({
        current: null,
        expectedUpdatedAt: null,
        desired: { addressText: null, phoneNumber: null },
      }),
    ).toEqual({ kind: "NOOP_ABSENT" });
  });

  it("creates the first non-empty state and rejects an expectation for a missing row", () => {
    expect(
      decideHospitalContactMutation({
        current: null,
        expectedUpdatedAt: null,
        desired: { addressText: "ถนนสุขภาพ", phoneNumber: null },
      }),
    ).toEqual({ kind: "CREATE" });
    expect(
      decideHospitalContactMutation({
        current: null,
        expectedUpdatedAt: token,
        desired: { addressText: null, phoneNumber: null },
      }),
    ).toEqual({ kind: "CONFLICT" });
  });

  it("checks a matching version before returning NOOP", () => {
    const current = {
      addressText: "ที่อยู่",
      phoneNumber: "02-123-4567",
      updatedAt: version,
    };

    expect(
      decideHospitalContactMutation({
        current,
        expectedUpdatedAt: token,
        desired: { addressText: "ที่อยู่", phoneNumber: "02-123-4567" },
      }),
    ).toEqual({ kind: "NOOP" });
    expect(
      decideHospitalContactMutation({
        current,
        expectedUpdatedAt: new Date(version.getTime() - 1).toISOString(),
        desired: { addressText: "ที่อยู่", phoneNumber: "02-123-4567" },
      }),
    ).toEqual({ kind: "CONFLICT" });
    expect(
      decideHospitalContactMutation({
        current,
        expectedUpdatedAt: null,
        desired: { addressText: "ที่อยู่", phoneNumber: "02-123-4567" },
      }),
    ).toEqual({ kind: "CONFLICT" });
  });

  it("updates changed values, including a clear, only from the matching version", () => {
    expect(
      decideHospitalContactMutation({
        current: { addressText: "ที่อยู่", phoneNumber: null, updatedAt: version },
        expectedUpdatedAt: token,
        desired: { addressText: null, phoneNumber: null },
      }),
    ).toEqual({ kind: "UPDATE" });
    expect(
      decideHospitalContactMutation({
        current: { addressText: "ที่อยู่", phoneNumber: null, updatedAt: version },
        expectedUpdatedAt: null,
        desired: { addressText: null, phoneNumber: null },
      }),
    ).toEqual({ kind: "CONFLICT" });
  });
});

describe("Hospital Contact monotonic millisecond version", () => {
  it("uses server time when it is later than the current version", () => {
    expect(nextHospitalContactVersion(new Date(version.getTime() + 8), version).getTime()).toBe(
      version.getTime() + 8,
    );
  });

  it("advances one millisecond for frozen or backward server clocks", () => {
    expect(nextHospitalContactVersion(version, version).getTime()).toBe(version.getTime() + 1);
    expect(nextHospitalContactVersion(new Date(version.getTime() - 20), version).getTime()).toBe(
      version.getTime() + 1,
    );
  });

  it("rejects invalid authoritative instants", () => {
    expect(() => nextHospitalContactVersion(new Date(Number.NaN), version)).toThrow();
    expect(() => nextHospitalContactVersion(version, new Date(Number.NaN))).toThrow();
  });
});
