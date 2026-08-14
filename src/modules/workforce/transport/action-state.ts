import type { WorkforceActivationMode, WorkforceKind } from "../schemas/workforce-schemas";

export type WorkforceProvisionResultState = {
  kind: WorkforceKind;
  userId: string;
  hospitalId: string;
  relationshipId: string;
  accountStatus: "PROVISIONED" | "INVITED" | "ACTIVE" | "SUSPENDED";
  relationshipStatus: "PROVISIONED" | "INVITED" | "ACTIVE" | "SUSPENDED";
  activationRequired: boolean;
  activationToken: string | null;
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
  activationExpiresAt: string;
  activationMode: WorkforceActivationMode;
};

export type WorkforceField =
  | "nationalId"
  | "givenName"
  | "familyName"
  | "targetHospitalId"
  | "profession"
  | "userId";

export type WorkforceErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "CONFLICT"
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
      fieldErrors?: { password?: string; passwordConfirmation?: string };
    }
  | { status: "SUCCESS" };

export const initialWorkforceProvisionActionState: WorkforceProvisionActionState = {
  status: "IDLE",
};

export const initialWorkforceActivationActionState: WorkforceActivationActionState = {
  status: "IDLE",
};

export const initialWorkforceCompletionActionState: WorkforceCompletionActionState = {
  status: "IDLE",
};
