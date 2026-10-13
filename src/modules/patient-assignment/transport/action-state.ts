import type {
  PatientOsmAssignmentMutationResult,
  PatientOsmBulkAssignmentResult,
} from "../services/patient-osm-assignment-service";

export type PatientOsmAssignmentActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | { status: "SUCCESS"; result: PatientOsmAssignmentMutationResult };

export const initialPatientOsmAssignmentActionState: PatientOsmAssignmentActionState = {
  status: "IDLE",
};

export type PatientOsmBulkAssignmentActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | { status: "SUCCESS"; result: PatientOsmBulkAssignmentResult };

export const initialPatientOsmBulkAssignmentActionState: PatientOsmBulkAssignmentActionState = {
  status: "IDLE",
};
