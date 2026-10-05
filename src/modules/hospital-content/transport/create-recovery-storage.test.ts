import { describe, expect, it } from "vitest";

import {
  clearHospitalContentCreateRecoveryMarkers,
  hospitalContentCreateRecoveryStorageKey,
} from "./create-recovery-storage";

describe("Hospital Content create recovery storage", () => {
  it("uses an account-scoped key under the bounded domain prefix", () => {
    expect(hospitalContentCreateRecoveryStorageKey("actor-person-scope")).toBe(
      "demi.hospital-content.create.v1.actor-person-scope",
    );
  });

  it("clears Hospital Content attempt identities without touching other session data", () => {
    const values = new Map([
      ["demi.hospital-content.create.v1.account-a", "attempt-a"],
      ["demi.hospital-content.create.v1.account-b", "attempt-b"],
      ["other-feature.session", "preserve"],
    ]);
    const storage = {
      get length(): number { return values.size; },
      key(index: number): string | null { return [...values.keys()][index] ?? null; },
      removeItem(key: string): void { values.delete(key); },
    };

    clearHospitalContentCreateRecoveryMarkers(storage);

    expect(values).toEqual(new Map([["other-feature.session", "preserve"]]));
  });
});
