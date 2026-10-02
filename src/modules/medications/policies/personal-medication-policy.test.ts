import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { assertPersonalMedicationSelf } from "./personal-medication-policy";

const actor: ActorContext = { userId: "u", personId: "p", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] };
describe("focused medication SELF gate", () => {
  it.each([[], [Role.OSM], [Role.HOSPITAL], [Role.ADMIN]].map((roles) => ({ roles })))("denies non Patient roles $roles", ({ roles }) => {
    expect(() => assertPersonalMedicationSelf({ ...actor, roles })).toThrow();
  });
  it.each([[Role.PATIENT], [Role.PATIENT, Role.OSM], [Role.PATIENT, Role.HOSPITAL], [Role.PATIENT, Role.ADMIN]].map((roles) => ({ roles })))("permits initial SELF gate $roles without a role bypass", ({ roles }) => {
    expect(() => assertPersonalMedicationSelf({ ...actor, roles })).not.toThrow();
  });
  it("fails closed for missing actor or identity", () => {
    for (const input of [null, undefined, { ...actor, roles: [Role.PATIENT], userId: " " }, { ...actor, roles: [Role.PATIENT], personId: "" }]) expect(() => assertPersonalMedicationSelf(input)).toThrow();
  });
});
