import type {
  PatientActivationIssueOutcome,
} from "../services/patient-activation-service";
import type {
  PatientActivationCandidate,
} from "../services/patient-activation-query-service";

export type PatientActivationIssueResultState = {
  outcome: PatientActivationIssueOutcome;
  userId: string;
  patientProfileId: string | null;
  hospitalId: string;
  activationToken: string | null;
  activationExpiresAt: string | null;
};

export type PatientActivationIssueActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code:
        | "INVALID_INPUT"
        | "FORBIDDEN"
        | "CONFLICT"
        | "RECONCILIATION_REQUIRED"
        | "UNAVAILABLE";
      message: string;
    }
  | { status: "SUCCESS"; result: PatientActivationIssueResultState };

export type PatientActivationCandidateState = Omit<
  PatientActivationCandidate,
  "activationExpiresAt"
> & {
  activationExpiresAt: string | null;
};

export type PatientActivationLookupActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; candidates: PatientActivationCandidateState[] }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "UNAVAILABLE";
      message: string;
    };

export type PatientActivationDetailsActionState =
  | {
      status: "AVAILABLE";
      displayName: string;
      hospitalName: string;
      activationExpiresAt: string;
    }
  | { status: "INVALID"; message: string };

export type PatientActivationCompletionActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "CONFLICT" | "UNAVAILABLE";
      message: string;
      fieldErrors?: { password?: string; passwordConfirmation?: string };
    }
  | { status: "SUCCESS" };

export const initialPatientActivationIssueActionState: PatientActivationIssueActionState = {
  status: "IDLE",
};

export const initialPatientActivationLookupActionState: PatientActivationLookupActionState = {
  status: "IDLE",
};

export const initialPatientActivationCompletionActionState: PatientActivationCompletionActionState = {
  status: "IDLE",
};
