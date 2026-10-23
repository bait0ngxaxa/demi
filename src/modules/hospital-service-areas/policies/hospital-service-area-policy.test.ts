import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import { assertHospitalServiceAreaPolicy, HOSPITAL_SERVICE_AREA_CAPABILITIES } from "./hospital-service-area-policy";

const parentHospitalId = randomUUID();
const actor: ActorContext = { userId: randomUUID(), personId: randomUUID(), roles: ["HOSPITAL"], osmHospitalRelationships: [],
  hospitalMemberships: [{ hospitalId: parentHospitalId, membershipType: "OWNER", status: "ACTIVE", hospitalStatus: "ACTIVE", profession: null }] };

describe("Parent OWNER area policy", () => {
  it.each(Object.values(HOSPITAL_SERVICE_AREA_CAPABILITIES))("allows %s for exact active direct OWNER context", (capability) => {
    expect(() => assertHospitalServiceAreaPolicy({ actor, capability, parentHospitalId })).not.toThrow();
  });
  it.each(["ADMIN", "OSM", "PATIENT", "CAREGIVER"] as const)("denies %s-only", (role) => {
    expect(() => assertHospitalServiceAreaPolicy({ actor: { ...actor, roles: [role] }, capability: HOSPITAL_SERVICE_AREA_CAPABILITIES.manage, parentHospitalId })).toThrow();
  });
  it("denies missing actors, unknown capabilities, MEMBER, stale memberships, inactive Hospitals and unrelated ownership", () => {
    const membership = actor.hospitalMemberships[0];
    const denied: (ActorContext | null)[] = [null,
      { ...actor, hospitalMemberships: [] },
      ...(["SUSPENDED", "ENDED", "INVITED", "PROVISIONED"] as const).map((status) => ({ ...actor, hospitalMemberships: [{ ...membership, status }] })),
      { ...actor, hospitalMemberships: [{ ...membership, membershipType: "MEMBER" }] },
      { ...actor, hospitalMemberships: [{ ...membership, hospitalStatus: "SUSPENDED" }] },
      { ...actor, hospitalMemberships: [{ ...membership, hospitalId: randomUUID() }] },
    ];
    for (const candidate of denied) expect(() => assertHospitalServiceAreaPolicy({ actor: candidate, capability: HOSPITAL_SERVICE_AREA_CAPABILITIES.manage, parentHospitalId })).toThrow();
    expect(() => assertHospitalServiceAreaPolicy({ actor, capability: "patient:read", parentHospitalId })).toThrow();
  });
  it("does not confer direct Child Patient authority", () => {
    expect(hasDirectHospitalPatientReadScope(actor, parentHospitalId)).toBe(true);
    expect(hasDirectHospitalPatientReadScope(actor, randomUUID())).toBe(false);
  });
});
