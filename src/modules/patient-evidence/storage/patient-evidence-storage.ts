import type { PatientEvidenceMediaType } from "../policies/patient-evidence-image-policy";
import { InfrastructureError } from "@/shared/errors/application-error";

export type PatientEvidenceStorageOperation = "upload" | "signed-url" | "remove";

export class PatientEvidenceStorageError extends InfrastructureError {
  readonly operation: PatientEvidenceStorageOperation;

  constructor(operation: PatientEvidenceStorageOperation) {
    super("Patient evidence storage operation failed");
    this.name = "PatientEvidenceStorageError";
    this.operation = operation;
  }
}

export type PatientEvidenceStorage = {
  uploadObject(input: {
    objectKey: string;
    bytes: Uint8Array;
    mediaType: PatientEvidenceMediaType;
  }): Promise<void>;
  createTemporaryAccessUrl(input: { objectKey: string; expiresInSeconds: number }): Promise<string>;
  removeObject(input: { objectKey: string }): Promise<void>;
};
