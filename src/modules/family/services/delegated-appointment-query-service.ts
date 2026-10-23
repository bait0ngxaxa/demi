import "server-only";

import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { isFamilyDelegatedAppointmentReadEnabled } from "@/lib/env/server";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError } from "@/shared/errors/application-error";
import type { AppointmentContactPhones } from "@/modules/appointments/domain/appointment-contact-phones";
import { loadAppointmentContactPhones } from "@/modules/appointments/services/appointment-contact-phone-service";
import { FAMILY_APPOINTMENT_PAGE_SIZE, FAMILY_APPOINTMENT_WINDOW_MS } from "../domain/appointment-grant-contract";
import { appointmentGrantCaregiverWhere } from "../policies/appointment-grant-policy";
import { assertFamilyAuthenticatedActor } from "../policies/caregiver-relationship-policy";
import { appointmentGrantIdSchema, delegatedAppointmentListSchema } from "../schemas/appointment-grant-schemas";
import { appointmentGrantNow, assertAppointmentGrantEnabled, rethrowAppointmentGrantError, type AppointmentGrantDependencies } from "./appointment-grant-service";

/** No SELF selector, notes, people or interaction data. Hospital name comes from authorized grant scope. */
export const delegatedAppointmentSelect = {
  id: true,
  type: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  status: true,
} satisfies Prisma.PatientAppointmentSelect;

type AppointmentRecord = Prisma.PatientAppointmentGetPayload<{ select: typeof delegatedAppointmentSelect }>;
export type DelegatedAppointment = Omit<AppointmentRecord, "id"> & { appointmentId: string; hospitalName: string };
export type DelegatedAppointmentPage = { appointments: DelegatedAppointment[]; nextCursor: string | null };
/** E4: a caregiver detail adds the Hospital phone only; the Patient phone is never projected. */
export type DelegatedAppointmentDetail = DelegatedAppointment & { contactPhones: AppointmentContactPhones };

function toAppointment(record: AppointmentRecord, hospitalName: string): DelegatedAppointment {
  return { appointmentId: record.id, hospitalName, type: record.type, scheduledAt: record.scheduledAt,
    durationMinutes: record.durationMinutes, locationType: record.locationType, status: record.status };
}

function appointmentWhere(actor: ActorContext, grantId: string, now: Date): Prisma.PatientAppointmentWhereInput {
  return {
    scheduledAt: { gte: now, lt: new Date(now.getTime() + FAMILY_APPOINTMENT_WINDOW_MS) },
    status: { in: ["SCHEDULED", "CANCELLED"] },
    patientHospitalRelationship: { is: {
      appointmentGrants: { some: { id: grantId, ...appointmentGrantCaregiverWhere(actor, "ACTIVE") } },
    } },
  };
}

export async function listDelegatedAppointments(
  actor: ActorContext | null | undefined, input: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<DelegatedAppointmentPage> {
  assertAppointmentGrantEnabled(dependencies);
  assertFamilyAuthenticatedActor(actor);
  const parsed = delegatedAppointmentListSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    // One snapshot for authority, Hospital name, cursor and rows. A pre-commit authorized read may be in flight.
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      const grant = await transaction.caregiverAppointmentGrant.findFirst({
        where: { id: parsed.data.grantId, ...appointmentGrantCaregiverWhere(actor, "ACTIVE") },
        select: { patientHospitalRelationship: { select: { hospital: { select: { name: true } } } } },
      });
      if (!grant) throw new NotFoundError();
      const where = appointmentWhere(actor, parsed.data.grantId, now);
      const anchor = parsed.data.cursor ? await transaction.patientAppointment.findFirst({
        where: { AND: [where, { id: parsed.data.cursor }] }, select: { id: true, scheduledAt: true },
      }) : null;
      if (parsed.data.cursor && !anchor) throw new NotFoundError();
      const rows = await transaction.patientAppointment.findMany({
        where: { AND: [where, ...(anchor ? [{ OR: [
          { scheduledAt: { gt: anchor.scheduledAt } }, { scheduledAt: anchor.scheduledAt, id: { gt: anchor.id } },
        ] }] : [])] },
        select: delegatedAppointmentSelect, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: FAMILY_APPOINTMENT_PAGE_SIZE + 1,
      });
      return { appointments: rows.slice(0, FAMILY_APPOINTMENT_PAGE_SIZE).map((row) => toAppointment(row, grant.patientHospitalRelationship.hospital.name)),
        nextCursor: rows.length > FAMILY_APPOINTMENT_PAGE_SIZE ? rows[FAMILY_APPOINTMENT_PAGE_SIZE - 1]?.id ?? null : null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

/** AF-4 hub switcher: one entry per currently ACTIVE grant held by the actor; empty while the feature is disabled. */
export type DelegatedAppointmentSubject = {
  grantId: string; patient: { givenName: string | null; familyName: string | null }; hospitalName: string;
};

export async function listDelegatedAppointmentSubjects(
  actor: ActorContext | null | undefined, dependencies: AppointmentGrantDependencies = {},
): Promise<DelegatedAppointmentSubject[]> {
  if (!(dependencies.enabled ?? isFamilyDelegatedAppointmentReadEnabled())) return [];
  assertFamilyAuthenticatedActor(actor);
  try {
    const rows = await (dependencies.database ?? getPrisma()).caregiverAppointmentGrant.findMany({
      where: appointmentGrantCaregiverWhere(actor, "ACTIVE"),
      select: { id: true, patientProfile: { select: { person: { select: { givenName: true, familyName: true } } } },
        patientHospitalRelationship: { select: { hospital: { select: { name: true } } } } },
      orderBy: [{ acceptedAt: "asc" }, { id: "asc" }], take: FAMILY_APPOINTMENT_PAGE_SIZE,
    });
    return rows.map((row) => ({ grantId: row.id, hospitalName: row.patientHospitalRelationship.hospital.name,
      patient: { givenName: row.patientProfile.person.givenName, familyName: row.patientProfile.person.familyName } }));
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function getDelegatedAppointment(
  actor: ActorContext | null | undefined, grantId: unknown, appointmentId: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<DelegatedAppointmentDetail> {
  assertAppointmentGrantEnabled(dependencies);
  assertFamilyAuthenticatedActor(actor);
  const grant = appointmentGrantIdSchema.safeParse(grantId);
  const appointment = appointmentGrantIdSchema.safeParse(appointmentId);
  if (!grant.success || !appointment.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      const scope = await transaction.caregiverAppointmentGrant.findFirst({
        where: { id: grant.data, ...appointmentGrantCaregiverWhere(actor, "ACTIVE") },
        select: { patientHospitalRelationshipId: true, patientHospitalRelationship: { select: { hospital: { select: { name: true } } } } },
      });
      if (!scope) throw new NotFoundError();
      const row = await transaction.patientAppointment.findFirst({
        where: { AND: [appointmentWhere(actor, grant.data, now), { id: appointment.data }] }, select: delegatedAppointmentSelect,
      });
      if (!row) throw new NotFoundError();
      return {
        ...toAppointment(row, scope.patientHospitalRelationship.hospital.name),
        contactPhones: await loadAppointmentContactPhones(transaction, scope.patientHospitalRelationshipId, "CAREGIVER_GRANT"),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}
