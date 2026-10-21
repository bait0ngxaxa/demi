import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, ValidationError } from "@/shared/errors/application-error";
import type { PatientImportUpload } from "../adapters/excel-patient-import-adapter";
import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import {
  PATIENT_IMPORT_XLSX_RESOURCE_LIMIT_MESSAGE,
  PatientImportXlsxResourceLimitError,
} from "../import/patient-import-xlsx-resource-preflight";
import {
  createPatientImportTemplateHospitalMismatchMessage,
  PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
} from "../import/patient-import-template-contract";
import type { PatientImportResultSummary } from "../services/patient-roster-import-types";
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
const mockedResolveTarget = vi.hoisted(() => vi.fn());
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
vi.mock("../services/patient-import-template-service", () => ({
  resolvePatientImportTemplateTarget: mockedResolveTarget,
}));
vi.mock("../services/patient-provisioning-service", () => ({
  provisionPatient: mockedProvisionPatient,
  PatientProvisioningConflictError: class PatientProvisioningConflictError extends Error {},
}));
vi.mock("../services/patient-roster-import-service", () => ({
  importPatientRoster: mockedImportProvisioning,
  previewPatientRosterImport: mockedPreviewProvisioning,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "44444444-4444-4444-8444-444444444444";
const relationshipId = "55555555-5555-4555-8555-555555555555";
const target = {
  hospitalId,
  hospitalCode: "SYN-A",
  hospitalName: "โรงพยาบาลสังเคราะห์เอ",
};

const directHospitalMembership = {
  hospitalId,
  membershipType: MembershipType.MEMBER,
  profession: null,
  status: MembershipStatus.ACTIVE,
  hospitalStatus: HospitalStatus.ACTIVE,
} satisfies ActorContext["hospitalMemberships"][number];

const actor = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [directHospitalMembership],
  osmHospitalRelationships: [],
} satisfies ActorContext;

const osmOnlyActor = {
  ...actor,
  roles: [Role.OSM],
  hospitalMemberships: [],
} satisfies ActorContext;

const multiRoleActor = {
  ...actor,
  roles: [Role.OSM, Role.HOSPITAL],
} satisfies ActorContext;

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
    effectiveDate?: string;
    importContractVersion?: string;
    extra?: Record<string, string>;
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

  formData.set("effectiveDate", values.effectiveDate ?? "");
  formData.set(
    "importContractVersion",
    values.importContractVersion ?? PATIENT_IMPORT_CONTRACT_VERSION,
  );

  for (const [key, value] of Object.entries(values.extra ?? {})) {
    formData.set(key, value);
  }

  return formData;
}

function createCandidate(rowNumber = 3): Record<string, unknown> {
  return {
    rowNumber,
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

function createSummary(overrides: Partial<PatientImportResultSummary> = {}): PatientImportResultSummary {
  return {
    targetHospitalId: hospitalId,
    imported: 1,
    alreadyExists: 0,
    duplicateInFile: 0,
    invalid: 0,
    conflict: 0,
    failed: 0,
    baselineCreated: 0,
    classificationCreated: 0,
    rows: [],
    file: null,
    ...overrides,
  };
}

describe("patient import Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedResolveTarget.mockResolvedValue(target);
    mockedReadCandidates.mockResolvedValue([createCandidate()]);
    mockedPreviewProvisioning.mockResolvedValue({
      targetHospitalId: hospitalId,
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      baselineDateRequired: false,
      rows: [],
      file: null,
    });
    mockedImportProvisioning.mockResolvedValue(createSummary());
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

  it.each([actor, osmOnlyActor, multiRoleActor])("rejects the legacy manual action without provisioning", async (subject) => {
    mockedActor.mockResolvedValue(subject);
    await expect(provisionPatientAction({ status: "IDLE" }, new FormData())).resolves.toMatchObject({ status: "ERROR", code: "FORBIDDEN" });
    expect(mockedProvisionPatient).not.toHaveBeenCalled();
  });

  it("resolves the hospital on the server, parses against it and returns a binding for the preview file bytes", async () => {
    const file = createUpload("file-a");
    const result = await previewPatientImportAction(createFormData(file, { targetHospitalId: hospitalId }));

    expect(result.status).toBe("SUCCESS");

    if (result.status !== "SUCCESS") {
      return;
    }

    expect(mockedResolveTarget).toHaveBeenCalledWith(actor, hospitalId);
    expect(mockedReadCandidates).toHaveBeenCalledWith(file, target);
    const fingerprint = await hashPatientImportFile(file);
    expect(result.preview.fileFingerprint).toBe(fingerprint);
    expect(result.preview.previewBinding).toBe(
      createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId),
    );
    expect(result.preview).not.toHaveProperty("osmAssignmentReconciliations");
    expect(result.preview).not.toHaveProperty("classificationReconciliations");
    expect(result.preview).not.toHaveProperty("canManageOsmAssignment");
  });

  it("denies an out-of-scope hospital before the file is read", async () => {
    mockedResolveTarget.mockRejectedValue(new ForbiddenError());

    const result = await previewPatientImportAction(
      createFormData(createUpload("file-a"), { targetHospitalId: otherHospitalId }),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "FORBIDDEN" });
    expect(mockedReadCandidates).not.toHaveBeenCalled();
    expect(mockedPreviewProvisioning).not.toHaveBeenCalled();
  });

  it("returns the actionable template mismatch message and previews nothing", async () => {
    mockedReadCandidates.mockRejectedValueOnce(new ValidationError(PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE));

    const result = await previewPatientImportAction(
      createFormData(createUpload("file-wrong-template"), { targetHospitalId: hospitalId }),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: PATIENT_IMPORT_TEMPLATE_MISMATCH_MESSAGE,
    });
    expect(mockedPreviewProvisioning).not.toHaveBeenCalled();
  });

  it("returns the hospital mismatch message naming only the selected hospital", async () => {
    const message = createPatientImportTemplateHospitalMismatchMessage(target);
    mockedReadCandidates.mockRejectedValueOnce(new ValidationError(message));

    const result = await previewPatientImportAction(
      createFormData(createUpload("file-other-hospital"), { targetHospitalId: hospitalId }),
    );

    expect(result).toEqual({ status: "ERROR", code: "INVALID_INPUT", message });
    expect(message).toContain(target.hospitalName);
    expect(message).not.toContain(target.hospitalCode);
    expect(mockedPreviewProvisioning).not.toHaveBeenCalled();
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("maps XLSX resource-envelope rejection to safe INVALID_INPUT for preview and confirm", async () => {
    const file = createUpload("file-resource-limit");
    mockedReadCandidates.mockRejectedValue(new PatientImportXlsxResourceLimitError());

    const previewResult = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId }),
    );

    expect(previewResult).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: PATIENT_IMPORT_XLSX_RESOURCE_LIMIT_MESSAGE,
    });

    const fingerprint = await hashPatientImportFile(file);
    const confirmResult = await confirmPatientImportAction(
      createFormData(file, {
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        fileFingerprint: fingerprint,
        previewBinding: createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId),
      }),
    );

    expect(confirmResult).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: PATIENT_IMPORT_XLSX_RESOURCE_LIMIT_MESSAGE,
    });
    expect(mockedPreviewProvisioning).not.toHaveBeenCalled();
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("accepts a valid shared effective date and binds it to the preview", async () => {
    const file = createUpload("file-effective-date");
    const effectiveDate = "2026-08-01";
    const result = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId, effectiveDate }),
    );

    expect(result.status).toBe("SUCCESS");
    expect(mockedPreviewProvisioning).toHaveBeenCalledWith(
      actor,
      hospitalId,
      [createCandidate()],
      undefined,
      { effectiveDate, importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION },
    );

    if (result.status !== "SUCCESS") {
      return;
    }

    const fingerprint = await hashPatientImportFile(file);
    expect(result.preview.previewBinding).toBe(
      createPatientImportPreviewBinding(
        fingerprint,
        hospitalId,
        actor.userId,
        effectiveDate,
        PATIENT_IMPORT_CONTRACT_VERSION,
      ),
    );
  });

  it("rejects invalid effective dates without reading or previewing the workbook", async () => {
    const result = await previewPatientImportAction(
      createFormData(createUpload("file-invalid-date"), {
        targetHospitalId: hospitalId,
        effectiveDate: "2026-02-30",
      }),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาเลือกไฟล์ Excel และโรงพยาบาลที่ถูกต้อง",
    });
    expect(mockedReadCandidates).not.toHaveBeenCalled();
    expect(mockedPreviewProvisioning).not.toHaveBeenCalled();
  });

  it("accepts the same file and Hospital, then reparses before importing, with no OSM or reconciliation input", async () => {
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
    expect(mockedReadCandidates).toHaveBeenCalledWith(file, target);
    expect(mockedImportProvisioning).toHaveBeenCalledWith(
      actor,
      hospitalId,
      [createCandidate()],
      {},
      {
        effectiveDate: null,
        importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      },
    );
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients/provision");
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients");
  });

  it("ignores leftover reconciliation or OSM form fields: nothing but the contract reaches the service", async () => {
    const file = createUpload("file-a");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);

    const leftovers: Array<Record<string, string>> = [
      { osmAssignmentChoices: "[]" },
      { classificationChoices: "[]" },
    ];

    for (const extra of leftovers) {
      const result = await confirmPatientImportAction(
        createFormData(file, {
          targetHospitalId: hospitalId,
          previewTargetHospitalId: hospitalId,
          fileFingerprint: fingerprint,
          previewBinding: binding,
          extra,
        }),
      );

      expect(result).toMatchObject({ status: "SUCCESS" });
    }

    expect(mockedImportProvisioning).toHaveBeenCalledTimes(2);

    for (const call of mockedImportProvisioning.mock.calls) {
      expect(call[4]).toEqual({
        effectiveDate: null,
        importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      });
    }
  });

  it("returns a mixed result summary unchanged", async () => {
    const mixedSummary = createSummary({ imported: 1, alreadyExists: 1, conflict: 1, baselineCreated: 1 });
    const file = createUpload("file-mixed-result");
    const fingerprint = await hashPatientImportFile(file);
    const previewBinding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    mockedImportProvisioning.mockResolvedValueOnce(mixedSummary);

    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding,
    }));

    expect(result).toEqual({ status: "SUCCESS", summary: mixedSummary });
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
      message: "ไฟล์ โรงพยาบาล วันที่ข้อมูลตั้งต้น หรือรูปแบบนำเข้าเปลี่ยนแปลงแล้ว กรุณาตรวจสอบใหม่ก่อนยืนยันนำเข้า",
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
      previewBinding: createPatientImportPreviewBinding(fingerprint, otherHospitalId, actor.userId),
    }));

    expect(changedHospitalResult).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(staleBindingResult).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("rejects another actor's binding", async () => {
    const file = createUpload("file-a");
    const fingerprint = await hashPatientImportFile(file);
    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: createPatientImportPreviewBinding(
        fingerprint,
        hospitalId,
        "99999999-9999-4999-8999-999999999999",
      ),
    }));

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("rejects a changed effective date after preview", async () => {
    const file = createUpload("file-date-binding");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(
      fingerprint,
      hospitalId,
      actor.userId,
      "2026-08-01",
      PATIENT_IMPORT_CONTRACT_VERSION,
    );
    const result = await confirmPatientImportAction(
      createFormData(file, {
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        fileFingerprint: fingerprint,
        previewBinding: binding,
        effectiveDate: "2026-08-15",
      }),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("rejects a preview bound under the previous import contract", async () => {
    const file = createUpload("file-previous-contract");
    const fingerprint = await hashPatientImportFile(file);
    const oldBinding = createPatientImportPreviewBinding(
      fingerprint,
      hospitalId,
      actor.userId,
      null,
      "phase-16d4-osm-assignment-v2",
    );
    const result = await confirmPatientImportAction(
      createFormData(file, {
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        fileFingerprint: fingerprint,
        previewBinding: oldBinding,
      }),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("rejects an unsupported import contract version at confirmation", async () => {
    const file = createUpload("file-contract-version");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(
      fingerprint,
      hospitalId,
      actor.userId,
      null,
      PATIENT_IMPORT_CONTRACT_VERSION,
    );
    const result = await confirmPatientImportAction(
      createFormData(file, {
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        fileFingerprint: fingerprint,
        previewBinding: binding,
        importContractVersion: "unsupported-contract",
      }),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("denies confirm for an out-of-scope hospital without importing", async () => {
    const file = createUpload("file-a");
    const fingerprint = await hashPatientImportFile(file);
    mockedResolveTarget.mockRejectedValue(new ForbiddenError());

    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId),
    }));

    expect(result).toMatchObject({ status: "ERROR", code: "FORBIDDEN" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });
});
