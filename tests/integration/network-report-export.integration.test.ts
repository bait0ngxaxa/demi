import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { attachHospitalServiceArea, endHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-service-area-service";
import { openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import {
  getHospitalReportingDatasetForExport,
  getNetworkReportExportPreview,
  HospitalReportExportLimitError,
} from "@/modules/reporting/services/hospital-report-query-service";
import { exportNetworkReportWorkbook } from "@/modules/reporting/services/network-report-export-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { clearProgramRoundCompletions } from "./support/program-rounds";

const db = getPrisma();
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];

async function hospital(
  kind: "PARENT" | "CHILD",
  name: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
): Promise<{ id: string; hospitalCode: string; name: string }> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `NX-${randomUUID().slice(0, 20)}`,
      name,
      status,
      serviceAreaEligibility: { create: { kind, verifiedAt: new Date() } },
    },
  });
  hospitals.push(row.id);
  return { id: row.id, hospitalCode: row.hospitalCode, name: row.name };
}

async function user(roles: Role[]): Promise<{ userId: string; personId: string }> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "บุคลากร", familyName: "เครือข่าย" } });
  people.push(person.id);
  const created = await db.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } },
  });
  users.push(created.id);
  return { userId: created.id, personId: person.id };
}

async function staff(hospitalId: string, membershipType: MembershipType): Promise<ActorContext> {
  const { userId, personId } = await user([Role.HOSPITAL]);
  await db.hospitalMembership.create({ data: { userId, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });
  return {
    userId,
    personId,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

async function patient(
  owner: ActorContext,
  hospitalId: string,
  familyName: string,
  options: { program?: boolean } = {},
): Promise<string> {
  const provisioned = await provisionPatient(owner, {
    identity: { namespace: "network-export", value: randomUUID() },
    targetHospitalId: hospitalId,
    givenName: "ผู้ป่วย",
    familyName,
    hospitalNumber: `HN-${randomUUID().slice(0, 8)}`,
  });
  users.push(provisioned.userId);
  people.push(provisioned.personId);
  if (options.program !== false) {
    await openPatientProgram(owner, { patientHospitalRelationshipId: provisioned.relationshipId });
  }
  return provisioned.relationshipId;
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  const parent = await hospital("PARENT", "โรงพยาบาลแม่ข่าย NX");
  const childA = await hospital("CHILD", "รพ.สต.ก NX");
  const childB = await hospital("CHILD", "รพ.สต.ข NX");
  const endedChild = await hospital("CHILD", "รพ.สต.สิ้นสุด NX");
  const suspendedChild = await hospital("CHILD", "รพ.สต.ระงับ NX");
  const pendingChild = await hospital("CHILD", "รพ.สต.รอยืนยัน NX", HospitalStatus.PENDING_VERIFICATION);
  const strayChild = await hospital("CHILD", "รพ.สต.นอกเครือข่าย NX");
  const otherParent = await hospital("PARENT", "โรงพยาบาลแม่ข่ายอื่น NX");
  const otherChild = await hospital("CHILD", "รพ.สต.ของแม่ข่ายอื่น NX");

  const parentOwner = await staff(parent.id, MembershipType.OWNER);
  const parentMember = await staff(parent.id, MembershipType.MEMBER);
  const childOwner = await staff(childA.id, MembershipType.OWNER);
  const childMember = await staff(childA.id, MembershipType.MEMBER);
  const childBOwner = await staff(childB.id, MembershipType.OWNER);
  const otherParentOwner = await staff(otherParent.id, MembershipType.OWNER);

  await patient(parentOwner, parent.id, "แม่ข่าย");
  await patient(childOwner, childA.id, "ลูกข่ายก หนึ่ง");
  const endedRelationshipId = await patient(childOwner, childA.id, "ลูกข่ายก สิ้นสุด");
  await patient(childBOwner, childB.id, "ลูกข่ายข", { program: false });

  for (const child of [childA, childB, endedChild, suspendedChild, strayChild]) {
    if (child === strayChild) continue;
    await attachHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, childHospitalId: child.id });
  }
  await attachHospitalServiceArea(otherParentOwner, { parentHospitalId: otherParent.id, childHospitalId: otherChild.id });
  const endedArea = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: endedChild.id, endedAt: null } });
  await endHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, areaId: endedArea.id, confirm: true, endReason: "สิ้นสุดเครือข่าย" });
  await db.hospital.update({ where: { id: suspendedChild.id }, data: { status: HospitalStatus.SUSPENDED } });
  // ADR-0018: a Parent-created Child is attached before it is ACTIVE.
  await db.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: pendingChild.id, createdByUserId: parentOwner.userId } });

  // The Program of the second Child A Patient is completed, then that Patient's care ends: INCLUDE_ENDED only.
  await db.patientProgram.updateMany({
    where: { patientHospitalRelationshipId: endedRelationshipId },
    data: { status: PatientProgramStatus.COMPLETED, completedAt: new Date() },
  });
  await db.patientHospitalRelationship.update({
    where: { id: endedRelationshipId },
    data: { endedAt: new Date(), endedByUserId: childOwner.userId, endReason: "สิ้นสุดการดูแลใน fixture" },
  });

  return {
    parent, childA, childB, endedChild, suspendedChild, pendingChild, strayChild, otherParent, otherChild,
    parentOwner, parentMember, childOwner, childMember, childBOwner, otherParentOwner,
  };
}

