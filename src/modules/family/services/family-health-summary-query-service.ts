import "server-only";

import { Prisma, Role, type AppointmentStatus, type AppointmentType } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getGoalActivity, getGoalTemplate } from "@/modules/goals/domain/goal-templates";
import { fromMedicationTimeCarrier } from "@/modules/medications/domain/medication-local-time";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { buildServiceProgress, serviceProgressRelationshipSelect, type ServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";
import { InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import { FAMILY_APPOINTMENT_PAGE_SIZE, FAMILY_APPOINTMENT_WINDOW_MS } from "../domain/appointment-grant-contract";
import { formatCaregiverRelationshipLabel } from "../domain/caregiver-sharing-contract";
import { ageInBangkok } from "../domain/family-health-summary";
import { appointmentGrantCaregiverWhere } from "../policies/appointment-grant-policy";
import { assertFamilyAuthenticatedActor } from "../policies/caregiver-relationship-policy";
import { resourceGrantCaregiverWhere } from "../policies/resource-grant-policy";
import { resourceGrantIdSchema } from "../schemas/caregiver-relationship-schemas";
import { appointmentGrantNow, rethrowAppointmentGrantError } from "./appointment-grant-service";

type PersonName = { givenName: string | null; familyName: string | null };

/**
 * AF-5 family health summary. A block is `null` (absent) when its grant is missing, not yet accepted or revoked;
 * a present block may still be empty. No phone of the Patient or of an OSM is ever selected.
 */
export type FamilyHealthSummary = {
  relationshipId: string;
  patient: PersonName;
  relationshipLabel: string | null;
  profile: {
    /** Hidden (null) without a date of birth. */
    age: number | null;
    careTeams: Array<{ hospitalName: string; parentHospitalName: string | null; osmDisplayName: string | null; hospitalPhone: string | null }>;
  } | null;
  nextAppointment: {
    appointment: { grantId: string; appointmentId: string; hospitalName: string; type: AppointmentType; scheduledAt: Date; status: AppointmentStatus } | null;
  } | null;
  healthPlan: {
    serviceProgress: ServiceProgress[];
    plans: Array<{
      hospitalName: string; roundNumber: number; createdAt: Date; primaryGoalLabel: string;
      targets: { weightLossKg: number | null; waistCm: number | null; bloodSugarMgDl: number | null; hba1cPercent: number | null };
      activities: Array<{ activityLabel: string; targetDays: number; targetValue: number | null; targetUnit: string | null }>;
    }>;
  } | null;
  medications: { items: Array<{ medicationId: string; medicationName: string; times: string[] }> } | null;
};

export type FamilyHealthSummaryDependencies = { database?: ReturnType<typeof getPrisma>; now?: () => Date };

// Bounded reads: a Patient has few ongoing Hospitals; medication lists use the personal page size.
const HOSPITAL_LIMIT = 20;
const MEDICATION_LIMIT = 50;

const ongoingHospitalWhere = { ...activePatientHospitalRelationshipWhere, hospital: { is: { status: "ACTIVE" as const } } };

function displayName(person: PersonName): string | null {
  return [person.givenName, person.familyName].map((part) => part?.trim()).filter(Boolean).join(" ") || null;
}

export async function getFamilyHealthSummary(
  actor: ActorContext | null | undefined, relationshipId: unknown, dependencies: FamilyHealthSummaryDependencies = {},
): Promise<FamilyHealthSummary> {
  assertFamilyAuthenticatedActor(actor);
  const parsed = resourceGrantIdSchema.safeParse(relationshipId);
  if (!parsed.success) throw new NotFoundError();
  const now = appointmentGrantNow(dependencies);
  const id = parsed.data;

  try {
    // One snapshot; every block re-checks its own grant inside the query that reads its data.
    return await (dependencies.database ?? getPrisma()).$transaction(async (transaction) => {
      const relationship = await transaction.caregiverRelationship.findFirst({
        where: {
          id, status: "ACTIVE", caregiverUserId: actor.userId,
          caregiverUser: { is: { id: actor.userId, personId: actor.personId, status: "ACTIVE" } },
          sourceInvitation: { is: { status: "ACCEPTED", caregiverUserId: actor.userId, caregiverPersonId: actor.personId,
            acceptanceContractVersion: "family-delegation-v1" } },
          patientProfile: { is: { person: { is: { user: { is: { status: "ACTIVE", roles: { some: { role: Role.PATIENT } } } } } } } },
        },
        select: { relationshipLabel: true, relationshipLabelOther: true,
          patientProfile: { select: { person: { select: { givenName: true, familyName: true } } } } },
      });
      if (!relationship) throw new NotFoundError();

      const resourceGrant = (resource: "PROFILE_SUMMARY" | "HEALTH_PLAN" | "MEDICATION") =>
        ({ caregiverRelationshipId: id, ...resourceGrantCaregiverWhere(actor, "ACTIVE", resource) });

      const profileGrant = await transaction.caregiverResourceGrant.findFirst({
        where: resourceGrant("PROFILE_SUMMARY"),
        select: { patientProfile: { select: {
          dateOfBirth: true,
          hospitalRelationships: {
            where: ongoingHospitalWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: HOSPITAL_LIMIT,
            select: {
              hospital: { select: { name: true, contact: { select: { phoneNumber: true } },
                serviceAreaAssignments: { where: { endedAt: null }, select: { parent: { select: { name: true } } }, take: 1 } } },
              osmAssignments: { where: { endedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
                select: { osmUser: { select: { person: { select: { givenName: true, familyName: true } } } } } },
            },
          },
        } } },
      });

      const appointmentGrants = await transaction.caregiverAppointmentGrant.findMany({
        where: { caregiverRelationshipId: id, ...appointmentGrantCaregiverWhere(actor, "ACTIVE") },
        take: FAMILY_APPOINTMENT_PAGE_SIZE,
        select: { id: true, patientHospitalRelationshipId: true, patientHospitalRelationship: { select: {
          hospital: { select: { name: true } },
          appointments: {
            where: { status: "SCHEDULED", scheduledAt: { gte: now, lt: new Date(now.getTime() + FAMILY_APPOINTMENT_WINDOW_MS) } },
            orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take: 1,
            select: { id: true, type: true, scheduledAt: true, status: true },
          },
        } } },
      });

      const planGrant = await transaction.caregiverResourceGrant.findFirst({
        where: resourceGrant("HEALTH_PLAN"),
        select: { patientProfile: { select: { hospitalRelationships: {
          where: ongoingHospitalWhere, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: HOSPITAL_LIMIT,
          select: { ...serviceProgressRelationshipSelect, goalPlans: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
            select: { roundNumber: true, createdAt: true, templateKey: true, templateVersion: true, primaryGoalCode: true,
              goalWeightLossKg: true, goalWaistCm: true, goalBloodSugarMgDl: true, goalHba1cPercent: true,
              items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { activityCode: true, targetDays: true, targetValue: true, targetUnit: true } } },
          } },
        } } } },
      });

      const medicationGrant = await transaction.caregiverResourceGrant.findFirst({
        where: resourceGrant("MEDICATION"),
        select: { patientProfile: { select: { personalMedications: {
          where: { status: "ACTIVE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: MEDICATION_LIMIT,
          select: { id: true, medicationName: true, schedules: { orderBy: { localTime: "asc" }, select: { localTime: true } } },
        } } } },
      });

      const next = appointmentGrants
        .flatMap((grant) => grant.patientHospitalRelationship.appointments.map((appointment) => ({
          grantId: grant.id, appointmentId: appointment.id, hospitalName: grant.patientHospitalRelationship.hospital.name,
          type: appointment.type, scheduledAt: appointment.scheduledAt, status: appointment.status,
        })))
        .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime() || left.appointmentId.localeCompare(right.appointmentId))[0] ?? null;

      // An absent appointment grant omits the entire appointment line, including any empty-state hint.
      // Keep the existing exact-Hospital 90-day appointment scope even when HEALTH_PLAN is active.
      const appointmentByRelationship = new Map(appointmentGrants.map((grant) => [
        grant.patientHospitalRelationshipId,
        grant.patientHospitalRelationship.appointments[0]
          ? { scheduledAt: grant.patientHospitalRelationship.appointments[0].scheduledAt }
          : null,
      ]));

      return {
        relationshipId: id,
        patient: relationship.patientProfile.person,
        relationshipLabel: formatCaregiverRelationshipLabel(relationship.relationshipLabel, relationship.relationshipLabelOther),
        profile: profileGrant ? {
          age: profileGrant.patientProfile.dateOfBirth ? ageInBangkok(profileGrant.patientProfile.dateOfBirth, now) : null,
          careTeams: profileGrant.patientProfile.hospitalRelationships.map((row) => ({
            hospitalName: row.hospital.name,
            parentHospitalName: row.hospital.serviceAreaAssignments[0]?.parent.name ?? null,
            osmDisplayName: row.osmAssignments[0] ? displayName(row.osmAssignments[0].osmUser.person) : null,
            hospitalPhone: row.hospital.contact?.phoneNumber?.trim() || null,
          })),
        } : null,
        nextAppointment: appointmentGrants.length > 0 ? { appointment: next } : null,
        healthPlan: planGrant ? {
          serviceProgress: planGrant.patientProfile.hospitalRelationships.map((row) =>
            buildServiceProgress(row, appointmentByRelationship.get(row.id), { readOnly: true }).progress),
          plans: planGrant.patientProfile.hospitalRelationships.flatMap((row) => row.goalPlans.map((plan) => {
          const template = getGoalTemplate(plan.templateKey, plan.templateVersion);
          const primaryGoal = template?.primaryGoals.find((goal) => goal.code === plan.primaryGoalCode);
          if (!template || !primaryGoal) throw new InfrastructureError("The historical Goal Plan template is unavailable");
          return {
            hospitalName: row.hospital.name, roundNumber: plan.roundNumber, createdAt: plan.createdAt, primaryGoalLabel: primaryGoal.label,
            targets: { weightLossKg: plan.goalWeightLossKg, waistCm: plan.goalWaistCm, bloodSugarMgDl: plan.goalBloodSugarMgDl, hba1cPercent: plan.goalHba1cPercent },
            activities: plan.items.map((item) => {
              const activity = getGoalActivity(template, item.activityCode);
              if (!activity) throw new InfrastructureError("The historical Goal activity is unavailable");
              return { activityLabel: activity.label, targetDays: item.targetDays, targetValue: item.targetValue, targetUnit: item.targetUnit };
            }),
          };
        })) } : null,
        medications: medicationGrant ? { items: medicationGrant.patientProfile.personalMedications.map((medication) => ({
          medicationId: medication.id, medicationName: medication.medicationName,
          times: medication.schedules.map(({ localTime }) => fromMedicationTimeCarrier(localTime)),
        })) } : null,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  } catch (error: unknown) { rethrowAppointmentGrantError(error); }
}
