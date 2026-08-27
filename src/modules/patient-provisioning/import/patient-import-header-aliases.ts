import type { PatientImportFieldKey } from "./patient-import-contract";

export type PatientImportHeaderBinding = {
  field: PatientImportFieldKey;
  columnNumber: number;
  sourceHeader: string;
  normalizedHeader: string;
  heightUnit: "cm" | "m" | null;
};

const explicitHeaderAliases: ReadonlyArray<readonly [string, PatientImportFieldKey]> = [
  ["thai national id", "nationalId"],
  ["national id", "nationalId"],
  ["เลขบัตรประชาชน", "nationalId"],
  ["เลขประจำตัวประชาชน", "nationalId"],
  ["first name", "givenName"],
  ["given name", "givenName"],
  ["ชื่อ", "givenName"],
  ["ชื่อคนไข้", "givenName"],
  ["ชื่อผู้ป่วย", "givenName"],
  ["last name", "familyName"],
  ["family name", "familyName"],
  ["นามสกุล", "familyName"],
  ["สกุล", "familyName"],
  ["hn", "hospitalNumber"],
  ["hn รพ", "hospitalNumber"],
  ["เลข hn", "hospitalNumber"],
  ["hospital number", "hospitalNumber"],
  ["hospitalnumber", "hospitalNumber"],
  ["วันเกิด", "dateOfBirth"],
  ["วันเกิด(พ.ศ.)", "dateOfBirth"],
  ["วันเดือน ปีเกิด พศ.", "dateOfBirth"],
  ["วัน เดือน ปีเกิด พ.ศ.", "dateOfBirth"],
  ["date of birth", "dateOfBirth"],
  ["dob", "dateOfBirth"],
  ["เพศ", "gender"],
  ["gender", "gender"],
  ["sex", "gender"],
  ["เบอร์โทร", "phoneNumber"],
  ["เบอร์โทรศัพท์", "phoneNumber"],
  ["เบอร์โทร ผู้รับบริการ", "phoneNumber"],
  ["โทรศัพท์", "phoneNumber"],
  ["phone", "phoneNumber"],
  ["phone number", "phoneNumber"],
  ["mobile", "phoneNumber"],
  ["น้ำหนัก", "weight"],
  ["น้ำหนัก kg", "weight"],
  ["น้ำหนัก (kg)", "weight"],
  ["weight", "weight"],
  ["bw.", "weight"],
  ["ส่วนสูง", "height"],
  ["ส่วนสูง (เมตร)", "height"],
  ["ส่วนสูง(cm)", "height"],
  ["height", "height"],
  ["รอบเอว(ซม.)", "waistCircumference"],
  ["รอบเอว (ซม.)", "waistCircumference"],
  ["รอบเอว", "waistCircumference"],
  ["waist circumference", "waistCircumference"],
  ["waist (cm)", "waistCircumference"],
  ["ประเภทเบาหวาน", "diabetesClassification"],
  ["ประเภทเบาหวาน กลุ่มเสี่ยง หรือเบาหวาน (ไม่ต้องมี type)", "diabetesClassification"],
  ["กลุ่มเสี่ยง หรือ เบาหวาน", "diabetesClassification"],
  ["risk group", "diabetesClassification"],
  ["ค่าน้ำตาลในเลือด", "bloodSugarDtx"],
  ["ค่าน้ำตาล", "bloodSugar"],
  ["blood sugar", "bloodSugar"],
  ["blood glucose", "bloodSugar"],
  ["ค่า hba1c ล่าสุด (ถ้ามี)", "hba1c"],
  ["hba1c", "hba1c"],
  ["a1c", "hba1c"],
  ["โรงพยาบาล", "hospitalName"],
  ["hospital", "hospitalName"],
  ["รพ.สต.", "subHospitalName"],
  ["รพสต.", "subHospitalName"],
  ["รพ.สต", "subHospitalName"],
  ["รพสต", "subHospitalName"],
  ["sub-hospital", "subHospitalName"],
  ["โรงพยาบาล หรือ รพสต.", "organizationCombinedText"],
  ["โรงพยาบาล หรือ รพ.สต", "organizationCombinedText"],
  ["โรงพยาบาล หรือ รพสต", "organizationCombinedText"],
  ["บ้านเลขที่", "houseNumber"],
  ["house number", "houseNumber"],
  ["หมู่ที่/ชุมชน", "villageNumber"],
  ["หมู่ที่", "villageNumber"],
  ["หมู่", "villageNumber"],
  ["village", "villageName"],
  ["หมู่บ้าน", "villageName"],
  ["ซอย", "soi"],
  ["soi", "soi"],
  ["ถนน", "road"],
  ["road", "road"],
  ["จังหวัด", "province"],
  ["province", "province"],
  ["อำเภอ", "district"],
  ["district", "district"],
  ["ตำบล", "subdistrict"],
  ["subdistrict", "subdistrict"],
  ["รหัสไปรษณีย์", "postalCode"],
  ["postcode", "postalCode"],
  ["postal code", "postalCode"],
  ["ชื่อผู้ติดต่อ(ญาติ)", "emergencyContactName"],
  ["ชื่อผู้ติดต่อ", "emergencyContactName"],
  ["ผู้ติดต่อฉุกเฉิน", "emergencyContactName"],
  ["ชื่อผู้ติดต่อฉุกเฉิน", "emergencyContactName"],
  ["เบอร์ผู้ติดต่อ", "emergencyContactPhone"],
  ["เบอร์โทรผู้ติดต่อ", "emergencyContactPhone"],
  ["เบอร์โทรฉุกเฉิน", "emergencyContactPhone"],
  ["ความสัมพันธ์", "emergencyContactRelationship"],
  ["ความสัมพันธ์กับผู้ติดต่อ", "emergencyContactRelationship"],
  ["relationship", "emergencyContactRelationship"],
  ["ชื่อผู้ดูแล (อสม.)", "osmCaregiverName"],
  ["ชื่อผู้ดูแล(อสม)", "osmCaregiverName"],
  ["ผู้ดูแล(อสม.)", "osmCaregiverName"],
  ["ผู้ดูแล(อสม)", "osmCaregiverName"],
  ["โค้ช", "osmCaregiverName"],
  ["โค้ชผู้ดูแล", "osmCaregiverName"],
  ["coach", "osmCaregiverName"],
  ["ที่", "sourceSequenceNumber"],
  ["ลำดับ", "sourceSequenceNumber"],
  ["ลำดับที่", "sourceSequenceNumber"],
  ["pid", "externalPatientId"],
  ["อายุ(ปี)", "ageAtRoster"],
  ["age", "ageAtRoster"],
  ["ที่อยู่", "addressText"],
  ["รายละเอียดที่อยู่", "addressText"],
  ["bp", "bloodPressureText"],
  ["ความดัน", "bloodPressureText"],
  ["blood pressure", "bloodPressureText"],
  ["p", "pulseRate"],
  ["ชีพจร", "pulseRate"],
  ["pulse", "pulseRate"],
  ["bmi", "bmi"],
  ["ค่า dtx", "dtxReading"],
  ["dtx", "dtxReading"],
  ["ปัญหา/ปัจจัยเสี่ยง", "riskFactorText"],
  ["ชื่อ สกุล", "combinedNameText"],
];

