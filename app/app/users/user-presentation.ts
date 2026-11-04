import type { StatusVariant } from "@/components/ui/status-badge";
import type { ActivationMethod, UserDirectoryStatus, UserKind } from "@/modules/user-management/domain/user-management-values";
import type { MembershipStatus, UserStatus } from "@prisma/client";

export const USER_KIND_LABELS: Record<UserKind, string> = {
  staff: "เจ้าหน้าที่โรงพยาบาล",
  osm: "อสม.",
  patient: "ผู้ป่วย",
};

export const USER_STATUS_PRESENTATION: Record<UserDirectoryStatus, { label: string; variant: StatusVariant }> = {
  PENDING: { label: "รอเปิดใช้งานบัญชี", variant: "warning" },
  ACTIVE: { label: "บัญชีและสิทธิ์ใช้งานได้", variant: "success" },
  SUSPENDED: { label: "บัญชีถูกระงับหรือพักสิทธิ์", variant: "danger" },
  REMOVED: { label: "สิ้นสุดการดูแลหรือสิทธิ์แล้ว", variant: "neutral" },
};

export const USER_ACCOUNT_STATUS_PRESENTATION: Record<UserStatus, { label: string; variant: StatusVariant }> = {
  PROVISIONED: { label: "รอเปิดใช้งานบัญชี", variant: "warning" },
  INVITED: { label: "รอตอบรับคำเชิญ", variant: "warning" },
  ACTIVE: { label: "บัญชีใช้งานได้", variant: "success" },
  SUSPENDED: { label: "บัญชีถูกระงับ", variant: "danger" },
};

export function hospitalRelationshipStatusPresentation(
  kind: UserKind,
  status: MembershipStatus,
): { label: string; variant: StatusVariant } {
  if (kind === "patient") {
    if (status === "ENDED") return { label: "สิ้นสุดการดูแลที่โรงพยาบาลนี้", variant: "neutral" };
    if (status === "ACTIVE") return { label: "อยู่ในการดูแลของโรงพยาบาลนี้", variant: "success" };
    return { label: "สถานะการดูแลต้องตรวจสอบ", variant: "neutral" };
  }

  switch (status) {
    case "PROVISIONED": return { label: "รอเปิดใช้งาน", variant: "warning" };
    case "INVITED": return { label: "รอตอบรับคำเชิญ", variant: "warning" };
    case "ACTIVE": return { label: kind === "osm" ? "ทำงานร่วมกับโรงพยาบาลนี้" : "ทำงานกับโรงพยาบาลนี้", variant: "success" };
    case "SUSPENDED": return { label: kind === "osm" ? "พักสิทธิ์ อสม. ในโรงพยาบาลนี้ชั่วคราว" : "พักสิทธิ์เจ้าหน้าที่ในโรงพยาบาลนี้ชั่วคราว", variant: "danger" };
    case "ENDED": return { label: kind === "osm" ? "สิ้นสุดการทำงานร่วมกับโรงพยาบาลนี้" : "สิ้นสุดการทำงานกับโรงพยาบาลนี้", variant: "neutral" };
    default: return { label: "ตรวจสอบสถานะการทำงาน", variant: "neutral" };
  }
}

export const ACTIVATION_METHOD_LABELS: Record<ActivationMethod, string> = {
  SELF_REGISTERED: "ลงทะเบียนเอง",
  INVITE: "ลิงก์เชิญ",
  ASSISTED: "ช่วยเหลือ",
  NOT_ACTIVATED: "ยังไม่เปิดใช้งาน",
  OTHER: "เปิดใช้งานแล้ว (ช่องทางอื่น)",
};
