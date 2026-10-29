export type PatientProgramRoundActionErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE";

export type PatientProgramRoundActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: PatientProgramRoundActionErrorCode;
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        operation: "RECORDED" | "ALREADY_RECORDED";
        patientProgramId: string;
        patientHospitalRelationshipId: string;
        roundNumber: number;
        done?: number;
        skipped?: number;
        notDone?: number;
      };
    };

export const initialPatientProgramRoundActionState: PatientProgramRoundActionState = {
  status: "IDLE",
};
