import type { CaregiverInvitationStatus, CaregiverRelationshipStatus } from "@prisma/client";

import type { StatusVariant } from "@/components/ui/status-badge";

export function caregiverInvitationStatusLabel(status: CaregiverInvitationStatus): string {
  switch (status) {
    case "PENDING":
      return "รอการตอบรับ";
    case "ACCEPTED":
      return "ยอมรับแล้ว";
    case "REJECTED":
      return "ปฏิเสธแล้ว";
    case "REVOKED":
      return "ยกเลิกแล้ว";
    case "EXPIRED":
      return "หมดอายุ";
  }
}

export function caregiverInvitationStatusVariant(status: CaregiverInvitationStatus): StatusVariant {
  switch (status) {
    case "PENDING":
      return "warning";
    case "ACCEPTED":
      return "success";
    case "REJECTED":
      return "neutral";
    case "REVOKED":
    case "EXPIRED":
      return "danger";
  }
}

export function caregiverRelationshipStatusLabel(status: CaregiverRelationshipStatus): string {
  switch (status) {
    case "ACTIVE":
      return "เชื่อมต่ออยู่";
    case "REVOKED":
      return "ผู้ป่วยยกเลิกการเชื่อมต่อแล้ว";
    case "WITHDRAWN":
      return "ผู้ดูแลยกเลิกการเชื่อมต่อแล้ว";
  }
}

export function caregiverRelationshipStatusVariant(status: CaregiverRelationshipStatus): StatusVariant {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "REVOKED":
    case "WITHDRAWN":
      return "neutral";
  }
}

export function formatFamilyManagementDate(value: Date | string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatFamilyParticipantName(
  participant: { givenName: string | null; familyName: string | null },
  fallback: string,
): string {
  return [participant.givenName?.trim(), participant.familyName?.trim()]
    .filter(Boolean)
    .join(" ") || fallback;
}
