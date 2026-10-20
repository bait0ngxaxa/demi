import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import { HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES } from "../policies/hospital-network-child-report-policy";
import {
  resolveParentChildHospitalReportAccessContext,
  type ParentChildHospitalReportAccessDatabase,
} from "./parent-child-hospital-report-access-service";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";
const actor: ActorContext = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.ADMIN, Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId: parentHospitalId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
};

// ADR-0016: the active operational network association is the only Parent scope source.
function createDatabase(area: unknown = {
  parent: { id: parentHospitalId, hospitalCode: "PARENT-01", name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
  child: { id: childHospitalId, hospitalCode: "CHILD-01", name: "โรงพยาบาลลูกข่ายสังเคราะห์" },
}) {
  const findFirst = vi.fn().mockResolvedValue(area);
  return {
    database: { hospitalServiceArea: { findFirst } } as unknown as ParentChildHospitalReportAccessDatabase,
    findFirst,
  };
}

describe("Parent-to-Child Hospital report access service", () => {
  it("returns one exact active network Child target without requiring a Child OWNER membership or loading report data", async () => {
    const { database, findFirst } = createDatabase();

    const access = await resolveParentChildHospitalReportAccessContext(
      actor,
      parentHospitalId,
      childHospitalId,
      database,
    );

    expect(access).toEqual({
      actorId: actor.userId,
      capability: HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES.read,
      parentHospitalId,
      parent: { id: parentHospitalId, name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
      hospital: {
        id: childHospitalId,
        name: "โรงพยาบาลลูกข่ายสังเคราะห์",
        status: HospitalStatus.ACTIVE,
        parentHospitalId,
      },
    });
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { parentHospitalId, childHospitalId, endedAt: null } });
    expect(JSON.stringify(access)).not.toMatch(/patient|program|measurement|hospitalCode/iu);
  });

  it("returns not-found when there is no active network association, whatever canonical placement says", async () => {
    const { database } = createDatabase(null);

    await expect(resolveParentChildHospitalReportAccessContext(actor, parentHospitalId, childHospitalId, database))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it("uses a coherent RepeatableRead transaction when given a Prisma client", async () => {
    const { database: transactionDatabase } = createDatabase();
    const outsideFindFirst = vi.fn();
    let transactionOptions: unknown;
    const database = {
      hospitalServiceArea: { findFirst: outsideFindFirst },
      $transaction: async <T>(
        operation: (transaction: ParentChildHospitalReportAccessDatabase) => Promise<T>,
        options: unknown,
      ): Promise<T> => {
        transactionOptions = options;
        return operation(transactionDatabase);
      },
    } as unknown as ParentChildHospitalReportAccessDatabase & {
      $transaction: (operation: (transaction: ParentChildHospitalReportAccessDatabase) => Promise<unknown>, options: unknown) => Promise<unknown>;
    };

    await expect(resolveParentChildHospitalReportAccessContext(
      actor,
      parentHospitalId,
      childHospitalId,
      database,
    )).resolves.toMatchObject({ hospital: { id: childHospitalId } });
    expect(transactionOptions).toMatchObject({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(outsideFindFirst).not.toHaveBeenCalled();
  });

  it("denies an absent actor without reading the hierarchy", async () => {
    const { database, findFirst } = createDatabase();

    await expect(resolveParentChildHospitalReportAccessContext(null, parentHospitalId, childHospitalId, database))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("denies ADMIN-only ActorContext even if it contains a stale Parent OWNER membership", async () => {
    const { database, findFirst } = createDatabase();

    await expect(resolveParentChildHospitalReportAccessContext(
      { ...actor, roles: [Role.ADMIN] },
      parentHospitalId,
      childHospitalId,
      database,
    )).rejects.toBeInstanceOf(ForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns a non-enumerating not-found result for malformed or mismatched Child targets", async () => {
    const { database, findFirst } = createDatabase();

    await expect(resolveParentChildHospitalReportAccessContext(actor, parentHospitalId, "invalid-id", database))
      .rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveParentChildHospitalReportAccessContext(actor, parentHospitalId, parentHospitalId, database))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("fails closed when current owner hierarchy data cannot be read", async () => {
    const { database, findFirst } = createDatabase();
    findFirst.mockRejectedValue(new Error("synthetic source failure"));

    await expect(resolveParentChildHospitalReportAccessContext(
      actor,
      parentHospitalId,
      childHospitalId,
      database,
    )).rejects.toBeInstanceOf(InfrastructureError);
  });
});
