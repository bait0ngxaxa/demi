import { z } from "zod";
import {
  INSTRUCTION_TEXT_MAX_LENGTH, INSTRUCTION_TEXT_RAW_MAX_LENGTH,
  MEDICATION_NAME_MAX_LENGTH, MEDICATION_NAME_RAW_MAX_LENGTH,
} from "../domain/personal-medication-definitions";

// Lengths use JavaScript UTF-16 code units, including raw input before normalization.
const medicationName = z.string().max(MEDICATION_NAME_RAW_MAX_LENGTH)
  .transform((value) => value.trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(1).max(MEDICATION_NAME_MAX_LENGTH));
const instructionText = z.string().max(INSTRUCTION_TEXT_RAW_MAX_LENGTH).nullable().optional()
  .transform((value) => value?.trim() || null)
  .pipe(z.string().max(INSTRUCTION_TEXT_MAX_LENGTH).nullable());
const versionFields = {
  medicationId: z.string().uuid().transform((value) => value.toLowerCase()),
  expectedUpdatedAt: z.string().max(40).datetime({ offset: true }),
};

export const personalMedicationCreateSchema = z.object({ medicationName, instructionText }).strict();
export const personalMedicationUpdateSchema = z.object({ ...versionFields, medicationName, instructionText }).strict();
export const personalMedicationStopSchema = z.object(versionFields).strict();
export const personalMedicationListSchema = z.object({
  status: z.enum(["ACTIVE", "STOPPED"]),
  cursor: z.string().uuid().transform((value) => value.toLowerCase()).nullable().optional(),
}).strict();
export const personalMedicationIdSchema = z.string().uuid().transform((value) => value.toLowerCase());
