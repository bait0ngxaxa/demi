import {
  AppointmentCancellationRequestStatus,
  AppointmentInteractionSource,
  AppointmentStatus,
  HospitalStatus,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, InfrastructureError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: mockedAudit }));

import {
  acknowledgeAppointmentOnBehalfOfPatient,
  acknowledgeOwnPatientAppointment,
  requestOwnPatientAppointmentCancellation,
  type AppointmentDatabase,
  type AppointmentInteractionPrecondition,
} from "./appointment-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const patientUserId = "44444444-4444-4444-8444-444444444444";
const nonce = "77777777-7777-4777-8777-777777777777";
const version = new Date("2026-08-17T05:00:00.000Z");

const patient: ActorContext = {
  userId: patientUserId, personId: "66666666-6666-4666-8666-666666666666",
  roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [],
};
const acknowledgement = { patientHospitalRelationshipId: relationshipId, appointmentId, expectedUpdatedAt: version.toISOString() };
const cancellation = { ...acknowledgement, submissionNonce: nonce };

type Calls = string[];

/** Transaction double recording every model call in order, so "precondition first" is observable. */
function createDatabase(overrides: Record<string, unknown> = {}): { database: AppointmentDatabase; calls: Calls; attempts: () => number } {
  const calls: Calls = [];
  let attempts = 0;
  const results: Record<string, unknown> = {
    "patientHospitalRelationship.findUnique": {
      id: relationshipId, hospitalId, hospitalNumber: "HN-1",
      hospital: { id: hospitalId, name: "โรงพยาบาล ก", status: HospitalStatus.ACTIVE },
      patientProfile: { person: { givenName: "ก", familyName: "ข", user: { id: patientUserId, roles: [{ role: Role.PATIENT }] } } },
      osmAssignments: [],
    },
    "user.findUnique": {
      id: patientUserId, personId: patient.personId, status: UserStatus.ACTIVE,
      roles: [{ role: Role.PATIENT }], memberships: [], osmHospitalRelationships: [],
    },
    "patientAppointment.findFirst": { id: appointmentId, status: AppointmentStatus.SCHEDULED, updatedAt: version },
    "patientAppointmentAcknowledgement.findUnique": null,
    "patientAppointmentAcknowledgement.create": {
      source: AppointmentInteractionSource.PATIENT_SELF, sourceAppointmentUpdatedAt: version, acknowledgedAt: version,
    },
    "patientAppointmentCancellationRequest.findUnique": null,
    "patientAppointmentCancellationRequest.findFirst": null,
    "patientAppointmentCancellationRequest.create": {
      id: "88888888-8888-4888-8888-888888888888", source: AppointmentInteractionSource.PATIENT_SELF,
      status: AppointmentCancellationRequestStatus.PENDING, sourceAppointmentUpdatedAt: version, submittedAt: version,
    },
    ...overrides,
  };
  const transaction = new Proxy({}, {
    get: (_target, model: string) => new Proxy({}, {
      get: (_inner, method: string) => async () => {
        calls.push(`${model}.${method}`);
        return results[`${model}.${method}`];
      },
    }),
  });
  const database = {
    $transaction: vi.fn(async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      attempts += 1;
      calls.push(`attempt:${attempts}`);
      return operation(transaction as Prisma.TransactionClient);
    }),
  } as unknown as AppointmentDatabase;
  return { database, calls, attempts: () => attempts };
}

function recordingPrecondition(calls: Calls): AppointmentInteractionPrecondition {
  return vi.fn(async (_transaction, actor) => {
    calls.push(`precondition:${actor.userId}`);
  });
}

function afterEachAttempt(calls: Calls): string[] {
  return calls.filter((call, index) => calls[index - 1]?.startsWith("attempt:"));
}

