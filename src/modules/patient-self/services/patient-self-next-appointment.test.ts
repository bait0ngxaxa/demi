import { Prisma, Role, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError } from "@/shared/errors/application-error";

import { getOwnNextAppointment } from "./patient-self-care-query-service";
import { patientSelfQueryInternals } from "./patient-self-query-service";

const actor: ActorContext = {
  userId: "user-current",
  personId: "person-current",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const asOf = new Date("2026-10-15T02:00:00.000Z");
const appointment = {
  scheduledAt: asOf,
  patientHospitalRelationship: { hospital: { name: "โรงพยาบาลตัวอย่าง" } },
};

function createDatabase(
  personResult: unknown = { patientProfile: { hospitalRelationships: [{ id: "internal" }] } },
  appointmentResult: unknown[] = [appointment],
) {
  const personFindFirst = vi.fn().mockResolvedValue(personResult);
  const appointmentFindMany = vi.fn().mockResolvedValue(appointmentResult);
  const database = {
    person: { findFirst: personFindFirst },
    patientAppointment: { findMany: appointmentFindMany },
  } as unknown as Prisma.TransactionClient;
  return { database, personFindFirst, appointmentFindMany };
}

describe("Patient SELF next appointment query", () => {
  it("verifies current persisted SELF identity, then reads one narrow nearest appointment", async () => {
    const { database, personFindFirst, appointmentFindMany } = createDatabase();
    const captureAsOf = vi.fn(() => asOf);

    const result = await getOwnNextAppointment(actor, captureAsOf, { database });

    expect(result).toEqual({
      status: "AUTHORIZED",
      appointment: { scheduledAt: asOf, hospitalName: "โรงพยาบาลตัวอย่าง" },
    });
    expect(personFindFirst).toHaveBeenCalledWith({
      where: {
        id: actor.personId,
        user: {
          is: {
            id: actor.userId,
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.PATIENT } },
          },
        },
      },
      select: patientSelfQueryInternals.ownPatientAppointmentIdentitySelect,
    });
    expect(captureAsOf).toHaveBeenCalledOnce();
    expect(appointmentFindMany).toHaveBeenCalledOnce();
    expect(appointmentFindMany).toHaveBeenCalledWith({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: asOf },
        patientHospitalRelationship: {
          is: {
            patientProfile: { is: { personId: actor.personId } },
          },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: 1,
      select: {
        scheduledAt: true,
        patientHospitalRelationship: {
          select: { hospital: { select: { name: true } } },
        },
      },
    });
    const projection = JSON.stringify(result);
    expect(projection).not.toMatch(/appointmentId|relationshipId|patientId|duration|location|staff|osm|acknowledgement|cancellation/i);
  });

  it.each([
    ["missing PatientProfile", { patientProfile: null }],
    ["no own Hospital relationship", { patientProfile: { hospitalRelationships: [] } }],
    ["stale User/Person/role authority", null],
  ])("returns ineligible for %s without reading an appointment", async (_label, personResult) => {
    const { database, appointmentFindMany } = createDatabase(personResult);
    const captureAsOf = vi.fn(() => asOf);

    await expect(getOwnNextAppointment(actor, captureAsOf, { database })).resolves.toEqual({
      status: "INELIGIBLE",
    });
    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(captureAsOf).not.toHaveBeenCalled();
  });

  it("denies a non-Patient ActorContext before any persisted identity query", async () => {
    const { database, personFindFirst, appointmentFindMany } = createDatabase();
    const nonPatientActor = { ...actor, roles: [] };

    await expect(getOwnNextAppointment(nonPatientActor, () => asOf, { database })).resolves.toEqual({
      status: "INELIGIBLE",
    });
    expect(personFindFirst).not.toHaveBeenCalled();
    expect(appointmentFindMany).not.toHaveBeenCalled();
  });

  it("returns authorized empty after exactly one SCHEDULED query", async () => {
    const { database, appointmentFindMany } = createDatabase(undefined, []);

    await expect(getOwnNextAppointment(actor, () => asOf, { database })).resolves.toEqual({
      status: "AUTHORIZED",
      appointment: null,
    });
    expect(appointmentFindMany).toHaveBeenCalledOnce();
    const query = appointmentFindMany.mock.calls[0]?.[0];
    expect(query?.where).toMatchObject({
      status: "SCHEDULED",
      scheduledAt: { gte: asOf },
    });
    expect(JSON.stringify(query?.where)).not.toMatch(/hospital.*status|osm|family|90/i);
  });

  it("maps database failures to an infrastructure error", async () => {
    const { database, appointmentFindMany } = createDatabase();
    appointmentFindMany.mockRejectedValue(new Error("private database detail"));

    await expect(getOwnNextAppointment(actor, () => asOf, { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });
});
