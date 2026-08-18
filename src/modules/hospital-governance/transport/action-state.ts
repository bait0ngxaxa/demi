export type HospitalGovernanceMutationResultState = {
  hospitalId: string;
  status: "ACTIVE" | "SUSPENDED";
  updatedAt: string;
};

export type HospitalGovernanceMutationActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | { status: "SUCCESS"; result: HospitalGovernanceMutationResultState };

export const initialHospitalGovernanceMutationActionState: HospitalGovernanceMutationActionState = {
  status: "IDLE",
};
