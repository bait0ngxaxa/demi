export type PatientServiceMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message?: string }
  | { status: "ERROR"; message: string; conflict?: boolean };

export const initialPatientServiceMutationActionState: PatientServiceMutationActionState = {
  status: "IDLE",
};
