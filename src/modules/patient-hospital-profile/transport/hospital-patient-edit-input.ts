// Moved from hospital-patient-edit-actions.ts: a "use server" module may export only async functions,
// and the form contract tests run these reads (tests/support/form-contract.ts). The reads are unchanged.

/** Every posted entry, as is; staffPatientHospitalProfileUpdateSchema (strict) validates it in the service. */
export function buildStaffPatientProfileInput(formData: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(formData.entries());
}

/** Every posted entry with the year as a number; patientHealthHistorySchema (strict) validates it in the service. */
export function buildPatientHealthHistoryInput(formData: FormData): Record<string, unknown> {
  const input = Object.fromEntries(formData.entries());
  return { ...input,
    diagnosisYear: input.diagnosisYear ? Number(input.diagnosisYear) : null,
    otherConditions: input.otherConditions || null,
  };
}
