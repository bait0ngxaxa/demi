import "server-only";

import { Prisma, type PatientServiceCode, type Profession } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { NotFoundError } from "@/shared/errors/application-error";
import { appointmentSource, type AppointmentSource } from "@/modules/appointments/domain/appointment-service-definitions";
import type { AppointmentContactPhones } from "@/modules/appointments/domain/appointment-contact-phones";
import { loadAppointmentContactPhones } from "@/modules/appointments/services/appointment-contact-phone-service";
import {
  FAMILY_APPOINTMENT_PAGE_SIZE,
  FAMILY_APPOINTMENT_READ_CONTRACT,
  FAMILY_APPOINTMENT_READ_CONTRACT_V2,
  FAMILY_APPOINTMENT_WINDOW_MS,
  familyAppointmentContractIncludesDetail,
  familyAppointmentContractIncludesServiceSource,
  isFamilyAppointmentReadContract,
  type FamilyAppointmentReadContract,
} from "../domain/appointment-grant-contract";
import { appointmentGrantCaregiverWhere } from "../policies/appointment-grant-policy";
import { assertFamilyAuthenticatedActor } from "../policies/caregiver-relationship-policy";
import { appointmentGrantIdSchema, delegatedAppointmentListSchema } from "../schemas/appointment-grant-schemas";
import { appointmentGrantNow, rethrowAppointmentGrantError, type AppointmentGrantDependencies } from "./appointment-grant-service";

/** v1: no SELF selector, notes, people or interaction data. Hospital name comes from authorized grant scope. */
export const delegatedAppointmentSelect = {
  id: true,
  type: true,
  scheduledAt: true,
  durationMinutes: true,
  locationType: true,
  status: true,
} satisfies Prisma.PatientAppointmentSelect;

/**
 * AF-5 v2 additions only. People are projected by name (and the appointer's profession at the appointment's
 * Hospital); no phone, note, interaction or Patient field is selected.
 */
export function delegatedAppointmentV2Select(hospitalId: string) {
  return {
    ...delegatedAppointmentSelect,
    locationDetail: true,
    responsibleUser: { select: {
      person: { select: { givenName: true, familyName: true } },
      memberships: { where: { hospitalId }, select: { profession: true }, take: 1 },
    } },
    osmAssignmentAtCreation: { select: { osmUser: { select: { person: { select: { givenName: true, familyName: true } } } } } },
  } satisfies Prisma.PatientAppointmentSelect;
}

/** SR-C1 v3 additions only: the service code and the source locator, reduced to a source label before returning. */
export function delegatedAppointmentV3Select(hospitalId: string) {
  return { ...delegatedAppointmentV2Select(hospitalId), serviceCode: true, sourceServiceRequestId: true } satisfies Prisma.PatientAppointmentSelect;
}

type AppointmentRecord = Prisma.PatientAppointmentGetPayload<{ select: typeof delegatedAppointmentSelect }>;
type AppointmentV2Record = Prisma.PatientAppointmentGetPayload<{ select: ReturnType<typeof delegatedAppointmentV2Select> }>;
type AppointmentV3Record = Prisma.PatientAppointmentGetPayload<{ select: ReturnType<typeof delegatedAppointmentV3Select> }>;
type DelegatedAppointmentRecord = AppointmentRecord | AppointmentV2Record | AppointmentV3Record;
export type DelegatedAppointmentTab = "upcoming" | "history";
/** Present only under a v2 or later grant. */
export type DelegatedAppointmentExtension = {
  locationDetail: string | null;
  responsibleDisplayName: string | null;
  responsibleProfession: Profession | null;
  osmAtCreationDisplayName: string | null;
  parentHospitalName: string | null;
};
/** Keys present only under a v3 grant; v1 and v2 projections omit them entirely. */
export type DelegatedAppointmentServiceSource = { serviceCode: PatientServiceCode | null; source: AppointmentSource };
export type DelegatedAppointment = Omit<AppointmentRecord, "id"> & {
  appointmentId: string; hospitalName: string; extension: DelegatedAppointmentExtension | null;
} & Partial<DelegatedAppointmentServiceSource>;
export type DelegatedAppointmentPage = {
  appointments: DelegatedAppointment[]; nextCursor: string | null; contractVersion: FamilyAppointmentReadContract;
};
/** E4: a caregiver detail adds the Hospital phone only; the Patient phone is never projected. */
export type DelegatedAppointmentDetail = DelegatedAppointment & { contactPhones: AppointmentContactPhones };

function displayName(person: { givenName: string | null; familyName: string | null }): string | null {
  return [person.givenName, person.familyName].map((part) => part?.trim()).filter(Boolean).join(" ") || null;
}

