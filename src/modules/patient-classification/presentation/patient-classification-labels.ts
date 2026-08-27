import type {
  PatientClassificationSource,
  PatientClassificationType,
} from "../schemas/patient-classification-schemas";

export const patientClassificationLabels: Record<PatientClassificationType, string> = {
  RISK: "กลุ่มเสี่ยง",
  DIABETES: "เบาหวาน",
};

export const patientClassificationSourceLabels: Record<PatientClassificationSource, string> = {
  ROSTER_IMPORT: "นำเข้าจาก roster",
  MANUAL: "แก้ไขในระบบ",
};

export function getPatientClassificationLabel(
  classification: PatientClassificationType | null | undefined,
): string {
  return classification ? patientClassificationLabels[classification] : "ยังไม่มีสถานะ";
}
