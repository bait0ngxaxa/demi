import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  type PrismaClient,
} from "@prisma/client";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import {
  exportParentChildHospitalReportWorkbook,
  generateParentChildHospitalReportWorkbook,
} from "./parent-child-hospital-report-workbook-service";

const parentHospitalId = "11111111-1111-4111-8111-111111111111";
const childHospitalId = "22222222-2222-4222-8222-222222222222";
const parentName = "โรงพยาบาลแม่ข่ายสังเคราะห์";
const childName = "รพ.สต.ลูกข่ายสังเคราะห์";


/** R1-E: Service 1 counts are Programs with the reported round's record, routed by relation name. */
function serviceOneProgramCount(counts: Record<string, (args: unknown) => unknown>): ReturnType<typeof vi.fn> {
  return vi.fn((args: { where: { AND: [unknown, Record<string, unknown>] } }) => {
    const relation = Object.keys(args.where.AND[1])[0] ?? "";
    const count = counts[relation];
    if (!count) throw new Error(`Unexpected count ${relation}`);
    return count(args);
  });
}

function actorWith(membershipType: MembershipType, hospitalId = parentHospitalId, reportExportGranted = false): ActorContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{
      hospitalId,
      membershipType,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
      reportExportGranted,
    }],
    osmHospitalRelationships: [],
  };
}
const parentOwner = actorWith(MembershipType.OWNER);

// ADR-0016: the active network association (SQL-filtered for OWNER, ACTIVE Parent/Child) or nothing.
const activeArea = {
  parent: { id: parentHospitalId, hospitalCode: "PARENT-01", name: parentName },
  child: { id: childHospitalId, hospitalCode: "CHILD-01", name: childName },
};

function createDatabase() {
  const findMembership = vi.fn().mockResolvedValue(activeArea);
  const relationshipCount = vi.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(4);
  const programGroupBy = vi.fn().mockResolvedValue([
    { status: PatientProgramStatus.ACTIVE, _count: { _all: 5 } },
    { status: PatientProgramStatus.COMPLETED, _count: { _all: 3 } },
  ]);
  const transaction = {
    hospitalServiceArea: { findFirst: findMembership },
    patientHospitalRelationship: { count: relationshipCount },
    patientProgram: {
      groupBy: programGroupBy,
      count: serviceOneProgramCount({
        serviceOneRoutines: vi.fn().mockResolvedValue(7),
        serviceOneFloatingCharts: vi.fn().mockResolvedValue(6),
        serviceOneDreamCards: vi.fn().mockResolvedValue(2),
        serviceOneConfidences: vi.fn().mockResolvedValue(1),
      }),
    },
  };
  const auditCreate = vi.fn().mockResolvedValue({ id: "66666666-6666-4666-8666-666666666666" });
  const database = {
    $transaction: vi.fn(async <T>(operation: (client: typeof transaction) => Promise<T>): Promise<T> => operation(transaction)),
    auditEvent: { create: auditCreate },
  } as unknown as PrismaClient;
  return { database, findMembership, relationshipCount, programGroupBy, auditCreate };
}

async function workbookCells(buffer: Buffer): Promise<{
  sheetNames: string[];
  values: unknown[];
  generationTime: unknown;
  generationTimeFormat: string;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const values: unknown[] = [];
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => values.push(cell.value))));
  const generationTimeCell = workbook.worksheets[0]?.getCell("B4");
  return {
    sheetNames: workbook.worksheets.map(({ name }) => name),
    values,
    generationTime: generationTimeCell?.value,
    generationTimeFormat: generationTimeCell?.numFmt ?? "",
  };
}

function expectAudit(auditCreate: ReturnType<typeof vi.fn>, outcome: string, reason?: string): void {
  expect(auditCreate).toHaveBeenCalledOnce();
  expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      actorUserId: parentOwner.userId,
      action: `parent_child_reporting.export.${outcome}`,
      resourceType: "Hospital",
      resourceId: childHospitalId,
      metadata: {
        operation: "PARENT_CHILD_REPORT_EXPORT",
        outcome,
        parentHospitalId,
        ...(reason ? { reason } : {}),
      },
    }),
  }));
}

