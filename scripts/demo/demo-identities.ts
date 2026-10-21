/**
 * Deterministic synthetic identities for the demo seed (P1 Part C).
 *
 * National IDs use the documented demo range 8-99-9xxxxxxx-c: category 8 with province code 99, which is not
 * an assigned province, and a valid checksum so the production validators accept them. Phone numbers use the
 * unassigned 02-000-00xx block. Names are fictional and always start with "ทดสอบ".
 */
export const DEMO_NATIONAL_ID_PREFIX = "8999";

export function demoNationalId(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > 99_999_999) throw new Error("Demo identity index is out of range");
  const body = `${DEMO_NATIONAL_ID_PREFIX}${String(index).padStart(8, "0")}`;
  const sum = [...body].reduce((total, digit, position) => total + Number(digit) * (13 - position), 0);
  return `${body}${(11 - (sum % 11)) % 10}`;
}

export function demoPhone(index: number): string {
  return `0200000${String(index).padStart(3, "0")}`;
}

export type DemoAccountRole =
  | "ADMIN"
  | "PARENT_OWNER"
  | "CHILD_OWNER"
  | "MEMBER_EXPORT"
  | "MEMBER"
  | "OSM"
  | "PATIENT";

export type DemoAccount = {
  key: string;
  index: number;
  role: DemoAccountRole;
  givenName: string;
  familyName: string;
  /** Human-readable role description for the credentials file. */
  label: string;
};

const FAMILY_NAME = "เดโม";

function account(key: string, index: number, role: DemoAccountRole, givenName: string, label: string): DemoAccount {
  return { key, index, role, givenName: `ทดสอบ${givenName}`, familyName: FAMILY_NAME, label };
}

/** Every demo account. Indexes are stable: changing one changes a login. */
export const DEMO_ACCOUNTS = {
  admin: account("admin", 1, "ADMIN", "ผู้ดูแลระบบ", "Platform ADMIN"),
  parentOwner: account("parentOwner", 2, "PARENT_OWNER", "เจ้าของแม่ข่าย", "OWNER โรงพยาบาลแม่ข่าย"),
  childAOwner: account("childAOwner", 3, "CHILD_OWNER", "เจ้าของสต.หนึ่ง", "OWNER รพ.สต. A"),
  childBOwner: account("childBOwner", 4, "CHILD_OWNER", "เจ้าของสต.สอง", "OWNER รพ.สต. B"),
  memberExport: account("memberExport", 5, "MEMBER_EXPORT", "เจ้าหน้าที่ส่งออก", "MEMBER รพ.สต. A (สาธิตส่งออกรายงาน)"),
  member: account("member", 6, "MEMBER", "เจ้าหน้าที่", "MEMBER รพ.สต. A + PATIENT ที่ รพ.สต. B"),
  osmA1: account("osmA1", 7, "OSM", "อสม.เอหนึ่ง", "OSM รพ.สต. A + PATIENT ที่ รพ.สต. B"),
  osmA2: account("osmA2", 8, "OSM", "อสม.เอสอง", "OSM รพ.สต. A"),
  osmB1: account("osmB1", 9, "OSM", "อสม.บีหนึ่ง", "OSM รพ.สต. B"),
  osmB2: account("osmB2", 10, "OSM", "อสม.บีสอง", "OSM รพ.สต. B"),
  patientA1: account("patientA1", 11, "PATIENT", "สมชาย", "PATIENT รพ.สต. A · Program จบแล้ว · ให้สิทธิ์ผู้ดูแลดูนัด"),
  patientA2: account("patientA2", 12, "PATIENT", "สมหญิง", "PATIENT รพ.สต. A · Program ครั้งที่ 4 · ขอเลื่อนนัด · แจ้งปัญหา"),
  patientA3: account("patientA3", 13, "PATIENT", "มานะ", "PATIENT รพ.สต. A · Program ครั้งที่ 2 · ขอยกเลิกนัด"),
  patientA4: account("patientA4", 14, "PATIENT", "มานี", "PATIENT รพ.สต. A · Program ครั้งที่ 1"),
  patientA5: account("patientA5", 15, "PATIENT", "ปิติ", "PATIENT รพ.สต. A · ยังไม่มี Program"),
  patientA6: account("patientA6", 16, "PATIENT", "ชูใจ", "PATIENT รพ.สต. A · สิ้นสุดการดูแลแล้ว (ประวัติอ่านอย่างเดียว)"),
  patientB1: account("patientB1", 17, "PATIENT", "วีระ", "PATIENT รพ.สต. B · Program จบแล้ว · ผู้ดูแล (caregiver) ของ สมชาย"),
  patientB2: account("patientB2", 18, "PATIENT", "วิไล", "PATIENT รพ.สต. B · Program จบแล้ว"),
  patientB3: account("patientB3", 19, "PATIENT", "ประเสริฐ", "PATIENT รพ.สต. B · Program ครั้งที่ 5"),
  patientB4: account("patientB4", 20, "PATIENT", "ประภา", "PATIENT รพ.สต. B · Program ครั้งที่ 2"),
  patientB5: account("patientB5", 21, "PATIENT", "สุชาติ", "PATIENT รพ.สต. B · Program ครั้งที่ 1"),
  patientB6: account("patientB6", 22, "PATIENT", "สุดา", "PATIENT รพ.สต. B · ยังไม่มี Program"),
} as const satisfies Record<string, DemoAccount>;

export type DemoAccountKey = keyof typeof DEMO_ACCOUNTS;

export const DEMO_ACCOUNT_LIST: readonly DemoAccount[] = Object.values(DEMO_ACCOUNTS);
