export const FAMILY_APPOINTMENT_READ_CONTRACT = "family-appointment-read-v1";
/** AF-5: adds location detail, the appointer, the OSM at creation, the parent Hospital and a 90-day history. */
export const FAMILY_APPOINTMENT_READ_CONTRACT_V2 = "family-appointment-read-v2";
/** SR-C1: v2 scope plus the appointment's service and source (hospital-booked or Patient-requested). */
export const FAMILY_APPOINTMENT_READ_CONTRACT_V3 = "family-appointment-read-v3";
/** Every version a caregiver may still hold, oldest first; new proposals always use the latest. */
export const FAMILY_APPOINTMENT_READ_CONTRACTS = [FAMILY_APPOINTMENT_READ_CONTRACT, FAMILY_APPOINTMENT_READ_CONTRACT_V2, FAMILY_APPOINTMENT_READ_CONTRACT_V3] as const;
export type FamilyAppointmentReadContract = (typeof FAMILY_APPOINTMENT_READ_CONTRACTS)[number];
export const FAMILY_APPOINTMENT_LATEST_READ_CONTRACT = FAMILY_APPOINTMENT_READ_CONTRACT_V3;
export const FAMILY_APPOINTMENT_PAGE_SIZE = 50;
export const FAMILY_APPOINTMENT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export const FAMILY_APPOINTMENT_ACCEPTANCE_TEXT = "คุณยอมรับสิทธิ์ดูข้อมูลนัดหมายของบุคคลนี้สำหรับหน่วยบริการที่ระบุ โดยเห็นเฉพาะชื่อหน่วยบริการ ประเภทนัด วันและเวลา ระยะเวลา รูปแบบสถานที่ และสถานะนัด สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย คุณจะเห็นนัดที่เข้าเกณฑ์ในช่วง 90 วันข้างหน้าอย่างต่อเนื่อง รวมถึงนัดใหม่ในหน่วยบริการและขอบเขตเดิม สิทธิ์ไม่มีวันหมดอายุอัตโนมัติ แต่ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้";

export const FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2 = "คุณยอมรับสิทธิ์ดูข้อมูลนัดหมายของบุคคลนี้สำหรับหน่วยบริการที่ระบุ โดยเห็นชื่อหน่วยบริการและหน่วยบริการแม่ข่าย ประเภทนัด วันและเวลา ระยะเวลา รูปแบบและรายละเอียดสถานที่ สถานะนัด ชื่อและวิชาชีพของผู้รับผิดชอบนัด และชื่อ อสม. ที่ดูแลขณะสร้างนัด คุณจะเห็นนัดในช่วง 90 วันข้างหน้าและนัดที่ผ่านมาในช่วง 90 วันย้อนหลัง รวมถึงนัดใหม่ในหน่วยบริการเดิม โดยไม่เห็นเบอร์โทรส่วนตัวของผู้ป่วยหรือของ อสม. และไม่เห็นบันทึกภายใน สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย สิทธิ์ไม่มีวันหมดอายุอัตโนมัติ แต่ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้";

export const FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V3 = "คุณยอมรับสิทธิ์ดูข้อมูลนัดหมายของบุคคลนี้สำหรับหน่วยบริการที่ระบุ โดยเห็นชื่อหน่วยบริการและหน่วยบริการแม่ข่าย ประเภทนัด บริการและที่มาของนัด วันและเวลา ระยะเวลา รูปแบบและรายละเอียดสถานที่ สถานะนัด ชื่อและวิชาชีพของผู้รับผิดชอบนัด และชื่อ อสม. ที่ดูแลขณะสร้างนัด คุณจะเห็นนัดในช่วง 90 วันข้างหน้าและนัดที่ผ่านมาในช่วง 90 วันย้อนหลัง รวมถึงนัดใหม่ในหน่วยบริการเดิม โดยไม่เห็นเบอร์โทรส่วนตัวของผู้ป่วยหรือของ อสม. และไม่เห็นบันทึกภายใน สิทธิ์นี้เป็นการดูข้อมูลเท่านั้น ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย สิทธิ์ไม่มีวันหมดอายุอัตโนมัติ แต่ใช้ได้เมื่อความสัมพันธ์และเงื่อนไขสิทธิ์ยังถูกต้อง ผู้ป่วยสามารถยกเลิกสิทธิ์ได้";

export const FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS: Readonly<Record<FamilyAppointmentReadContract, string>> = {
  [FAMILY_APPOINTMENT_READ_CONTRACT]: FAMILY_APPOINTMENT_ACCEPTANCE_TEXT,
  [FAMILY_APPOINTMENT_READ_CONTRACT_V2]: FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2,
  [FAMILY_APPOINTMENT_READ_CONTRACT_V3]: FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V3,
};

export function isFamilyAppointmentReadContract(value: string): value is FamilyAppointmentReadContract {
  return (FAMILY_APPOINTMENT_READ_CONTRACTS as readonly string[]).includes(value);
}

/** Versions strictly older than `version`; accepting `version` supersedes an ACTIVE grant of any of them. */
export function olderFamilyAppointmentReadContracts(version: FamilyAppointmentReadContract): FamilyAppointmentReadContract[] {
  return FAMILY_APPOINTMENT_READ_CONTRACTS.slice(0, FAMILY_APPOINTMENT_READ_CONTRACTS.indexOf(version));
}

/** AF-5 v2 and later: location detail, people, parent Hospital and the 90-day history. */
export function familyAppointmentContractIncludesDetail(version: FamilyAppointmentReadContract): boolean {
  return version !== FAMILY_APPOINTMENT_READ_CONTRACT;
}

/** SR-C1 v3 and later: the appointment's service and source. */
export function familyAppointmentContractIncludesServiceSource(version: FamilyAppointmentReadContract): boolean {
  return version === FAMILY_APPOINTMENT_READ_CONTRACT_V3;
}
