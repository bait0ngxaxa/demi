export type PatientServiceMutationActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; message?: string; appointment?: { relationshipId: string; appointmentId: string } }
  | { status: "ERROR"; message: string; conflict?: boolean };

export const initialPatientServiceMutationActionState: PatientServiceMutationActionState = {
  status: "IDLE",
};
