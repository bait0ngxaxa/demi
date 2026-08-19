import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { PatientImportUpload } from "../adapters/excel-patient-import-adapter";
import {
  createPatientImportPreviewBinding,
  hashPatientImportFile,
} from "./patient-import-file-binding";
import {
  confirmPatientImportAction,
  previewPatientImportAction,
  provisionPatientAction,
} from "./server-actions";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedReadCandidates = vi.hoisted(() => vi.fn());
const mockedPreviewProvisioning = vi.hoisted(() => vi.fn());
const mockedImportProvisioning = vi.hoisted(() => vi.fn());
const mockedProvisionPatient = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("../adapters/excel-patient-import-adapter", () => ({
  readPatientImportCandidates: mockedReadCandidates,
}));
vi.mock("../services/patient-provisioning-service", () => ({
  importPatientProvisioning: mockedImportProvisioning,
  previewPatientProvisioning: mockedPreviewProvisioning,
  provisionPatient: mockedProvisionPatient,
  PatientProvisioningConflictError: class PatientProvisioningConflictError extends Error {},
}));

const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
} satisfies ActorContext;

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "44444444-4444-4444-8444-444444444444";
const relationshipId = "55555555-5555-4555-8555-555555555555";

function createUpload(contents: string, name = "patients.xlsx"): PatientImportUpload {
  return new File([new TextEncoder().encode(contents)], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function createFormData(
  file: PatientImportUpload,
  values: {
    targetHospitalId: string;
    previewTargetHospitalId?: string;
    fileFingerprint?: string;
    previewBinding?: string;
  },
): FormData {
  const formData = new FormData();
  formData.set("targetHospitalId", values.targetHospitalId);
  formData.set("file", file as File, file.name);

  if (values.previewTargetHospitalId) {
    formData.set("previewTargetHospitalId", values.previewTargetHospitalId);
  }

  if (values.fileFingerprint) {
    formData.set("fileFingerprint", values.fileFingerprint);
  }

  if (values.previewBinding) {
    formData.set("previewBinding", values.previewBinding);
  }

  return formData;
}

function createCandidate(): Record<string, unknown> {
  return {
    rowNumber: 2,
    identityDisplay: "••••••0009",
    input: {
      identity: { namespace: "thai-national-id", value: "1000000000009" },
      givenName: "สมชาย",
      familyName: "ผู้ป่วย",
      hospitalNumber: undefined,
      targetHospitalId: hospitalId,
    },
    givenName: "สมชาย",
    familyName: "ผู้ป่วย",
    hospitalNumber: null,
    validationMessage: null,
  };
}

describe("patient import Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedReadCandidates.mockResolvedValue([createCandidate()]);
    mockedPreviewProvisioning.mockResolvedValue({ targetHospitalId: hospitalId, rows: [] });
    mockedImportProvisioning.mockResolvedValue({
      targetHospitalId: hospitalId,
      imported: 1,
      alreadyExists: 0,
      duplicateInFile: 0,
      invalid: 0,
      conflict: 0,
      failed: 0,
      rows: [],
    });
    mockedProvisionPatient.mockResolvedValue({
      outcome: "CREATED",
      personId: "66666666-6666-4666-8666-666666666666",
      userId: "77777777-7777-4777-8777-777777777777",
      patientProfileId: "88888888-8888-4888-8888-888888888888",
      relationshipId,
      hospitalId,
      accountStatus: "PROVISIONED",
      reusedExistingUser: false,
    });
  });

  it("preserves the authoritative single-provisioning relationship ID", async () => {
    const formData = new FormData();
    formData.set("nationalId", "1000000000009");
    formData.set("givenName", "สมชาย");
    formData.set("familyName", "ผู้ป่วย");
    formData.set("hospitalNumber", "HN-001");
    formData.set("targetHospitalId", hospitalId);

    const result = await provisionPatientAction({ status: "IDLE" }, formData);

    expect(result).toEqual({
      status: "SUCCESS",
      result: {
        outcome: "CREATED",
        relationshipId,
        hospitalId,
        accountStatus: "PROVISIONED",
        reusedExistingUser: false,
      },
    });
  });

  it("returns a fingerprint and binding created from the preview file bytes", async () => {
    const file = createUpload("file-a");
    const result = await previewPatientImportAction(createFormData(file, { targetHospitalId: hospitalId }));

    expect(result.status).toBe("SUCCESS");

    if (result.status !== "SUCCESS") {
      return;
    }

    const fingerprint = await hashPatientImportFile(file);
    expect(result.preview.fileFingerprint).toBe(fingerprint);
    expect(result.preview.previewBinding).toBe(
      createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId),
    );
  });

  it("accepts the same file and Hospital, then reparses before importing", async () => {
    const file = createUpload("file-a");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: binding,
    }));

    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(mockedReadCandidates).toHaveBeenCalledTimes(1);
    expect(mockedImportProvisioning).toHaveBeenCalledWith(actor, hospitalId, [createCandidate()]);
  });

  it("rejects a changed file and does not invoke the import service", async () => {
    const previewFile = createUpload("file-a");
    const changedFile = createUpload("file-b");
    const fingerprint = await hashPatientImportFile(previewFile);
    const binding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    const result = await confirmPatientImportAction(createFormData(changedFile, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: binding,
    }));

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไฟล์หรือโรงพยาบาลเปลี่ยนแปลงแล้ว กรุณาตรวจสอบไฟล์ใหม่ก่อนยืนยันนำเข้า",
    });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("rejects a changed Hospital and a stale binding before import", async () => {
    const file = createUpload("file-a");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    const changedHospitalResult = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: otherHospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: binding,
    }));
    const staleBindingResult = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: createPatientImportPreviewBinding(
        fingerprint,
        otherHospitalId,
        actor.userId,
      ),
    }));

    expect(changedHospitalResult).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(staleBindingResult).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });
});
