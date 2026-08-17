export type FollowupActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        followupId: string;
        patientHospitalRelationshipId: string;
        roundNumber: number;
      };
    };

export const initialFollowupActionState: FollowupActionState = { status: "IDLE" };
