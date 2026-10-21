export type HospitalNetworkActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string; completedAt: number }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" | "UNAVAILABLE";
      message: string;
    };

export const initialHospitalNetworkActionState: HospitalNetworkActionState = { status: "IDLE" };

/** ADR-0018: the plaintext link exists only in this one response; it is never stored or shown again. */
export type ChildOwnerInvitationActionState =
  | { status: "IDLE" }
  | {
      status: "SUCCESS";
      message: string;
      completedAt: number;
      invitation:
        | { kind: "ACTIVATION_LINK"; activationToken: string; activationExpiresAt: string; activationMode: "REMOTE" | "ASSISTED" }
        | { kind: "AWAITING_ACCEPTANCE" }
        | { kind: "ALREADY_ISSUED" };
    }
  | Extract<HospitalNetworkActionState, { status: "ERROR" }>;

export const initialChildOwnerInvitationActionState: ChildOwnerInvitationActionState = { status: "IDLE" };

export type HospitalBulkRegistrationPreviewRowState = {
  rowNumber: number;
  name: string;
  status: "OK" | "INVALID" | "SIMILAR_NAME";
  similarTo: { source: "EXISTING" | "FILE"; name: string; hospitalCode: string | null; status: string | null }[];
};

export type HospitalBulkRegistrationActionState =
  | { status: "IDLE" }
  | { status: "ERROR"; message: string }
  | { status: "PREVIEW"; csvText: string; submissionNonce: string; rows: HospitalBulkRegistrationPreviewRowState[]; message: string | null }
  | { status: "APPLIED"; submissionNonce: string; count: number; replayed: boolean; completedAt: number };

export const initialHospitalBulkRegistrationActionState: HospitalBulkRegistrationActionState = { status: "IDLE" };
