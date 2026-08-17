import {
  AppointmentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
  appointmentServiceInternals,
  type AppointmentDatabase,
} from "./appointment-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const hospitalUserId = "44444444-4444-4444-8444-444444444444";
const responsibleUserId = "55555555-5555-4555-8555-555555555555";
const personId = "66666666-6666-4666-8666-666666666666";
const nonce = "77777777-7777-4777-8777-777777777777";
const now = new Date("2026-08-17T05:00:00.000Z");
const scheduledAt = new Date("2026-08-20T03:30:00.000Z");

const hospitalActor: ActorContext = {
  userId: hospitalUserId,
  personId,
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: nonce,
    scheduledAt: "2026-08-20T10:30:00+07:00",
    type: "FOLLOW_UP",
    responsibleUserId,
    durationMinutes: 30,
    locationType: "CLINIC",
    locationDetail: "ห้องตรวจ 1",
    note: "รายละเอียดที่ไม่ควรอยู่ใน audit",
    ...overrides,
  };
}

function rescheduleInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    appointmentId,
    expectedUpdatedAt: now.toISOString(),
    scheduledAt: "2026-08-21T10:30:00+07:00",
    type: "FOLLOW_UP",
    responsibleUserId,
    durationMinutes: 30,
    locationType: "CLINIC",
    locationDetail: "ห้องตรวจ 1",
    note: "รายละเอียดที่ไม่ควรอยู่ใน audit",
    ...overrides,
  };
}

type AppointmentHashFields = Parameters<
  typeof appointmentServiceInternals.createAppointmentRequestHash
>[2];

function requestHash(
  actor: ActorContext = hospitalActor,
  patientRelationshipId = relationshipId,
  overrides: Partial<AppointmentHashFields> = {},
): string {
  const fields: AppointmentHashFields = {
    scheduledAt,
    type: "FOLLOW_UP",
    responsibleUserId,
    durationMinutes: 30,
    locationType: "CLINIC",
    locationDetail: "ห้องตรวจ 1",
    note: "รายละเอียดที่ไม่ควรอยู่ใน audit",
    ...overrides,
  };

  return appointmentServiceInternals.createAppointmentRequestHash(actor, patientRelationshipId, fields);
}

function appointmentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: appointmentId,
    patientHospitalRelationshipId: relationshipId,
    responsibleUserId,
    createdByUserId: hospitalUserId,
    type: "FOLLOW_UP",
    scheduledAt,
    durationMinutes: 30,
    locationType: "CLINIC",
    locationDetail: "ห้องตรวจ 1",
    note: "รายละเอียดที่ไม่ควรอยู่ใน audit",
    status: AppointmentStatus.SCHEDULED,
    submissionNonce: nonce,
    creationRequestHash: requestHash(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createDatabase(input: {
  existing?: Record<string, unknown> | null;
  findUniqueResults?: Array<Record<string, unknown> | null>;
  findFirstResults?: Array<Record<string, unknown> | null>;
  createResult?: Record<string, unknown>;
  updateCount?: number;
  responsibleEligible?: boolean;
} = {}): {
  database: AppointmentDatabase;
  transaction: {
    patientAppointment: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    hospitalMembership: { findFirst: ReturnType<typeof vi.fn> };
  };
} {
  const findFirstResults = input.findFirstResults ?? [];
  let findFirstIndex = 0;
  let findUniqueIndex = 0;
  const transaction = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: hospitalUserId,
        personId,
        status: UserStatus.ACTIVE,
        roles: [{ role: Role.HOSPITAL }],
        memberships: [
          {
            hospitalId,
            membershipType: MembershipType.MEMBER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          },
        ],
        osmHospitalRelationships: [],
      }),
    },
    patientHospitalRelationship: {
      findUnique: vi.fn().mockResolvedValue({
        id: relationshipId,
        hospitalId,
        hospitalNumber: "HN-001",
        hospital: { id: hospitalId, name: "โรงพยาบาล ก", status: HospitalStatus.ACTIVE },
        patientProfile: {
          person: {
            givenName: "สมชาย",
            familyName: "ผู้ป่วย",
            user: { roles: [{ role: Role.PATIENT }] },
          },
        },
        osmAssignments: [],
      }),
    },
    hospitalMembership: {
      findFirst: vi.fn().mockResolvedValue(
        input.responsibleEligible === false ? null : { userId: responsibleUserId },
      ),
    },
    patientAppointment: {
      findUnique: vi.fn().mockImplementation(async () => {
        if (input.findUniqueResults) {
          const result = input.findUniqueResults[findUniqueIndex];
          findUniqueIndex += 1;
          return result ?? null;
        }

        return input.existing ?? null;
      }),
      findFirst: vi.fn().mockImplementation(async () => {
        const result = findFirstResults[findFirstIndex];
        findFirstIndex += 1;
        return result ?? null;
      }),
      create: vi.fn().mockResolvedValue(input.createResult ?? appointmentRecord()),
      updateMany: vi.fn().mockResolvedValue({ count: input.updateCount ?? 1 }),
    },
  };

  const database = {
    $transaction: vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(transaction as unknown as Prisma.TransactionClient),
    ),
  } as unknown as AppointmentDatabase;

  return { database, transaction };
}

function transitionInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    patientHospitalRelationshipId: relationshipId,
    appointmentId,
    expectedUpdatedAt: now.toISOString(),
    ...overrides,
  };
}

describe("Appointment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAudit.mockResolvedValue(undefined);
  });

  it("resolves the exact relationship, derives creator, forces SCHEDULED, and audits atomically", async () => {
    const { database, transaction } = createDatabase();

    const result = await createAppointment(hospitalActor, validInput(), {
      database,
      now: () => now,
    });

    expect(result).toMatchObject({
      appointmentId,
      patientHospitalRelationshipId: relationshipId,
      hospitalId,
      status: AppointmentStatus.SCHEDULED,
    });
    expect(transaction.patientAppointment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientHospitalRelationshipId: relationshipId,
        createdByUserId: hospitalUserId,
        status: AppointmentStatus.SCHEDULED,
        type: "FOLLOW_UP",
        creationRequestHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
      select: expect.anything(),
    });
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "appointment.created",
        resourceType: "PatientAppointment",
        metadata: expect.objectContaining({ hospitalId, toStatus: AppointmentStatus.SCHEDULED }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(mockedAudit.mock.calls[0]?.[0])).not.toContain("รายละเอียดที่ไม่ควรอยู่ใน audit");
  });

  it("returns the existing Appointment for the same nonce and rejects a changed payload", async () => {
    const existing = appointmentRecord();
    const { database, transaction } = createDatabase({ existing });

    await expect(createAppointment(hospitalActor, validInput(), { database })).resolves.toMatchObject({
      appointmentId,
      status: AppointmentStatus.SCHEDULED,
    });
    expect(transaction.patientAppointment.create).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();

    await expect(
      createAppointment(hospitalActor, validInput({ note: "เปลี่ยน payload" }), { database }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("keeps the original create retry idempotent after reschedule", async () => {
    const original = appointmentRecord();
    const rescheduled = appointmentRecord({
      scheduledAt: new Date("2026-08-21T03:30:00.000Z"),
      type: "CONSULTATION",
      durationMinutes: 45,
      locationType: "ONLINE",
      locationDetail: "ห้องประชุมออนไลน์",
      note: "หมายเหตุหลังเลื่อนนัด",
      updatedAt: new Date("2026-08-17T05:00:02.000Z"),
      creationRequestHash: original.creationRequestHash,
    });
    const { database, transaction } = createDatabase({
      findUniqueResults: [null, rescheduled],
      findFirstResults: [original, rescheduled],
      createResult: original,
    });

    const first = await createAppointment(hospitalActor, validInput(), { database, now: () => now });
    const updated = await rescheduleAppointment(
      hospitalActor,
      rescheduleInput({ expectedUpdatedAt: first.updatedAt.toISOString() }),
      { database, now: () => now },
    );

    transaction.hospitalMembership.findFirst.mockResolvedValue(null);

    const replay = await createAppointment(hospitalActor, validInput(), { database, now: () => now });

    expect(updated.status).toBe(AppointmentStatus.SCHEDULED);
    expect(replay).toMatchObject({ appointmentId, status: AppointmentStatus.SCHEDULED });
    expect(transaction.patientAppointment.create).toHaveBeenCalledOnce();
    expect(mockedAudit).toHaveBeenCalledTimes(2);
    expect(mockedAudit.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ action: "appointment.created" }),
    );
    expect(mockedAudit.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ action: "appointment.rescheduled" }),
    );
  });

  it("compares a changed retry against the immutable original create fingerprint", async () => {
    const original = appointmentRecord();
    const rescheduled = appointmentRecord({
      scheduledAt: new Date("2026-08-21T03:30:00.000Z"),
      note: "หมายเหตุหลังเลื่อนนัด",
      updatedAt: new Date("2026-08-17T05:00:02.000Z"),
      creationRequestHash: original.creationRequestHash,
    });
    const { database, transaction } = createDatabase({
      findUniqueResults: [null, rescheduled],
      findFirstResults: [original, rescheduled],
      createResult: original,
    });

    const first = await createAppointment(hospitalActor, validInput(), { database, now: () => now });
    await rescheduleAppointment(
      hospitalActor,
      rescheduleInput({ expectedUpdatedAt: first.updatedAt.toISOString() }),
      { database, now: () => now },
    );

    await expect(
      createAppointment(hospitalActor, validInput({ note: "เปลี่ยน payload เดิม" }), { database }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientAppointment.create).toHaveBeenCalledOnce();
  });

  it("returns the current terminal state when the original create is replayed", async () => {
    const original = appointmentRecord();
    const completed = appointmentRecord({
      status: AppointmentStatus.COMPLETED,
      updatedAt: new Date("2026-08-17T05:00:02.000Z"),
      creationRequestHash: original.creationRequestHash,
    });
    const { database, transaction } = createDatabase({
      findUniqueResults: [null, completed],
      findFirstResults: [original, completed],
      createResult: original,
    });

    const first = await createAppointment(hospitalActor, validInput(), { database, now: () => now });
    const completion = await completeAppointment(
      hospitalActor,
      transitionInput({ expectedUpdatedAt: first.updatedAt.toISOString() }),
      { database, now: () => now },
    );
    const replay = await createAppointment(hospitalActor, validInput(), { database, now: () => now });

    expect(completion.status).toBe(AppointmentStatus.COMPLETED);
    expect(replay).toMatchObject({ appointmentId, status: AppointmentStatus.COMPLETED });
    expect(transaction.patientAppointment.create).toHaveBeenCalledOnce();
    expect(mockedAudit).toHaveBeenCalledTimes(2);
    expect(mockedAudit.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ action: "appointment.created" }),
    );
    expect(mockedAudit.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ action: "appointment.completed" }),
    );
  });

  it("normalizes equivalent note and timestamp spellings to the same create identity", async () => {
    const existing = appointmentRecord({
      responsibleUserId: null,
      creationRequestHash: requestHash(hospitalActor, relationshipId, {
        responsibleUserId: null,
        note: "note",
      }),
    });
    const { database, transaction } = createDatabase({
      findUniqueResults: [null, existing],
      createResult: existing,
    });

    await createAppointment(
      hospitalActor,
      validInput({ responsibleUserId: null, note: " note " }),
      { database },
    );
    await expect(
      createAppointment(
        hospitalActor,
        validInput({ responsibleUserId: null, note: "note", scheduledAt: "2026-08-20T03:30:00Z" }),
        { database },
      ),
    ).resolves.toMatchObject({ appointmentId });

    expect(transaction.patientAppointment.create).toHaveBeenCalledOnce();
  });

  it("rejects the same nonce when replayed by another actor", async () => {
    const otherActor: ActorContext = {
      ...hospitalActor,
      userId: "88888888-8888-4888-8888-888888888888",
    };
    const { database, transaction } = createDatabase({ existing: appointmentRecord() });

    await expect(createAppointment(otherActor, validInput(), { database })).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientAppointment.create).not.toHaveBeenCalled();
  });

  it("fails safely when a pre-fix row has no immutable create fingerprint", async () => {
    const { database, transaction } = createDatabase({ existing: appointmentRecord({ creationRequestHash: null }) });

    await expect(createAppointment(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientAppointment.create).not.toHaveBeenCalled();
  });

  it("revalidates responsible staff against active direct membership in the same Hospital", async () => {
    const { database } = createDatabase({ responsibleEligible: false });

    await expect(createAppointment(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects client authority fields before touching the database", async () => {
    const { database, transaction } = createDatabase();

    await expect(
      createAppointment(hospitalActor, {
        ...validInput(),
        hospitalId,
        createdByUserId: hospitalUserId,
        status: "COMPLETED",
      }, { database }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(transaction.patientAppointment.create).not.toHaveBeenCalled();
  });

  it("reschedules only a current SCHEDULED Appointment and emits one audit event", async () => {
    const updatedAt = new Date("2026-08-17T05:00:01.000Z");
    const current = appointmentRecord({ updatedAt });
    const updated = appointmentRecord({
      scheduledAt: new Date("2026-08-21T03:30:00.000Z"),
      updatedAt: new Date("2026-08-17T05:00:02.000Z"),
    });
    const { database, transaction } = createDatabase({ findFirstResults: [current, updated] });

    const result = await rescheduleAppointment(
      hospitalActor,
      {
        ...rescheduleInput(),
        expectedUpdatedAt: updatedAt.toISOString(),
      },
      { database, now: () => now },
    );

    expect(result.status).toBe(AppointmentStatus.SCHEDULED);
    expect(transaction.patientAppointment.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: AppointmentStatus.SCHEDULED, updatedAt }),
      data: expect.objectContaining({ updatedAt: expect.any(Date) }),
    });
    expect(mockedAudit).toHaveBeenCalledOnce();
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "appointment.rescheduled" }),
      expect.anything(),
    );
  });

  it("rejects stale reschedule and terminal updates", async () => {
    const current = appointmentRecord({ updatedAt: new Date("2026-08-17T05:00:01.000Z") });
    const { database, transaction } = createDatabase({ findFirstResults: [current] });

    await expect(
      rescheduleAppointment(
        hospitalActor,
        rescheduleInput({ expectedUpdatedAt: now.toISOString() }),
        { database },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(transaction.patientAppointment.updateMany).not.toHaveBeenCalled();

    const terminal = createDatabase({ findFirstResults: [current] });
    await expect(
      cancelAppointment(hospitalActor, transitionInput(), { database: terminal.database }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it.each([
    ["cancel", cancelAppointment, AppointmentStatus.CANCELLED, "appointment.cancelled"],
    ["complete", completeAppointment, AppointmentStatus.COMPLETED, "appointment.completed"],
  ] as const)("supports explicit %s transition from SCHEDULED", async (_label, operation, status, action) => {
    const current = appointmentRecord();
    const updated = appointmentRecord({ status });
    const { database } = createDatabase({ findFirstResults: [current, updated] });

    const result = await operation(hospitalActor, transitionInput(), {
      database,
      now: () => now,
    });

    expect(result.status).toBe(status);
    expect(mockedAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action, metadata: expect.objectContaining({ fromStatus: "SCHEDULED", toStatus: status }) }),
      expect.anything(),
    );
  });

  it("treats a repeated exact terminal action as idempotent and rejects a conflicting action", async () => {
    const cancelled = appointmentRecord({ status: AppointmentStatus.CANCELLED });
    const repeated = createDatabase({ findFirstResults: [cancelled] });

    await expect(cancelAppointment(hospitalActor, transitionInput(), { database: repeated.database })).resolves.toMatchObject({
      status: AppointmentStatus.CANCELLED,
    });
    expect(repeated.transaction.patientAppointment.updateMany).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();

    const completed = createDatabase({ findFirstResults: [appointmentRecord({ status: AppointmentStatus.COMPLETED })] });
    await expect(cancelAppointment(hospitalActor, transitionInput(), { database: completed.database })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("requires server time to mark a past Appointment as NO_SHOW", async () => {
    const past = appointmentRecord({ scheduledAt: new Date("2026-08-17T04:59:00.000Z") });
    const updated = appointmentRecord({ scheduledAt: past.scheduledAt, status: AppointmentStatus.NO_SHOW });
    const pastDatabase = createDatabase({ findFirstResults: [past, updated] });

    await expect(
      markAppointmentNoShow(hospitalActor, transitionInput(), { database: pastDatabase.database, now: () => now }),
    ).resolves.toMatchObject({ status: AppointmentStatus.NO_SHOW });

    const future = createDatabase({ findFirstResults: [appointmentRecord()] });
    await expect(
      markAppointmentNoShow(hospitalActor, transitionInput(), { database: future.database, now: () => now }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not report success when audit persistence fails", async () => {
    mockedAudit.mockRejectedValue(new InfrastructureError("audit unavailable"));
    const { database } = createDatabase();

    await expect(createAppointment(hospitalActor, validInput(), { database })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
  });
});
