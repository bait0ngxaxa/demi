import { Role, UserStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { patientActivationQueryInternals } from "./patient-activation-query-service";

const now = new Date("2026-08-15T12:00:00.000Z");
const baseUser = {
  status: UserStatus.PROVISIONED,
  authSubject: null,
  roles: [{ role: Role.PATIENT }],
};

const activation = {
  expiresAt: new Date("2026-08-16T12:00:00.000Z"),
  claimedAt: null,
  claimExpiresAt: null,
  reconciliationRequiredAt: null,
  usedAt: null,
  revokedAt: null,
};

describe("patient activation query projection", () => {
  it("builds a case-insensitive, term-by-term name filter", () => {
    expect(
      patientActivationQueryInternals.buildNameWhere("  สมชาย   ใจดี "),
    ).toEqual({
      AND: [
        {
          OR: [
            { givenName: { contains: "สมชาย", mode: "insensitive" } },
            { familyName: { contains: "สมชาย", mode: "insensitive" } },
          ],
        },
        {
          OR: [
            { givenName: { contains: "ใจดี", mode: "insensitive" } },
            { familyName: { contains: "ใจดี", mode: "insensitive" } },
          ],
        },
      ],
    });
  });

  it.each([
    ["no activation", [], "NOT_ISSUED"],
    ["valid activation", [activation], "ISSUED"],
    [
      "active claim",
      [
        {
          ...activation,
          claimedAt: new Date("2026-08-15T11:59:00.000Z"),
          claimExpiresAt: new Date("2026-08-15T12:05:00.000Z"),
        },
      ],
      "IN_PROGRESS",
    ],
    [
      "expired activation",
      [{ ...activation, expiresAt: new Date("2026-08-15T11:59:00.000Z") }],
      "EXPIRED",
    ],
    [
      "reconciliation marker",
      [{ ...activation, reconciliationRequiredAt: new Date("2026-08-15T12:01:00.000Z") }],
      "RECONCILIATION_REQUIRED",
    ],
  ])("projects %s", (_label, activations, expectedStatus) => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(
        baseUser,
        activations,
        now,
      ).activationStatus,
    ).toBe(expectedStatus);
  });

  it("projects a mapped ACTIVE User as active without considering activation rows", () => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(
        {
          status: UserStatus.ACTIVE,
          authSubject: "11111111-1111-4111-8111-111111111111",
          roles: [{ role: Role.PATIENT }, { role: Role.OSM }],
        },
        [],
        now,
      ),
    ).toEqual({
      activationStatus: "ACTIVE",
      activationExpiresAt: null,
      activationMayBeIssued: false,
    });
  });

  it("fails closed for an ACTIVE User with an invalid provider mapping", () => {
    expect(
      patientActivationQueryInternals.projectActivationStatus(
        {
          status: UserStatus.ACTIVE,
          authSubject: "invalid-subject",
          roles: [{ role: Role.PATIENT }],
        },
        [],
        now,
      ).activationStatus,
    ).toBe("RECONCILIATION_REQUIRED");
  });
});