async function cleanup(): Promise<void> {
  if (hospitals.length === 0) return;
  const relationshipWhere = { hospitalId: { in: hospitals } };
  const programIds = (await db.patientProgram.findMany({ where: { patientHospitalRelationship: relationshipWhere }, select: { id: true } }))
    .map(({ id }) => id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: hospitals } } });
  });
  await clearProgramRoundCompletions(programIds);
  await db.patientProgram.deleteMany({ where: { id: { in: programIds } } });
  await db.patientHospitalProfile.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientHospitalHealthHistory.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientHospitalRelationship.deleteMany({ where: relationshipWhere });
  await db.patientProfile.deleteMany({ where: { personId: { in: people } } });
  await db.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.osmHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospitalContact.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0;
  users.length = 0;
  people.length = 0;
}

async function summaryRows(buffer: Buffer): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  expect(workbook.worksheets.map(({ name }) => name)).toEqual(["Dashboard ภาพรวม", "รายงานการจัดบริการ", "สรุปรายหน่วยบริการ"]);
  const sheet = workbook.getWorksheet("สรุปรายหน่วยบริการ");
  if (!sheet) throw new Error("Missing summary sheet");
  return Array.from({ length: sheet.rowCount }, (_, index) => (sheet.getRow(index + 1).values as unknown[]).slice(1));
}

