export type PatientServiceMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS" }
  | { status: "ERROR"; message: string };

export const initialPatientServiceMutationActionState: PatientServiceMutationActionState = {
  status: "IDLE",
};
