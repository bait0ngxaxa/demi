import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

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
  const relationshipCount = vi.fn()
    .mockResolvedValueOnce(3)
    .mockResolvedValueOnce(1);
  const programGroupBy = vi.fn().mockResolvedValue([
    { status: PatientProgramStatus.ACTIVE, _count: { _all: 2 } },
    { status: PatientProgramStatus.COMPLETED, _count: { _all: 1 } },
  ]);
  const routineCount = vi.fn().mockResolvedValue(2);
  const floatingChartCount = vi.fn().mockResolvedValue(1);
  const dreamCardCount = vi.fn().mockResolvedValue(0);
  const confidenceCount = vi.fn().mockResolvedValue(0);
  const transaction = {
    hospitalMembership: { findFirst: findMembership },
    hospital: { findFirst: findHospital },
    patientHospitalRelationship: { count: relationshipCount },
    patientProgram: { groupBy: programGroupBy },
    patientProgramServiceOneRoutine: { count: routineCount },
    patientProgramServiceOneFloatingChart: { count: floatingChartCount },
    patientProgramServiceOneDreamCard: { count: dreamCardCount },
    patientProgramServiceOneConfidence: { count: confidenceCount },
  };
  const auditCreate = vi.fn().mockResolvedValue({ id: "66666666-6666-4666-8666-666666666666" });
  const database = {
    $transaction: vi.fn(async <T>(operation: (client: typeof transaction) => Promise<T>): Promise<T> => operation(transaction)),
    auditEvent: { create: auditCreate },
  } as unknown as PrismaClient;

  return {
    database,
    findMembership,
    findHospital,
    transaction,
    relationshipCount,
    programGroupBy,
    routineCount,
    floatingChartCount,
    dreamCardCount,
    confidenceCount,
    auditCreate,
  };
}

describe("Parent-to-Child Hospital report query", () => {
  it("returns source-backed summary values for the exact Child without projecting patient or program details", async () => {
    const {
      database,
      findMembership,
      findHospital,
      relationshipCount,
      programGroupBy,
      routineCount,
      floatingChartCount,
      dreamCardCount,
      confidenceCount,
      auditCreate,
    } = createDatabase();

    const projection = await getParentChildHospitalReportingPage(actor, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database });

    expect(projection).toEqual({
      operation: "PARENT_CHILD_REPORT",
      access: "PARENT_OWNER",
      parent: { id: parentHospitalId, name: "โรงพยาบาลแม่ข่ายสังเคราะห์" },
      hospital: { id: childHospitalId, name: "โรงพยาบาลลูกข่ายสังเคราะห์" },
      content: {
        state: "AVAILABLE",
        dashboard: {
          state: "AVAILABLE",
          value: {
            patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 3 },
            relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
            programs: { grain: "PATIENT_PROGRAM", total: 3, active: 2, completed: 1 },
          },
        },
        serviceProcess: {
          state: "AVAILABLE",
          value: {
            programsWithRoutineRecord: { grain: "PATIENT_PROGRAM", value: 2 },
            programsWithFloatingChartRecord: { grain: "PATIENT_PROGRAM", value: 1 },
            programsWithDreamCardRecord: { grain: "PATIENT_PROGRAM", value: 0 },
            programsWithConfidenceRecord: { grain: "PATIENT_PROGRAM", value: 0 },
          },
        },
      },
    });
    expect(findMembership).toHaveBeenCalledTimes(2);
    expect(findHospital).toHaveBeenCalledOnce();
    expect(relationshipCount).toHaveBeenNthCalledWith(1, { where: { hospitalId: childHospitalId } });
    expect(relationshipCount).toHaveBeenNthCalledWith(2, {
      where: { hospitalId: childHospitalId, programs: { none: {} } },
    });
    expect(programGroupBy).toHaveBeenCalledWith({
      by: ["status"],
      where: {
        patientHospitalRelationship: { is: { hospitalId: childHospitalId } },
        status: { in: [PatientProgramStatus.ACTIVE, PatientProgramStatus.COMPLETED] },
      },
      _count: { _all: true },
    });
    const serviceProcessWhere = {
      where: {
        patientProgram: {
          is: {
            patientHospitalRelationship: { is: { hospitalId: childHospitalId } },
            status: { in: [PatientProgramStatus.ACTIVE, PatientProgramStatus.COMPLETED] },
          },
        },
      },
    };
    expect(routineCount).toHaveBeenCalledWith(serviceProcessWhere);
    expect(floatingChartCount).toHaveBeenCalledWith(serviceProcessWhere);
    expect(dreamCardCount).toHaveBeenCalledWith(serviceProcessWhere);
    expect(confidenceCount).toHaveBeenCalledWith(serviceProcessWhere);
    expect(JSON.stringify(projection)).not.toMatch(/patientProgramId|patientHospitalRelationshipId|hospitalCode|hospitalNumber|displayName|measurement|bloodSugar|goalPlans|followups/iu);
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        actorUserId: actor.userId,
        action: "parent_child_reporting.access.read",
        resourceType: "Hospital",
        resourceId: childHospitalId,
        metadata: {
          operation: "PARENT_CHILD_REPORT",
          outcome: "read",
          parentHospitalId,
        },
      }),
    }));
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
    const { database, findMembership, auditCreate } = createDatabase();

    await expect(getParentChildHospitalReportingPage({
      ...actor,
      roles: [Role.ADMIN],
    }, { parentHospitalId, hospitalId: childHospitalId }, { database }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(findMembership).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "parent_child_reporting.access.denied",
        resourceId: childHospitalId,
        metadata: expect.objectContaining({ outcome: "denied", reason: "NOT_AUTHORIZED" }),
      }),
    }));
  });

  it("fails closed and audits unavailable source reads without recording source details", async () => {
    const { database, relationshipCount, auditCreate } = createDatabase();
    relationshipCount.mockReset().mockRejectedValue(new Error("sensitive database error"));

    await expect(getParentChildHospitalReportingPage(actor, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(InfrastructureError);
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "parent_child_reporting.access.failed",
        resourceId: childHospitalId,
        metadata: expect.objectContaining({
          operation: "PARENT_CHILD_REPORT",
          outcome: "failed",
          parentHospitalId,
          reason: "UNAVAILABLE",
        }),
      }),
    }));
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("sensitive database error");
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
