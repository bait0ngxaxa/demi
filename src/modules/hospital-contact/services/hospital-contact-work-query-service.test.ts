import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

import { listWorkHospitalContacts } from "./hospital-contact-work-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const secondHospitalId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";

function actor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    userId,
    personId,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.MEMBER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
    ...overrides,
  };
}

function database(rows: Array<{
  hospitalCode: string;
  name: string;
  contact: { addressText: string | null; phoneNumber: string | null } | null;
}>, userExists = true) {
  const userFindFirst = vi.fn().mockResolvedValue(userExists ? { id: userId } : null);
  const hospitalFindMany = vi.fn().mockResolvedValue(rows);
  return {
    database: {
      user: { findFirst: userFindFirst },
      hospital: { findMany: hospitalFindMany },
    } as unknown as PrismaClient,
    userFindFirst,
    hospitalFindMany,
  };
}

describe("listWorkHospitalContacts", () => {
  it("rechecks the active user and filters hospitals by active OWNER or MEMBER membership", async () => {
    const db = database([
      {
        hospitalCode: "H-001",
        name: "โรงพยาบาลทดสอบ",
        contact: { addressText: "ถนนสุขภาพ", phoneNumber: "02-123-4567" },
      },
    ]);

    await expect(listWorkHospitalContacts(actor(), db.database)).resolves.toEqual([
      {
        hospital: { hospitalCode: "H-001", name: "โรงพยาบาลทดสอบ" },
        availability: "AVAILABLE",
        addressText: "ถนนสุขภาพ",
        phoneNumber: "02-123-4567",
      },
    ]);

    expect(db.userFindFirst).toHaveBeenCalledWith({
      where: {
        id: userId,
        personId,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { in: [Role.HOSPITAL] } } },
      },
      select: { id: true },
    });
    expect(db.hospitalFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: HospitalStatus.ACTIVE,
        OR: [
          {
            memberships: {
              some: {
                userId,
                membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
                status: MembershipStatus.ACTIVE,
                user: {
                  id: userId,
                  personId,
                  status: UserStatus.ACTIVE,
                  roles: { some: { role: Role.HOSPITAL } },
                },
              },
            },
          },
        ],
      },
      select: {
        hospitalCode: true,
        name: true,
        contact: { select: { addressText: true, phoneNumber: true } },
      },
    }));
  });

  it("uses active OSM relationship and ACTIVE user, person, and Hospital filters in the database query", async () => {
    const workActor = actor({
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
        { hospitalId: secondHospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    });
    const db = database([
      { hospitalCode: "H-001", name: "โรงพยาบาล ก", contact: null },
      { hospitalCode: "H-002", name: "โรงพยาบาล ข", contact: { addressText: null, phoneNumber: null } },
    ]);

    await expect(listWorkHospitalContacts(workActor, db.database)).resolves.toEqual([
      {
        hospital: { hospitalCode: "H-001", name: "โรงพยาบาล ก" },
        availability: "UNAVAILABLE",
        addressText: null,
        phoneNumber: null,
      },
      {
        hospital: { hospitalCode: "H-002", name: "โรงพยาบาล ข" },
        availability: "UNAVAILABLE",
        addressText: null,
        phoneNumber: null,
      },
    ]);

    expect(db.userFindFirst).toHaveBeenCalledWith({
      where: {
        id: userId,
        personId,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { in: [Role.OSM] } } },
      },
      select: { id: true },
    });
    const query = db.hospitalFindMany.mock.calls[0]?.[0];
    expect(query?.where).toEqual({
      status: HospitalStatus.ACTIVE,
      OR: [
        {
          osmHospitalRelationships: {
            some: {
              userId,
              status: MembershipStatus.ACTIVE,
              user: {
                id: userId,
                personId,
                status: UserStatus.ACTIVE,
                roles: { some: { role: Role.OSM } },
              },
            },
          },
        },
      ],
    });
  });

  it("includes both relationship types for actors with both work roles", async () => {
    const workActor = actor({
      roles: [Role.HOSPITAL, Role.OSM],
      osmHospitalRelationships: [
        { hospitalId: secondHospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    });
    const db = database([]);

    await expect(listWorkHospitalContacts(workActor, db.database)).resolves.toEqual([]);

    expect(db.hospitalFindMany.mock.calls[0]?.[0]?.where).toMatchObject({
      status: HospitalStatus.ACTIVE,
      OR: [
        { memberships: { some: { membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] }, status: MembershipStatus.ACTIVE } } },
        { osmHospitalRelationships: { some: { status: MembershipStatus.ACTIVE } } },
      ],
    });
  });

  it("denies a user that is no longer ACTIVE before querying any Hospital", async () => {
    const db = database([], false);

    await expect(listWorkHospitalContacts(actor(), db.database)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.hospitalFindMany).not.toHaveBeenCalled();
  });

  it("denies actors without a HOSPITAL or OSM role even if relationship data is present", async () => {
    const db = database([]);

    await expect(
      listWorkHospitalContacts(actor({ roles: [Role.ADMIN] }), db.database),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.userFindFirst).not.toHaveBeenCalled();
    expect(db.hospitalFindMany).not.toHaveBeenCalled();
  });
});
