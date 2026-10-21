import { describe, expect, it } from "vitest";

import {
  assertPatientImportPreviewBinding,
  createPatientImportPreviewBinding,
  hashPatientImportFile,
  matchesPatientImportFileFingerprint,
  matchesPatientImportPreviewBinding,
  PatientImportPreviewBindingError,
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

  it("no longer accepts a preview bound under the previous import contract", async () => {
    const fingerprint = await hashPatientImportFile(createFileSource("file-old-contract"));
    const previousContractVersion = "patient-import-v2-hospital-template";
    const oldBinding = createPatientImportPreviewBinding(
      fingerprint,
      targetHospitalId,
      actorUserId,
      null,
      previousContractVersion,
    );

    expect(PATIENT_IMPORT_CONTRACT_VERSION).not.toBe(previousContractVersion);
    expect(
      matchesPatientImportPreviewBinding(oldBinding, fingerprint, targetHospitalId, actorUserId),
    ).toBe(false);
  });

  it("rejects malformed bindings without throwing", async () => {
    const fingerprint = await hashPatientImportFile(createFileSource("file-malformed"));

    expect(matchesPatientImportPreviewBinding("not-hex", fingerprint, targetHospitalId, actorUserId)).toBe(false);
    expect(matchesPatientImportFileFingerprint("not-hex", fingerprint)).toBe(false);
  });

  describe("assertPatientImportPreviewBinding", () => {
    async function validRequest(contents: string) {
      const file = createFileSource(contents);
      const fileFingerprint = await hashPatientImportFile(file);

      return {
        actorUserId,
        targetHospitalId,
        previewTargetHospitalId: targetHospitalId,
        fileFingerprint,
        previewBinding: createPatientImportPreviewBinding(fileFingerprint, targetHospitalId, actorUserId),
        effectiveDate: null,
        importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
        file,
      };
    }

    it("accepts the previewed file for the previewed hospital and actor", async () => {
      await expect(assertPatientImportPreviewBinding(await validRequest("same"))).resolves.toBeUndefined();
    });

    it("rejects another file, another hospital, another actor and another contract", async () => {
      const request = await validRequest("original");

      await expect(
        assertPatientImportPreviewBinding({ ...request, file: createFileSource("changed") }),
      ).rejects.toBeInstanceOf(PatientImportPreviewBindingError);
      await expect(
        assertPatientImportPreviewBinding({
          ...request,
          targetHospitalId: "33333333-3333-4333-8333-333333333333",
        }),
      ).rejects.toBeInstanceOf(PatientImportPreviewBindingError);
      await expect(
        assertPatientImportPreviewBinding({
          ...request,
          actorUserId: "44444444-4444-4444-8444-444444444444",
        }),
      ).rejects.toBeInstanceOf(PatientImportPreviewBindingError);
      await expect(
        assertPatientImportPreviewBinding({ ...request, importContractVersion: "other" }),
      ).rejects.toBeInstanceOf(PatientImportPreviewBindingError);
    });
  });
});
