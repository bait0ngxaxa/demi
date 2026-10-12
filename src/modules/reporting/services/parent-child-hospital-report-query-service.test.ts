import { HospitalStatus, MembershipStatus, MembershipType, Role, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { getParentChildHospitalReportingPage } from "./hospital-report-query-service";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";
const actor: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId: parentHospitalId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
};

function createDatabase() {
  const parentRecord = {
    id: parentHospitalId,
    hospitalCode: "PARENT-01",
    name: "โรงพยาบาลแม่ข่ายสังเคราะห์",
    status: HospitalStatus.ACTIVE,
    parentHospitalId: null,
    parentHospital: null,
    childHospitals: [{
      id: childHospitalId,
      hospitalCode: "CHILD-01",
      name: "โรงพยาบาลลูกข่ายสังเคราะห์",
      status: HospitalStatus.ACTIVE,
      parentHospitalId,
    }],
  };
  const findMembership = vi.fn().mockResolvedValue({ hospital: parentRecord });
  const findHospital = vi.fn().mockResolvedValue({
    id: childHospitalId,
    name: "โรงพยาบาลลูกข่ายสังเคราะห์",
    parentHospital: { id: parentHospitalId, name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
  });
  const transaction = {
    hospitalMembership: { findFirst: findMembership },
    hospital: { findFirst: findHospital },
  };
  const database = {
    $transaction: vi.fn(async <T>(operation: (client: typeof transaction) => Promise<T>): Promise<T> => operation(transaction)),
  } as unknown as PrismaClient;

  return { database, findMembership, findHospital, transaction };
}

describe("Parent-to-Child Hospital report query", () => {
  it("returns a minimal exact-target projection without querying Patient, Program, or report sources", async () => {
    const { database, findMembership, findHospital } = createDatabase();

    const projection = await getParentChildHospitalReportingPage(actor, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database });

    expect(projection).toEqual({
      operation: "PARENT_CHILD_REPORT",
      access: "PARENT_OWNER",
      parent: { id: parentHospitalId, name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
      hospital: { id: childHospitalId, name: "โรงพยาบาลลูกข่ายสังเคราะห์" },
      content: { state: "WITHHELD", reason: "PARENT_FIELD_DISCLOSURE_NOT_APPROVED" },
    });
    expect(findMembership).toHaveBeenCalledTimes(2);
    expect(findHospital).toHaveBeenCalledOnce();
    expect(JSON.stringify(projection)).not.toMatch(/patient|program|clinical|count|hospitalCode|measurement/iu);
  });

  it("rejects cursors and extra report parameters instead of accepting a direct OWNER continuation", async () => {
    const { database } = createDatabase();

    await expect(getParentChildHospitalReportingPage(actor, {
      parentHospitalId,
      hospitalId: childHospitalId,
      cursor: "direct-owner-cursor",
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it("does not let ADMIN-only actors use the Parent report operation", async () => {
    const { database, findMembership } = createDatabase();

    await expect(getParentChildHospitalReportingPage({
      ...actor,
      roles: [Role.ADMIN],
    }, { parentHospitalId, hospitalId: childHospitalId }, { database }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("fails closed when the selected Child is not the exact direct child resolved by the hierarchy", async () => {
    const { database, findMembership } = createDatabase();
    findMembership.mockResolvedValueOnce({
      hospital: {
        id: parentHospitalId,
        hospitalCode: "PARENT-01",
        name: "โรงพยาบาลแม่ข่ายสังเคราะห์",
        status: HospitalStatus.ACTIVE,
        parentHospitalId: null,
        parentHospital: null,
        childHospitals: [],
      },
    });

    await expect(getParentChildHospitalReportingPage(actor, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
  });
});
