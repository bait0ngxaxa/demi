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
import { PATIENT_IMPORT_CONTRACT_VERSION } from "@/modules/patient-provisioning/import/patient-import-contract";
import {
  importPatientProvisioning,
  previewPatientProvisioning,
  provisionPatient,
  type PatientProvisioningServiceDependencies,
  type ProvisionPatientInput,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import {
  createPatientImportPreviewBinding,
  hashPatientImportFile,
} from "@/modules/patient-provisioning/transport/patient-import-file-binding";
import { createPatientImportFailedRowsDownload } from "@/modules/patient-provisioning/transport/patient-import-downloads";

import {
  createTemplateUpload,
  importTargetOf,
  readTemplateCandidates,
  type ImportTestHospital,
  type TemplateRow,
} from "./support/patient-import-template-upload";

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
  concurrent: "1000000000130",
  rollback: "1000000000148",
  independentValid: "1000000000155",
  independentConflict: "1000000000163",
} as const;

/** A valid Thai national ID for a numeric seed (13th digit is the mod-11 check digit). */
function thaiNationalId(seed: number): string {
  const digits = String(100000000000 + seed).slice(-12).split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (13 - index), 0);
  return `${digits.join("")}${(11 - (sum % 11)) % 10}`;
}

let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.patientClassificationHistory.deleteMany();
  await prisma.patientClassification.deleteMany();
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

