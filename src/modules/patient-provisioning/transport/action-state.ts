import type {
  PatientImportPreview,
  PatientImportResultSummary,
  PatientProvisioningOutcome,
} from "../services/patient-provisioning-service";

export type PatientImportPreviewBinding = PatientImportPreview & {
  fileFingerprint: string;
  previewBinding: string;
};

export type PatientProvisionResultState = {
  outcome: PatientProvisioningOutcome;
  relationshipId: string;
  hospitalId: string;
  accountStatus: "PROVISIONED" | "INVITED" | "ACTIVE" | "SUSPENDED";
  reusedExistingUser: boolean;
};

export type PatientProvisionActionState =
  | { status: "IDLE" }
  | {
      status: "SUCCESS";
      result: PatientProvisionResultState;
    }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
      fieldErrors?: Partial<Record<"nationalId" | "givenName" | "familyName" | "hospitalNumber", string>>;
    };

export type PatientImportPreviewActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; preview: PatientImportPreviewBinding }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "UNAVAILABLE";
      message: string;
    };

export type PatientImportActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; summary: PatientImportResultSummary }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "UNAVAILABLE";
      message: string;
    };

export const initialPatientProvisionActionState: PatientProvisionActionState = {
  status: "IDLE",
};

export const initialPatientImportPreviewActionState: PatientImportPreviewActionState = {
  status: "IDLE",
};

export const initialPatientImportActionState: PatientImportActionState = {
  status: "IDLE",
};
