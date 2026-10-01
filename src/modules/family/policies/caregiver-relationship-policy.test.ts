import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  decideFamilyPatientSelfPolicy,
} from "./caregiver-relationship-policy";

const actor = (roles: readonly Role[]): ActorContext => ({
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles,
  hospitalMemberships: [],
  osmHospitalRelationships: [],
});

describe("Family Patient SELF management policy", () => {
  it("requires the authenticated Patient role for Patient-initiated actions", () => {
    expect(decideFamilyPatientSelfPolicy(actor([Role.PATIENT])).allowed).toBe(true);
    expect(decideFamilyPatientSelfPolicy(actor([Role.HOSPITAL])).allowed).toBe(false);
    expect(decideFamilyPatientSelfPolicy(actor([Role.OSM])).allowed).toBe(false);
    expect(decideFamilyPatientSelfPolicy(actor([Role.ADMIN])).allowed).toBe(false);
  });

  it("does not give any role a Patient-resource capability", () => {
    expect(decideFamilyPatientSelfPolicy(null).allowed).toBe(false);
    expect(
      decideFamilyPatientSelfPolicy({ ...actor([Role.PATIENT]), userId: " " }).reason,
    ).toBe("authenticated_identity_required");
  });
});
