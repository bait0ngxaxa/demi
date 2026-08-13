export type HospitalOnboardingSubmitActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      code: "INVALID_INPUT" | "CONFLICT" | "UNAVAILABLE";
      message: string;
    }
  | { status: "SUCCESS" };

export type HospitalOnboardingReviewActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      message: string;
    };

export const initialHospitalOnboardingSubmitActionState: HospitalOnboardingSubmitActionState = {
  status: "IDLE",
};

export const initialHospitalOnboardingReviewActionState: HospitalOnboardingReviewActionState = {
  status: "IDLE",
};
