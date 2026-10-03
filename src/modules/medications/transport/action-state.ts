import type { PersonalMedicationDto } from "../domain/personal-medication-definitions";

export type PersonalMedicationActionState = {
  status: "IDLE" | "SUCCESS" | "ERROR" | "CONFLICT";
  message?: string;
  item?: PersonalMedicationDto;
  fieldErrors?: Partial<Record<"medicationName" | "instructionText" | "times", string>>;
  refreshRequired?: boolean;
};
export const INITIAL_PERSONAL_MEDICATION_ACTION_STATE: PersonalMedicationActionState = { status: "IDLE" };
