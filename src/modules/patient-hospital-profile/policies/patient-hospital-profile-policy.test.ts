import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decidePatientHospitalProfileUpdatePolicy,
  PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY,
} from "./patient-hospital-profile-policy";

const patientActor: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

describe("Patient Hospital profile update policy", () => {
  it("allows PATIENT SELF and preserves it for multi-role actors", () => {
    expect(
      decidePatientHospitalProfileUpdatePolicy({
        actor: { ...patientActor, roles: [Role.PATIENT, Role.HOSPITAL, Role.ADMIN] },
        capability: PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY,
      }),
    ).toMatchObject({ allowed: true, scope: "SELF" });
  });

  it.each([[Role.HOSPITAL], [Role.OSM], [Role.ADMIN]])(
    "denies a work-only %s actor",
    (role) => {
      expect(
        decidePatientHospitalProfileUpdatePolicy({
          actor: { ...patientActor, roles: [role] },
          capability: PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY,
        }).allowed,
      ).toBe(false);
    },
  );

  it("denies a missing actor and unrelated capability", () => {
    expect(
      decidePatientHospitalProfileUpdatePolicy({
        actor: null,
        capability: PATIENT_HOSPITAL_PROFILE_UPDATE_CAPABILITY,
      }).allowed,
    ).toBe(false);
    expect(
      decidePatientHospitalProfileUpdatePolicy({
        actor: patientActor,
        capability: "patient:delete",
      }).allowed,
    ).toBe(false);
  });
});
