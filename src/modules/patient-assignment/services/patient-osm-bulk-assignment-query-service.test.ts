import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import {
  getPatientOsmBulkAssignmentView,
  listPatientOsmAssignmentScopes,
  type PatientOsmAssignmentQueryDatabase,
} from "./patient-osm-assignment-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const ownerUserId = "33333333-3333-4333-8333-333333333333";

function actorWith(
  membershipType: MembershipType,
  targetHospitalId = hospitalId,
): ActorContext {
  return {
    userId: ownerUserId,
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId: targetHospitalId,
        membershipType,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

function createDatabase(options: { hospitalFound?: boolean } = {}) {
  const hospital = {
    findFirst: vi.fn(async () => (options.hospitalFound === false ? null : { id: hospitalId, name: "โรงพยาบาล ก" })),
    findMany: vi.fn(async () => [{ id: hospitalId, name: "โรงพยาบาล ก" }, { id: otherHospitalId, name: "โรงพยาบาล ข" }]),
  };
  const patientHospitalRelationship = {
    findMany: vi.fn(async () => [
      {
        id: "55555555-5555-4555-8555-555555555555",
        hospitalNumber: "HN-1",
        hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
        patientProfile: {
          id: "66666666-6666-4666-8666-666666666666",
          patientClassification: { classification: "RISK" },
          person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
        },
      },
    ]),
    count: vi.fn(async () => 731),
  };
  const user = {
    findMany: vi.fn(async () => [
      { id: "77777777-7777-4777-8777-777777777777", person: { givenName: "สมหญิง", familyName: "ผู้ดูแล" } },
    ]),
  };

  return {
    database: { hospital, patientHospitalRelationship, user } as unknown as PatientOsmAssignmentQueryDatabase,
    hospital,
    patientHospitalRelationship,
    user,
  };
}

describe("listPatientOsmAssignmentScopes", () => {
  it("lists only hospitals the actor actively owns", async () => {
    const { database } = createDatabase();
    const scopes = await listPatientOsmAssignmentScopes(actorWith(MembershipType.OWNER), { database });

    expect(scopes).toEqual([{ hospitalId, hospitalName: "โรงพยาบาล ก" }]);
  });

  it("lists nothing for a MEMBER even if the database query is permissive", async () => {
    const { database } = createDatabase();

    expect(await listPatientOsmAssignmentScopes(actorWith(MembershipType.MEMBER), { database })).toEqual([]);
  });

  it("fails closed without an actor", async () => {
    await expect(listPatientOsmAssignmentScopes(null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getPatientOsmBulkAssignmentView", () => {
  it("returns unassigned patients capped at the batch size, the total and eligible OSMs", async () => {
    const { database, patientHospitalRelationship, user } = createDatabase();
    const view = await getPatientOsmBulkAssignmentView(
      actorWith(MembershipType.OWNER),
      { hospitalId, value: "สม" },
      { database },
    );

    expect(view.hospital).toEqual({ hospitalId, hospitalName: "โรงพยาบาล ก" });
    expect(view.totalWithoutOsm).toBe(731);
    expect(view.patients).toEqual([
      expect.objectContaining({ displayName: "สมชาย ผู้ป่วย", hospitalNumber: "HN-1" }),
    ]);
    expect(view.osmCandidates).toEqual([
      { userId: "77777777-7777-4777-8777-777777777777", displayName: "สมหญิง ผู้ดูแล" },
    ]);

    const patientCalls = patientHospitalRelationship.findMany.mock.calls as unknown as Array<
      [{ where: Record<string, unknown>; take: number }]
    >;
    const patientQuery = patientCalls[0]?.[0] as { where: Record<string, unknown>; take: number };
    expect(patientQuery.take).toBe(500);
    expect(patientQuery.where).toMatchObject({
      hospitalId,
      osmAssignments: { none: { endedAt: null } },
    });
    expect(JSON.stringify(patientQuery.where)).toContain("PATIENT");

    const osmCalls = user.findMany.mock.calls as unknown as Array<[{ where: Record<string, unknown> }]>;
    const osmQuery = osmCalls[0]?.[0] as { where: Record<string, unknown> };
    expect(osmQuery.where).toMatchObject({
      status: UserStatus.ACTIVE,
      id: { not: ownerUserId },
      osmHospitalRelationships: { some: { hospitalId, status: MembershipStatus.ACTIVE } },
    });
  });

  it("denies a MEMBER before querying", async () => {
    const { database, patientHospitalRelationship } = createDatabase();

    await expect(
      getPatientOsmBulkAssignmentView(actorWith(MembershipType.MEMBER), { hospitalId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("denies an owner of a different hospital", async () => {
    const { database, patientHospitalRelationship } = createDatabase();

    await expect(
      getPatientOsmBulkAssignmentView(
        actorWith(MembershipType.OWNER, otherHospitalId),
        { hospitalId },
        { database },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("denies when the hospital is not found for the owner", async () => {
    const { database, patientHospitalRelationship } = createDatabase({ hospitalFound: false });

    await expect(
      getPatientOsmBulkAssignmentView(actorWith(MembershipType.OWNER), { hospitalId }, { database }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(patientHospitalRelationship.findMany).not.toHaveBeenCalled();
  });

  it("rejects malformed input and a missing actor", async () => {
    const { database } = createDatabase();

    await expect(
      getPatientOsmBulkAssignmentView(actorWith(MembershipType.OWNER), { hospitalId: "x" }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(getPatientOsmBulkAssignmentView(null, { hospitalId }, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
