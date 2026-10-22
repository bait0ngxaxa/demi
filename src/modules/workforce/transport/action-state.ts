import type {
  HospitalMemberProvisionInput,
  WorkforceActivationMode,
  WorkforceKind,
} from "../schemas/workforce-schemas";

export type WorkforceProvisionResultState = {
  kind: WorkforceKind;
  userId: string;
  hospitalId: string;
  relationshipId: string;
  accountStatus: "PROVISIONED" | "INVITED" | "ACTIVE" | "SUSPENDED";
  relationshipStatus: "PROVISIONED" | "INVITED" | "ACTIVE" | "SUSPENDED" | "ENDED";
  activationRequired: boolean;
  activationToken: string | null;
  activationUrl: string | null;
  activationExpiresAt: string | null;
  activationMode: WorkforceActivationMode | null;
  reusedExistingUser: boolean;
  idempotent: boolean;
};

export type WorkforceActivationResultState = {
  userId: string;
  hospitalId: string;
  kind: WorkforceKind;
  activationToken: string;
  activationUrl: string;
  activationExpiresAt: string;
  activationMode: WorkforceActivationMode;
};

export type WorkforcePasswordResetResultState = {
  userId: string;
  hospitalId: string;
  activationToken: string;
  activationExpiresAt: string;
};

export type WorkforceBulkRowResultState =
  | {
      rowNumber: number;
      status: "created" | "existing";
      activationRequired: boolean;
    }
  | {
      rowNumber: number;
      status: "invalid";
      reason: "INVALID_ROW" | "CONFLICT" | "UNAVAILABLE";
    };

export type WorkforceBulkResultState = {
  kind: WorkforceKind;
  hospitalId: string;
  rows: WorkforceBulkRowResultState[];
};

export type WorkforceMembershipMutationResultState = {
  relationshipId: string;
  hospitalId: string;
  membershipStatus: "ACTIVE" | "SUSPENDED";
  profession: HospitalMemberProvisionInput["profession"] | null;
  updatedAt: string;
};

export type WorkforceOsmRelationshipMutationResultState = {
  relationshipId: string;
  hospitalId: string;
  relationshipStatus: "ACTIVE" | "SUSPENDED";
  updatedAt: string;
};

export type WorkforceOwnerGovernanceMutationResultState = {
  relationshipId: string;
  hospitalId: string;
  membershipType: "OWNER" | "MEMBER";
  updatedAt: string;
};

export type WorkforceField =
  | "nationalId"
  | "givenName"
  | "familyName"
  | "targetHospitalId"
  | "profession"
  | "userId"
  | "relationshipId"
  | "expectedUpdatedAt";

export type WorkforceErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "CONFLICT"
  | "CONFIGURATION"
  | "UNAVAILABLE";

export type WorkforceProvisionActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
      fieldErrors?: Partial<Record<WorkforceField, string>>;
    }
  | { status: "SUCCESS"; result: WorkforceProvisionResultState };

export type WorkforceActivationActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
      fieldErrors?: Partial<Record<WorkforceField, string>>;
    }
  | { status: "SUCCESS"; result: WorkforceActivationResultState };

export type WorkforceCompletionActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
      fieldErrors?: { nationalId?: string; password?: string; passwordConfirmation?: string };
    }
  | { status: "SUCCESS" };

export type WorkforcePasswordResetActionState =
  | { status: "IDLE" }
  | { status: "ERROR"; code: WorkforceErrorCode; message: string }
  | { status: "SUCCESS"; result: WorkforcePasswordResetResultState };

export type WorkforceBulkActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
      duplicateRowNumbers?: number[];
    }
  | { status: "SUCCESS"; result: WorkforceBulkResultState };

export type WorkforceActivationPreviewState =
  | { status: "SUCCESS"; maskedName: string; purpose: "ACTIVATION" | "RESET" | "CHILD_OWNER_ONBOARDING" }
  | { status: "ERROR"; message: string };

export type WorkforceMembershipMutationActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
    }
  | { status: "SUCCESS"; result: WorkforceMembershipMutationResultState };

export type WorkforceOsmRelationshipMutationActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
    }
  | { status: "SUCCESS"; result: WorkforceOsmRelationshipMutationResultState };

export type WorkforceReportExportGrantActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
    }
  | { status: "SUCCESS"; granted: boolean };

export const initialWorkforceReportExportGrantActionState: WorkforceReportExportGrantActionState = {
  status: "IDLE",
};

export type WorkforceOwnerGovernanceMutationActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: WorkforceErrorCode;
      message: string;
    }
  | { status: "SUCCESS"; result: WorkforceOwnerGovernanceMutationResultState };

/**
 * `outcome` says what the server proved, which `success: false` alone cannot: `UNAVAILABLE` may follow a
 * committed release, so only the other failure outcomes are confirmed refusals.
 */
export type WorkforceReleaseOutcome =
  | "RELEASED"
  | "INVALID_CONFIRMATION"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAVAILABLE";

export type WorkforceReleaseActionState = {
  message: string;
  success: boolean;
  outcome: WorkforceReleaseOutcome | null;
};

export const initialWorkforceReleaseActionState: WorkforceReleaseActionState = {
  message: "",
  success: false,
  outcome: null,
};

export const initialWorkforceProvisionActionState: WorkforceProvisionActionState = {
  status: "IDLE",
};

export const initialWorkforceActivationActionState: WorkforceActivationActionState = {
  status: "IDLE",
};

export const initialWorkforceCompletionActionState: WorkforceCompletionActionState = {
  status: "IDLE",
};

export const initialWorkforceMembershipMutationActionState: WorkforceMembershipMutationActionState = {
  status: "IDLE",
};

export const initialWorkforceOsmRelationshipMutationActionState: WorkforceOsmRelationshipMutationActionState = {
  status: "IDLE",
};

export const initialWorkforceOwnerGovernanceMutationActionState: WorkforceOwnerGovernanceMutationActionState = {
  status: "IDLE",
};

export const initialWorkforcePasswordResetActionState: WorkforcePasswordResetActionState = {
  status: "IDLE",
};

export const initialWorkforceBulkActionState: WorkforceBulkActionState = {
  status: "IDLE",
};
