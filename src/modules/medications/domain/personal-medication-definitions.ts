export const MEDICATION_NAME_MAX_LENGTH = 200;
export const INSTRUCTION_TEXT_MAX_LENGTH = 2_000;
export const MEDICATION_NAME_RAW_MAX_LENGTH = 1_000;
export const INSTRUCTION_TEXT_RAW_MAX_LENGTH = 4_000;
export const PERSONAL_MEDICATION_PAGE_SIZE = 50;

export type PersonalMedicationDto = {
  id: string;
  medicationName: string;
  instructionText: string | null;
  status: "ACTIVE" | "STOPPED";
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonalMedicationPage = {
  items: PersonalMedicationDto[];
  nextCursor: string | null;
};
