export type PatientBaselineActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | {
      status: "SUCCESS";
      result: {
        patientBaselineId: string;
        patientHospitalRelationshipId: string;
        recordedOn: string;
      };
    };

export const initialPatientBaselineActionState: PatientBaselineActionState = { status: "IDLE" };
