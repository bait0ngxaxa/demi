import type {
  PatientClassificationMutationOperation,
} from "../services/patient-classification-transaction";
import type { PatientClassificationType } from "../schemas/patient-classification-schemas";

export type PatientClassificationActionState =
  | { status: "IDLE" }
  | {
      status: "SUCCESS";
      result: {
        operation: PatientClassificationMutationOperation;
        classification: PatientClassificationType;
      };
    }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    };

export const initialPatientClassificationActionState: PatientClassificationActionState = {
  status: "IDLE",
};
