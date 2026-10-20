export type HospitalNetworkActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message: string; completedAt: number }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "NOT_FOUND" | "UNAVAILABLE";
      message: string;
    };

export const initialHospitalNetworkActionState: HospitalNetworkActionState = { status: "IDLE" };
