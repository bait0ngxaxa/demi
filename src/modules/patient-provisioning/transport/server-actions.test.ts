import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { PatientImportUpload } from "../adapters/excel-patient-import-adapter";
import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import type { PatientProvisionActionState } from "./action-state";
import {
  createPatientImportClassificationReconciliationBinding,
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
const mockedProjectPatientImportPreview = vi.hoisted(() => (preview: unknown): unknown => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  if (!isRecord(preview) || !Array.isArray(preview.rows)) {
    return preview;
  }

  return {
    ...preview,
    rows: preview.rows.map((row: unknown) => {
      if (!isRecord(row)) {
        return row;
      }

      const rowRecord = row;
      const osmValue = rowRecord["patientOsmAssignment"];

      if (!isRecord(osmValue)) {
        return row;
      }

      const osm = osmValue;
      const currentDisplayName = "currentCaregiverDisplayName" in osm &&
        typeof osm.currentCaregiverDisplayName === "string"
        ? osm.currentCaregiverDisplayName
        : null;
      const resolvedDisplayName = "resolvedCandidateDisplayName" in osm &&
        typeof osm.resolvedCandidateDisplayName === "string"
        ? osm.resolvedCandidateDisplayName
        : null;
      const candidates = osm.resolutionStatus === "OSM_AMBIGUOUS"
        ? []
        : "candidates" in osm && Array.isArray(osm.candidates)
        ? osm.candidates.map((candidate: unknown) =>
            typeof candidate === "object" && candidate !== null && "displayName" in candidate
              ? { displayName: candidate.displayName }
              : { displayName: "" },
          )
        : [];

      return {
        ...rowRecord,
        patientOsmAssignment: {
          resolutionStatus: osm.resolutionStatus,
          assignmentStatus: osm.assignmentStatus,
          sourceCaregiverName: osm.sourceCaregiverName,
          currentCaregiver: currentDisplayName ? { displayName: currentDisplayName } : null,
          resolvedCandidate: resolvedDisplayName ? { displayName: resolvedDisplayName } : null,
          candidates,
        },
      };
    }),
  };
});

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("../adapters/excel-patient-import-adapter", () => ({
  readPatientImportCandidates: mockedReadCandidates,
}));
vi.mock("../services/patient-provisioning-service", () => ({
  provisionPatient: mockedProvisionPatient,
  PatientProvisioningConflictError: class PatientProvisioningConflictError extends Error {},
}));
vi.mock("../services/patient-roster-import-service", () => ({
  importPatientRoster: mockedImportProvisioning,
  previewPatientRosterImportInternal: mockedPreviewProvisioning,
  projectPatientRosterImportPreview: mockedProjectPatientImportPreview,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "44444444-4444-4444-8444-444444444444";
const relationshipId = "55555555-5555-4555-8555-555555555555";

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
    classificationReconciliationChoices?: string;
    osmAssignmentChoices?: string;
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

  if (values.classificationReconciliationChoices !== undefined) {
    formData.set(
      "classificationReconciliationChoices",
      values.classificationReconciliationChoices,
    );
  }

  if (values.osmAssignmentChoices !== undefined) {
    formData.set("osmAssignmentChoices", values.osmAssignmentChoices);
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

function createOsmPreview(input: {
  resolutionStatus?: "OSM_MATCHED" | "OSM_AMBIGUOUS";
  assignmentStatus?: "OSM_ASSIGNMENT_READY" | "OSM_ASSIGNMENT_CONFLICT" | null;
  currentOsmUserId?: string | null;
  candidates?: Array<{ osmUserId: string; displayName: string }>;
}): Record<string, unknown> {
  const resolutionStatus = input.resolutionStatus ?? "OSM_MATCHED";
  const currentOsmUserId = input.currentOsmUserId ?? null;
  const candidates = input.candidates ?? [{
    osmUserId: "99999999-9999-4999-8999-999999999999",
    displayName: "สมชาย ผู้ดูแล",
  }];

  return {
    targetHospitalId: hospitalId,
    effectiveDate: null,
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    baselineDateRequired: false,
    canManageOsmAssignment: true,
    rows: [{
      rowNumber: 2,
      identityDisplay: "••••••0009",
      givenName: "สมชาย",
      familyName: "ผู้ป่วย",
      combinedNameText: null,
      hospitalNumber: null,
      classification: input.assignmentStatus === "OSM_ASSIGNMENT_CONFLICT" ||
        resolutionStatus === "OSM_AMBIGUOUS" ? "NEEDS_REVIEW" : "READY",
      reason: null,
      baselineStatus: "NOT_APPLICABLE",
      requirementGatedFields: [],
      diagnosticCodes: [],
      patientClassification: {
        status: "NOT_APPLICABLE",
        currentClassification: null,
        sourceClassification: null,
      },
      patientOsmAssignment: {
        resolutionStatus,
        assignmentStatus: input.assignmentStatus ??
          (resolutionStatus === "OSM_AMBIGUOUS" ? null : "OSM_ASSIGNMENT_READY"),
        sourceCaregiverName: "สมชาย ผู้ดูแล",
        normalizedSourceCaregiverName: "สมชาย ผู้ดูแล",
        currentOsmUserId,
        currentCaregiverDisplayName: currentOsmUserId ? "สมหญิง ผู้ดูแล" : null,
        resolvedOsmUserId: resolutionStatus === "OSM_MATCHED" ? candidates[0]?.osmUserId ?? null : null,
        resolvedCandidateDisplayName: resolutionStatus === "OSM_MATCHED" ? candidates[0]?.displayName ?? null : null,
        candidates,
      },
    }],
    classificationReconciliations: [],
    file: null,
  };
}

describe("patient import Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedReadCandidates.mockResolvedValue([createCandidate()]);
    mockedPreviewProvisioning.mockResolvedValue({
      targetHospitalId: hospitalId,
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      baselineDateRequired: false,
      canManageOsmAssignment: false,
      rows: [],
      classificationReconciliations: [],
      file: null,
    });
    mockedImportProvisioning.mockResolvedValue({
      targetHospitalId: hospitalId,
      imported: 1,
      alreadyExists: 0,
      duplicateInFile: 0,
      invalid: 0,
      conflict: 0,
      failed: 0,
      baselineCreated: 0,
      baselineAlreadyExists: 0,
      baselineConflict: 0,
      baselineInvalid: 0,
      baselineDateRequired: 0,
      classificationCreated: 0,
      classificationAlreadyExists: 0,
      classificationChanged: 0,
      classificationNeedsReview: 0,
      classificationInvalid: 0,
      osmAssigned: 0,
      osmAlreadyAssigned: 0,
      osmReassigned: 0,
      osmNotFound: 0,
      osmAmbiguous: 0,
      osmAssignmentConflict: 0,
      osmOwnerRequired: 0,
      needsReview: 0,
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

  async function provisionSinglePatient(): Promise<PatientProvisionActionState> {
    const formData = new FormData();
    formData.set("nationalId", "1000000000009");
    formData.set("givenName", "สมชาย");
    formData.set("familyName", "ผู้ป่วย");
    formData.set("hospitalNumber", "HN-001");
    formData.set("targetHospitalId", hospitalId);

    return provisionPatientAction({ status: "IDLE" }, formData);
  }

  it("preserves the authoritative single-provisioning relationship ID", async () => {
    const result = await provisionSinglePatient();

    expect(result).toEqual({
      status: "SUCCESS",
      result: {
        outcome: "CREATED",
        relationshipId,
        hospitalId,
        accountStatus: "PROVISIONED",
        reusedExistingUser: false,
        canOpenPatientDetail: true,
        canManagePatientActivation: true,
      },
    });
  });

  it("does not collapse provisioning, read, and activation authority for an OSM-only actor", async () => {
    mockedActor.mockResolvedValue(osmOnlyActor);

    const result = await provisionSinglePatient();

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        relationshipId,
        hospitalId,
        canOpenPatientDetail: false,
        canManagePatientActivation: false,
      },
    });
  });

  it("uses direct Hospital scope for a multi-role actor", async () => {
    mockedActor.mockResolvedValue(multiRoleActor);

    const result = await provisionSinglePatient();

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        canOpenPatientDetail: true,
        canManagePatientActivation: true,
      },
    });
  });

  it("applies the same server-derived capabilities to an existing relationship", async () => {
    mockedActor.mockResolvedValue(osmOnlyActor);
    mockedProvisionPatient.mockResolvedValue({
      outcome: "ALREADY_PROVISIONED",
      personId: "66666666-6666-4666-8666-666666666666",
      userId: "77777777-7777-4777-8777-777777777777",
      patientProfileId: "88888888-8888-4888-8888-888888888888",
      relationshipId,
      hospitalId,
      accountStatus: "ACTIVE",
      reusedExistingUser: true,
    });

    const result = await provisionSinglePatient();

    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        outcome: "ALREADY_PROVISIONED",
        accountStatus: "ACTIVE",
        canOpenPatientDetail: false,
        canManagePatientActivation: false,
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

    expect(mockedReadCandidates).toHaveBeenCalledWith(file, hospitalId, { mode: "CANONICAL" });
    const fingerprint = await hashPatientImportFile(file);
    expect(result.preview.fileFingerprint).toBe(fingerprint);
    expect(result.preview.previewBinding).toBe(
      createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId),
    );
  });

  it("returns only opaque OSM candidate bindings to the browser", async () => {
    mockedPreviewProvisioning.mockResolvedValue(createOsmPreview({
      candidates: [{
        osmUserId: "99999999-9999-4999-8999-999999999999",
        displayName: "สมชาย ผู้ดูแล",
      }],
    }));
    const file = createUpload("file-osm-preview");
    const result = await previewPatientImportAction(createFormData(file, { targetHospitalId: hospitalId }));

    expect(result.status).toBe("SUCCESS");

    if (result.status !== "SUCCESS") {
      return;
    }

    const reconciliation = result.preview.osmAssignmentReconciliations[0];
    expect(reconciliation).toBeDefined();
    expect(reconciliation?.candidates[0]).toMatchObject({
      displayName: "สมชาย ผู้ดูแล",
      sameAsCurrent: false,
    });
    expect(JSON.stringify(result.preview)).not.toContain("99999999-9999-4999-8999-999999999999");
    expect(reconciliation?.candidates[0]?.candidateToken).not.toBe(
      "99999999-9999-4999-8999-999999999999",
    );
  });

  it("does not expose or bind visually indistinguishable ambiguous OSM candidates", async () => {
    mockedPreviewProvisioning.mockResolvedValue(createOsmPreview({
      resolutionStatus: "OSM_AMBIGUOUS",
      candidates: [
        {
          osmUserId: "99999999-9999-4999-8999-999999999999",
          displayName: "สมชาย ผู้ดูแล",
        },
        {
          osmUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          displayName: "สมชาย ผู้ดูแล",
        },
      ],
    }));
    const file = createUpload("file-osm-ambiguous");
    const previewResult = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId }),
    );

    expect(previewResult.status).toBe("SUCCESS");
    if (previewResult.status !== "SUCCESS") {
      return;
    }

    expect(previewResult.preview.rows[0]?.patientOsmAssignment.candidates).toEqual([]);
    expect(previewResult.preview.osmAssignmentReconciliations).toEqual([]);

    const fingerprint = await hashPatientImportFile(file);
    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding: createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId),
      osmAssignmentChoices: JSON.stringify([{
        rowNumber: 2,
        resolutionStatus: "OSM_MATCHED",
        candidateToken: "0".repeat(64),
        candidateReferenceToken: "0".repeat(64),
        explicitReassignment: false,
      }]),
    }));

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });

  it("revalidates an opaque OSM choice and forwards only server-derived identity", async () => {
    const file = createUpload("file-osm-confirm");
    const fingerprint = await hashPatientImportFile(file);
    const previewBinding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    mockedPreviewProvisioning.mockResolvedValue(createOsmPreview({
      candidates: [{
        osmUserId: "99999999-9999-4999-8999-999999999999",
        displayName: "สมชาย ผู้ดูแล",
      }],
    }));

    const previewResult = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId }),
    );
    expect(previewResult.status).toBe("SUCCESS");

    if (previewResult.status !== "SUCCESS") {
      return;
    }

    const candidate = previewResult.preview.osmAssignmentReconciliations[0]?.candidates[0];
    expect(candidate).toBeDefined();

    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding,
      osmAssignmentChoices: JSON.stringify([{
        rowNumber: 2,
        resolutionStatus: "OSM_MATCHED",
        candidateToken: candidate?.candidateToken,
        candidateReferenceToken: candidate?.candidateReferenceToken,
        explicitReassignment: false,
      }]),
    }));

    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(mockedImportProvisioning).toHaveBeenCalledWith(
      actor,
      hospitalId,
      [createCandidate()],
      {},
      {
        effectiveDate: null,
        importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
        classificationReconciliationChoices: [],
        osmAssignmentChoices: [{
          rowNumber: 2,
          resolutionStatus: "OSM_MATCHED",
          sourceCaregiverName: "สมชาย ผู้ดูแล",
          normalizedSourceCaregiverName: "สมชาย ผู้ดูแล",
          candidateOsmUserId: "99999999-9999-4999-8999-999999999999",
          currentOsmUserId: null,
          explicitReassignment: false,
        }],
      },
    );
  });

  it("rejects a forged OSM candidate token before import", async () => {
    const file = createUpload("file-forged-osm");
    const fingerprint = await hashPatientImportFile(file);
    const previewBinding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    mockedPreviewProvisioning.mockResolvedValue(createOsmPreview({
      candidates: [{
        osmUserId: "99999999-9999-4999-8999-999999999999",
        displayName: "สมชาย ผู้ดูแล",
      }],
    }));
    const previewResult = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId }),
    );

    expect(previewResult.status).toBe("SUCCESS");

    if (previewResult.status !== "SUCCESS") {
      return;
    }

    const candidate = previewResult.preview.osmAssignmentReconciliations[0]?.candidates[0];
    expect(candidate).toBeDefined();
    const forgedToken = `${candidate?.candidateToken.slice(0, -1)}${candidate?.candidateToken.endsWith("0") ? "1" : "0"}`;

    const result = await confirmPatientImportAction(createFormData(file, {
      targetHospitalId: hospitalId,
      previewTargetHospitalId: hospitalId,
      fileFingerprint: fingerprint,
      previewBinding,
      osmAssignmentChoices: JSON.stringify([{
        rowNumber: 2,
        resolutionStatus: "OSM_MATCHED",
        candidateToken: forgedToken,
        candidateReferenceToken: candidate?.candidateReferenceToken,
        explicitReassignment: false,
      }]),
    }));

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
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
    const file = createUpload("file-invalid-date");
    const result = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId, effectiveDate: "2026-02-30" }),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาเลือกไฟล์ Excel และโรงพยาบาลที่ถูกต้อง",
    });
    expect(mockedReadCandidates).not.toHaveBeenCalled();
    expect(mockedPreviewProvisioning).not.toHaveBeenCalled();
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
    expect(mockedReadCandidates).toHaveBeenCalledWith(file, hospitalId, { mode: "CANONICAL" });
    expect(mockedImportProvisioning).toHaveBeenCalledWith(
      actor,
      hospitalId,
      [createCandidate()],
      {},
      {
        effectiveDate: null,
        importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
        classificationReconciliationChoices: [],
        osmAssignmentChoices: [],
      },
    );
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

  it("rejects a changed effective date after preview", async () => {
    const file = createUpload("file-date-binding");
    const fingerprint = await hashPatientImportFile(file);
    const previewDate = "2026-08-01";
    const binding = createPatientImportPreviewBinding(
      fingerprint,
      hospitalId,
      actor.userId,
      previewDate,
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

  it("requires a server-bound explicit choice for a conflicting classification", async () => {
    const file = createUpload("file-classification-conflict");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    const conflictPreview = {
      targetHospitalId: hospitalId,
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      baselineDateRequired: false,
      rows: [{
        rowNumber: 2,
        identityDisplay: "••••••0009",
        givenName: "สมชาย",
        familyName: "ผู้ป่วย",
        combinedNameText: null,
        hospitalNumber: null,
        classification: "NEEDS_REVIEW",
        reason: "สถานะผู้ป่วยจากไฟล์แตกต่างจากสถานะปัจจุบัน",
        baselineStatus: "NOT_APPLICABLE",
        requirementGatedFields: [],
        diagnosticCodes: [],
        patientClassification: {
          status: "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION",
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
        },
        patientOsmAssignment: {
          resolutionStatus: "OSM_NOT_APPLICABLE",
          assignmentStatus: null,
          sourceCaregiverName: null,
          normalizedSourceCaregiverName: null,
          currentOsmUserId: null,
          currentCaregiverDisplayName: null,
          resolvedOsmUserId: null,
          resolvedCandidateDisplayName: null,
          candidates: [],
        },
      }],
      classificationReconciliations: [{
        rowNumber: 2,
        currentClassification: "RISK",
        sourceClassification: "DIABETES",
      }],
      file: null,
      canManageOsmAssignment: false,
    };
    mockedPreviewProvisioning.mockResolvedValue(conflictPreview);

    const previewResult = await previewPatientImportAction(
      createFormData(file, { targetHospitalId: hospitalId }),
    );
    expect(previewResult.status).toBe("SUCCESS");

    if (previewResult.status !== "SUCCESS") {
      return;
    }

    const descriptor = previewResult.preview.classificationReconciliations[0];
    expect(descriptor).toBeDefined();
    const result = await confirmPatientImportAction(
      createFormData(file, {
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        fileFingerprint: fingerprint,
        previewBinding: binding,
        classificationReconciliationChoices: JSON.stringify([descriptor]),
      }),
    );

    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(mockedImportProvisioning).toHaveBeenCalledWith(
      actor,
      hospitalId,
      [createCandidate()],
      {},
      {
        effectiveDate: null,
        importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
        classificationReconciliationChoices: [{
          rowNumber: 2,
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
        }],
        osmAssignmentChoices: [],
      },
    );
  });

  it("rejects a forged classification reconciliation token before import", async () => {
    const file = createUpload("file-forged-classification");
    const fingerprint = await hashPatientImportFile(file);
    const binding = createPatientImportPreviewBinding(fingerprint, hospitalId, actor.userId);
    mockedPreviewProvisioning.mockResolvedValue({
      targetHospitalId: hospitalId,
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      baselineDateRequired: false,
      canManageOsmAssignment: false,
      rows: [],
      classificationReconciliations: [],
      file: null,
    });

    const result = await confirmPatientImportAction(
      createFormData(file, {
        targetHospitalId: hospitalId,
        previewTargetHospitalId: hospitalId,
        fileFingerprint: fingerprint,
        previewBinding: binding,
        classificationReconciliationChoices: JSON.stringify([{
          rowNumber: 2,
          currentClassification: "RISK",
          sourceClassification: "DIABETES",
          confirmationToken: (() => {
            const token = createPatientImportClassificationReconciliationBinding({
              fileFingerprint: fingerprint,
              targetHospitalId: hospitalId,
              actorUserId: actor.userId,
              effectiveDate: null,
              importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
              rowNumber: 2,
              currentClassification: "RISK",
              sourceClassification: "DIABETES",
            });

            return `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
          })(),
        }]),
      }),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedImportProvisioning).not.toHaveBeenCalled();
  });
});
