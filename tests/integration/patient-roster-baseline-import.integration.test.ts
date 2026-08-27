import ExcelJS from "exceljs";
import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { createPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-service";
import {
  readPatientImportCandidates,
  type PatientImportUpload,
} from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";
import {
  importPatientProvisioning,
  previewPatientProvisioning,
  provisionPatient,
  type PatientProvisioningServiceDependencies,
  type ProvisionPatientInput,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";

const prisma = getPrisma();
const transactionNow = new Date("2026-08-25T05:00:00.000Z");
const batchDate = "2026-08-01";

const nationalIds = {
  allFields: "1000000000009",
  partialFields: "1000000000017",
  noBaseline: "1000000000025",
  existingWithoutBaseline: "1000000000033",
  sameImport: "1000000000041",
  blankHeight: "1000000000050",
  partialConflict: "1000000000068",
  weightConflict: "1000000000076",
  heightConflict: "1000000000084",
  waistConflict: "1000000000092",
  dtxConflict: "1000000000106",
  hba1cConflict: "1000000000114",
  dateConflict: "1000000000122",
  concurrent: "1000000000130",
  rollback: "1000000000148",
  independentValid: "1000000000155",
  independentConflict: "1000000000163",
} as const;

let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientBaseline.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(): Promise<{ id: string }> {
  sequence += 1;

  return prisma.hospital.create({
    data: {
      hospitalCode: "PHASE-16D2-" + sequence,
      name: "โรงพยาบาลทดสอบ Phase 16D.2 " + sequence,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true },
  });
}

async function createOwnerActor(hospitalId: string): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: "phase-16d2-owner-" + sequence },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId,
      membershipType: MembershipType.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [
      {
        hospitalId,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      },
    ],
    osmHospitalRelationships: [],
  };
}

function patientInput(
  nationalId: string,
  hospitalId: string,
  familyName = "ทดสอบนำเข้า",
): ProvisionPatientInput {
  return {
    identity: { namespace: "thai-national-id", value: nationalId },
    givenName: "สมชาย",
    familyName,
    hospitalNumber: "HN-" + nationalId.slice(-4),
    targetHospitalId: hospitalId,
  };
}

async function createRosterUpload(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<PatientImportUpload> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Synthetic roster");
  worksheet.addRow([...headers]);

  for (const row of rows) {
    worksheet.addRow([...row]);
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(new Uint8Array(written));

  return {
    name: "synthetic-phase-16d2.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

async function readRosterCandidate(
  hospitalId: string,
  headers: readonly string[],
  row: readonly unknown[],
) {
  const upload = await createRosterUpload(headers, [row]);
  const [candidate] = await readPatientImportCandidates(upload, hospitalId);
  return candidate;
}

function importDependencies(
  database?: PrismaClient,
): PatientProvisioningServiceDependencies {
  return { database, now: () => transactionNow, transactionRetries: 2 };
}

function createBaselineFailureDatabase(): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") {
        return Reflect.get(target, property, receiver);
      }

      return (
        operation: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        target.$transaction(async (transaction) => {
          const failingBaseline = new Proxy(transaction.patientBaseline, {
            get(delegate, delegateProperty, delegateReceiver): unknown {
              if (delegateProperty === "create") {
                return async (): Promise<never> => {
                  throw new Error("forced baseline write failure");
                };
              }

              return Reflect.get(delegate, delegateProperty, delegateReceiver);
            },
          });
          const transactionWithFailure = new Proxy(transaction, {
            get(transactionTarget, transactionProperty, transactionReceiver): unknown {
              if (transactionProperty === "patientBaseline") {
                return failingBaseline;
              }

              return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
            },
          });

          return operation(transactionWithFailure as unknown as Prisma.TransactionClient);
        });
    },
  }) as unknown as PrismaClient;
}

