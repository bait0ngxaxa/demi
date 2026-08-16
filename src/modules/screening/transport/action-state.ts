import type { ScreeningSubmissionResult } from "../services/screening-service";

export type ScreeningActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        screeningAssessmentId: ScreeningSubmissionResult["screeningAssessmentId"];
        patientHospitalRelationshipId: ScreeningSubmissionResult["patientHospitalRelationshipId"];
        submittedAt: string;
      };
    };

export const initialScreeningActionState: ScreeningActionState = { status: "IDLE" };
