export type PatientFinalAssessmentActionErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE";

export type PatientFinalAssessmentActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: PatientFinalAssessmentActionErrorCode;
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        patientFinalAssessmentId: string;
        patientProgramId: string;
        patientHospitalRelationshipId: string;
      };
    };

export const initialPatientFinalAssessmentActionState: PatientFinalAssessmentActionState = {
  status: "IDLE",
};