describe("Phase 16D.2 initial Baseline roster import PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persists all approved Baseline fields with one shared date and bounded audits", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const headers = [
      "Thai National ID",
      "First name",
      "Last name",
      "HN",
      "น้ำหนัก",
      "ส่วนสูง",
      "รอบเอว",
      "ค่าน้ำตาลในเลือด",
      "HbA1c",
    ];
    const candidate = await readRosterCandidate(
      hospital.id,
      headers,
      [nationalIds.allFields, "สมชาย", "ทดสอบนำเข้า", "HN-0009", 72.5, 170, 85, 126, 6.5],
    );

    const preview = await previewPatientProvisioning(actor, hospital.id, [candidate], prisma, {
      effectiveDate: batchDate,
    });
    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(preview.rows[0]).toMatchObject({
      classification: "READY",
      baselineStatus: "BASELINE_READY",
    });
    expect(summary).toMatchObject({
      imported: 1,
      baselineCreated: 1,
      baselineAlreadyExists: 0,
      baselineConflict: 0,
    });
    expect(summary.rows[0]).toMatchObject({
      result: "IMPORTED",
      baselineStatus: "BASELINE_CREATED",
    });

    const baseline = await prisma.patientBaseline.findFirstOrThrow({
      select: {
        recordedOn: true,
        weight: true,
        heightCm: true,
        waistCircumference: true,
        bloodSugarDtx: true,
        hba1c: true,
      },
    });
    expect(baseline).toMatchObject({
      recordedOn: new Date(batchDate + "T00:00:00.000Z"),
      weight: 72.5,
      heightCm: 170,
      waistCircumference: 85,
      bloodSugarDtx: 126,
      hba1c: 6.5,
    });
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient_baseline.created" } })).toBe(1);
    const baselineAudit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "patient_baseline.created" },
      select: { metadata: true },
    });
    expect(baselineAudit.metadata).toMatchObject({ source: "ROSTER_IMPORT" });
    expect(JSON.stringify(baselineAudit.metadata)).not.toContain("72.5");
    expect(JSON.stringify(baselineAudit.metadata)).not.toContain("126");
  });

  it("creates a partial Baseline only when at least one approved value exists", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const headers = ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "ส่วนสูง", "HbA1c"];
    const partialCandidate = await readRosterCandidate(
      hospital.id,
      headers,
      [nationalIds.partialFields, "สมชาย", "บางส่วน", "HN-0017", 70, "", ""],
    );
    const noBaselineCandidate = await readRosterCandidate(
      hospital.id,
      headers,
      [nationalIds.noBaseline, "สมชาย", "ไม่มีข้อมูลตั้งต้น", "HN-0025", "", "", ""],
    );

    const partialSummary = await importPatientProvisioning(
      actor,
      hospital.id,
      [partialCandidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );
    const noBaselineSummary = await importPatientProvisioning(
      actor,
      hospital.id,
      [noBaselineCandidate],
      importDependencies(),
    );

    expect(partialSummary).toMatchObject({ imported: 1, baselineCreated: 1 });
    expect(noBaselineSummary).toMatchObject({ imported: 1, baselineCreated: 0 });
    expect(await prisma.patientBaseline.count()).toBe(1);
    expect(await prisma.patientBaseline.findFirstOrThrow({ select: { weight: true, heightCm: true, hba1c: true } })).toEqual({
      weight: 70,
      heightCm: null,
      hba1c: null,
    });
  });

  it("rolls back a newly provisioned Patient core when the Baseline write fails", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก"],
      [nationalIds.rollback, "สมชาย", "แถวล้มเหลว", "HN-0148", 72.5],
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(createBaselineFailureDatabase()),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ imported: 0, failed: 1 });
    expect(summary.rows[0]).toMatchObject({ result: "FAILED" });
    expect(
      await prisma.person.count({
        where: {
          identityKeyHash: hashIdentityReference({
            namespace: "thai-national-id",
            value: nationalIds.rollback,
          }),
        },
      }),
    ).toBe(0);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.userRole.count({ where: { role: Role.PATIENT } })).toBe(0);
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    expect(await prisma.patientBaseline.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "patient_baseline.created" } })).toBe(0);
  });

  it("keeps independent rows independent when one Baseline conflicts", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const existingPatient = await provisionPatient(
      actor,
      patientInput(nationalIds.independentConflict, hospital.id, "แถวขัดแย้ง"),
    );
    await createPatientBaseline(
      actor,
      {
        patientHospitalRelationshipId: existingPatient.relationshipId,
        recordedOn: batchDate,
        weight: 70,
      },
      importDependencies(),
    );
    const headers = ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก"];
    const upload = await createRosterUpload(headers, [
      [nationalIds.independentValid, "สมชาย", "แถวสำเร็จ", "HN-0155", 71],
      [nationalIds.independentConflict, "สมชาย", "แถวขัดแย้ง", "HN-0163", 71],
    ]);
    const [validCandidate, conflictingCandidate] = await readPatientImportCandidates(
      upload,
      hospital.id,
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [validCandidate, conflictingCandidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ imported: 1, conflict: 1, baselineCreated: 1, baselineConflict: 1 });
    expect(summary.rows.map(({ result }) => result)).toEqual(["IMPORTED", "CONFLICT"]);
    expect(await prisma.patientHospitalRelationship.count()).toBe(2);
    expect(await prisma.patientBaseline.count()).toBe(2);
  });

  it("reconciles only present import fields and preserves unrelated Baseline values", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const patient = await provisionPatient(
      actor,
      patientInput(nationalIds.sameImport, hospital.id, "ข้อมูลเดิม"),
    );
    await createPatientBaseline(
      actor,
      {
        patientHospitalRelationshipId: patient.relationshipId,
        recordedOn: batchDate,
        weight: 70,
        waistCircumference: 85,
        bloodPressureSystolic: 120,
        bloodPressureDiastolic: 80,
        summary: "สรุปเดิม",
      },
      importDependencies(),
    );
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "รอบเอว"],
      [nationalIds.sameImport, "สมชาย", "ข้อมูลเดิม", "HN-0041", 70, 85],
    );

    const preview = await previewPatientProvisioning(actor, hospital.id, [candidate], prisma, {
      effectiveDate: batchDate,
    });
    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(preview.rows[0]).toMatchObject({
      classification: "ALREADY_EXISTS",
      baselineStatus: "BASELINE_ALREADY_EXISTS",
    });
    expect(summary).toMatchObject({ imported: 0, alreadyExists: 1, baselineAlreadyExists: 1 });
    expect(await prisma.patientBaseline.count()).toBe(1);
    expect(await prisma.patientBaseline.findFirstOrThrow({ select: { bloodPressureSystolic: true, summary: true } })).toEqual({
      bloodPressureSystolic: 120,
      summary: "สรุปเดิม",
    });
  });

  it("treats a blank source height as no assertion and never clears the existing value", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const patient = await provisionPatient(
      actor,
      patientInput(nationalIds.blankHeight, hospital.id, "ส่วนสูงเดิม"),
    );
    await createPatientBaseline(
      actor,
      {
        patientHospitalRelationshipId: patient.relationshipId,
        recordedOn: batchDate,
        weight: 70,
        heightCm: 170,
      },
      importDependencies(),
    );
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "ส่วนสูง"],
      [nationalIds.blankHeight, "สมชาย", "ส่วนสูงเดิม", "HN-0050", 70, ""],
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ conflict: 0, baselineAlreadyExists: 1 });
    expect(await prisma.patientBaseline.findFirstOrThrow({ select: { heightCm: true } })).toEqual({
      heightCm: 170,
    });
  });

  it("rejects an immutable partial update instead of filling a missing field", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const patient = await provisionPatient(
      actor,
      patientInput(nationalIds.partialConflict, hospital.id, "ข้อมูลบางส่วน"),
    );
    await createPatientBaseline(
      actor,
      {
        patientHospitalRelationshipId: patient.relationshipId,
        recordedOn: batchDate,
        weight: 70,
        waistCircumference: null,
      },
      importDependencies(),
    );
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "รอบเอว"],
      [nationalIds.partialConflict, "สมชาย", "ข้อมูลบางส่วน", "HN-0068", 70, 85],
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ conflict: 1, baselineConflict: 1, baselineCreated: 0 });
    expect(summary.rows[0]).toMatchObject({
      result: "CONFLICT",
      baselineStatus: "BASELINE_CONFLICT",
    });
    expect(await prisma.patientBaseline.findFirstOrThrow({ select: { waistCircumference: true } })).toEqual({
      waistCircumference: null,
    });
  });

  it.each([
    {
      id: nationalIds.weightConflict,
      header: "น้ำหนัก",
      existing: { weight: 70 },
      sourceValue: 71,
    },
    {
      id: nationalIds.heightConflict,
      header: "ส่วนสูง",
      existing: { heightCm: 170 },
      sourceValue: 171,
    },
    {
      id: nationalIds.waistConflict,
      header: "รอบเอว",
      existing: { waistCircumference: 85 },
      sourceValue: 86,
    },
    {
      id: nationalIds.dtxConflict,
      header: "ค่าน้ำตาลในเลือด",
      existing: { bloodSugarDtx: 126 },
      sourceValue: 127,
    },
    {
      id: nationalIds.hba1cConflict,
      header: "HbA1c",
      existing: { hba1c: 6.5 },
      sourceValue: 6.6,
    },
  ])("returns BASELINE_CONFLICT for a differing $header value", async ({ id, header, existing, sourceValue }) => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const patient = await provisionPatient(actor, patientInput(id, hospital.id, "ค่าต่างกัน"));
    await createPatientBaseline(
      actor,
      {
        patientHospitalRelationshipId: patient.relationshipId,
        recordedOn: batchDate,
        ...existing,
      },
      importDependencies(),
    );
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", header],
      [id, "สมชาย", "ค่าต่างกัน", "HN-" + id.slice(-4), sourceValue],
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ conflict: 1, baselineConflict: 1 });
    expect(summary.rows[0]).toMatchObject({ result: "CONFLICT", baselineStatus: "BASELINE_CONFLICT" });
  });

  it("returns BASELINE_CONFLICT when the batch effective date differs", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const patient = await provisionPatient(
      actor,
      patientInput(nationalIds.dateConflict, hospital.id, "วันที่ต่างกัน"),
    );
    await createPatientBaseline(
      actor,
      {
        patientHospitalRelationshipId: patient.relationshipId,
        recordedOn: batchDate,
        weight: 70,
      },
      importDependencies(),
    );
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก"],
      [nationalIds.dateConflict, "สมชาย", "วันที่ต่างกัน", "HN-0122", 70],
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: "2026-08-15" },
    );

    expect(summary).toMatchObject({ conflict: 1, baselineConflict: 1 });
    expect(summary.rows[0]).toMatchObject({ result: "CONFLICT", baselineStatus: "BASELINE_CONFLICT" });
  });

  it("creates a Baseline for an existing Patient core without changing the core", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    await provisionPatient(
      actor,
      patientInput(nationalIds.existingWithoutBaseline, hospital.id, "มี core แล้ว"),
    );
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก"],
      [nationalIds.existingWithoutBaseline, "สมชาย", "มี core แล้ว", "HN-0033", 70],
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({
      imported: 0,
      alreadyExists: 1,
      baselineCreated: 1,
    });
    expect(summary.rows[0]).toMatchObject({
      result: "ALREADY_EXISTS",
      baselineStatus: "BASELINE_CREATED",
    });
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    expect(await prisma.patientBaseline.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
  });

  it("requires an explicit date for approved Baseline data and never fabricates it", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก"],
      [nationalIds.allFields, "สมชาย", "ต้องระบุวันที่", "HN-0009", 70],
    );

    const preview = await previewPatientProvisioning(actor, hospital.id, [candidate], prisma);

    expect(preview).toMatchObject({
      effectiveDate: null,
      baselineDateRequired: true,
    });
    expect(preview.rows[0]).toMatchObject({
      classification: "INVALID",
      baselineStatus: "BASELINE_DATE_REQUIRED",
    });
    await expect(importPatientProvisioning(actor, hospital.id, [candidate], importDependencies())).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
  });

  it("keeps concurrent confirmations idempotent without duplicate core or Baseline rows", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const candidate = await readRosterCandidate(
      hospital.id,
      ["Thai National ID", "First name", "Last name", "HN", "น้ำหนัก", "ส่วนสูง"],
      [nationalIds.concurrent, "สมชาย", "พร้อมกัน", "HN-0130", 70, 170],
    );

    const outcomes = await Promise.all([
      importPatientProvisioning(actor, hospital.id, [candidate], importDependencies(), {
        effectiveDate: batchDate,
      }),
      importPatientProvisioning(actor, hospital.id, [candidate], importDependencies(), {
        effectiveDate: batchDate,
      }),
    ]);

    expect(outcomes.every((summary) => summary.failed === 0 && summary.conflict === 0)).toBe(true);
    expect(
      await prisma.person.count({
        where: {
          identityKeyHash: hashIdentityReference({
            namespace: "thai-national-id",
            value: nationalIds.concurrent,
          }),
        },
      }),
    ).toBe(1);
    expect(await prisma.userRole.count({ where: { role: Role.PATIENT } })).toBe(1);
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    expect(await prisma.patientBaseline.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient_baseline.created" } })).toBe(1);
  });
});
