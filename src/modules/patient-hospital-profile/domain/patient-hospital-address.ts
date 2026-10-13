export const PATIENT_HOSPITAL_ADDRESS_FIELDS = [
  "houseNumber", "villageNumber", "villageName", "soi", "road",
  "province", "district", "subdistrict", "postalCode",
] as const;

export type PatientHospitalAddress = Record<(typeof PATIENT_HOSPITAL_ADDRESS_FIELDS)[number], string | null>;

/** Structured import data is authoritative; free text is used only without components. */
export function formatPatientHospitalAddress(
  profile: Partial<PatientHospitalAddress> & { addressText: string | null },
): string | null {
  const bangkok = profile.province === "กรุงเทพมหานคร" || profile.province === "กรุงเทพฯ";
  const prefix = (value: string | null | undefined, label: string): string | null =>
    value ? value.startsWith(label) ? value : `${label}${value}` : null;
  const parts = [
    profile.houseNumber,
    prefix(profile.villageNumber, "หมู่ "),
    profile.villageName,
    prefix(profile.soi, "ซอย"),
    prefix(profile.road, "ถนน"),
    prefix(profile.subdistrict, bangkok ? "แขวง" : "ตำบล"),
    prefix(profile.district, bangkok ? "เขต" : "อำเภอ"),
    bangkok ? profile.province : prefix(profile.province, "จังหวัด"),
    profile.postalCode,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" ") : profile.addressText;
}

export const patientHospitalAddressSelect = {
  houseNumber: true, villageNumber: true, villageName: true, soi: true,
  road: true, province: true, district: true, subdistrict: true, postalCode: true,
} as const;
