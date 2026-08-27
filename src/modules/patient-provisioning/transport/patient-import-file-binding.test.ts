import { describe, expect, it } from "vitest";

import {
  createPatientImportClassificationReconciliationBinding,
  createPatientImportPreviewBinding,
  hashPatientImportFile,
  matchesPatientImportClassificationReconciliationBinding,
  matchesPatientImportFileFingerprint,
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
});
