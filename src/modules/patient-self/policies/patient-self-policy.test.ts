import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { APPOINTMENT_MANAGE_CAPABILITY, APPOINTMENT_READ_CAPABILITY } from "@/modules/appointments/policies/appointment-policy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_BASELINE_CREATE_CAPABILITY } from "@/modules/patient-baseline/policies/patient-baseline-policy";
import { FOLLOWUP_READ_CAPABILITY, FOLLOWUP_RECORD_CAPABILITY } from "@/modules/followups/policies/followup-policy";
import { PATIENT_READ_CAPABILITY } from "@/modules/patient-directory/policies/patient-directory-policy";
import { GOAL_PLAN_CAPABILITY, GOAL_READ_CAPABILITY } from "@/modules/goals/policies/goal-policy";
import {
  PATIENT_PROGRAM_MANAGE_CAPABILITY,
  PATIENT_PROGRAM_READ_CAPABILITY,
} from "@/modules/patient-program/policies/patient-program-policy";
import { SCREENING_READ_CAPABILITY, SCREENING_SUBMIT_CAPABILITY } from "@/modules/screening/policies/screening-policy";
import { ForbiddenError } from "@/shared/errors/application-error";

import {
  assertPatientSelfReadPolicy,
  decidePatientSelfReadPolicy,
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
        capability: PATIENT_READ_CAPABILITY,
      }),
    ).toMatchObject({ allowed: true, scope: "SELF" });

    expect(() =>
      assertPatientSelfReadPolicy({
        actor: actor(roles),
        capability: PATIENT_READ_CAPABILITY,
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
        capability: PATIENT_READ_CAPABILITY,
      });

      expect(decision).toMatchObject({ allowed: false });
      expect(() =>
        assertPatientSelfReadPolicy({
          actor: actor(roles),
          capability: PATIENT_READ_CAPABILITY,
        }),
      ).toThrow(ForbiddenError);
    });

  it("fails closed for a different capability or incomplete authenticated identity", () => {
    expect(
      decidePatientSelfReadPolicy({ actor: actor(), capability: "appointment:manage" }).allowed,
    ).toBe(false);
    expect(
      decidePatientSelfReadPolicy({
        actor: { ...actor(), personId: " " },
        capability: PATIENT_READ_CAPABILITY,
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientSelfReadPolicy({
        actor: { ...actor(), userId: " " },
        capability: PATIENT_READ_CAPABILITY,
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientSelfReadPolicy({ actor: null, capability: PATIENT_READ_CAPABILITY })
        .allowed,
    ).toBe(false);
  });

  it.each([
    PATIENT_READ_CAPABILITY,
    SCREENING_READ_CAPABILITY,
    PATIENT_PROGRAM_READ_CAPABILITY,
    GOAL_READ_CAPABILITY,
    FOLLOWUP_READ_CAPABILITY,
    APPOINTMENT_READ_CAPABILITY,
  ])("allows an existing read capability through SELF: %s", (capability) => {
    expect(decidePatientSelfReadPolicy({ actor: actor(), capability })).toMatchObject({
      allowed: true,
      scope: "SELF",
    });
  });

  it.each([
    SCREENING_SUBMIT_CAPABILITY,
    PATIENT_PROGRAM_MANAGE_CAPABILITY,
    GOAL_PLAN_CAPABILITY,
    FOLLOWUP_RECORD_CAPABILITY,
    APPOINTMENT_MANAGE_CAPABILITY,
    PATIENT_BASELINE_CREATE_CAPABILITY,
  ])("does not allow a mutation capability through SELF: %s", (capability) => {
    expect(decidePatientSelfReadPolicy({ actor: actor(), capability }).allowed).toBe(false);
  });
});