async function createHospital(): Promise<ImportTestHospital> {
  sequence += 1;

  return prisma.hospital.create({
    data: {
      hospitalCode: "PHASE-16D2-" + sequence,
      name: "โรงพยาบาลทดสอบ Phase 16D.2 " + sequence,
      status: HospitalStatus.ACTIVE,
    },
    select: { id: true, hospitalCode: true, name: true },
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

function templateRow(
  nationalId: string,
  familyName: string,
  extra: TemplateRow = {},
): TemplateRow {
  return {
    nationalId,
    givenName: "สมชาย",
    familyName,
    hospitalNumber: "HN-" + nationalId.slice(-4),
    ...extra,
  };
}

async function readCandidate(hospital: ImportTestHospital, row: TemplateRow) {
  const [candidate] = await readTemplateCandidates(hospital, [row]);

  if (!candidate) {
    throw new Error("The synthetic template row was not parsed");
  }

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

describe("Patient roster import (template v2, new patients only) PostgreSQL workflow", () => {
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
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.allFields, "ทดสอบนำเข้า", {
        weight: 72.5,
        height: 170,
        waistCircumference: 85,
        bloodSugarDtx: 126,
        hba1c: 6.5,
      }),
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
    expect(summary).toMatchObject({ imported: 1, baselineCreated: 1 });
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
    const partialCandidate = await readCandidate(
      hospital,
      templateRow(nationalIds.partialFields, "บางส่วน", { weight: 70, height: "", hba1c: "" }),
    );
    const noBaselineCandidate = await readCandidate(
      hospital,
      templateRow(nationalIds.noBaseline, "ไม่มีข้อมูลตั้งต้น", { weight: "", height: "", hba1c: "" }),
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
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.rollback, "แถวล้มเหลว", { weight: 72.5 }),
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

  it("keeps independent rows independent when one existing patient does not match", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    await provisionPatient(
      actor,
      patientInput(nationalIds.independentConflict, hospital.id, "แถวขัดแย้ง"),
    );
    const candidates = await readTemplateCandidates(hospital, [
      templateRow(nationalIds.independentValid, "แถวสำเร็จ", { weight: 71 }),
      templateRow(nationalIds.independentConflict, "ชื่อไม่ตรงกัน", { weight: 71 }),
    ]);

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      candidates,
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ imported: 1, conflict: 1, baselineCreated: 1 });
    expect(summary.rows.map(({ result }) => result)).toEqual(["IMPORTED", "CONFLICT"]);
    expect(await prisma.patientHospitalRelationship.count()).toBe(2);
    expect(await prisma.patientBaseline.count()).toBe(1);
  });

  it("never changes an existing patient: changed baseline values are ignored and nothing is overwritten", async () => {
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
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.sameImport, "ข้อมูลเดิม", {
        weight: 99,
        waistCircumference: 120,
        height: 190,
        hba1c: 9,
      }),
    );

    const preview = await previewPatientProvisioning(actor, hospital.id, [candidate], prisma, {
      effectiveDate: "2026-08-15",
    });
    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: "2026-08-15" },
    );

    expect(preview.rows[0]).toMatchObject({ classification: "ALREADY_EXISTS", baselineStatus: "NOT_APPLICABLE" });
    expect(summary).toMatchObject({ imported: 0, alreadyExists: 1, conflict: 0, baselineCreated: 0 });
    expect(await prisma.patientBaseline.count()).toBe(1);
    expect(
      await prisma.patientBaseline.findFirstOrThrow({
        select: {
          recordedOn: true,
          weight: true,
          waistCircumference: true,
          heightCm: true,
          hba1c: true,
          bloodPressureSystolic: true,
          summary: true,
        },
      }),
    ).toEqual({
      recordedOn: new Date(batchDate + "T00:00:00.000Z"),
      weight: 70,
      waistCircumference: 85,
      heightCm: null,
      hba1c: null,
      bloodPressureSystolic: 120,
      summary: "สรุปเดิม",
    });
  });

  it("does not create a Baseline for an existing patient that has none, and does not need a date for it", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    await provisionPatient(
      actor,
      patientInput(nationalIds.existingWithoutBaseline, hospital.id, "มี core แล้ว"),
    );
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.existingWithoutBaseline, "มี core แล้ว", { weight: 70 }),
    );

    const preview = await previewPatientProvisioning(actor, hospital.id, [candidate], prisma);
    const summary = await importPatientProvisioning(actor, hospital.id, [candidate], importDependencies());

    expect(preview.baselineDateRequired).toBe(false);
    expect(summary).toMatchObject({ imported: 0, alreadyExists: 1, baselineCreated: 0 });
    expect(summary.rows[0]).toMatchObject({ result: "ALREADY_EXISTS", baselineStatus: "NOT_APPLICABLE" });
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    expect(await prisma.patientBaseline.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
  });

  it("does not fill in a missing HN or touch a blank source height of an existing patient", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const patient = await provisionPatient(actor, {
      ...patientInput(nationalIds.blankHeight, hospital.id, "ส่วนสูงเดิม"),
      hospitalNumber: undefined,
    });
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
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.blankHeight, "ส่วนสูงเดิม", { weight: 70, height: "" }),
    );

    const summary = await importPatientProvisioning(
      actor,
      hospital.id,
      [candidate],
      importDependencies(),
      { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ alreadyExists: 1, conflict: 0 });
    expect(await prisma.patientBaseline.findFirstOrThrow({ select: { heightCm: true } })).toEqual({
      heightCm: 170,
    });
    expect(
      await prisma.patientHospitalRelationship.findFirstOrThrow({ select: { hospitalNumber: true } }),
    ).toEqual({ hospitalNumber: null });
    expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(1);
  });

  it("requires an explicit date for new patients with Baseline data and never fabricates it", async () => {
    const hospital = await createHospital();
    const actor = await createOwnerActor(hospital.id);
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.allFields, "ต้องระบุวันที่", { weight: 70 }),
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
    const candidate = await readCandidate(
      hospital,
      templateRow(nationalIds.concurrent, "พร้อมกัน", { weight: 70, height: 170 }),
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
    expect(outcomes.reduce((total, summary) => total + summary.imported, 0)).toBe(1);
    expect(outcomes.reduce((total, summary) => total + summary.alreadyExists, 0)).toBe(1);
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

  describe("append-only re-import", () => {
    const names = (seed: number): TemplateRow =>
      templateRow(thaiNationalId(seed), "ผู้ป่วยต่อท้าย", { weight: 60 + (seed % 20) });

    it("imports 100, then re-imports 130: 30 new, 100 already exist, no duplicates, existing data unchanged", async () => {
      const hospital = await createHospital();
      const actor = await createOwnerActor(hospital.id);
      const first = Array.from({ length: 100 }, (_, index) => names(index));
      const firstSummary = await importPatientProvisioning(
        actor,
        hospital.id,
        await readTemplateCandidates(hospital, first),
        importDependencies(),
        { effectiveDate: batchDate },
      );

      expect(firstSummary).toMatchObject({ imported: 100, alreadyExists: 0 });
      const patientAudits = await prisma.auditEvent.count({ where: { action: "patient.provisioned" } });
      const baselineBefore = await prisma.patientBaseline.findMany({
        orderBy: { patientHospitalRelationshipId: "asc" },
        select: { patientHospitalRelationshipId: true, weight: true, recordedOn: true },
      });

      // The 30 appended patients are new; the first 100 now carry *different* values in the file.
      const appended = Array.from({ length: 30 }, (_, index) => names(1000 + index));
      const changedExisting = first.map((row) => ({ ...row, weight: 200, diabetesClassification: "เบาหวาน" }));
      const secondSummary = await importPatientProvisioning(
        actor,
        hospital.id,
        await readTemplateCandidates(hospital, [...changedExisting, ...appended]),
        importDependencies(),
        { effectiveDate: "2026-09-01" },
      );

      expect(secondSummary).toMatchObject({
        imported: 30,
        alreadyExists: 100,
        conflict: 0,
        failed: 0,
        invalid: 0,
        classificationCreated: 0,
      });
      expect(await prisma.patientHospitalRelationship.count()).toBe(130);
      expect(await prisma.patientProfile.count()).toBe(130);
      expect(await prisma.auditEvent.count({ where: { action: "patient.provisioned" } })).toBe(patientAudits + 30);
      expect(await prisma.patientClassification.count()).toBe(0);

      const baselineAfter = await prisma.patientBaseline.findMany({
        where: { patientHospitalRelationshipId: { in: baselineBefore.map((row) => row.patientHospitalRelationshipId) } },
        orderBy: { patientHospitalRelationshipId: "asc" },
        select: { patientHospitalRelationshipId: true, weight: true, recordedOn: true },
      });
      expect(baselineAfter).toEqual(baselineBefore);
      expect(await prisma.patientBaseline.count()).toBe(130);
    }, 120_000);

    it("keeps imported patients free of an OSM", async () => {
      const hospital = await createHospital();
      const actor = await createOwnerActor(hospital.id);

      await importPatientProvisioning(
        actor,
        hospital.id,
        await readTemplateCandidates(hospital, [names(1), names(2)]),
        importDependencies(),
        { effectiveDate: batchDate },
      );

      expect(await prisma.patientOsmAssignment.count()).toBe(0);
    });
  });

  describe("hospital binding", () => {
    it("rejects hospital B's file for hospital A without writing anything", async () => {
      const hospitalA = await createHospital();
      const hospitalB = await createHospital();
      await createOwnerActor(hospitalA.id);

      await expect(
        readTemplateCandidates(hospitalB, [names(1)], {}, hospitalA),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    });

    function names(seed: number): TemplateRow {
      return templateRow(thaiNationalId(seed), "ผู้ป่วยโรงพยาบาล");
    }
  });

  describe("failed-rows export", () => {
    it("exports only the rows that were not imported, and the fixed file imports", async () => {
      const hospital = await createHospital();
      const actor = await createOwnerActor(hospital.id);
      await provisionPatient(actor, patientInput(nationalIds.independentConflict, hospital.id, "แถวขัดแย้ง"));
      const upload: PatientImportUpload = await createTemplateUpload(hospital, [
        templateRow(nationalIds.independentValid, "แถวสำเร็จ"),
        templateRow(nationalIds.independentConflict, "แถวขัดแย้ง"),
        templateRow(thaiNationalId(9001), "ข้อมูลผิด", { nationalId: "123" }),
        templateRow(nationalIds.independentConflict, "ชื่อไม่ตรงกัน"),
      ]);
      const fileFingerprint = await hashPatientImportFile(upload);
      const previewBinding = createPatientImportPreviewBinding(fileFingerprint, hospital.id, actor.userId);
      const candidates = await readPatientImportCandidates(upload, importTargetOf(hospital));

      const summary = await importPatientProvisioning(actor, hospital.id, candidates, importDependencies());
      expect(summary).toMatchObject({ imported: 1, alreadyExists: 0, conflict: 0 });
      expect(summary.rows.map(({ result }) => result)).toEqual([
        "IMPORTED",
        "DUPLICATE_IN_FILE",
        "INVALID",
        "DUPLICATE_IN_FILE",
      ]);

      const download = await createPatientImportFailedRowsDownload(
        actor,
        {
          targetHospitalId: hospital.id,
          previewTargetHospitalId: hospital.id,
          fileFingerprint,
          previewBinding,
          importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
          failedRowNumbers: [],
        },
        upload,
      );
      const failedUpload: PatientImportUpload = {
        name: download.filename,
        size: download.buffer.byteLength,
        arrayBuffer: async () =>
          download.buffer.buffer.slice(
            download.buffer.byteOffset,
            download.buffer.byteOffset + download.buffer.byteLength,
          ) as ArrayBuffer,
      };
      const failedCandidates = await readPatientImportCandidates(failedUpload, importTargetOf(hospital));

      // Rows 5 (invalid) and the two duplicates come back; the imported and existing rows do not.
      expect(failedCandidates.map(({ rowNumber }) => rowNumber)).toEqual([3, 4, 5]);
      expect(failedCandidates.map(({ canonicalRow }) => canonicalRow.identity.familyName)).toEqual([
        "แถวขัดแย้ง",
        "ข้อมูลผิด",
        "ชื่อไม่ตรงกัน",
      ]);
    });
  });
});
