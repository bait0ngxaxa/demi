import type {
  PatientImportPreview,
  PatientImportClassificationReconciliation,
  PatientImportResultSummary,
  PatientImportOsmAssignmentPreview,
  PatientProvisioningOutcome,
} from "../services/patient-provisioning-service";
import type { PatientProvisionContinuation } from "./patient-provisioning-continuation";

export type PatientImportPreviewReconciliationBinding = PatientImportClassificationReconciliation & {
  confirmationToken: string;
};

export type PatientImportOsmCandidateBinding = {
  displayName: string;
  candidateToken: string;
  candidateReferenceToken: string;
  sameAsCurrent: boolean;
  reassignmentToken?: string;
};

export type PatientImportOsmAssignmentChoiceBinding = {
  rowNumber: number;
  resolutionStatus: "OSM_MATCHED" | "OSM_AMBIGUOUS";
  candidateToken: string;
  candidateReferenceToken: string;
  explicitReassignment: boolean;
  reassignmentToken?: string;
};

export type PatientImportOsmAssignmentReconciliationBinding = {
  rowNumber: number;
  resolutionStatus: "OSM_MATCHED" | "OSM_AMBIGUOUS";
  sourceCaregiverName: string;
  currentCaregiver: PatientImportOsmAssignmentPreview["currentCaregiver"];
  assignmentStatus: PatientImportOsmAssignmentPreview["assignmentStatus"];
  candidates: PatientImportOsmCandidateBinding[];
};

export type PatientImportPreviewBinding = Omit<PatientImportPreview, "classificationReconciliations"> & {
  fileFingerprint: string;
  previewBinding: string;
  classificationReconciliations: PatientImportPreviewReconciliationBinding[];
  osmAssignmentReconciliations: PatientImportOsmAssignmentReconciliationBinding[];
};

export type PatientProvisionResultState = PatientProvisionContinuation & {
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
