export type HospitalOnboardingField =
  | "hospitalCode"
  | "nationalId"
  | "givenName"
  | "familyName"
  | "password"
  | "passwordConfirmation"
  | "acceptLegal";

export type HospitalOnboardingFieldErrors = Partial<
  Record<HospitalOnboardingField, string>
>;

export type HospitalOnboardingSubmitActionState =
  | { status: "IDLE" }
  | {
      status: "ERROR";
      /** LEGAL_VERSION_CHANGED is recoverable: the screen reloads the current versions and asks again. */
      code: "INVALID_INPUT" | "CONFLICT" | "UNAVAILABLE" | "LEGAL_VERSION_CHANGED";
      message: string;
      fieldErrors?: HospitalOnboardingFieldErrors;
    }
  | { status: "SUCCESS" };

export type HospitalOnboardingReviewActionState =
  | { status: "IDLE" }
  | {
      status: "SUCCESS";
      decision: "APPROVED" | "REJECTED";
    }
  | {
      status: "ERROR";
      code: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_INPUT" | "UNAVAILABLE";
      message: string;
    };

/** Added only to a hydrated client submission to select a returned action result. */
export const HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD = "__reviewResponseMode";
export const HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT = "enhanced-client";

export const initialHospitalOnboardingSubmitActionState: HospitalOnboardingSubmitActionState = {
  status: "IDLE",
};

export const initialHospitalOnboardingReviewActionState: HospitalOnboardingReviewActionState = {
  status: "IDLE",
};
