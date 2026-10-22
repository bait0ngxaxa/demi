import type { UserTakeoverProviderState } from "@prisma/client";

import type { UserRecordDeletionBlocker } from "../services/user-record-deletion-service";

export type UserRecordDeletionOutcome =
  | "DELETED"
  | "NOT_DELETABLE"
  | "CONFLICT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_CONFIRMATION"
  | "UNAVAILABLE";

export type UserRecordDeletionActionState = {
  success: boolean;
  outcome: UserRecordDeletionOutcome | null;
  message: string;
  blockers: UserRecordDeletionBlocker[];
};

export const initialUserRecordDeletionActionState: UserRecordDeletionActionState = {
  success: false,
  outcome: null,
  message: "",
  blockers: [],
};

export type UserTakeoverOutcome =
  | "LOCKED"
  | "NOT_ELIGIBLE"
  | "REQUIRES_ADMIN"
  | "CONFLICT"
  | "FORBIDDEN"
  | "INVALID_CONFIRMATION"
  | "UNAVAILABLE";

export type UserTakeoverActionState = {
  success: boolean;
  outcome: UserTakeoverOutcome | null;
  providerState: UserTakeoverProviderState | null;
  message: string;
};

export const initialUserTakeoverActionState: UserTakeoverActionState = {
  success: false,
  outcome: null,
  providerState: null,
  message: "",
};

/** Owner-facing reasons; the server decides, these only explain (UM-D2a). */
export const DELETION_BLOCKER_LABELS: Record<UserRecordDeletionBlocker, string> = {
  REMOVED: "รายการนี้นำออกจากระบบหรือสิ้นสุดการดูแลแล้ว ประวัติต้องเก็บไว้",
  OWNER_MEMBERSHIP: "เจ้าของโรงพยาบาลลบรายการไม่ได้",
  ACTIVATED: "บัญชีนี้เคยเปิดใช้งานแล้ว",
  ACTIVATION_STARTED: "มีการเริ่มเปิดใช้งานบัญชีแล้ว",
  OTHER_RELATIONSHIP: "บุคคลนี้เชื่อมกับโรงพยาบาลอื่นหรือบทบาทอื่นด้วย",
  OTHER_ROLE: "บัญชีนี้มีบทบาทอื่นในระบบ",
  HAS_DATA: "มีข้อมูลการดูแล นัดหมาย การมอบหมาย หลักฐาน หรือข้อมูลที่แก้ไขหลังนำเข้าแล้ว",
  UNKNOWN_RELATION: "ระบบตรวจสอบข้อมูลที่เกี่ยวข้องได้ไม่ครบ จึงไม่อนุญาตให้ลบ",
};
