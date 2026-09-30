export type PatientHospitalProfileUpdateActionState = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  code?: "INVALID_INPUT" | "CONFLICT" | "UNAVAILABLE";
  message?: string;
};

export const initialPatientHospitalProfileUpdateActionState: PatientHospitalProfileUpdateActionState = {
  status: "IDLE",
};
