import type { CaregiverRelationshipLabel, CaregiverResource } from "@prisma/client";

/** AF-5: labels the Patient picks for a caregiver. A label describes; it never proves kinship or grants access. */
export const CAREGIVER_RELATIONSHIP_LABELS: Readonly<Record<CaregiverRelationshipLabel, string>> = {
  SPOUSE: "คู่สมรส",
  CHILD: "บุตร",
  PARENT: "บิดาหรือมารดา",
  SIBLING: "พี่น้อง",
  GRANDCHILD: "หลาน",
  RELATIVE: "ญาติ",
  OTHER: "อื่น ๆ",
};
export const CAREGIVER_RELATIONSHIP_LABEL_OTHER_MAX = 50;

export function formatCaregiverRelationshipLabel(kind: CaregiverRelationshipLabel | null, other: string | null): string | null {
  if (kind === null) return null;
  return kind === "OTHER" && other ? other : CAREGIVER_RELATIONSHIP_LABELS[kind];
}

/** HEALTH_PLAN and MEDICATION stay behind FAMILY_PLAN_MEDICATION_SHARING_ENABLED until the agency approves (G-01). */
export const PLAN_MEDICATION_RESOURCES: readonly CaregiverResource[] = ["HEALTH_PLAN", "MEDICATION"];

export function isPlanMedicationResource(resource: CaregiverResource): boolean {
  return PLAN_MEDICATION_RESOURCES.includes(resource);
}

export const CAREGIVER_RESOURCE_CONTRACTS: Readonly<Record<CaregiverResource, string>> = {
  PROFILE_SUMMARY: "family-profile-summary-v1",
  HEALTH_PLAN: "family-health-plan-v1",
  MEDICATION: "family-medication-v1",
};

export const CAREGIVER_RESOURCE_LABELS: Readonly<Record<CaregiverResource, string>> = {
  PROFILE_SUMMARY: "ข้อมูลทั่วไป",
  HEALTH_PLAN: "แผนสุขภาพ",
  MEDICATION: "ยา",
};

/** Exact text the caregiver accepts for each resource contract version. */
export const CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS: Readonly<Record<CaregiverResource, string>> = {
  PROFILE_SUMMARY: "คุณยอมรับสิทธิ์ดูข้อมูลทั่วไปของบุคคลนี้ ได้แก่ อายุ ชื่อ อสม. ที่ดูแล และเบอร์โทรของโรงพยาบาลหรือ รพ.สต. ที่ยังดูแลอยู่ โดยไม่เห็นเบอร์โทรส่วนตัวของผู้ป่วยหรือของ อสม. สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้",
  HEALTH_PLAN: "คุณยอมรับสิทธิ์ดูแผนสุขภาพปัจจุบันของบุคคลนี้แบบอ่านอย่างเดียว ได้แก่ เป้าหมายหลัก ค่าเป้าหมาย และกิจกรรมตามแผนล่าสุดของแต่ละหน่วยบริการที่ยังดูแลอยู่ โดยไม่เห็นบันทึกข้อความของเจ้าหน้าที่หรือผู้ป่วย สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้",
  MEDICATION: "คุณยอมรับสิทธิ์ดูรายการยาที่บุคคลนี้บันทึกไว้และยังใช้อยู่ ได้แก่ ชื่อยาและเวลาที่ต้องใช้ยา โดยไม่เห็นคำแนะนำการใช้ยาที่ผู้ป่วยบันทึก สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้",
};
