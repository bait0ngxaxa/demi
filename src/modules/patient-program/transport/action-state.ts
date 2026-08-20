import type { PatientProgramMutationResult } from "../services/patient-program-service";

export type PatientProgramActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        operation: PatientProgramMutationResult["operation"];
        patientProgramId: string;
        patientHospitalRelationshipId: string;
        status: PatientProgramMutationResult["status"];
        startedAt: string;
        completedAt: string | null;
      };
    };

export const initialPatientProgramActionState: PatientProgramActionState = { status: "IDLE" };
