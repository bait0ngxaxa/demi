import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  projectAppointmentContactPhones,
  type AppointmentContactAudience,
  type AppointmentContactPhones,
} from "../domain/appointment-contact-phones";

/**
 * E4: loads the phones for an already-authorized appointment read. The Patient phone is only read for the
 * assigned OSM / Hospital staff audience; it follows the effective hospital-local profile rule.
 */
export async function loadAppointmentContactPhones(
  database: PrismaClient | Prisma.TransactionClient,
  patientHospitalRelationshipId: string,
  audience: AppointmentContactAudience,
): Promise<AppointmentContactPhones> {
  const relationship = await database.patientHospitalRelationship.findUnique({
    where: { id: patientHospitalRelationshipId },
    select: { hospital: { select: { contact: { select: { phoneNumber: true } } } } },
  });
  const patient = audience === "ASSIGNED_OSM_OR_HOSPITAL_STAFF"
    ? await database.patientHospitalRelationship.findUnique({
        where: { id: patientHospitalRelationshipId },
        select: {
          hospitalProfile: { select: { phoneNumber: true } },
          patientProfile: { select: { phoneNumber: true } },
        },
      })
    : null;

  return projectAppointmentContactPhones({
    hospitalPhone: relationship?.hospital.contact?.phoneNumber ?? null,
    patientPhone: patient
      ? patient.hospitalProfile
        ? patient.hospitalProfile.phoneNumber
        : patient.patientProfile.phoneNumber
      : null,
  }, audience);
}
