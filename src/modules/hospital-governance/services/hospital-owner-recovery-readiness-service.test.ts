import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { countSoleActiveOwnerHospitals } from "./hospital-owner-recovery-readiness-service";

const actor: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    { hospitalId: "hospital-one", membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
    { hospitalId: "hospital-two", membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
    { hospitalId: "hospital-inactive", membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.SUSPENDED, hospitalStatus: HospitalStatus.ACTIVE },
    { hospitalId: "hospital-member", membershipType: MembershipType.MEMBER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
  ],
  osmHospitalRelationships: [],
};

describe("Hospital OWNER recovery readiness context", () => {
  it("counts only active owners for active Hospitals the current OWNER belongs to", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { hospitalId: "hospital-one" },
      { hospitalId: "hospital-two" },
      { hospitalId: "hospital-two" },
    ]);

    await expect(countSoleActiveOwnerHospitals(actor, {
      database: { hospitalMembership: { findMany } } as unknown as PrismaClient,
    })).resolves.toBe(1);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        hospitalId: { in: ["hospital-one", "hospital-two"] },
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        hospital: { status: HospitalStatus.ACTIVE },
        user: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } },
      },
      select: { hospitalId: true },
    });
  });

  it("does not query hospital ownership for non-Hospital actors", async () => {
    const findMany = vi.fn();

    await expect(countSoleActiveOwnerHospitals({ ...actor, roles: [Role.ADMIN, Role.HOSPITAL] }, {
      database: { hospitalMembership: { findMany } } as unknown as PrismaClient,
    })).resolves.toBe(0);

    expect(findMany).not.toHaveBeenCalled();
  });
});
