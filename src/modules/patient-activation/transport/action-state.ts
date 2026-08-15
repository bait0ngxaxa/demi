import type {
  PatientActivationIssueOutcome,
} from "../services/patient-activation-service";

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
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | { status: "SUCCESS"; result: PatientActivationIssueResultState };

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

export const initialPatientActivationCompletionActionState: PatientActivationCompletionActionState = {
  status: "IDLE",
};
