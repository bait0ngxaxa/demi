export type LoginActionState = {
  status: "IDLE" | "ERROR";
  code?:
    | "INVALID_INPUT"
    | "INVALID_CREDENTIALS"
    | "APPLICATION_ACCESS_DENIED"
    | "AUTH_INFRASTRUCTURE_FAILURE";
  message?: string;
};

export type LogoutActionState = {
  status: "IDLE" | "ERROR";
  message?: string;
};

export const initialLoginActionState: LoginActionState = { status: "IDLE" };
export const initialLogoutActionState: LogoutActionState = { status: "IDLE" };
