import "server-only";

import { Prisma, Role } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError } from "@/shared/errors/application-error";
import { isFamilyDelegatedAppointmentReadEnabled } from "@/lib/env/server";
import { FAMILY_APPOINTMENT_PAGE_SIZE, FAMILY_APPOINTMENT_READ_CONTRACT } from "../domain/appointment-grant-contract";
import { appointmentGrantCaregiverWhere, appointmentGrantOwnerWhere } from "../policies/appointment-grant-policy";
import { assertFamilyAuthenticatedActor } from "../policies/caregiver-relationship-policy";
import { appointmentGrantManagementSchema } from "../schemas/appointment-grant-schemas";
import { rethrowAppointmentGrantError, type AppointmentGrantDependencies } from "./appointment-grant-service";

const nameSelect = { givenName: true, familyName: true } satisfies Prisma.PersonSelect;
const lifecycleSelect = { id: true, status: true, proposedAt: true, acceptedAt: true, revokedAt: true,
  patientHospitalRelationship: { select: { hospital: { select: { name: true } } } },
} satisfies Prisma.CaregiverAppointmentGrantSelect;
const patientSelect = { ...lifecycleSelect, caregiverUser: { select: { person: { select: nameSelect } } } } satisfies Prisma.CaregiverAppointmentGrantSelect;
const caregiverSelect = { ...lifecycleSelect, patientProfile: { select: { person: { select: nameSelect } } } } satisfies Prisma.CaregiverAppointmentGrantSelect;

export type AppointmentGrantManagementItem = {
  grantId: string; status: "PENDING" | "ACTIVE" | "REVOKED";
  proposedAt: Date; acceptedAt: Date | null; revokedAt: Date | null;
  participant: { givenName: string | null; familyName: string | null }; hospitalName: string;
};
export type AppointmentGrantManagement = {
  patient: { grants: AppointmentGrantManagementItem[]; nextCursor: string | null;
    hospitals: { relationshipId: string; hospitalName: string }[]; nextHospitalsCursor: string | null } | null;
  caregiver: { grants: AppointmentGrantManagementItem[]; nextCursor: string | null };
};

function nextCursor(rows: readonly { id: string }[]): string | null {
  return rows.length > FAMILY_APPOINTMENT_PAGE_SIZE ? rows[FAMILY_APPOINTMENT_PAGE_SIZE - 1]?.id ?? null : null;
}

function item(row: Prisma.CaregiverAppointmentGrantGetPayload<{ select: typeof lifecycleSelect }>, participant: AppointmentGrantManagementItem["participant"]): AppointmentGrantManagementItem {
  return { grantId: row.id, status: row.status, proposedAt: row.proposedAt, acceptedAt: row.acceptedAt, revokedAt: row.revokedAt,
    participant: { givenName: participant.givenName, familyName: participant.familyName }, hospitalName: row.patientHospitalRelationship.hospital.name };
}

export async function getAppointmentGrantManagement(
  actor: ActorContext | null | undefined, input: unknown = {}, dependencies: AppointmentGrantDependencies = {},
): Promise<AppointmentGrantManagement | null> {
  if (!(dependencies.enabled ?? isFamilyDelegatedAppointmentReadEnabled())) return null;
  assertFamilyAuthenticatedActor(actor);
  const parsed = appointmentGrantManagementSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  try {
    const db = dependencies.database ?? getPrisma();
    const user = await db.user.findFirst({ where: { id: actor.userId, personId: actor.personId, status: "ACTIVE" },
      select: { roles: { select: { role: true } } } });
    if (!user) throw new NotFoundError();
    const isPatient = actor.roles.includes(Role.PATIENT) && user.roles.some(({ role }) => role === Role.PATIENT);
    const [patientRows, caregiverRows, hospitals] = await Promise.all([
      isPatient ? db.caregiverAppointmentGrant.findMany({
        where: { ...appointmentGrantOwnerWhere(actor), contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT,
          ...(parsed.data.patientGrantsCursor ? { id: { gt: parsed.data.patientGrantsCursor } } : {}) },
        select: patientSelect, take: FAMILY_APPOINTMENT_PAGE_SIZE + 1, orderBy: { id: "asc" },
      }) : Promise.resolve([]),
      db.caregiverAppointmentGrant.findMany({
        where: { OR: [appointmentGrantCaregiverWhere(actor, "PENDING"), appointmentGrantCaregiverWhere(actor, "ACTIVE")],
          ...(parsed.data.caregiverGrantsCursor ? { id: { gt: parsed.data.caregiverGrantsCursor } } : {}) },
        select: caregiverSelect, take: FAMILY_APPOINTMENT_PAGE_SIZE + 1, orderBy: { id: "asc" },
      }),
      isPatient ? db.patientHospitalRelationship.findMany({
        where: { patientProfile: { is: { personId: actor.personId } }, hospital: { is: { status: "ACTIVE" } },
          ...(parsed.data.hospitalsCursor ? { id: { gt: parsed.data.hospitalsCursor } } : {}) },
        select: { id: true, hospital: { select: { name: true } } }, take: FAMILY_APPOINTMENT_PAGE_SIZE + 1, orderBy: { id: "asc" },
      }) : Promise.resolve([]),
    ]);
    return {
      patient: isPatient ? { grants: patientRows.slice(0, FAMILY_APPOINTMENT_PAGE_SIZE).map((row) => item(row, row.caregiverUser.person)),
        nextCursor: nextCursor(patientRows), hospitals: hospitals.slice(0, FAMILY_APPOINTMENT_PAGE_SIZE).map((row) => ({ relationshipId: row.id, hospitalName: row.hospital.name })),
        nextHospitalsCursor: nextCursor(hospitals) } : null,
      caregiver: { grants: caregiverRows.slice(0, FAMILY_APPOINTMENT_PAGE_SIZE).map((row) => item(row, row.patientProfile.person)), nextCursor: nextCursor(caregiverRows) },
    };
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export const appointmentGrantManagementSelects = { patientSelect, caregiverSelect };