function normalizeUnicodeWhitespace(value: string): string {
  return value.replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]+/gu, " ");
}

export function normalizePatientImportHeader(value: string): string {
  return normalizeUnicodeWhitespace(value)
    .replace(/^\uFEFF/u, "")
    .normalize("NFC")
    .trim()
    .replace(/\s*([().,/:\-])\s*/gu, "$1")
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

const aliasMap = new Map<string, PatientImportFieldKey>(
  explicitHeaderAliases.map(([alias, field]) => [normalizePatientImportHeader(alias), field]),
);

function compactHeader(value: string): string {
  return value.replace(/\s+/gu, "");
}

function resolveRepeatedOperationalHeader(
  normalizedHeader: string,
): PatientImportFieldKey | null {
  const compact = compactHeader(normalizedHeader);

  if (/^วันเดือนปีที่รับบริการครั้งที่\d+$/u.test(compact)) {
    return "serviceVisitDate";
  }

  if (
    /^(น้ำหนัก\d*|รอบเอว\d*|ค่าdtx\d*|สรุป(?:น้ำหนัก|dtx)?|ผลสรุป(?:น้ำหนัก|dtx)?)(ครั้งที่\d+)?$/u.test(
      compact,
    )
  ) {
    return "extendedMeasurementSeries";
  }

  return null;
}

export function resolvePatientImportHeaderField(
  sourceHeader: string,
): { field: PatientImportFieldKey; heightUnit: "cm" | "m" | null } | null {
  const normalizedHeader = normalizePatientImportHeader(sourceHeader);
  const field = aliasMap.get(normalizedHeader) ?? resolveRepeatedOperationalHeader(normalizedHeader);

  if (!field) {
    return null;
  }

  let heightUnit: "cm" | "m" | null = null;

  if (field === "height") {
    if (normalizedHeader === normalizePatientImportHeader("ส่วนสูง")) {
      heightUnit = "cm";
    } else if (normalizedHeader.includes("เมตร") || normalizedHeader.endsWith("(m)")) {
      heightUnit = "m";
    } else if (normalizedHeader.includes("cm") || normalizedHeader.includes("ซม")) {
      heightUnit = "cm";
    }
  }

  return { field, heightUnit };
}

export function createPatientImportHeaderBinding(
  sourceHeader: string,
  columnNumber: number,
): PatientImportHeaderBinding | null {
  const resolved = resolvePatientImportHeaderField(sourceHeader);

  if (!resolved) {
    return null;
  }

  return {
    field: resolved.field,
    columnNumber,
    sourceHeader: sourceHeader.trim(),
    normalizedHeader: normalizePatientImportHeader(sourceHeader),
    heightUnit: resolved.heightUnit,
  };
}

export const patientImportHeaderAliases = Object.freeze(
  explicitHeaderAliases.map(([alias, field]) => ({ alias, field })),
);
