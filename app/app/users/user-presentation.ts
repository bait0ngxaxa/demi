import type { StatusVariant } from "@/components/ui/status-badge";
import type { ActivationMethod, UserDirectoryStatus, UserKind } from "@/modules/user-management/domain/user-management-values";

export const USER_KIND_LABELS: Record<UserKind, string> = {
  staff: "บุคลากร",
  osm: "อสม.",
  patient: "ผู้ป่วย",
};

export const USER_STATUS_PRESENTATION: Record<UserDirectoryStatus, { label: string; variant: StatusVariant }> = {
  PENDING: { label: "รอลงทะเบียน", variant: "warning" },
  ACTIVE: { label: "ใช้งานอยู่", variant: "success" },
  SUSPENDED: { label: "ระงับ", variant: "danger" },
  REMOVED: { label: "นำออกแล้ว", variant: "neutral" },
};

export const ACTIVATION_METHOD_LABELS: Record<ActivationMethod, string> = {
  SELF_REGISTERED: "ลงทะเบียนเอง",
  INVITE: "ลิงก์เชิญ",
  ASSISTED: "ช่วยเหลือ",
  NOT_ACTIVATED: "ยังไม่เปิดใช้งาน",
  OTHER: "เปิดใช้งานแล้ว (ช่องทางอื่น)",
};
