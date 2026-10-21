import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const authenticatedActor = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: authenticatedActor }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import { getPatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";
import { getPatientDirectoryDetail } from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  getPatientHealthInformation,
  updatePatientHealthHistory,
} from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { readPatientImportFile } from "@/modules/patient-provisioning/adapters/excel-patient-import-adapter";
import { PATIENT_IMPORT_CONTRACT_VERSION } from "@/modules/patient-provisioning/import/patient-import-contract";
import {
  importPatientProvisioning,
  previewPatientProvisioning,
  type PatientProvisioningServiceDependencies,
} from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { createPatientImportFailedRowsDownload } from "@/modules/patient-provisioning/transport/patient-import-downloads";
import {
  createPatientImportPreviewBinding,
  hashPatientImportFile,
} from "@/modules/patient-provisioning/transport/patient-import-file-binding";
import { confirmPatientImportAction, previewPatientImportAction } from "@/modules/patient-provisioning/transport/server-actions";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  createTemplateUpload,
  importTargetOf,
  readTemplateCandidates,
  type ImportTestHospital,
  type TemplateRow,
} from "./support/patient-import-template-upload";

const prisma = getPrisma();
const transactionNow = new Date("2026-10-21T05:00:00.000Z");
const batchDate = "2026-10-01";
let sequence = 0;

/** A valid Thai national ID for a numeric seed (13th digit is the mod-11 check digit). */
function thaiNationalId(seed: number): string {
  const digits = String(300000000000 + seed).slice(-12).split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (13 - index), 0);
  return `${digits.join("")}${(11 - (sum % 11)) % 10}`;
}

async function clearDatabase(): Promise<void> {
  await prisma.patientHospitalHealthHistory.deleteMany();
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
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(): Promise<ImportTestHospital> {
  sequence += 1;
  return prisma.hospital.create({
    data: { hospitalCode: `IMPORT-V3-${sequence}`, name: `โรงพยาบาลทดสอบนำเข้า v3 ${sequence}`, status: HospitalStatus.ACTIVE },
    select: { id: true, hospitalCode: true, name: true },
  });
}

async function createHospitalActor(hospitalId: string, membershipType: MembershipType = MembershipType.OWNER): Promise<ActorContext> {
  sequence += 1;
  const person = await prisma.person.create({ data: { identityKeyHash: `import-v3-staff-${sequence}` }, select: { id: true } });
  const user = await prisma.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({ data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE } });

  return {
    userId: user.id,
    personId: person.id,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{
      hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE,
    }],
    osmHospitalRelationships: [],
  };
}

function patientRow(nationalId: string, extra: TemplateRow = {}): TemplateRow {
  return {
    nationalId,
    givenName: "สมหญิง",
    familyName: "ข้อมูลสุขภาพ",
    hospitalNumber: `HN-${nationalId.slice(-5)}`,
    ...extra,
  };
}

/** Demographics, Baseline, classification, contacts and every medical/family history column. */
function completeRow(nationalId: string, extra: TemplateRow = {}): TemplateRow {
  return patientRow(nationalId, {
    dateOfBirth: "15/01/2523", gender: "หญิง", phoneNumber: "0812345678",
    houseNumber: "12", villageNumber: "3", villageName: "บ้านทดสอบ", province: "เชียงใหม่",
    district: "เมืองเชียงใหม่", subdistrict: "สุเทพ", postalCode: "50200",
    emergencyContactName: "สมชาย ข้อมูลสุขภาพ", emergencyContactPhone: "0891234567", emergencyContactRelationship: "สามี",
    weight: 70, height: 160, waistCircumference: 90, bloodSugarDtx: 130, hba1c: 7.1, diabetesClassification: "กลุ่มเสี่ยง",
    historyDiabetes: "ไม่ทราบ", historyHypertension: "มี", otherConditions: "ไขมันในเลือดสูง",
    familyHypertension: "มี", familyDiabetes: "ไม่มี", familyHeartDisease: null, familyStroke: "ไม่ทราบ",
    ...extra,
  });
}

