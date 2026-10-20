import { HospitalStatus, Prisma, Role, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import {
  getOwnNextAppointment,
  getOwnNextAppointmentForRelationship,
} from "./patient-self-care-query-service";
import { patientSelfQueryInternals } from "./patient-self-query-service";

const actor: ActorContext = {
  userId: "user-current",
  personId: "person-current",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

const asOf = new Date("2026-10-15T02:00:00.000Z");
const relationshipId = "44444444-4444-4444-8444-444444444444";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const appointment = {
  scheduledAt: asOf,
  patientHospitalRelationship: { hospital: { name: "โรงพยาบาลตัวอย่าง" } },
};

function ownRelationshipRecord(overrides: Record<string, unknown> = {}) {
  return {
    patientProfile: {
      hospitalRelationships: [
        {
          id: relationshipId,
          hospitalNumber: "HN-001",
          endedAt: null,
          hospital: {
            hospitalCode: "H-001",
            name: "โรงพยาบาลตัวอย่าง",
            status: HospitalStatus.ACTIVE,
          },
          ...overrides,
        },
      ],
    },
  };
}

function createDatabase(
  personResult: unknown = { patientProfile: { hospitalRelationships: [{ id: "internal" }] } },
  appointmentResult: unknown[] = [appointment],
  nextAppointmentResult: unknown = { id: appointmentId, scheduledAt: asOf },
) {
  const personFindFirst = vi.fn().mockResolvedValue(personResult);
  const appointmentFindMany = vi.fn().mockResolvedValue(appointmentResult);
  const appointmentFindFirst = vi.fn().mockResolvedValue(nextAppointmentResult);
  const database = {
    person: { findFirst: personFindFirst },
    patientAppointment: { findMany: appointmentFindMany, findFirst: appointmentFindFirst },
  } as unknown as Prisma.TransactionClient;
  return { database, personFindFirst, appointmentFindMany, appointmentFindFirst };
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

  it("loads the earliest scheduled appointment from one verified active self relationship", async () => {
    const { database, personFindFirst, appointmentFindFirst } = createDatabase(
      ownRelationshipRecord(),
    );

    await expect(
      getOwnNextAppointmentForRelationship(actor, relationshipId, { database, now: asOf }),
    ).resolves.toEqual({ appointmentId, scheduledAt: asOf });

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
      select: {
        patientProfile: {
          select: {
            hospitalRelationships: {
              where: { id: relationshipId },
              select: patientSelfQueryInternals.patientSelfRelationshipNavigationSelect,
            },
          },
        },
      },
    });
    expect(appointmentFindFirst).toHaveBeenCalledWith({
      where: {
        patientHospitalRelationshipId: relationshipId,
        scheduledAt: { gte: asOf },
        status: "SCHEDULED",
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: 1,
      select: { id: true, scheduledAt: true },
    });
  });

  it.each([
    ["ended care", { endedAt: new Date("2026-10-01T00:00:00.000Z") }],
    ["inactive Hospital", { hospital: { hospitalCode: "H-001", name: "โรงพยาบาลตัวอย่าง", status: HospitalStatus.SUSPENDED } }],
  ])("does not query appointments for an %s relationship", async (_label, overrides) => {
    const { database, appointmentFindFirst } = createDatabase(ownRelationshipRecord(overrides));

    await expect(
      getOwnNextAppointmentForRelationship(actor, relationshipId, { database, now: asOf }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(appointmentFindFirst).not.toHaveBeenCalled();
  });

  it("does not query appointments when the relationship belongs to another Patient", async () => {
    const { database, appointmentFindFirst } = createDatabase({ patientProfile: null });

    await expect(
      getOwnNextAppointmentForRelationship(actor, relationshipId, { database, now: asOf }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(appointmentFindFirst).not.toHaveBeenCalled();
  });

  it("rejects non-Patient actors before querying a relationship", async () => {
    const { database, personFindFirst, appointmentFindFirst } = createDatabase(
      ownRelationshipRecord(),
    );

    await expect(
      getOwnNextAppointmentForRelationship({ ...actor, roles: [] }, relationshipId, {
        database,
        now: asOf,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(personFindFirst).not.toHaveBeenCalled();
    expect(appointmentFindFirst).not.toHaveBeenCalled();
  });

  it("ignores COMPLETED, NO_SHOW, CANCELLED and past appointments when choosing the next one", async () => {
    const day = 24 * 60 * 60 * 1000;
    const rows = [
      { id: "a-completed", status: "COMPLETED", scheduledAt: new Date(asOf.getTime() + day) },
      { id: "b-no-show", status: "NO_SHOW", scheduledAt: new Date(asOf.getTime() + 2 * day) },
      { id: "c-cancelled", status: "CANCELLED", scheduledAt: new Date(asOf.getTime() + 3 * day) },
      { id: "d-past", status: "SCHEDULED", scheduledAt: new Date(asOf.getTime() - day) },
      { id: appointmentId, status: "SCHEDULED", scheduledAt: new Date(asOf.getTime() + 4 * day) },
    ];
    const { database, appointmentFindFirst } = createDatabase(ownRelationshipRecord());
    // Evaluates the issued predicate over the fixture rows instead of trusting its shape.
    appointmentFindFirst.mockImplementation(async ({ where }: {
      where: { status: unknown; scheduledAt: { gte: Date } };
    }) => rows
      .filter((row) => row.scheduledAt >= where.scheduledAt.gte)
      .filter((row) => typeof where.status === "string"
        ? row.status === where.status
        : row.status !== (where.status as { not: string }).not)
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())
      .map(({ id, scheduledAt }) => ({ id, scheduledAt }))[0] ?? null);

    await expect(
      getOwnNextAppointmentForRelationship(actor, relationshipId, { database, now: asOf }),
    ).resolves.toEqual({ appointmentId, scheduledAt: rows[4]?.scheduledAt });
  });

  it("returns empty when no upcoming appointment matches the selected relationship", async () => {
    const { database, appointmentFindFirst } = createDatabase(ownRelationshipRecord(), [], null);

    await expect(
      getOwnNextAppointmentForRelationship(actor, relationshipId, { database, now: asOf }),
    ).resolves.toBeNull();
    expect(appointmentFindFirst).toHaveBeenCalledOnce();
  });
});
