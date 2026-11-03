import type { Prisma, Profession } from "@prisma/client";

import { appointmentResponsiblePresentation } from "./appointment-definitions";

/**
 * ADR-0027 (AP-5): who made an appointment and who is responsible for it, as every appointment projection
 * shows them. The role comes from the person's relationship to the appointment's Hospital: a staff membership
 * (its profession) or an อสม. relationship.
 */
export type AppointmentPersonRole = "DOCTOR" | "NURSE" | "STAFF" | "OSM";

export const APPOINTMENT_PERSON_ROLE_LABELS: Record<AppointmentPersonRole, string> = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  STAFF: "เจ้าหน้าที่",
  OSM: "อสม.",
};

/** The staff picker's profession label; a membership without a profession reads as เจ้าหน้าที่. */
export const STAFF_PROFESSION_LABELS: Record<Profession, string> = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
};

export function staffProfessionLabel(profession: Profession | null): string {
  return profession ? STAFF_PROFESSION_LABELS[profession] : APPOINTMENT_PERSON_ROLE_LABELS.STAFF;
}

export function staffPersonRole(profession: Profession | null): AppointmentPersonRole {
  if (profession === "DOCTOR") return "DOCTOR";
  if (profession === "NURSE") return "NURSE";
  return "STAFF";
}

export type AppointmentAppointer = {
  displayName: string;
  /** Null when the creator no longer has any relationship to the Hospital that says who they were. */
  role: AppointmentPersonRole | null;
};

/** The creator's name and their relationship to the appointment's Hospital (any status: it is history). */
export function appointmentAppointerSelect(hospitalId: string) {
  return {
    person: { select: { givenName: true, familyName: true } },
    memberships: { where: { hospitalId }, orderBy: { createdAt: "desc" }, take: 1, select: { profession: true } },
    osmHospitalRelationships: { where: { hospitalId }, take: 1, select: { id: true } },
  } satisfies Prisma.UserSelect;
}

export type AppointmentAppointerRecord = Prisma.UserGetPayload<{
  select: ReturnType<typeof appointmentAppointerSelect>;
}>;

export function toAppointmentAppointer(
  record: AppointmentAppointerRecord,
  displayName: (person: { givenName: string | null; familyName: string | null }) => string,
): AppointmentAppointer {
  const membership = record.memberships[0];
  return {
    displayName: displayName(record.person),
    role: membership ? staffPersonRole(membership.profession) : record.osmHospitalRelationships.length > 0 ? "OSM" : null,
  };
}

export function appointerLabel(appointer: AppointmentAppointer): string {
  return appointer.role ? `${appointer.displayName} · ${APPOINTMENT_PERSON_ROLE_LABELS[appointer.role]}` : appointer.displayName;
}

export type AppointmentAssigneePresentation = { heading: string; displayName: string };

/** AP-4: one assignee, a staff member or an อสม.; the heading names the role. */
export function appointmentAssigneePresentation(input: {
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  assignedOsmDisplayName: string | null;
}): AppointmentAssigneePresentation {
  if (input.assignedOsmDisplayName) {
    return { heading: "อสม. ผู้รับผิดชอบนัด", displayName: input.assignedOsmDisplayName };
  }
  return appointmentResponsiblePresentation(input.responsibleDisplayName, input.responsibleProfession);
}
