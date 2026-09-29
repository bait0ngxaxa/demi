import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

import {
  assertPatientSelfReadPolicy,
  decidePatientSelfReadPolicy,
  PATIENT_SELF_READ_CAPABILITY,
} from "./patient-self-policy";

function actor(roles: readonly Role[] = [Role.PATIENT]): ActorContext {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    personId: "33333333-3333-4333-8333-333333333333",
    roles,
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

describe("Patient self-read policy", () => {
  it.each([
    ["Patient", [Role.PATIENT]],
    ["OSM and Patient", [Role.OSM, Role.PATIENT]],
    ["Hospital and Patient", [Role.HOSPITAL, Role.PATIENT]],
  ] as const)("allows the authenticated self scope for %s", (_label, roles) => {
    expect(
      decidePatientSelfReadPolicy({
        actor: actor(roles),
        capability: PATIENT_SELF_READ_CAPABILITY,
      }),
    ).toMatchObject({ allowed: true, scope: "SELF" });

    expect(() =>
      assertPatientSelfReadPolicy({
        actor: actor(roles),
        capability: PATIENT_SELF_READ_CAPABILITY,
      }),
    ).not.toThrow();
  });

  it.each([
    ["OSM", [Role.OSM]],
    ["Hospital", [Role.HOSPITAL]],
    ["Platform Admin", [Role.ADMIN]],
    ["no roles", []],
  ] as const)("denies actors without PATIENT role (%s)", (_label, roles) => {
      const decision = decidePatientSelfReadPolicy({
        actor: actor(roles),
        capability: PATIENT_SELF_READ_CAPABILITY,
      });

      expect(decision).toMatchObject({ allowed: false });
      expect(() =>
        assertPatientSelfReadPolicy({
          actor: actor(roles),
          capability: PATIENT_SELF_READ_CAPABILITY,
        }),
      ).toThrow(ForbiddenError);
    });

  it("fails closed for a different capability or incomplete authenticated identity", () => {
    expect(
      decidePatientSelfReadPolicy({ actor: actor(), capability: "patient:read" }).allowed,
    ).toBe(false);
    expect(
      decidePatientSelfReadPolicy({
        actor: { ...actor(), personId: " " },
        capability: PATIENT_SELF_READ_CAPABILITY,
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientSelfReadPolicy({ actor: null, capability: PATIENT_SELF_READ_CAPABILITY })
        .allowed,
    ).toBe(false);
  });
});
