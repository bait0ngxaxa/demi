import { z } from "zod";

import { patientBaselineDateOnlySchema } from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import { PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS } from "@/modules/patient-hospital-profile/domain/patient-hospital-profile-values";

import type { CanonicalPatientImportRow } from "./patient-import-contract";

const text = (maximum: number): z.ZodType<string | null> => z.string().min(1).max(maximum).nullable();
const phone = z.string().regex(/^\+?\d+$/u).max(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.phoneNumber).nullable();

export const patientImportProfileSchema = z.object({
  dateOfBirth: patientBaselineDateOnlySchema.nullable(),
  gender: text(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.gender),
  phoneNumber: phone,
  houseNumber: text(200), villageNumber: text(200), villageName: text(200),
  soi: text(200), road: text(200), province: text(200), district: text(200), subdistrict: text(200),
  postalCode: z.string().regex(/^\d{5}$/u).nullable(),
  emergencyContactName: text(PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS.emergencyContactName),
  emergencyContactPhone: phone,
  emergencyContactRelationship: text(200),
}).strict();

export type PatientImportProfile = z.infer<typeof patientImportProfileSchema>;

export function readPatientImportProfile(row: CanonicalPatientImportRow): PatientImportProfile {
  return patientImportProfileSchema.parse({ ...row.demographics, ...row.contact, ...row.address });
}

export function validatePatientImportProfile(row: CanonicalPatientImportRow): boolean {
  return patientImportProfileSchema.safeParse({ ...row.demographics, ...row.contact, ...row.address }).success;
}
