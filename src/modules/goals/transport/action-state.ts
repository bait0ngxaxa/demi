import type { GoalPlanSubmissionResult } from "../services/goal-service";

export type GoalPlanActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        goalPlanId: GoalPlanSubmissionResult["goalPlanId"];
        patientHospitalRelationshipId: GoalPlanSubmissionResult["patientHospitalRelationshipId"];
        roundNumber: number;
      };
    };

export const initialGoalPlanActionState: GoalPlanActionState = { status: "IDLE" };

