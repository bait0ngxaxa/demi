import "server-only";

import {
  AppointmentLineNotificationRecipientKind,
  CaregiverAppointmentGrantStatus,
  HospitalStatus,
  MembershipStatus,
  Role,
  UserStatus,
  type Prisma,
} from "@prisma/client";

import { FAMILY_APPOINTMENT_READ_CONTRACT } from "@/modules/family/domain/appointment-grant-contract";
import { appointmentGrantCaregiverWhere } from "@/modules/family/policies/appointment-grant-policy";
import { activePatientHospitalRelationshipWhere } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";

/**
 * Customer decision E6 (ก-24): appointment notification recipients are the Patient, the currently assigned OSM
 * and caregivers holding an ACTIVE appointment grant. The same predicates run at source (outbox) and again at send
 * time (drain), so an unassigned OSM or a revoked grant receives nothing.
 */
export type AppointmentNotificationRecipient = {
  kind: AppointmentLineNotificationRecipientKind;
  userId: string;
  grantId: string | null;
};

type Transaction = Prisma.TransactionClient;

/** The OSM of the current assignment, if that OSM may still read this relationship's appointments. */
export async function currentAssignedOsmRecipient(
  transaction: Transaction,
  patientHospitalRelationshipId: string,
): Promise<string | null> {
  const relationship = await transaction.patientHospitalRelationship.findUnique({
    where: { id: patientHospitalRelationshipId, ...activePatientHospitalRelationshipWhere },
    select: {
      hospitalId: true,
      hospital: { select: { status: true } },
      osmAssignments: {
        where: { endedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { osmUserId: true },
      },
    },
  });
  const osmUserId = relationship?.osmAssignments[0]?.osmUserId;
  if (!relationship || !osmUserId || relationship.hospital.status !== HospitalStatus.ACTIVE) return null;

  const osm = await transaction.user.findFirst({
    where: {
      id: osmUserId,
      status: UserStatus.ACTIVE,
      roles: { some: { role: Role.OSM } },
      osmHospitalRelationships: { some: { hospitalId: relationship.hospitalId, status: MembershipStatus.ACTIVE } },
    },
    select: { id: true },
  });
  return osm?.id ?? null;
}

/** Whether this caregiver has an ACTIVE appointment grant for this relationship. */
async function hasActiveCaregiverAppointmentGrantFor(
  transaction: Transaction,
  input: { grantId?: string; caregiverUserId: string; patientHospitalRelationshipId: string },
): Promise<boolean> {
  const caregiver = await transaction.user.findUnique({
    where: { id: input.caregiverUserId },
    select: { id: true, personId: true },
  });
  if (!caregiver) return false;
  const grant = await transaction.caregiverAppointmentGrant.findFirst({
    where: {
      AND: [
        {
          ...(input.grantId ? { id: input.grantId } : {}),
          patientHospitalRelationshipId: input.patientHospitalRelationshipId,
        },
        appointmentGrantCaregiverWhere(
          { userId: caregiver.id, personId: caregiver.personId, roles: [], hospitalMemberships: [], osmHospitalRelationships: [] },
          "ACTIVE",
        ),
      ],
    },
    select: { id: true },
  });
  return grant !== null;
}

/** Whether this exact grant is still an ACTIVE appointment grant of this caregiver for this relationship. */
export async function isActiveCaregiverAppointmentGrant(
  transaction: Transaction,
  input: { grantId: string; caregiverUserId: string; patientHospitalRelationshipId: string },
): Promise<boolean> {
  return hasActiveCaregiverAppointmentGrantFor(transaction, input);
}

/** Whether any current grant gives this caregiver appointment access to the relationship. */
export async function hasActiveCaregiverAppointmentGrant(
  transaction: Transaction,
  input: { caregiverUserId: string; patientHospitalRelationshipId: string },
): Promise<boolean> {
  return hasActiveCaregiverAppointmentGrantFor(transaction, input);
}

async function activeCaregiverRecipients(
  transaction: Transaction,
  patientHospitalRelationshipId: string,
): Promise<AppointmentNotificationRecipient[]> {
  const candidates = await transaction.caregiverAppointmentGrant.findMany({
    where: {
      patientHospitalRelationshipId,
      contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT,
      status: CaregiverAppointmentGrantStatus.ACTIVE,
      revokedAt: null,
    },
    orderBy: { id: "asc" },
    select: { id: true, caregiverUserId: true },
  });
  const recipients: AppointmentNotificationRecipient[] = [];
  for (const candidate of candidates) {
    if (await isActiveCaregiverAppointmentGrant(transaction, {
      grantId: candidate.id,
      caregiverUserId: candidate.caregiverUserId,
      patientHospitalRelationshipId,
    })) {
      recipients.push({ kind: AppointmentLineNotificationRecipientKind.CAREGIVER, userId: candidate.caregiverUserId, grantId: candidate.id });
    }
  }
  return recipients;
}

/**
 * Additional (non-Patient) recipients at source. One entry per User: a User who is also the Patient or already
 * listed (for example an OSM who is also a caregiver) is notified once.
 */
export async function resolveAdditionalAppointmentNotificationRecipients(
  transaction: Transaction,
  input: { patientHospitalRelationshipId: string; patientUserId: string | null; familyAppointmentReadEnabled: boolean },
): Promise<AppointmentNotificationRecipient[]> {
  const seen = new Set(input.patientUserId ? [input.patientUserId] : []);
  const recipients: AppointmentNotificationRecipient[] = [];
  const osmUserId = await currentAssignedOsmRecipient(transaction, input.patientHospitalRelationshipId);
  const candidates: AppointmentNotificationRecipient[] = [
    ...(osmUserId ? [{ kind: AppointmentLineNotificationRecipientKind.OSM, userId: osmUserId, grantId: null }] : []),
    ...(input.familyAppointmentReadEnabled
      ? await activeCaregiverRecipients(transaction, input.patientHospitalRelationshipId)
      : []),
  ];
  for (const candidate of candidates) {
    if (seen.has(candidate.userId)) continue;
    seen.add(candidate.userId);
    recipients.push(candidate);
  }
  return recipients;
}