function dependencies(database?: PrismaClient): PatientProvisioningServiceDependencies {
  return { database, now: () => transactionNow, transactionRetries: 2 };
}

/** Fails only the health-history write inside the import's per-row transaction. */
function createHealthHistoryFailureDatabase(): PrismaClient {
  return new Proxy(prisma, {
    get(target, property, receiver): unknown {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) =>
        target.$transaction(async (transaction) => {
          const failingHistory = new Proxy(transaction.patientHospitalHealthHistory, {
            get(delegate, delegateProperty, delegateReceiver): unknown {
              return delegateProperty === "create"
                ? async (): Promise<never> => { throw new Error("forced health history write failure"); }
                : Reflect.get(delegate, delegateProperty, delegateReceiver);
            },
          });
          return operation(new Proxy(transaction, {
            get(transactionTarget, transactionProperty, transactionReceiver): unknown {
              return transactionProperty === "patientHospitalHealthHistory"
                ? failingHistory
                : Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
            },
          }) as unknown as Prisma.TransactionClient);
        }, options as Parameters<typeof target.$transaction>[1]);
    },
  }) as unknown as PrismaClient;
}

async function relationshipFor(hospitalId: string, nationalId: string) {
  return prisma.patientHospitalRelationship.findFirstOrThrow({
    where: { hospitalId, hospitalNumber: `HN-${nationalId.slice(-5)}` },
    include: { healthHistory: true, hospitalProfile: true, baseline: true, patientProfile: true },
  });
}

