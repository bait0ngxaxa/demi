import type {
  PatientProgramServiceOneActivity,
  PatientProgramServiceOneMutationResult,
} from "../services/patient-program-service-one-service";

export type PatientProgramServiceOneActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        activity: PatientProgramServiceOneActivity;
        operation: PatientProgramServiceOneMutationResult["operation"];
        patientProgramId: string;
        patientHospitalRelationshipId: string;
        recordedAt: string;
      };
    };

export const initialPatientProgramServiceOneActionState: PatientProgramServiceOneActionState = {
  status: "IDLE",
};
