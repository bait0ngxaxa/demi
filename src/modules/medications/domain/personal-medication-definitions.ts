export const MEDICATION_NAME_MAX_LENGTH = 200;
export const INSTRUCTION_TEXT_MAX_LENGTH = 2_000;
export const MEDICATION_NAME_RAW_MAX_LENGTH = 1_000;
export const INSTRUCTION_TEXT_RAW_MAX_LENGTH = 4_000;
export const PERSONAL_MEDICATION_PAGE_SIZE = 50;
export const MEDICATION_SCHEDULE_MAX_TIMES = 1_440;
export const MEDICATION_SCHEDULE_MAX_FIELDS = 3;
export const MEDICATION_ID_RAW_MAX_LENGTH = 36;
export const MEDICATION_VERSION_RAW_MAX_LENGTH = 40;
export const MEDICATION_SCHEDULE_JSON_MAX_LENGTH = 12_000;
export const MEDICATION_SCHEDULE_FORM_MAX_BYTES = 16 * 1_024;
export const MEDICATION_LOCAL_TIME_PATTERN = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

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

export type PersonalMedicationDetailDto = PersonalMedicationDto & {
  schedules: Array<{ localTime: string }>;
};