async function audits(actor: ActorContext): Promise<Array<{ action: string; resourceId: string | null; metadata: unknown }>> {
  return db.auditEvent.findMany({
    where: { actorUserId: actor.userId, action: { contains: "export" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { action: true, resourceId: true, metadata: true },
  });
}

const all = (f: Fixture, cohort?: "INCLUDE_ENDED"): Record<string, unknown> => ({
  parentHospitalId: f.parent.id,
  hospitalIds: "ALL",
  ...(cohort ? { cohort } : {}),
});

describe("ADR-0025 network report export / PostgreSQL", () => {
  beforeAll(async () => { await db.$connect(); });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it.each(["OWNER", "MEMBER"] as const)("lets the Parent %s export the whole network with per-Hospital single-export counts and audit", async (basis) => {
    const f = await fixture();
    const exporter = basis === "OWNER" ? f.parentOwner : f.parentMember;

    const { buffer, parent } = await exportNetworkReportWorkbook(exporter, all(f));
    expect(parent).toEqual(f.parent);

    const singleCounts = async (hospitalId: string, owner: ActorContext): Promise<number[]> => {
      const single = await getHospitalReportingDatasetForExport(owner, { hospitalId });
      return [
        single.counts.patientHospitalRelationships.value,
        single.counts.programs.total,
        single.counts.programs.active,
        single.counts.programs.completed,
        single.counts.relationshipsWithoutProgram.value,
      ];
    };
    expect(await summaryRows(buffer)).toEqual([
      ["หน่วยบริการ", "รหัส", "ประเภท", "จำนวนเคส", "Program ทั้งหมด", "ACTIVE", "COMPLETED", "ความสัมพันธ์ที่ยังไม่มี Program"],
      [f.parent.name, f.parent.hospitalCode, "แม่ข่าย", ...await singleCounts(f.parent.id, f.parentOwner)],
      [f.childA.name, f.childA.hospitalCode, "ลูกข่าย", ...await singleCounts(f.childA.id, f.childOwner)],
      [f.childB.name, f.childB.hospitalCode, "ลูกข่าย", ...await singleCounts(f.childB.id, f.childBOwner)],
      ["รวม", "", "", 3, 2, 2, 0, 1],
    ]);

    const events = await audits(exporter);
    const network = events.find(({ action }) => action === "hospital_reporting.network_export.prepared");
    expect(network).toMatchObject({
      resourceId: f.parent.id,
      metadata: {
        accessBasis: basis,
        parentHospitalId: f.parent.id,
        hospitalCount: 3,
        includesParent: true,
        childHospitalCount: 2,
        programCount: 2,
        cohort: "ACTIVE",
      },
    });
    const reference = (network?.metadata as { exportReference?: string }).exportReference;
    expect(reference).toEqual(expect.any(String));
    const childEvents = events.filter(({ action }) => action === "parent_child_reporting.export.prepared");
    expect(childEvents.map(({ resourceId }) => resourceId).sort()).toEqual([f.childA.id, f.childB.id].sort());
    expect(childEvents.every(({ metadata }) =>
      (metadata as Record<string, unknown>).scope === "NETWORK_EXPORT" && (metadata as Record<string, unknown>).exportReference === reference,
    )).toBe(true);
    expect(JSON.stringify(events)).not.toContain("ผู้ป่วย");
  });

  it("exports only the selected subset, in Parent-then-name order, and allows INCLUDE_ENDED for a MEMBER", async () => {
    const f = await fixture();

    const subset = await exportNetworkReportWorkbook(f.parentMember, { parentHospitalId: f.parent.id, hospitalIds: [f.childA.id] });
    const subsetRows = await summaryRows(subset.buffer);
    expect(subsetRows.slice(1).map((row) => row[0])).toEqual([f.childA.name, "รวม"]);
    expect(subsetRows[1]?.slice(3)).toEqual([1, 1, 1, 0, 0]);

    const history = await exportNetworkReportWorkbook(f.parentMember, {
      parentHospitalId: f.parent.id,
      hospitalIds: [f.childA.id, f.parent.id],
      cohort: "INCLUDE_ENDED",
    });
    const historyRows = await summaryRows(history.buffer);
    expect(historyRows.slice(1).map((row) => row[0])).toEqual([f.parent.name, f.childA.name, "รวม"]);
    expect(historyRows[2]?.slice(3)).toEqual([2, 2, 1, 1, 0]);

    const events = await audits(f.parentMember);
    expect(events.filter(({ action }) => action === "hospital_reporting.network_export.prepared").map(({ metadata }) => metadata))
      .toEqual([
        expect.objectContaining({ accessBasis: "MEMBER", hospitalCount: 1, includesParent: false, cohort: "ACTIVE" }),
        expect.objectContaining({ accessBasis: "MEMBER", hospitalCount: 2, includesParent: true, cohort: "INCLUDE_ENDED" }),
      ]);
  });

  it("refuses every Hospital outside the active network by name and audits the denial", async () => {
    const f = await fixture();

    for (const target of [f.strayChild, f.endedChild, f.suspendedChild, f.pendingChild, f.otherChild, f.otherParent]) {
      const attempt = exportNetworkReportWorkbook(f.parentOwner, { parentHospitalId: f.parent.id, hospitalIds: [f.childA.id, target.id] });
      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      await expect(attempt).rejects.toThrow(target.name);
    }
    await expect(exportNetworkReportWorkbook(f.parentOwner, { parentHospitalId: f.parent.id, hospitalIds: [randomUUID()] }))
      .rejects.toThrow("หน่วยบริการที่ไม่พบในระบบ");

    const preview = await getNetworkReportExportPreview(f.parentOwner, { parentHospitalId: f.parent.id });
    expect(preview.hospitals.map(({ id }) => id)).toEqual([f.parent.id, f.childA.id, f.childB.id]);

    const events = await audits(f.parentOwner);
    expect(events.filter(({ action }) => action.endsWith(".prepared"))).toEqual([]);
    expect(events.filter(({ action }) => action === "hospital_reporting.network_export.denied")).toHaveLength(7);
    expect(events[0]?.metadata).toMatchObject({ reason: "TARGET_NOT_ELIGIBLE", requestedScope: "SELECTED", requestedHospitalCount: 2 });
  });

  it("refuses actors that are not an OWNER or MEMBER of an active Parent", async () => {
    const f = await fixture();
    const osm = await user([Role.OSM]);
    const admin = await user([Role.ADMIN]);
    const actorFor = (ids: { userId: string; personId: string }, roles: Role[]): ActorContext => ({
      ...ids, roles, hospitalMemberships: [], osmHospitalRelationships: [],
    });

    await expect(exportNetworkReportWorkbook(f.childOwner, { parentHospitalId: f.childA.id, hospitalIds: "ALL" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(exportNetworkReportWorkbook(f.childMember, { parentHospitalId: f.childA.id, hospitalIds: "ALL" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(exportNetworkReportWorkbook(f.childOwner, all(f))).rejects.toBeInstanceOf(NotFoundError);
    await expect(exportNetworkReportWorkbook(f.otherParentOwner, all(f))).rejects.toBeInstanceOf(NotFoundError);
    await expect(exportNetworkReportWorkbook(actorFor(osm, [Role.OSM]), all(f))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportNetworkReportWorkbook(actorFor(admin, [Role.ADMIN]), all(f))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getNetworkReportExportPreview(f.childOwner, { parentHospitalId: f.parent.id })).rejects.toBeInstanceOf(NotFoundError);

    // A suspended membership and a suspended Parent both end the authority.
    await db.hospitalMembership.updateMany({ where: { userId: f.parentMember.userId }, data: { status: MembershipStatus.SUSPENDED } });
    await expect(exportNetworkReportWorkbook(f.parentMember, all(f))).rejects.toBeInstanceOf(NotFoundError);
    await db.hospital.update({ where: { id: f.parent.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(exportNetworkReportWorkbook(f.parentOwner, all(f))).rejects.toBeInstanceOf(NotFoundError);

    const denied = await db.auditEvent.findMany({ where: { actorUserId: { in: [f.childOwner.userId, f.childMember.userId, osm.userId, admin.userId] }, action: "hospital_reporting.network_export.denied" } });
    expect(denied).toHaveLength(5);
  });

  it("refuses a Child whose association ended between the preview and the export", async () => {
    const f = await fixture();
    const preview = await getNetworkReportExportPreview(f.parentMember, { parentHospitalId: f.parent.id });
    expect(preview).toMatchObject({ accessBasis: "MEMBER", totals: { relationships: 3, programs: 2, relationshipsWithoutProgram: 1 } });

    const area = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: f.childA.id, endedAt: null } });
    await endHospitalServiceArea(f.parentOwner, { parentHospitalId: f.parent.id, areaId: area.id, confirm: true, endReason: "โอนย้าย" });

    const attempt = exportNetworkReportWorkbook(f.parentMember, { parentHospitalId: f.parent.id, hospitalIds: preview.hospitals.map(({ id }) => id) });
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow(f.childA.name);
  });

  it("stops at 5,000 Programs with a limit error before any Program row is read", async () => {
    const f = await fixture();
    const relationship = await db.patientHospitalRelationship.findFirstOrThrow({ where: { hospitalId: f.childB.id } });
    await db.patientProgram.createMany({
      data: Array.from({ length: 4_999 }, () => ({
        patientHospitalRelationshipId: relationship.id,
        createdByUserId: f.parentOwner.userId,
        status: PatientProgramStatus.COMPLETED,
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        completedAt: new Date("2026-02-01T00:00:00.000Z"),
      })),
    });
    let programRowReads = 0;
    const tracked = db.$extends({
      query: {
        patientProgram: {
          async findMany({ args, query }) {
            programRowReads += 1;
            return query(args);
          },
        },
      },
    }) as unknown as PrismaClient;

    await expect(exportNetworkReportWorkbook(f.parentOwner, all(f), { database: tracked })).rejects.toBeInstanceOf(HospitalReportExportLimitError);
    expect(programRowReads).toBe(0);
    expect((await audits(f.parentOwner)).map(({ action, metadata }) => [action, (metadata as Record<string, unknown>).reason]))
      .toEqual([["hospital_reporting.network_export.denied", "LIMIT_EXCEEDED"]]);

    await expect(getNetworkReportExportPreview(f.parentOwner, { parentHospitalId: f.parent.id })).resolves.toMatchObject({
      totals: { programs: 5_001 },
      maxPrograms: 5_000,
    });
    // The same tracked client does see row reads for a selection within the limit.
    await exportNetworkReportWorkbook(f.parentOwner, { parentHospitalId: f.parent.id, hospitalIds: [f.parent.id, f.childA.id] }, { database: tracked });
    expect(programRowReads).toBeGreaterThan(0);
  });
});
