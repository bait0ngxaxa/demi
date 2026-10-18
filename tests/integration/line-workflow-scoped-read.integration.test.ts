import { createHash, randomBytes, randomUUID } from "node:crypto";
import { HospitalStatus, Role, UserStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { LineChannelInventory } from "@/modules/line/domain/line-authorization-lifecycle";
import { LineWorkflowFailure } from "@/modules/line/domain/line-workflow-errors";
import type { LineMiniAppConfiguration } from "@/modules/line/services/line-mini-app-configuration";
import { parseLineWorkflowContextKeyring, sealLineWorkflowContext } from "@/modules/line/services/line-workflow-context";
import { runLineWorkflowScopedRead, type LineWorkflowScopedReadDependencies } from "@/modules/line/services/line-workflow-service";
import { lineWorkflowScopedFailureState } from "@/modules/line/transport/workflow-scoped-appointments";
import {
  getOwnPatientAppointmentDetail,
  getOwnPatientAppointmentHistory,
} from "@/modules/patient-self/services/patient-self-care-query-service";
import { listOwnPatientRelationshipNavigation } from "@/modules/patient-self/services/patient-self-query-service";
import { NotFoundError } from "@/shared/errors/application-error";

const database = getPrisma();
const created = { people: [] as string[], users: [] as string[], hospitals: [] as string[] };
const configuration: LineMiniAppConfiguration = {
  environment: "DEVELOPING", channelId: "2000000001", liffId: "2000000001-MiniDev",
  origin: "https://demi.example.org", endpointUrl: "https://demi.example.org/line/workflow", deploymentReference: "deploy:it",
};
const inventory: LineChannelInventory = { revision: "inventory:it", channels: [
  { kind: "ACCOUNT", providerReference: "provider:synthetic", channelId: "1000000001", environment: "ACCOUNT", deploymentReference: "deploy:it" },
  { kind: "MINI", providerReference: "provider:synthetic", channelId: "2000000001", environment: "DEVELOPING", deploymentReference: "deploy:it" },
] };
const keyring = parseLineWorkflowContextKeyring(JSON.stringify({
  currentKid: "it1", keys: [{ kid: "it1", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
}));

type PatientFixture = { userId: string; authSubject: string; sessionId: string; bindingId: string; relationshipId: string; appointmentIds: string[] };

const hex = (): string => createHash("sha256").update(randomUUID()).digest("hex");

async function patient(options: { hospitalStatus?: HospitalStatus; appointments?: number } = {}): Promise<PatientFixture> {
  const hospital = await database.hospital.create({
    data: { hospitalCode: `B21-${randomUUID().slice(0, 8)}`, name: "โรงพยาบาลสังเคราะห์ B2.1", status: options.hospitalStatus ?? HospitalStatus.ACTIVE },
  });
  created.hospitals.push(hospital.id);
  const person = await database.person.create({ data: { identityKeyHash: hex(), givenName: "ทดสอบ", familyName: "Scoped" } });
  created.people.push(person.id);
  const authSubject = randomUUID();
  const user = await database.user.create({ data: { personId: person.id, authSubject, status: UserStatus.ACTIVE } });
  created.users.push(user.id);
  await database.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
  const profile = await database.patientProfile.create({ data: { personId: person.id } });
  const relationship = await database.patientHospitalRelationship.create({
    data: { patientProfileId: profile.id, hospitalId: hospital.id, hospitalNumber: "HN-SYN" },
  });
  const appointmentIds: string[] = [];
  for (let index = 0; index < (options.appointments ?? 2); index += 1) {
    const row = await database.patientAppointment.create({ data: {
      patientHospitalRelationshipId: relationship.id, createdByUserId: user.id, type: "FOLLOW_UP",
      scheduledAt: new Date(Date.UTC(2026, 10, 1 + index, 3)), submissionNonce: randomUUID(),
    } });
    appointmentIds.push(row.id);
  }
  const binding = await database.lineAccountBinding.create({ data: {
    userId: user.id, lineUserId: `U${hex().slice(0, 32)}`, lineSubjectFingerprint: hex(), lineSubjectFingerprintKeyId: "synthetic",
  } });
  return { userId: user.id, authSubject, sessionId: randomUUID(), bindingId: binding.id, relationshipId: relationship.id, appointmentIds };
}

function contextFor(fixture: PatientFixture, bindingVersion = 1): string {
  return sealLineWorkflowContext(
    { bindingId: fixture.bindingId, bindingVersion, userId: fixture.userId, sessionId: fixture.sessionId, proofExpiresAt: new Date(Date.now() + 3_600_000) },
    { keyring, tuple: configuration, now: new Date() },
  ).value;
}

function dependencies(fixture: PatientFixture, overrides: Partial<LineWorkflowScopedReadDependencies> = {}): LineWorkflowScopedReadDependencies {
  return {
    database,
    configuration: () => configuration,
    keyring: () => keyring,
    lifecycleInventory: async () => inventory,
    liveSession: async () => ({ userId: fixture.userId, sessionId: fixture.sessionId, authSubject: fixture.authSubject }),
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  if (!(error instanceof LineWorkflowFailure)) throw new Error(`Expected LineWorkflowFailure, received ${String(error)}`);
  return error.code;
}

const unlinkData = { unlinkedAt: new Date(), providerCleanupState: "PENDING" as const, lifecycleVersion: { increment: 1 } };

describe("LINE-QA.B2.1 scoped Appointment reads on PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local disposable PostgreSQL required");
    await database.$connect();
  });
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_MINI_APP_WORKFLOW_ENABLED", "true");
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await database.lineAccountBinding.deleteMany({ where: { userId: { in: created.users } } });
    await database.patientAppointment.deleteMany({ where: { createdByUserId: { in: created.users } } });
    await database.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: created.hospitals } } });
    await database.patientProfile.deleteMany({ where: { personId: { in: created.people } } });
    await database.userRole.deleteMany({ where: { userId: { in: created.users } } });
    await database.user.deleteMany({ where: { id: { in: created.users } } });
    await database.person.deleteMany({ where: { id: { in: created.people } } });
    await database.hospital.deleteMany({ where: { id: { in: created.hospitals } } });
    created.people.splice(0); created.users.splice(0); created.hospitals.splice(0);
  });
  afterAll(async () => database.$disconnect());

  it("reads relationships, history and detail through one RepeatableRead snapshot, with no network under it", async () => {
    const own = await patient({ hospitalStatus: HospitalStatus.SUSPENDED });
    const deps = dependencies(own, {
      liveSession: async () => {
        const open = await database.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM pg_stat_activity
          WHERE datname = current_database() AND state LIKE 'idle in transaction%'`;
        expect(open[0].count).toBe(0);
        return { userId: own.userId, sessionId: own.sessionId, authSubject: own.authSubject };
      },
    });
    const result = await runLineWorkflowScopedRead(contextFor(own), async ({ actor, database: snapshot }) => {
      const isolation = await snapshot.$queryRaw<Array<{ level: string }>>`SELECT current_setting('transaction_isolation') AS level`;
      return {
        isolation: isolation[0].level,
        nestedTransactionAvailable: "$transaction" in snapshot,
        relationships: await listOwnPatientRelationshipNavigation(actor, { database: snapshot }),
        history: await getOwnPatientAppointmentHistory(actor, own.relationshipId, { database: snapshot }),
        detail: await getOwnPatientAppointmentDetail(actor, own.relationshipId, own.appointmentIds[0], { database: snapshot }),
      };
    }, deps);
    expect(result.isolation).toBe("repeatable read");
    expect(result.nestedTransactionAvailable).toBe(false);
    // Historical read visibility of a non-ACTIVE Hospital is preserved.
    expect(result.relationships).toEqual([expect.objectContaining({ relationshipId: own.relationshipId, hospitalStatus: HospitalStatus.SUSPENDED })]);
    expect(result.history.appointments.map((row) => row.appointmentId)).toEqual([...own.appointmentIds].reverse());
    expect(result.history.historyPage).toEqual({ page: 1, hasMore: false });
    expect(result.detail.appointmentId).toBe(own.appointmentIds[0]);
  });

  it("keeps bounded pagination and the legitimate empty result", async () => {
    const own = await patient({ appointments: 0 });
    const history = await runLineWorkflowScopedRead(contextFor(own), ({ actor, database: snapshot }) =>
      getOwnPatientAppointmentHistory(actor, own.relationshipId, { database: snapshot }), dependencies(own));
    expect(history.appointments).toEqual([]);
    await expect(runLineWorkflowScopedRead(contextFor(own), ({ actor, database: snapshot }) =>
      getOwnPatientAppointmentHistory(actor, own.relationshipId, { database: snapshot }, "0"), dependencies(own))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("denies another Patient's relationship and appointment through existing domain policy", async () => {
    const own = await patient();
    const other = await patient();
    const read = (relationshipId: string, appointmentId: string) => runLineWorkflowScopedRead(contextFor(own), ({ actor, database: snapshot }) =>
      getOwnPatientAppointmentDetail(actor, relationshipId, appointmentId, { database: snapshot }), dependencies(own));
    await expect(read(other.relationshipId, other.appointmentIds[0])).rejects.toBeInstanceOf(NotFoundError);
    await expect(read(own.relationshipId, other.appointmentIds[0])).rejects.toBeInstanceOf(NotFoundError);
    await expect(runLineWorkflowScopedRead(contextFor(own), ({ actor, database: snapshot }) =>
      getOwnPatientAppointmentHistory(actor, other.relationshipId, { database: snapshot }), dependencies(own))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("denies a snapshot that begins after an unlink commit, before any domain query", async () => {
    const own = await patient();
    const reader = vi.fn();
    const deps = dependencies(own, {
      // The unlink commits after the provider check but before the transaction starts.
      liveSession: async () => {
        await database.lineAccountBinding.update({ where: { id: own.bindingId }, data: unlinkData });
        return { userId: own.userId, sessionId: own.sessionId, authSubject: own.authSubject };
      },
    });
    expect(await failure(runLineWorkflowScopedRead(contextFor(own), reader, deps))).toBe("SCOPE_REVOKED");
    expect(reader).not.toHaveBeenCalled();
  });

  it("lets a read authorized before an unlink commit finish on its snapshot, then denies the next read", async () => {
    const own = await patient();
    let release!: () => void;
    const unlinked = new Promise<void>((resolve) => { release = resolve; });
    const inFlight = runLineWorkflowScopedRead(contextFor(own), async ({ actor, database: snapshot }) => {
      // Concurrent unlink commits on another connection while this snapshot is open.
      void database.lineAccountBinding.update({ where: { id: own.bindingId }, data: unlinkData }).then(() => release());
      await unlinked;
      const seen = await snapshot.lineAccountBinding.findUniqueOrThrow({ where: { id: own.bindingId }, select: { unlinkedAt: true } });
      const history = await getOwnPatientAppointmentHistory(actor, own.relationshipId, { database: snapshot });
      return { seenUnlinkedAt: seen.unlinkedAt, count: history.appointments.length };
    }, dependencies(own));
    await expect(inFlight).resolves.toEqual({ seenUnlinkedAt: null, count: 2 });
    expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: own.bindingId } })).unlinkedAt).not.toBeNull();
    expect(await failure(runLineWorkflowScopedRead(contextFor(own), vi.fn(), dependencies(own)))).toBe("SCOPE_REVOKED");
  });

  it("invalidates an older context after relink to a newer binding generation", async () => {
    const own = await patient();
    const stale = contextFor(own, 1);
    await database.lineAccountBinding.update({ where: { id: own.bindingId }, data: unlinkData });
    await database.lineAccountBinding.update({ where: { id: own.bindingId }, data: { unlinkedAt: null, providerCleanupState: null, lifecycleVersion: { increment: 1 } } });
    expect(await failure(runLineWorkflowScopedRead(stale, vi.fn(), dependencies(own)))).toBe("SCOPE_REVOKED");
    await expect(runLineWorkflowScopedRead(contextFor(own, 3), async () => "fresh", dependencies(own))).resolves.toBe("fresh");
  });

  it("denies after the PATIENT role or persisted Patient SELF eligibility is removed", async () => {
    const own = await patient();
    await database.userRole.deleteMany({ where: { userId: own.userId, role: Role.PATIENT } });
    expect(await failure(runLineWorkflowScopedRead(contextFor(own), vi.fn(), dependencies(own)))).toBe("WORKFLOW_INELIGIBLE");

    const second = await patient({ appointments: 0 });
    await database.patientHospitalRelationship.delete({ where: { id: second.relationshipId } });
    expect(await failure(runLineWorkflowScopedRead(contextFor(second), vi.fn(), dependencies(second)))).toBe("WORKFLOW_INELIGIBLE");

    const third = await patient();
    await database.user.update({ where: { id: third.userId }, data: { status: UserStatus.SUSPENDED } });
    expect(await failure(runLineWorkflowScopedRead(contextFor(third), vi.fn(), dependencies(third)))).toBe("WORKFLOW_INELIGIBLE");
  });

  it("denies another DEMI User, another session, and a remapped Auth subject", async () => {
    const own = await patient();
    const other = await patient();
    expect(await failure(runLineWorkflowScopedRead(contextFor(own), vi.fn(), dependencies(other)))).toBe("SCOPE_SESSION_MISMATCH");
    expect(await failure(runLineWorkflowScopedRead(contextFor(own), vi.fn(), dependencies({ ...own, sessionId: randomUUID() })))).toBe("SCOPE_SESSION_MISMATCH");
    await database.user.update({ where: { id: own.userId }, data: { authSubject: randomUUID() } });
    expect(await failure(runLineWorkflowScopedRead(contextFor(own), vi.fn(), dependencies(own)))).toBe("SCOPE_SESSION_MISMATCH");
  });

  it("fails closed when the transaction exceeds its bound, without returning data", async () => {
    const own = await patient();
    const slow = runLineWorkflowScopedRead(contextFor(own), async ({ actor, database: snapshot }) => {
      await new Promise((resolve) => setTimeout(resolve, 5_500));
      return getOwnPatientAppointmentHistory(actor, own.relationshipId, { database: snapshot });
    }, dependencies(own));
    const error = await slow.then(() => null, (caught: unknown) => caught);
    expect(lineWorkflowScopedFailureState(error)).toBe("TEMPORARILY_UNAVAILABLE");
  }, 15_000);
});