describe("Patient import template v3: complete initial health data (PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    authenticatedActor.mockReset();
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await prisma.$disconnect();
  });

  it("persists demographics, Baseline, classification and history from one upload + confirmation and reads them back", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor(hospital.id);
    authenticatedActor.mockResolvedValue(owner);
    const withHistory = thaiNationalId(1);
    const withoutHistory = thaiNationalId(2);
    const upload = await createTemplateUpload(hospital, [
      completeRow(withHistory),
      patientRow(withoutHistory, { historyDiabetes: null, familyStroke: "ไม่ทราบ" }),
    ]);
    const form = new FormData();
    form.set("file", new File([await upload.arrayBuffer()], upload.name));
    form.set("targetHospitalId", hospital.id);
    form.set("effectiveDate", batchDate);

    const preview = await previewPatientImportAction(form);
    if (preview.status !== "SUCCESS") throw new Error("Preview failed");
    expect(preview.preview.importContractVersion).toBe("patient-import-v3-initial-health-data");
    expect(preview.preview.rows.map(({ classification }) => classification)).toEqual(["READY", "READY"]);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);

    form.set("previewTargetHospitalId", hospital.id);
    form.set("fileFingerprint", preview.preview.fileFingerprint);
    form.set("previewBinding", preview.preview.previewBinding);
    form.set("importContractVersion", preview.preview.importContractVersion);
    const confirmed = await confirmPatientImportAction(form);
    if (confirmed.status !== "SUCCESS") throw new Error("Confirmation failed");
    expect(confirmed.summary).toMatchObject({ imported: 2, baselineCreated: 1, classificationCreated: 1 });
    expect(confirmed.summary.rows[0]?.reason).toContain("บันทึกประวัติโรคและประวัติครอบครัวแล้ว");
    expect(confirmed.summary.rows[1]?.reason).not.toContain("ประวัติโรค");

    const stored = await relationshipFor(hospital.id, withHistory);
    const health = await getPatientHealthInformation(owner, stored.id, prisma);
    expect(health.dateOfBirth).toEqual(new Date("1980-01-15T00:00:00.000Z"));
    expect(health.history).toMatchObject({
      diabetes: "UNKNOWN",
      hypertension: "YES",
      otherConditions: "ไขมันในเลือดสูง",
      familyHypertension: "YES",
      familyDiabetes: "NO",
      familyHeartDisease: "UNKNOWN",
      familyStroke: "UNKNOWN",
      diagnosisYear: null,
      version: 1,
    });
    expect(await getPatientBaseline(owner, stored.id, { database: prisma })).toMatchObject({
      recordedOn: new Date(`${batchDate}T00:00:00.000Z`),
      measurements: { weight: 70, heightCm: 160, waistCircumference: 90, bloodSugarDtx: 130, hba1c: 7.1 },
    });
    // RISK classification is stored as given and never turned into confirmed diabetes history.
    expect((await getPatientClassificationPageContext(owner, stored.id, prisma)).current).toMatchObject({ classification: "RISK" });
    expect((await getPatientDirectoryDetail(owner, stored.id)).profile).toMatchObject({
      phoneNumber: "0812345678", emergencyContactName: "สมชาย ข้อมูลสุขภาพ", emergencyContactPhone: "0891234567", emergencyContactRelationship: "สามี",
    });
    expect(await prisma.auditEvent.count({ where: { action: "patient.health_history.imported", resourceId: stored.id } })).toBe(1);

    // No history supplied: no row, so the read model keeps "not recorded" (UNKNOWN) semantics.
    const bare = await relationshipFor(hospital.id, withoutHistory);
    expect(bare.healthHistory).toBeNull();
    expect((await getPatientHealthInformation(owner, bare.id, prisma)).history).toBeNull();

    // The imported history remains editable through the existing optimistic-version flow.
    await expect(updatePatientHealthHistory(owner, stored.id, {
      expectedVersion: 1, diabetes: "YES", hypertension: "YES", otherConditions: null, familyHypertension: "YES",
      familyDiabetes: "NO", familyHeartDisease: "UNKNOWN", familyStroke: "UNKNOWN", diagnosisYear: null,
    }, prisma)).resolves.toEqual({ version: 2 });
  });

  it("marks an unsupported answer INVALID with its column and saves nothing for that patient", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor(hospital.id);
    const valid = thaiNationalId(3);
    const invalid = thaiNationalId(4);
    const candidates = await readTemplateCandidates(hospital, [
      completeRow(valid),
      completeRow(invalid, { familyHeartDisease: "ใช่" }),
    ]);

    const preview = await previewPatientProvisioning(owner, hospital.id, candidates, prisma, { effectiveDate: batchDate });
    expect(preview.rows[1]).toMatchObject({ classification: "INVALID" });
    expect(preview.rows[1]?.reason).toContain("ญาติสายตรง: โรคหัวใจ");
    expect(preview.rows[1]?.diagnosticCodes).toContain("HEALTH_HISTORY_DATA_INVALID");

    const summary = await importPatientProvisioning(owner, hospital.id, candidates, dependencies(), { effectiveDate: batchDate });
    expect(summary).toMatchObject({ imported: 1, invalid: 1 });
    expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    expect(await prisma.patientHospitalHealthHistory.count()).toBe(1);
    expect(await prisma.person.count({ where: { givenName: "สมหญิง" } })).toBe(1);
  });

  it("rolls back identity, profile, Baseline and classification when the health history write fails", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor(hospital.id);
    const nationalId = thaiNationalId(5);
    const candidates = await readTemplateCandidates(hospital, [completeRow(nationalId)]);
    const before = {
      people: await prisma.person.count(),
      users: await prisma.user.count(),
      audits: await prisma.auditEvent.count(),
    };

    const summary = await importPatientProvisioning(
      owner, hospital.id, candidates, dependencies(createHealthHistoryFailureDatabase()), { effectiveDate: batchDate },
    );

    expect(summary).toMatchObject({ imported: 0, failed: 1 });
    expect(await prisma.person.count()).toBe(before.people);
    expect(await prisma.user.count()).toBe(before.users);
    expect(await prisma.auditEvent.count()).toBe(before.audits);
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    expect(await prisma.patientHospitalProfile.count()).toBe(0);
    expect(await prisma.patientBaseline.count()).toBe(0);
    expect(await prisma.patientClassification.count()).toBe(0);
    expect(await prisma.patientHospitalHealthHistory.count()).toBe(0);

    // The same file then imports cleanly: nothing partial blocks the retry.
    expect(await importPatientProvisioning(owner, hospital.id, candidates, dependencies(), { effectiveDate: batchDate }))
      .toMatchObject({ imported: 1 });
  });

  it("never overwrites an existing patient's history on re-import (ALREADY_EXISTS) and stays idempotent", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor(hospital.id);
    const nationalId = thaiNationalId(6);
    await importPatientProvisioning(owner, hospital.id, await readTemplateCandidates(hospital, [completeRow(nationalId)]), dependencies(), { effectiveDate: batchDate });
    const stored = await relationshipFor(hospital.id, nationalId);
    await updatePatientHealthHistory(owner, stored.id, {
      expectedVersion: 1, diabetes: "YES", hypertension: "YES", otherConditions: "แก้ไขโดยโรงพยาบาล", familyHypertension: "YES",
      familyDiabetes: "NO", familyHeartDisease: "UNKNOWN", familyStroke: "UNKNOWN", diagnosisYear: null,
    }, prisma);
    const historyBefore = await prisma.patientHospitalHealthHistory.findUniqueOrThrow({ where: { patientHospitalRelationshipId: stored.id } });

    const changed = await readTemplateCandidates(hospital, [
      completeRow(nationalId, { historyDiabetes: "ไม่มี", familyStroke: "มี", otherConditions: null }),
    ]);
    expect((await previewPatientProvisioning(owner, hospital.id, changed, prisma)).rows[0]?.classification).toBe("ALREADY_EXISTS");
    expect((await importPatientProvisioning(owner, hospital.id, changed, dependencies())).rows[0]?.result).toBe("ALREADY_EXISTS");
    // Concurrent duplicate confirmations of the same existing row write nothing either.
    await Promise.all([
      importPatientProvisioning(owner, hospital.id, changed, dependencies()),
      importPatientProvisioning(owner, hospital.id, changed, dependencies()),
    ]);

    expect(await prisma.patientHospitalHealthHistory.findUniqueOrThrow({ where: { patientHospitalRelationshipId: stored.id } })).toEqual(historyBefore);
    expect(await prisma.patientHospitalHealthHistory.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient.health_history.imported" } })).toBe(1);
  });

  it("creates exactly one history under concurrent confirmations of a new patient", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor(hospital.id);
    const candidates = await readTemplateCandidates(hospital, [completeRow(thaiNationalId(7))]);

    const outcomes = await Promise.all([
      importPatientProvisioning(owner, hospital.id, candidates, dependencies(), { effectiveDate: batchDate }),
      importPatientProvisioning(owner, hospital.id, candidates, dependencies(), { effectiveDate: batchDate }),
    ]);

    expect(outcomes.reduce((total, summary) => total + summary.imported, 0)).toBe(1);
    expect(outcomes.reduce((total, summary) => total + summary.alreadyExists, 0)).toBe(1);
    expect(await prisma.patientHospitalHealthHistory.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "patient.health_history.imported" } })).toBe(1);
  });

  it("gives a second Hospital its own history and never copies the first Hospital's", async () => {
    const hospitalA = await createHospital();
    const hospitalB = await createHospital();
    const ownerA = await createHospitalActor(hospitalA.id);
    const ownerB = await createHospitalActor(hospitalB.id);
    const shared = thaiNationalId(8);
    const sharedWithoutHistoryInB = thaiNationalId(9);
    await importPatientProvisioning(ownerA, hospitalA.id, await readTemplateCandidates(hospitalA, [
      completeRow(shared), completeRow(sharedWithoutHistoryInB),
    ]), dependencies(), { effectiveDate: batchDate });
    const historyA = await prisma.patientHospitalHealthHistory.findMany({ orderBy: { id: "asc" } });

    const summaryB = await importPatientProvisioning(ownerB, hospitalB.id, await readTemplateCandidates(hospitalB, [
      patientRow(shared, { dateOfBirth: "15/01/2523", historyDiabetes: "มี", familyStroke: "มี" }),
      patientRow(sharedWithoutHistoryInB),
    ]), dependencies(), { effectiveDate: batchDate });
    expect(summaryB).toMatchObject({ imported: 2 });

    const relationshipB = await relationshipFor(hospitalB.id, shared);
    const relationshipA = await relationshipFor(hospitalA.id, shared);
    expect(relationshipB.patientProfileId).toBe(relationshipA.patientProfileId);
    expect(relationshipB.healthHistory).toMatchObject({ diabetes: "YES", hypertension: "UNKNOWN", familyStroke: "YES", otherConditions: null });
    expect((await relationshipFor(hospitalB.id, sharedWithoutHistoryInB)).healthHistory).toBeNull();
    expect(await prisma.patientHospitalHealthHistory.findMany({
      where: { relationship: { hospitalId: hospitalA.id } }, orderBy: { id: "asc" },
    })).toEqual(historyA);

    // Hospital-local history stays scoped: B cannot read A's, A cannot read B's.
    await expect(getPatientHealthInformation(ownerB, relationshipA.id, prisma)).rejects.toSatisfy(
      (error: unknown) => error instanceof ForbiddenError || error instanceof NotFoundError,
    );
    await expect(getPatientHealthInformation(ownerA, relationshipB.id, prisma)).rejects.toSatisfy(
      (error: unknown) => error instanceof ForbiddenError || error instanceof NotFoundError,
    );
  });

  it("exports failed rows with the v3 history columns and re-reads the corrected workbook", async () => {
    const hospital = await createHospital();
    const owner = await createHospitalActor(hospital.id);
    const upload = await createTemplateUpload(hospital, [
      completeRow(thaiNationalId(10), { historyHypertension: "เป็น", otherConditions: "หอบหืด" }),
    ]);
    const preview = await previewPatientProvisioning(
      owner, hospital.id, (await readPatientImportFile(upload, importTargetOf(hospital))).candidates, prisma, { effectiveDate: batchDate },
    );
    expect(preview.rows[0]?.classification).toBe("INVALID");

    const fileFingerprint = await hashPatientImportFile(upload);
    const download = await createPatientImportFailedRowsDownload(owner, {
      targetHospitalId: hospital.id,
      previewTargetHospitalId: hospital.id,
      fileFingerprint,
      previewBinding: createPatientImportPreviewBinding(fileFingerprint, hospital.id, owner.userId, batchDate),
      effectiveDate: batchDate,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      failedRowNumbers: [],
    }, upload);
    const bytes = Uint8Array.from(download.buffer);
    const failed = await readPatientImportFile(
      { name: download.filename, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer },
      importTargetOf(hospital),
    );

    expect(download.filename).toContain("_patient_import_v3_failed_rows.xlsx");
    expect(failed.candidates).toHaveLength(1);
    expect(failed.candidates[0]?.canonicalRow.healthHistoryCandidates).toMatchObject({
      diabetes: "UNKNOWN", otherConditions: "หอบหืด", familyHypertension: "YES", familyDiabetes: "NO",
    });
    expect(failed.candidates[0]?.canonicalRow.fieldAssessments.historyHypertension.diagnostics).toContain("HEALTH_HISTORY_DATA_INVALID");
  });

  it("keeps import OWNER-only for the selected Hospital", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const member = await createHospitalActor(hospital.id, MembershipType.MEMBER);
    const otherOwner = await createHospitalActor(otherHospital.id);
    const candidates = await readTemplateCandidates(hospital, [completeRow(thaiNationalId(11))]);

    await expect(previewPatientProvisioning(member, hospital.id, candidates, prisma, { effectiveDate: batchDate }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(importPatientProvisioning(member, hospital.id, candidates, dependencies(), { effectiveDate: batchDate }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(importPatientProvisioning(otherOwner, hospital.id, candidates, dependencies(), { effectiveDate: batchDate }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.patientHospitalHealthHistory.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
  });
});
