import type {
  HospitalContentCreateResult,
  HospitalContentDetailProjection,
  HospitalContentMutationResult,
  HospitalContentReconciliationResult,
} from "../types/hospital-content-projections";

export type HospitalContentField = "title" | "body" | "category" | "sourceText";
export type HospitalContentActionErrorCode = "VALIDATION" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
export type HospitalContentActionError = {
  status: "ERROR";
  code: HospitalContentActionErrorCode;
  message: string;
  fieldErrors?: Partial<Record<HospitalContentField, string>>;
};

export type HospitalContentCreateActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; result: Exclude<HospitalContentCreateResult, { outcome: "UNCONFIRMED" }> }
  | { status: "UNCONFIRMED" }
  | HospitalContentActionError;

export type HospitalContentMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; result: Exclude<HospitalContentMutationResult, { outcome: "UNCONFIRMED" }> }
  | { status: "UNCONFIRMED" }
  | HospitalContentActionError;

export type HospitalContentReadActionState =
  | { status: "SUCCESS"; content: HospitalContentDetailProjection }
  | { status: "NOT_FOUND" }
  | { status: "FORBIDDEN" }
  | { status: "UNAVAILABLE" };

export type HospitalContentReconciliationActionState =
  | { status: "SUCCESS"; result: HospitalContentReconciliationResult }
  | HospitalContentActionError;

export const initialHospitalContentCreateActionState: HospitalContentCreateActionState = { status: "IDLE" };
export const initialHospitalContentMutationActionState: HospitalContentMutationActionState = { status: "IDLE" };
