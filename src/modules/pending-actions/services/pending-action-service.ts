import "server-only";

import { cache } from "react";
import { Role, type Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { createActorContextStore, resolveActorAccessByUserId } from "@/modules/auth/services/actor-context-service";
import {
  countWorkAppointmentAcceptanceByHospital,
  countWorkAppointmentRequests,
} from "@/modules/appointments/services/work-appointment-query-service";
import { decidePatientServiceRequestPolicy, PATIENT_SERVICE_REQUEST_CAPABILITIES } from "@/modules/patient-service-requests/policies/patient-service-request-policy";
import { hospitalOperatedByWhere } from "@/modules/identity/services/hospital-authority";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";
import { ApplicationError, ForbiddenError } from "@/shared/errors/application-error";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

export type PendingActionIndicator = {
  /** Existing navigation destination; no new navigation entries are created. */
  navigationHref: string;
  href: string;
  count: number;
  label: string;
};

/** Only a server-authenticated user ID enters here. Roles and scopes are resolved again from persistence. */
export async function calculatePendingActions(
  userId: string,
  database: PrismaClient | Prisma.TransactionClient = getPrisma(),
  now: Date = new Date(),
): Promise<readonly PendingActionIndicator[]> {
  try {
    const access = await resolveActorAccessByUserId(userId, createActorContextStore(database));
    if (access.status !== "AUTHORIZED") throw new ForbiddenError();
    const actor = access.actor;
    if (actor.roles.includes(Role.ADMIN)) {
      const [onboarding, support] = await Promise.all([
        database.hospitalOnboardingApplication.count({ where: { status: "PENDING" } }),
        database.supportReport.count({ where: { status: "NEW" } }),
      ]);
      return [
        { navigationHref: "/app/admin/hospital-onboarding", href: "/app/admin/hospital-onboarding", count: onboarding, label: "คำขอขึ้นทะเบียนโรงพยาบาลรอพิจารณา" },
        { navigationHref: "/app/admin/support", href: "/app/admin/support?status=NEW", count: support, label: "รายงานปัญหาใหม่รอดำเนินการ" },
      ];
    }

    const hospitalIds = [...new Set(actor.hospitalMemberships.filter(({ hospitalId }) =>
      decidePatientServiceRequestPolicy({ actor, hospitalId, capability: PATIENT_SERVICE_REQUEST_CAPABILITIES.review }).allowed,
    ).map(({ hospitalId }) => hospitalId))];
    const dependencies = { database, now: () => now };
    const [serviceRequests, appointmentRequests, acceptances] = await Promise.all([
      hospitalIds.length === 0 ? 0 : database.patientServiceRequest.count({ where: {
        status: "PENDING",
        hospitalId: { in: hospitalIds },
        relationship: { is: {
          ...activePatientHospitalRelationshipWhere,
          hospital: { is: hospitalOperatedByWhere(actor.userId) },
        } },
      } }),
      Promise.all(hospitalIds.map(async (hospitalId) => ({
        hospitalId, count: await countWorkAppointmentRequests(actor, hospitalId, dependencies),
      }))),
      countWorkAppointmentAcceptanceByHospital(actor, dependencies),
    ]);
    const appointmentCounts = actor.roles.includes(Role.OSM) ? acceptances : appointmentRequests;
    const firstPending = appointmentCounts.find(({ count }) => count > 0);
    const appointmentCount = appointmentCounts.reduce((total, { count }) => total + count, 0);
    const tab = actor.roles.includes(Role.OSM) ? "AWAITING_MY_ACCEPTANCE" : "PENDING_REQUESTS";
    return [
      ...(hospitalIds.length === 0 ? [] : [{
        navigationHref: "/app/patients/service-requests", href: "/app/patients/service-requests?group=PENDING",
        count: serviceRequests, label: "คำขอรับบริการรอพิจารณา",
      }]),
      ...(hospitalIds.length === 0 && !actor.roles.includes(Role.OSM) ? [] : [{
        navigationHref: "/app/appointments",
        href: firstPending ? `/app/appointments?${new URLSearchParams({ tab, hospitalId: firstPending.hospitalId })}` : "/app/appointments",
        count: appointmentCount,
        label: actor.roles.includes(Role.OSM) ? "นัดหมายรอคุณตอบรับในโรงพยาบาลที่คุณมีสิทธิ์" : "คำขอนัดหมายรอพิจารณาในโรงพยาบาลที่คุณมีสิทธิ์",
      }]),
    ];
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw toInfrastructureError("pending-actions.calculate", error, "Pending actions could not be loaded");
  }
}

/** Request-local deduplication for the layout and More page; never a cross-user or persistent cache. */
export const getPendingActions = cache(async (userId: string): Promise<readonly PendingActionIndicator[]> =>
  calculatePendingActions(userId),
);
