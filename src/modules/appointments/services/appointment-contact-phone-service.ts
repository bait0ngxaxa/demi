import "server-only";

import { loadAssignedOsmPhone } from "@/modules/patient-assignment/services/assigned-osm-phone";

import type { Prisma, PrismaClient } from "@prisma/client";

import { isPatientHospitalRelationshipEnded } from "@/modules/patient-hospital-relationship/domain/patient-hospital-relationship-lifecycle";

import {
  projectAppointmentContactPhones,
  type AppointmentContactAudience,
  type AppointmentContactPhones,
} from "../domain/appointment-contact-phones";

/**
 * E4: loads the phones for an already-authorized appointment read. The Patient phone is only read for the
 * assigned OSM / Hospital staff audience; it follows the effective hospital-local profile rule. Phase F: an
 * ended relationship (Patient history only) shows no Hospital phone.
 */
export async function loadAppointmentContactPhones(
  database: PrismaClient | Prisma.TransactionClient,
  patientHospitalRelationshipId: string,
  audience: AppointmentContactAudience,
): Promise<AppointmentContactPhones> {
  const relationship = await database.patientHospitalRelationship.findUnique({
    where: { id: patientHospitalRelationshipId },
    select: { endedAt: true, hospital: { select: { contact: { select: { phoneNumber: true } } } } },
  });
  const patient = (audience === "ASSIGNED_OSM_OR_HOSPITAL_STAFF" || audience === "HOSPITAL_STAFF")
    ? await database.patientHospitalRelationship.findUnique({
        where: { id: patientHospitalRelationshipId },
        select: {
          hospitalProfile: { select: { phoneNumber: true } },
          patientProfile: { select: { phoneNumber: true } },
        },
      })
    : null;

  return projectAppointmentContactPhones({
    assignedOsmPhone: audience === "PATIENT_SELF" || audience === "HOSPITAL_STAFF"
      ? await loadAssignedOsmPhone(database, patientHospitalRelationshipId) : null,
    hospitalPhone: relationship && !isPatientHospitalRelationshipEnded(relationship)
      ? relationship.hospital.contact?.phoneNumber ?? null
      : null,
    patientPhone: patient
      ? patient.hospitalProfile
        ? patient.hospitalProfile.phoneNumber
        : patient.patientProfile.phoneNumber
      : null,
  }, audience);
}