type GrantScope = {
  contractVersion: FamilyAppointmentReadContract;
  hospitalId: string;
  hospitalName: string;
  parentHospitalName: string | null;
};

function toAppointment(record: DelegatedAppointmentRecord, scope: GrantScope): DelegatedAppointment {
  const base = { appointmentId: record.id, hospitalName: scope.hospitalName, type: record.type, scheduledAt: record.scheduledAt,
    durationMinutes: record.durationMinutes, locationType: record.locationType, status: record.status,
    ...(familyAppointmentContractIncludesServiceSource(scope.contractVersion) && "serviceCode" in record
      ? { serviceCode: record.serviceCode, source: appointmentSource(record.sourceServiceRequestId) } : {}) };
  if (!familyAppointmentContractIncludesDetail(scope.contractVersion) || !("locationDetail" in record)) return { ...base, extension: null };
  return { ...base, extension: {
    locationDetail: record.locationDetail,
    responsibleDisplayName: record.responsibleUser ? displayName(record.responsibleUser.person) : null,
    responsibleProfession: record.responsibleUser?.memberships[0]?.profession ?? null,
    osmAtCreationDisplayName: record.osmAssignmentAtCreation ? displayName(record.osmAssignmentAtCreation.osmUser.person) : null,
    parentHospitalName: scope.parentHospitalName,
  } };
}

/**
 * Upcoming (every version): SCHEDULED/CANCELLED in [now, now + 90 days). History (v2 and later): any status in
 * [now - 90 days, now). The grant predicate is part of every row query.
 */
function appointmentWhere(actor: ActorContext, grantId: string, now: Date, tab: DelegatedAppointmentTab): Prisma.PatientAppointmentWhereInput {
  return {
    ...(tab === "upcoming"
      ? { scheduledAt: { gte: now, lt: new Date(now.getTime() + FAMILY_APPOINTMENT_WINDOW_MS) }, status: { in: ["SCHEDULED", "CANCELLED"] } }
      : { scheduledAt: { gte: new Date(now.getTime() - FAMILY_APPOINTMENT_WINDOW_MS), lt: now } }),
    patientHospitalRelationship: { is: {
      appointmentGrants: { some: { id: grantId, ...appointmentGrantCaregiverWhere(actor, "ACTIVE") } },
    } },
  };
}

const grantScopeSelect = {
  contractVersion: true,
  patientHospitalRelationshipId: true,
  patientHospitalRelationship: { select: { hospital: { select: {
    id: true, name: true,
    // ADR-0015: the current active parent of a child facility, read at request time.
    serviceAreaAssignments: { where: { endedAt: null }, select: { parent: { select: { name: true } } }, take: 1 },
  } } } },
} satisfies Prisma.CaregiverAppointmentGrantSelect;

async function loadGrantScope(
  transaction: Prisma.TransactionClient, actor: ActorContext, grantId: string,
): Promise<GrantScope & { patientHospitalRelationshipId: string }> {
  const grant = await transaction.caregiverAppointmentGrant.findFirst({
    where: { id: grantId, ...appointmentGrantCaregiverWhere(actor, "ACTIVE") }, select: grantScopeSelect,
  });
  if (!grant || !isFamilyAppointmentReadContract(grant.contractVersion)) throw new NotFoundError();
  const hospital = grant.patientHospitalRelationship.hospital;
  return {
    contractVersion: grant.contractVersion,
    patientHospitalRelationshipId: grant.patientHospitalRelationshipId,
    hospitalId: hospital.id,
    hospitalName: hospital.name,
    parentHospitalName: familyAppointmentContractIncludesDetail(grant.contractVersion) ? hospital.serviceAreaAssignments[0]?.parent.name ?? null : null,
  };
}

/** Each version selects only what its acceptance text names. */
function selectFor(scope: GrantScope) {
  switch (scope.contractVersion) {
    case FAMILY_APPOINTMENT_READ_CONTRACT: return delegatedAppointmentSelect;
    case FAMILY_APPOINTMENT_READ_CONTRACT_V2: return delegatedAppointmentV2Select(scope.hospitalId);
    default: return delegatedAppointmentV3Select(scope.hospitalId);
  }
}

