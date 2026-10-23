import type { CaregiverInvitationStatus, CaregiverResource } from "@prisma/client";

/** AF-5: what accepting will share; hospital names only for the signed-in, identity-matched invitee. */
export type CaregiverInvitationRequestedSharingView = {
  relationshipLabel: string | null;
  appointmentHospitalCount: number;
  appointmentHospitalNames: string[] | null;
  resources: CaregiverResource[];
};

export const CAREGIVER_INVITATION_UNAVAILABLE_MESSAGE = "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน";

export type CreateCaregiverInvitationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; invitationUrl: string; expiresAt: string }
  | { status: "ERROR"; message: string };

export type FamilyMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string }
  | { status: "ERROR"; message: string };

export type CaregiverInvitationPreviewActionState =
  | { status: "LOADING" }
  | {
      status: "NEEDS_ACCOUNT";
      invitation: {
        expiresAt: string;
        patientDisplayName: string;
        acceptanceContractVersion: string;
        requestedSharing: CaregiverInvitationRequestedSharingView;
      };
    }
  | {
      status: "READY";
      invitation: {
        invitationStatus: CaregiverInvitationStatus;
        expiresAt: string;
        patientDisplayName: string;
        acceptanceContractVersion: string;
        requestedSharing: CaregiverInvitationRequestedSharingView;
      };
    }
  | { status: "INVALID"; message: string }
  | { status: "NEEDS_LOGIN"; message: string }
  | { status: "ERROR"; message: string };

export const initialCreateCaregiverInvitationActionState: CreateCaregiverInvitationActionState = {
  status: "IDLE",
};
export const initialFamilyMutationActionState: FamilyMutationActionState = { status: "IDLE" };
export const initialCaregiverInvitationPreviewActionState: CaregiverInvitationPreviewActionState = {
  status: "LOADING",
};
