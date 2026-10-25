export type PasswordChangeActionState = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message?: string;
  fieldErrors?: { currentPassword?: string };
};

export const initialPasswordChangeActionState: PasswordChangeActionState = {
  status: "IDLE",
};

export type AccountRecoveryIssueActionState = {
  status: "IDLE" | "ISSUED" | "ERROR";
  message?: string;
  handoffUrl?: string;
  expiresAt?: string;
};

export const initialAccountRecoveryIssueActionState: AccountRecoveryIssueActionState = {
  status: "IDLE",
};

export type AccountRecoveryAvailabilityActionState = {
  status: "READY" | "INVALID";
};

export type AccountRecoveryCompletionActionState = {
  status: "IDLE" | "COMPLETED" | "ERROR";
  message?: string;
  fieldErrors?: { newPassword?: string };
};

export const initialAccountRecoveryCompletionActionState: AccountRecoveryCompletionActionState = {
  status: "IDLE",
};
