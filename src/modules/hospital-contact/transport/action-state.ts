import type {
  HospitalContactEditorProjection,
  HospitalContactMutationResult,
} from "../types/hospital-contact-projections";

export type HospitalContactField = "addressText" | "phoneNumber";

export type HospitalContactReadActionState =
  | { status: "SUCCESS"; contact: HospitalContactEditorProjection }
  | { status: "FORBIDDEN" }
  | { status: "UNAVAILABLE" };

export type HospitalContactMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; result: Exclude<HospitalContactMutationResult, { outcome: "UNCONFIRMED" }> }
  | { status: "UNCONFIRMED" }
  | {
      status: "ERROR";
      code: "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE";
      message: string;
      fieldErrors?: Partial<Record<HospitalContactField, string>>;
    };

export const initialHospitalContactMutationActionState: HospitalContactMutationActionState = {
  status: "IDLE",
};
