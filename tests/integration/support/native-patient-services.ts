import { randomUUID } from "node:crypto";

import { PatientServiceRequestStatus, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { expect } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { PATIENT_SERVICE_CODES, preferredDateBounds } from "@/modules/patient-service-requests/domain/patient-service-definitions";
import {
  createPatientServiceRequest,
  listOwnPatientServiceRequests,
} from "@/modules/patient-service-requests/services/patient-service-request-service";

/**
 * ADR-0029: a patient of the given ACTIVE Hospital sees the three native services and requests each one with no
 * Hospital setup. The patient and the requests are removed again, so the caller's cleanup stays unchanged.
 */
export async function expectEveryNativeServiceRequestable(database: PrismaClient, hospitalId: string): Promise<void> {
  const person = await database.person.create({
    data: { identityKeyHash: `native-services-${randomUUID()}`, givenName: "ผู้ป่วย", familyName: "บริการพื้นฐาน" },
    select: { id: true },
  });
  const user = await database.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE }, select: { id: true } });
  try {
    await database.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
    const profile = await database.patientProfile.create({ data: { personId: person.id }, select: { id: true } });
    const relationship = await database.patientHospitalRelationship.create({
      data: { patientProfileId: profile.id, hospitalId },
      select: { id: true },
    });
    const actor: ActorContext = {
      userId: user.id,
      personId: person.id,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const now = new Date();

    const [view] = (await listOwnPatientServiceRequests(actor, { database }))
      .filter(({ relationshipId }) => relationshipId === relationship.id);
    expect(view).toMatchObject({ hospitalActive: true, careEnded: false, services: ["SCREENING", "FOLLOW_UP", "EMPOWERMENT"] });

    for (const serviceCode of PATIENT_SERVICE_CODES) {
      await expect(createPatientServiceRequest(actor, {
        relationshipId: relationship.id,
        serviceCode,
        preferredDate: preferredDateBounds(now).min,
        preferredSlot: "ANY",
      }, { database, now: () => now })).resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    }
    expect((await database.patientServiceRequest.findMany({
      where: { patientHospitalRelationshipId: relationship.id },
      select: { serviceCode: true },
    })).map(({ serviceCode }) => serviceCode).sort()).toEqual([...PATIENT_SERVICE_CODES].sort());
  } finally {
    await database.patientServiceRequest.deleteMany({ where: { requestedByUserId: user.id } });
    await database.patientHospitalRelationship.deleteMany({ where: { patientProfile: { personId: person.id } } });
    await database.patientProfile.deleteMany({ where: { personId: person.id } });
    await database.userRole.deleteMany({ where: { userId: user.id } });
    await database.user.delete({ where: { id: user.id } });
    await database.person.delete({ where: { id: person.id } });
  }
}
