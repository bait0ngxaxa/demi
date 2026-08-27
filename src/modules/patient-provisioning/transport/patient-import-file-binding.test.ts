import { describe, expect, it } from "vitest";

import {
  createPatientImportClassificationReconciliationBinding,
  createPatientImportOsmCandidateBinding,
  createPatientImportOsmCandidateReferenceBinding,
  createPatientImportOsmReassignmentBinding,
  createPatientImportPreviewBinding,
  hashPatientImportFile,
  matchesPatientImportClassificationReconciliationBinding,
  matchesPatientImportFileFingerprint,
  matchesPatientImportOsmCandidateBinding,
  matchesPatientImportOsmCandidateReferenceBinding,
  matchesPatientImportOsmReassignmentBinding,
  matchesPatientImportPreviewBinding,
} from "./patient-import-file-binding";
import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";

function createFileSource(contents: string): { arrayBuffer(): Promise<ArrayBuffer> } {
  const bytes = new TextEncoder().encode(contents);

  return {
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

describe("patient import file binding", () => {
  it("hashes the actual uploaded bytes deterministically", async () => {
    const firstFingerprint = await hashPatientImportFile(createFileSource("file-a"));
    const secondFingerprint = await hashPatientImportFile(createFileSource("file-a"));
    const changedFingerprint = await hashPatientImportFile(createFileSource("file-b"));

    expect(firstFingerprint).toHaveLength(64);
    expect(firstFingerprint).toBe(secondFingerprint);
    expect(firstFingerprint).not.toBe(changedFingerprint);
    expect(matchesPatientImportFileFingerprint(firstFingerprint, secondFingerprint)).toBe(true);
    expect(matchesPatientImportFileFingerprint(firstFingerprint, changedFingerprint)).toBe(false);
  });

  it("binds the fingerprint to the actor and Hospital context", async () => {
    const fingerprint = await hashPatientImportFile(createFileSource("file-a"));
    const binding = createPatientImportPreviewBinding(
      fingerprint,
      targetHospitalId,
      actorUserId,
    );

    expect(matchesPatientImportPreviewBinding(
      binding,
      fingerprint,
      targetHospitalId,
      actorUserId,
    )).toBe(true);
    expect(matchesPatientImportPreviewBinding(
      binding,
      fingerprint,
      "33333333-3333-4333-8333-333333333333",
      actorUserId,
    )).toBe(false);
    expect(matchesPatientImportPreviewBinding(
      binding,
      fingerprint,
      targetHospitalId,
      "44444444-4444-4444-8444-444444444444",
    )).toBe(false);
  });

  it("binds the shared effective date and import contract version", async () => {
    const fingerprint = await hashPatientImportFile(createFileSource("file-date"));
    const binding = createPatientImportPreviewBinding(
      fingerprint,
      targetHospitalId,
      actorUserId,
      "2026-08-01",
      PATIENT_IMPORT_CONTRACT_VERSION,
    );

    expect(
      matchesPatientImportPreviewBinding(
        binding,
        fingerprint,
        targetHospitalId,
        actorUserId,
        "2026-08-01",
        PATIENT_IMPORT_CONTRACT_VERSION,
      ),
    ).toBe(true);
    expect(
      matchesPatientImportPreviewBinding(
        binding,
        fingerprint,
        targetHospitalId,
        actorUserId,
        "2026-08-15",
        PATIENT_IMPORT_CONTRACT_VERSION,
      ),
    ).toBe(false);
    expect(
      matchesPatientImportPreviewBinding(
        binding,
        fingerprint,
        targetHospitalId,
        actorUserId,
        "2026-08-01",
        "different-contract",
      ),
    ).toBe(false);
  });

  it("binds each explicit classification reconciliation to its preview context", async () => {
    const fingerprint = await hashPatientImportFile(createFileSource("file-classification"));
    const input = {
      fileFingerprint: fingerprint,
      targetHospitalId,
      actorUserId,
      effectiveDate: "2026-08-01",
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      rowNumber: 7,
      currentClassification: "RISK" as const,
      sourceClassification: "DIABETES" as const,
    };
    const binding = createPatientImportClassificationReconciliationBinding(input);

    expect(matchesPatientImportClassificationReconciliationBinding({ binding, ...input })).toBe(true);
    expect(
      matchesPatientImportClassificationReconciliationBinding({
        binding,
        ...input,
        rowNumber: 8,
      }),
    ).toBe(false);
    expect(
      matchesPatientImportClassificationReconciliationBinding({
        binding,
        ...input,
        currentClassification: "DIABETES",
      }),
    ).toBe(false);
    expect(
      matchesPatientImportClassificationReconciliationBinding({
        binding,
        ...input,
        sourceClassification: "RISK",
      }),
    ).toBe(false);
  });

  it("binds an OSM candidate to the exact roster preview context", async () => {
    const fileFingerprint = await hashPatientImportFile(createFileSource("file-osm-candidate"));
    const input = {
      fileFingerprint,
      targetHospitalId,
      actorUserId,
      effectiveDate: "2026-08-01",
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      rowNumber: 7,
      normalizedSourceCaregiverName: "สมชาย ใจดี",
      resolutionStatus: "OSM_MATCHED" as const,
      candidateOsmUserId: "55555555-5555-4555-8555-555555555555",
      currentOsmUserId: "66666666-6666-4666-8666-666666666666",
    };
    const binding = createPatientImportOsmCandidateBinding(input);

    expect(matchesPatientImportOsmCandidateBinding({ binding, input })).toBe(true);
    expect(
      matchesPatientImportOsmCandidateBinding({
        binding,
        input: { ...input, rowNumber: 8 },
      }),
    ).toBe(false);
    expect(
      matchesPatientImportOsmCandidateBinding({
        binding,
        input: { ...input, normalizedSourceCaregiverName: "สมชาย ใจดีใหม่" },
      }),
    ).toBe(false);
    expect(
      matchesPatientImportOsmCandidateBinding({
        binding,
        input: {
          ...input,
          candidateOsmUserId: "77777777-7777-4777-8777-777777777777",
        },
      }),
    ).toBe(false);
  });

  it("keeps candidate discovery bound while allowing a fresh current assignment check", async () => {
    const fileFingerprint = await hashPatientImportFile(createFileSource("file-osm-reference"));
    const input = {
      fileFingerprint,
      targetHospitalId,
      actorUserId,
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      rowNumber: 9,
      normalizedSourceCaregiverName: "สมหญิง มั่นคง",
      resolutionStatus: "OSM_AMBIGUOUS" as const,
      candidateOsmUserId: "88888888-8888-4888-8888-888888888888",
      currentOsmUserId: "99999999-9999-4999-8999-999999999999",
    };
    const binding = createPatientImportOsmCandidateReferenceBinding(input);

    expect(matchesPatientImportOsmCandidateReferenceBinding({ binding, input })).toBe(true);
    expect(
      matchesPatientImportOsmCandidateReferenceBinding({
        binding,
        input: { ...input, currentOsmUserId: null },
      }),
    ).toBe(true);
    expect(
      matchesPatientImportOsmCandidateReferenceBinding({
        binding,
        input: {
          ...input,
          candidateOsmUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        },
      }),
    ).toBe(false);
  });

  it("binds reassignment consent to the current assigned OSM", async () => {
    const fileFingerprint = await hashPatientImportFile(createFileSource("file-osm-reassignment"));
    const input = {
      fileFingerprint,
      targetHospitalId,
      actorUserId,
      effectiveDate: "2026-08-15",
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
      rowNumber: 11,
      normalizedSourceCaregiverName: "สมศักดิ์ มั่นคง",
      resolutionStatus: "OSM_MATCHED" as const,
      candidateOsmUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      currentOsmUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    };
    const binding = createPatientImportOsmReassignmentBinding(input);

    expect(matchesPatientImportOsmReassignmentBinding({ binding, input })).toBe(true);
    expect(
      matchesPatientImportOsmReassignmentBinding({
        binding,
        input: {
          ...input,
          currentOsmUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        },
      }),
    ).toBe(false);
  });
});