export async function listDelegatedAppointments(
  actor: ActorContext | null | undefined, input: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<DelegatedAppointmentPage> {
  assertFamilyAuthenticatedActor(actor);
  const parsed = delegatedAppointmentListSchema.safeParse(input);
  if (!parsed.success) throw new NotFoundError();
  const tab = parsed.data.tab ?? "upcoming";
  const now = appointmentGrantNow(dependencies);
  try {
    // One snapshot for authority, Hospital name, cursor and rows. A pre-commit authorized read may be in flight.
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      const scope = await loadGrantScope(transaction, actor, parsed.data.grantId);
      // v1 consent covers upcoming appointments only; history needs the caregiver's v2 (or later) acceptance.
      if (tab === "history" && !familyAppointmentContractIncludesDetail(scope.contractVersion)) throw new NotFoundError();
      const where = appointmentWhere(actor, parsed.data.grantId, now, tab);
      const anchor = parsed.data.cursor ? await transaction.patientAppointment.findFirst({
        where: { AND: [where, { id: parsed.data.cursor }] }, select: { id: true, scheduledAt: true },
      }) : null;
      if (parsed.data.cursor && !anchor) throw new NotFoundError();
      const direction = tab === "upcoming" ? "gt" : "lt";
      const rows: DelegatedAppointmentRecord[] = await transaction.patientAppointment.findMany({
        where: { AND: [where, ...(anchor ? [{ OR: [
          { scheduledAt: { [direction]: anchor.scheduledAt } }, { scheduledAt: anchor.scheduledAt, id: { [direction]: anchor.id } },
        ] }] : [])] },
        select: selectFor(scope),
        orderBy: tab === "upcoming" ? [{ scheduledAt: "asc" }, { id: "asc" }] : [{ scheduledAt: "desc" }, { id: "desc" }],
        take: FAMILY_APPOINTMENT_PAGE_SIZE + 1,
      });
      return { appointments: rows.slice(0, FAMILY_APPOINTMENT_PAGE_SIZE).map((row) => toAppointment(row, scope)),
        nextCursor: rows.length > FAMILY_APPOINTMENT_PAGE_SIZE ? rows[FAMILY_APPOINTMENT_PAGE_SIZE - 1]?.id ?? null : null,
        contractVersion: scope.contractVersion };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

/** AF-4 hub switcher: one entry per currently ACTIVE grant held by the actor; empty while the feature is disabled. */
export type DelegatedAppointmentSubject = {
  grantId: string; caregiverRelationshipId: string; contractVersion: FamilyAppointmentReadContract;
  patient: { givenName: string | null; familyName: string | null }; hospitalName: string;
};

export async function listDelegatedAppointmentSubjects(
  actor: ActorContext | null | undefined, dependencies: AppointmentGrantDependencies = {},
): Promise<DelegatedAppointmentSubject[]> {
  assertFamilyAuthenticatedActor(actor);
  try {
    const rows = await (dependencies.database ?? getPrisma()).caregiverAppointmentGrant.findMany({
      where: appointmentGrantCaregiverWhere(actor, "ACTIVE"),
      select: { id: true, caregiverRelationshipId: true, contractVersion: true,
        patientProfile: { select: { person: { select: { givenName: true, familyName: true } } } },
        patientHospitalRelationship: { select: { hospital: { select: { name: true } } } } },
      orderBy: [{ acceptedAt: "asc" }, { id: "asc" }], take: FAMILY_APPOINTMENT_PAGE_SIZE,
    });
    return rows.flatMap((row) => isFamilyAppointmentReadContract(row.contractVersion) ? [{
      grantId: row.id, caregiverRelationshipId: row.caregiverRelationshipId, contractVersion: row.contractVersion,
      hospitalName: row.patientHospitalRelationship.hospital.name,
      patient: { givenName: row.patientProfile.person.givenName, familyName: row.patientProfile.person.familyName },
    }] : []);
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}

export async function getDelegatedAppointment(
  actor: ActorContext | null | undefined, grantId: unknown, appointmentId: unknown, dependencies: AppointmentGrantDependencies = {},
): Promise<DelegatedAppointmentDetail> {
  assertFamilyAuthenticatedActor(actor);
  const grant = appointmentGrantIdSchema.safeParse(grantId);
  const appointment = appointmentGrantIdSchema.safeParse(appointmentId);
  if (!grant.success || !appointment.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  try {
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      const scope = await loadGrantScope(transaction, actor, grant.data);
      const tabs: DelegatedAppointmentTab[] = familyAppointmentContractIncludesDetail(scope.contractVersion) ? ["upcoming", "history"] : ["upcoming"];
      const row: DelegatedAppointmentRecord | null = await transaction.patientAppointment.findFirst({
        where: { AND: [{ OR: tabs.map((tab) => appointmentWhere(actor, grant.data, now, tab)) }, { id: appointment.data }] },
        select: selectFor(scope),
      });
      if (!row) throw new NotFoundError();
      return {
        ...toAppointment(row, scope),
        contactPhones: await loadAppointmentContactPhones(transaction, scope.patientHospitalRelationshipId, "CAREGIVER_GRANT"),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}