describe("RPT-32 Parent-to-Child summary export (ADR-0013 §3/§7)", () => {
  it("exports exactly the nine active-cohort values with Parent/Child labels and audits Parent and Child", async () => {
    const { database, relationshipCount, programGroupBy, auditCreate } = createDatabase();

    const result = await exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database });

    const { sheetNames, values } = await workbookCells(result.buffer);
    expect(sheetNames).toEqual(["สรุปรายลูกข่าย"]);
    expect(values).toContain(parentName);
    expect(values).toContain(childName);
    expect(values.filter((value) => typeof value === "number")).toEqual([12, 4, 8, 5, 3, 7, 6, 2, 1]);
    // No IDs, codes or patient-level fields: only labels, names, the generation time and the nine counts.
    const text = values.filter((value) => typeof value === "string").join("\n");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu);
    expect(text).not.toMatch(/PARENT-01|CHILD-01|HN|เลขบัตร|ชื่อผู้ป่วย|เบอร์|ที่อยู่|น้ำตาล|น้ำหนัก|ความดัน|Baseline|อสม\./u);
    expect(values.filter((value) => value instanceof Date)).toHaveLength(1);
    expect(values).toContain("เวลาที่สร้างไฟล์ (เวลาไทย)");
    expect(values).toContain("เวลาที่สร้างไฟล์เป็นเวลาไทย ไม่ใช่เวลาอ้างอิงของข้อมูล");

    // Phase F: active Patient–Hospital relationships only; there is no include-ended option.
    expect(relationshipCount).toHaveBeenNthCalledWith(1, { where: { hospitalId: childHospitalId, endedAt: null } });
    expect(programGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        patientHospitalRelationship: { is: { hospitalId: childHospitalId, endedAt: null } },
      }),
    }));
    expectAudit(auditCreate, "prepared");
    expect(JSON.stringify(auditCreate.mock.calls)).not.toMatch(/"12"|:12\b|value/u);
  });

  it("writes the generation instant as Bangkok wall time for a UTC timestamp near midnight", async () => {
    const { database } = createDatabase();
    const result = await exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database });
    const generatedAt = new Date("2026-10-16T17:30:00.000Z");
    const buffer = await generateParentChildHospitalReportWorkbook(result.summary, generatedAt);
    const workbook = await workbookCells(buffer);

    expect(workbook.generationTime).toEqual(new Date("2026-10-17T00:30:00.000Z"));
    expect(workbook.generationTimeFormat).toBe("dd/mm/yyyy hh:mm");
  });

  it.each([
    ["Parent MEMBER", actorWith(MembershipType.MEMBER)],
    ["Parent MEMBER holding a ก-15 export grant", actorWith(MembershipType.MEMBER, parentHospitalId, true)],
    ["Child OWNER exporting upward", actorWith(MembershipType.OWNER, childHospitalId)],
  ])("denies and audits a %s without building a file", async (_label, subject) => {
    const { database, findMembership, auditCreate } = createDatabase();

    await expect(exportParentChildHospitalReportWorkbook(subject, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect(findMembership).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "parent_child_reporting.export.denied",
        resourceId: childHospitalId,
        metadata: expect.objectContaining({ operation: "PARENT_CHILD_REPORT_EXPORT", outcome: "denied", reason: "NOT_AUTHORIZED" }),
      }),
    }));
  });

  it.each([
    "ended association (Child removed from the network)",
    "transferred Child (active under another Parent)",
    "inactive Child or Parent (filtered by the network predicate)",
  ])("denies a %s", async () => {
    const { database, findMembership, auditCreate } = createDatabase();
    findMembership.mockResolvedValue(null);

    await expect(exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
    expectAudit(auditCreate, "denied", "SCOPE_UNAVAILABLE");
  });

  it("ends access with the current association: a Child detached while the file is built is denied at the export-time re-check", async () => {
    const { database, findMembership, auditCreate } = createDatabase();
    findMembership.mockResolvedValueOnce(activeArea).mockResolvedValueOnce(null);

    await expect(exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
    expect(findMembership).toHaveBeenCalledTimes(2);
    expectAudit(auditCreate, "denied", "SCOPE_UNAVAILABLE");
  });

  it("does not release the file when the export audit cannot be written", async () => {
    const { database, auditCreate } = createDatabase();
    auditCreate.mockRejectedValue(new Error("audit store unavailable"));

    await expect(exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("fails closed and audits a failed source read without leaking error detail", async () => {
    const { database, relationshipCount, auditCreate } = createDatabase();
    relationshipCount.mockReset().mockRejectedValue(new Error("sensitive database error"));

    await expect(exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
    }, { database })).rejects.toBeInstanceOf(InfrastructureError);
    expectAudit(auditCreate, "failed", "UNAVAILABLE");
    expect(JSON.stringify(auditCreate.mock.calls)).not.toContain("sensitive database error");
  });

  it("rejects malformed or extra input before any read and audits the denial", async () => {
    const { database, auditCreate } = createDatabase();

    await expect(exportParentChildHospitalReportWorkbook(parentOwner, {
      parentHospitalId,
      hospitalId: childHospitalId,
      cohort: "INCLUDE_ENDED",
    }, { database })).rejects.toBeInstanceOf(NotFoundError);
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "parent_child_reporting.export.denied",
        resourceType: "ParentChildHospitalReporting",
      }),
    }));
  });
});
