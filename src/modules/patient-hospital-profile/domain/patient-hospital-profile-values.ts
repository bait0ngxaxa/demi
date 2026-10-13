import { formatPatientHospitalAddress, type PatientHospitalAddress } from "./patient-hospital-address";

export const PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS = {
  gender: 64,
  phoneNumber: 32,
  addressText: 2000,
  emergencyContactName: 200,
  emergencyContactPhone: 32,
  occupation: 200,
  educationLevel: 200,
} as const;

export const PATIENT_HOSPITAL_PROFILE_FIELDS = [
  "gender",
  "phoneNumber",
  "addressText",
  "emergencyContactName",
  "emergencyContactPhone",
  "occupation",
  "educationLevel",
] as const;

export type PatientHospitalProfileField = (typeof PATIENT_HOSPITAL_PROFILE_FIELDS)[number];

export type PatientHospitalProfileValues = Record<PatientHospitalProfileField, string | null>;

export type PatientHospitalProfileSource = "HOSPITAL_LOCAL" | "LEGACY_FALLBACK";

export type EffectivePatientHospitalProfile = {
  values: PatientHospitalProfileValues;
  source: PatientHospitalProfileSource;
  version: number;
  emergencyContactRelationship: string | null;
};

export type PatientHospitalProfilePatch = Partial<PatientHospitalProfileValues>;

export function resolveEffectivePatientHospitalProfile(input: {
  legacy: PatientHospitalProfileValues;
  local: (PatientHospitalProfileValues & Partial<PatientHospitalAddress> & {
    version: number; emergencyContactRelationship?: string | null;
  }) | null;
}): EffectivePatientHospitalProfile {
  if (input.local) {
    return {
      values: {
        gender: input.local.gender,
        phoneNumber: input.local.phoneNumber,
        addressText: formatPatientHospitalAddress(input.local),
        emergencyContactName: input.local.emergencyContactName,
        emergencyContactPhone: input.local.emergencyContactPhone,
        occupation: input.local.occupation,
        educationLevel: input.local.educationLevel,
      },
      source: "HOSPITAL_LOCAL",
      version: input.local.version,
      emergencyContactRelationship: input.local.emergencyContactRelationship ?? null,
    };
  }

  return {
    values: input.legacy,
    source: "LEGACY_FALLBACK",
    version: 0,
    emergencyContactRelationship: null,
  };
}

export function applyPatientHospitalProfilePatch(
  base: PatientHospitalProfileValues,
  patch: PatientHospitalProfilePatch,
): PatientHospitalProfileValues {
  return {
    gender: patch.gender === undefined ? base.gender : patch.gender,
    phoneNumber: patch.phoneNumber === undefined ? base.phoneNumber : patch.phoneNumber,
    addressText: patch.addressText === undefined ? base.addressText : patch.addressText,
    emergencyContactName:
      patch.emergencyContactName === undefined
        ? base.emergencyContactName
        : patch.emergencyContactName,
    emergencyContactPhone:
      patch.emergencyContactPhone === undefined
        ? base.emergencyContactPhone
        : patch.emergencyContactPhone,
    occupation: patch.occupation === undefined ? base.occupation : patch.occupation,
    educationLevel:
      patch.educationLevel === undefined ? base.educationLevel : patch.educationLevel,
  };
}
