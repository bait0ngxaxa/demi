export const PATIENT_HOSPITAL_PROFILE_FIELD_LIMITS = {
  gender: 64,
  phoneNumber: 32,
  addressText: 500,
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
};

export type PatientHospitalProfilePatch = Partial<PatientHospitalProfileValues>;

export function resolveEffectivePatientHospitalProfile(input: {
  legacy: PatientHospitalProfileValues;
  local: (PatientHospitalProfileValues & { version: number }) | null;
}): EffectivePatientHospitalProfile {
  if (input.local) {
    return {
      values: {
        gender: input.local.gender,
        phoneNumber: input.local.phoneNumber,
        addressText: input.local.addressText,
        emergencyContactName: input.local.emergencyContactName,
        emergencyContactPhone: input.local.emergencyContactPhone,
        occupation: input.local.occupation,
        educationLevel: input.local.educationLevel,
      },
      source: "HOSPITAL_LOCAL",
      version: input.local.version,
    };
  }

  return {
    values: input.legacy,
    source: "LEGACY_FALLBACK",
    version: 0,
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
