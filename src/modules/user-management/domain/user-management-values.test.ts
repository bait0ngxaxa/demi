import {
  PatientActivationPurpose,
  UserStatus,
  WorkforceActivationMode,
  WorkforceActivationPurpose,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  credentialEstablishedAt,
  deriveActivationMethod,
  deriveUserDirectoryStatus,
  type UsedActivation,
} from "./user-management-values";

const at = (iso: string) => new Date(iso);
const workforce = (purpose: WorkforceActivationPurpose, mode: WorkforceActivationMode, usedAt = "2026-10-01T00:00:00Z"): UsedActivation =>
  ({ source: "WORKFORCE", purpose, mode, usedAt: at(usedAt) });
const patient = (purpose: PatientActivationPurpose, usedAt = "2026-10-01T00:00:00Z"): UsedActivation =>
  ({ source: "PATIENT", purpose, usedAt: at(usedAt) });

describe("deriveUserDirectoryStatus", () => {
  it.each([
    [{ ended: true, relationshipSuspended: true, userStatus: UserStatus.SUSPENDED }, "REMOVED"],
    [{ ended: false, relationshipSuspended: true, userStatus: UserStatus.ACTIVE }, "SUSPENDED"],
    [{ ended: false, relationshipSuspended: false, userStatus: UserStatus.SUSPENDED }, "SUSPENDED"],
    [{ ended: false, relationshipSuspended: false, userStatus: UserStatus.PROVISIONED }, "PENDING"],
    [{ ended: false, relationshipSuspended: false, userStatus: UserStatus.INVITED }, "PENDING"],
    [{ ended: false, relationshipSuspended: false, userStatus: UserStatus.ACTIVE }, "ACTIVE"],
  ] as const)("%o → %s", (input, expected) => {
    expect(deriveUserDirectoryStatus(input)).toBe(expected);
  });
});

describe("deriveActivationMethod", () => {
  it("prefers self-registration from the relationship marker or a used capability", () => {
    expect(deriveActivationMethod({ selfRegisteredAt: at("2026-10-02T00:00:00Z"), userStatus: UserStatus.ACTIVE, usedActivations: [] }))
      .toBe("SELF_REGISTERED");
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.ACTIVE,
      usedActivations: [patient(PatientActivationPurpose.SELF_REGISTRATION), workforce(WorkforceActivationPurpose.ACTIVATION, WorkforceActivationMode.ASSISTED)] }))
      .toBe("SELF_REGISTERED");
  });

  it("separates not activated, assisted, invite and other", () => {
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.PROVISIONED, usedActivations: [] })).toBe("NOT_ACTIVATED");
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.ACTIVE,
      usedActivations: [workforce(WorkforceActivationPurpose.ACTIVATION, WorkforceActivationMode.ASSISTED)] })).toBe("ASSISTED");
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.SUSPENDED,
      usedActivations: [workforce(WorkforceActivationPurpose.ACTIVATION, WorkforceActivationMode.REMOTE)] })).toBe("INVITE");
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.ACTIVE,
      usedActivations: [patient(PatientActivationPurpose.ACTIVATION)] })).toBe("INVITE");
    // ADR-0024: a Parent OWNER invitation link is an invite, as a Child OWNER one is.
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.ACTIVE,
      usedActivations: [workforce(WorkforceActivationPurpose.PARENT_OWNER_ONBOARDING, WorkforceActivationMode.REMOTE)] })).toBe("INVITE");
    // A password reset is not a first activation.
    expect(deriveActivationMethod({ selfRegisteredAt: null, userStatus: UserStatus.ACTIVE,
      usedActivations: [workforce(WorkforceActivationPurpose.RESET, WorkforceActivationMode.ASSISTED)] })).toBe("OTHER");
  });
});

describe("credentialEstablishedAt", () => {
  it("returns the earliest first-credential use and ignores resets", () => {
    expect(credentialEstablishedAt([
      workforce(WorkforceActivationPurpose.RESET, WorkforceActivationMode.ASSISTED, "2026-09-01T00:00:00Z"),
      patient(PatientActivationPurpose.ACTIVATION, "2026-10-05T00:00:00Z"),
      workforce(WorkforceActivationPurpose.SELF_REGISTRATION, WorkforceActivationMode.REMOTE, "2026-10-03T00:00:00Z"),
    ])).toEqual(at("2026-10-03T00:00:00Z"));
    expect(credentialEstablishedAt([])).toBeNull();
  });
});
