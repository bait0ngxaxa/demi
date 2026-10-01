import type {
  PatientAccessRequestResolution,
  PatientAccessRequestStatus,
} from "@prisma/client";

export type PublicPatientAccessRequestActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS" }
  | { status: "ERROR"; message: string };

export type PatientAccessRequestReviewActionState =
  | { status: "IDLE" }
  | {
      status: "SUCCESS";
      requestStatus: PatientAccessRequestStatus;
      resolution: PatientAccessRequestResolution | null;
    }
  | { status: "ERROR"; message: string };

export type PatientAccessRequestWithdrawalActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS" }
  | { status: "ERROR"; message: string };

export const initialPublicPatientAccessRequestActionState: PublicPatientAccessRequestActionState = {
  status: "IDLE",
};

export const initialPatientAccessRequestReviewActionState: PatientAccessRequestReviewActionState = {
  status: "IDLE",
};

export const initialPatientAccessRequestWithdrawalActionState: PatientAccessRequestWithdrawalActionState = {
  status: "IDLE",
};