describe("Patient SELF interaction precondition seam", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["first acknowledgement", acknowledgeOwnPatientAppointment, acknowledgement, {}],
    ["already-acknowledged idempotent return", acknowledgeOwnPatientAppointment, acknowledgement, {
      "patientAppointmentAcknowledgement.findUnique": { source: AppointmentInteractionSource.PATIENT_SELF, sourceAppointmentUpdatedAt: version, acknowledgedAt: version },
    }],
    ["first cancellation request", requestOwnPatientAppointmentCancellation, cancellation, {}],
    ["submissionNonce replay", requestOwnPatientAppointmentCancellation, cancellation, {
      "patientAppointmentCancellationRequest.findUnique": {
        id: "99999999-9999-4999-8999-999999999999", appointmentId, submittedByUserId: patientUserId,
        source: AppointmentInteractionSource.PATIENT_SELF, status: AppointmentCancellationRequestStatus.PENDING,
        sourceAppointmentUpdatedAt: version, submittedAt: version,
      },
    }],
    ["existing pending request reuse", requestOwnPatientAppointmentCancellation, cancellation, {
      "patientAppointmentCancellationRequest.findFirst": {
        id: "99999999-9999-4999-8999-999999999999", source: AppointmentInteractionSource.PATIENT_SELF,
        status: AppointmentCancellationRequestStatus.PENDING, sourceAppointmentUpdatedAt: version, submittedAt: version,
      },
    }],
  ] as const)("runs the precondition first for the %s, before access, resource reads, returns and writes", async (_label, service, input, overrides) => {
    const { database, calls } = createDatabase(overrides);
    await service(patient, input, { database, beforeInteractionInTransaction: recordingPrecondition(calls) });
    expect(calls[0]).toBe("attempt:1");
    expect(calls[1]).toBe(`precondition:${patientUserId}`);
    expect(calls[2]).toBe("patientHospitalRelationship.findUnique");
    expect(calls.filter((call) => call.startsWith("precondition:"))).toHaveLength(1);
  });

  it("aborts on a denying precondition with no access lookup, resource read, write or audit", async () => {
    const { database, calls, attempts } = createDatabase();
    const deny = vi.fn(async () => {
      throw new Error("scope denied");
    });
    await expect(acknowledgeOwnPatientAppointment(patient, acknowledgement, { database, beforeInteractionInTransaction: deny }))
      .rejects.toBeInstanceOf(InfrastructureError);
    await expect(requestOwnPatientAppointmentCancellation(patient, cancellation, { database, beforeInteractionInTransaction: deny }))
      .rejects.toBeInstanceOf(InfrastructureError);
    expect(calls).toEqual(["attempt:1", "attempt:2"]);
    expect(attempts()).toBe(2);
    expect(mockedAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["P2034", {}],
    ["P2002", {}],
    ["P2010", { code: "40001" }],
  ])("reruns the full precondition on every %s retry attempt", async (code, meta) => {
    const { database, calls } = createDatabase();
    let failures = 0;
    const precondition: AppointmentInteractionPrecondition = async (_transaction, actor) => {
      calls.push(`precondition:${actor.userId}`);
      if (failures < 2) {
        failures += 1;
        throw new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "6.19.3", meta });
      }
    };
    await acknowledgeOwnPatientAppointment(patient, acknowledgement, { database, beforeInteractionInTransaction: precondition });
    expect(afterEachAttempt(calls)).toEqual(Array(3).fill(`precondition:${patientUserId}`));
  });

  it("returns the existing safe conflict after bounded retries are exhausted, with no write", async () => {
    const { database, calls } = createDatabase();
    const precondition: AppointmentInteractionPrecondition = async () => {
      throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2010", clientVersion: "6.19.3", meta: { code: "40001" } });
    };
    await expect(requestOwnPatientAppointmentCancellation(patient, cancellation, { database, beforeInteractionInTransaction: precondition }))
      .rejects.toBeInstanceOf(ConflictError);
    expect(calls).toEqual(["attempt:1", "attempt:2", "attempt:3"]);
  });

  it("does not retry an unrelated raw-query failure", async () => {
    const { database, attempts } = createDatabase();
    const precondition: AppointmentInteractionPrecondition = async () => {
      throw new Prisma.PrismaClientKnownRequestError("raw", { code: "P2010", clientVersion: "6.19.3", meta: { code: "42601" } });
    };
    await expect(acknowledgeOwnPatientAppointment(patient, acknowledgement, { database, beforeInteractionInTransaction: precondition }))
      .rejects.toBeInstanceOf(InfrastructureError);
    expect(attempts()).toBe(1);
  });

  it("keeps ordinary calls independent of any precondition", async () => {
    const { database, calls } = createDatabase();
    await acknowledgeOwnPatientAppointment(patient, acknowledgement, { database });
    expect(calls.slice(0, 2)).toEqual(["attempt:1", "patientHospitalRelationship.findUnique"]);
    expect(mockedAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "appointment.acknowledged", metadata: expect.objectContaining({ source: AppointmentInteractionSource.PATIENT_SELF }),
    }), expect.anything());
  });

  it("never runs a precondition smuggled into the OSM proxy entry point", async () => {
    const { database, calls } = createDatabase();
    const precondition = recordingPrecondition(calls);
    await acknowledgeAppointmentOnBehalfOfPatient(patient, acknowledgement, {
      database, beforeInteractionInTransaction: precondition,
    } as Parameters<typeof acknowledgeAppointmentOnBehalfOfPatient>[2]).catch(() => undefined);
    expect(precondition).not.toHaveBeenCalled();
  });
});
