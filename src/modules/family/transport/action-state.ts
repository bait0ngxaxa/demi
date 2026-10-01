import type { CaregiverInvitationStatus } from "@prisma/client";

export type CreateCaregiverInvitationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; token: string; expiresAt: string }
  | { status: "ERROR"; message: string };

export type FamilyMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; message: string };

export type CaregiverInvitationPreviewActionState =
  | { status: "LOADING" }
  | {
      status: "READY";
      invitation: {
        invitationStatus: CaregiverInvitationStatus;
        expiresAt: string;
        patientDisplayName: string;
        acceptanceContractVersion: string;
      };
    }
  | { status: "INVALID"; message: string }
  | { status: "NOT_RECIPIENT"; message: string }
  | { status: "NEEDS_LOGIN"; message: string }
  | { status: "ERROR"; message: string };

export const initialCreateCaregiverInvitationActionState: CreateCaregiverInvitationActionState = {
  status: "IDLE",
};
export const initialFamilyMutationActionState: FamilyMutationActionState = { status: "IDLE" };
export const initialCaregiverInvitationPreviewActionState: CaregiverInvitationPreviewActionState = {
  status: "LOADING",
};
