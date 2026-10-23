import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AppointmentCancellationRequestStatus, AppointmentInteractionSource, AppointmentStatus, HospitalStatus, LineAccountAction, Prisma, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { LineChannelInventory } from "@/modules/line/domain/line-authorization-lifecycle";
import { LineWorkflowFailure } from "@/modules/line/domain/line-workflow-errors";
import { createLineAccountIntent, unlinkLineAccount } from "@/modules/line/services/line-account-service";
import type { LineMiniAppConfiguration } from "@/modules/line/services/line-mini-app-configuration";
import { parseLineWorkflowContextKeyring, sealLineWorkflowContext } from "@/modules/line/services/line-workflow-context";
import {
  runLineWorkflowScopedInteraction,
  runLineWorkflowScopedRead,
  type LineWorkflowScopedMutationDependencies,
} from "@/modules/line/services/line-workflow-service";
import { getOwnPatientAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const database = getPrisma();
const created = { people: [] as string[], users: [] as string[], hospitals: [] as string[] };
const configuration: LineMiniAppConfiguration = {
  environment: "DEVELOPING", channelId: "2000000001", liffId: "2000000001-MiniDev",
  origin: "https://demi.example.org", endpointUrl: "https://demi.example.org/line/workflow",
};
const inventory: LineChannelInventory = { channels: [
  { kind: "ACCOUNT", channelId: "1000000001", environment: "ACCOUNT" },
  { kind: "MINI", channelId: "2000000001", environment: "DEVELOPING" },
] };
const keyring = parseLineWorkflowContextKeyring(JSON.stringify({
  currentKid: "it1", keys: [{ kid: "it1", encryptionKey: randomBytes(32).toString("base64url"), sessionKey: randomBytes(32).toString("base64url") }],
}));
const LINE_SESSION_HASH = "a".repeat(64);

type PatientFixture = {
  userId: string; personId: string; authSubject: string; sessionId: string; bindingId: string;
  relationshipId: string; appointmentId: string; version: Date;
};

const hex = (): string => createHash("sha256").update(randomUUID()).digest("hex");

async function patient(options: { hospitalStatus?: HospitalStatus; status?: AppointmentStatus } = {}): Promise<PatientFixture> {
  const hospital = await database.hospital.create({
    data: { hospitalCode: `B22-${randomUUID().slice(0, 8)}`, name: "โรงพยาบาลสังเคราะห์ B2.2", status: options.hospitalStatus ?? HospitalStatus.ACTIVE },
  });
  created.hospitals.push(hospital.id);
  const person = await database.person.create({ data: { identityKeyHash: hex(), givenName: "ทดสอบ", familyName: "Mutation" } });
  created.people.push(person.id);
  const authSubject = randomUUID();
  const user = await database.user.create({ data: { personId: person.id, authSubject, status: UserStatus.ACTIVE } });
  created.users.push(user.id);
  await database.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
  const profile = await database.patientProfile.create({ data: { personId: person.id } });
  const relationship = await database.patientHospitalRelationship.create({
    data: { patientProfileId: profile.id, hospitalId: hospital.id, hospitalNumber: "HN-SYN" },
  });
  const appointment = await database.patientAppointment.create({ data: {
    patientHospitalRelationshipId: relationship.id, createdByUserId: user.id, type: "FOLLOW_UP",
    scheduledAt: new Date(Date.UTC(2026, 10, 1, 3)), submissionNonce: randomUUID(), status: options.status ?? AppointmentStatus.SCHEDULED,
  } });
  const binding = await database.lineAccountBinding.create({ data: {
    userId: user.id, lineUserId: `U${hex().slice(0, 32)}`, lineSubjectFingerprint: hex(), lineSubjectFingerprintKeyId: "synthetic",
  } });
  return {
    userId: user.id, personId: person.id, authSubject, sessionId: randomUUID(), bindingId: binding.id,
    relationshipId: relationship.id, appointmentId: appointment.id, version: appointment.updatedAt,
  };
}

function contextFor(fixture: PatientFixture, options: { bindingVersion?: number; issuedAt?: Date; tuple?: LineMiniAppConfiguration } = {}): string {
  return sealLineWorkflowContext(
    { bindingId: fixture.bindingId, bindingVersion: options.bindingVersion ?? 1, userId: fixture.userId, sessionId: fixture.sessionId,
      proofExpiresAt: new Date(Date.now() + 3_600_000) },
    { keyring, tuple: options.tuple ?? configuration, now: options.issuedAt ?? new Date() },
  ).value;
}

function dependencies(fixture: PatientFixture, overrides: Partial<LineWorkflowScopedMutationDependencies> = {}): LineWorkflowScopedMutationDependencies {
  return {
    database,
    configuration: () => configuration,
    keyring: () => keyring,
    lifecycleInventory: async () => inventory,
    liveSession: async () => ({ userId: fixture.userId, sessionId: fixture.sessionId, authSubject: fixture.authSubject }),
    ...overrides,
  };
}

const acknowledgement = (fixture: PatientFixture, version = fixture.version) => ({
  patientHospitalRelationshipId: fixture.relationshipId, appointmentId: fixture.appointmentId, expectedUpdatedAt: version.toISOString(),
});
const cancellation = (fixture: PatientFixture, submissionNonce = randomUUID()) => ({ ...acknowledgement(fixture), submissionNonce });

const acknowledge = (fixture: PatientFixture, overrides: Partial<LineWorkflowScopedMutationDependencies> = {}, credential = contextFor(fixture)) =>
  runLineWorkflowScopedInteraction(credential, "ACKNOWLEDGE", acknowledgement(fixture), dependencies(fixture, overrides));
const requestCancellation = (fixture: PatientFixture, input = cancellation(fixture), overrides: Partial<LineWorkflowScopedMutationDependencies> = {}, credential = contextFor(fixture)) =>
  runLineWorkflowScopedInteraction(credential, "CANCELLATION_REQUEST", input, dependencies(fixture, overrides));

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => null, (error: unknown) => error);
}

async function failure(promise: Promise<unknown>): Promise<string> {
  const error = await caught(promise);
  if (!(error instanceof LineWorkflowFailure)) throw new Error(`Expected LineWorkflowFailure, received ${String(error)}`);
  return error.code;
}

/** Counts every write an interaction could leave behind for this fixture. */
async function writes(fixture: PatientFixture): Promise<{ acknowledgements: number; requests: number; audits: number; appointmentVersion: number }> {
  const [acknowledgements, requests, audits, appointment] = await Promise.all([
    database.patientAppointmentAcknowledgement.count({ where: { appointmentId: fixture.appointmentId } }),
    database.patientAppointmentCancellationRequest.count({ where: { appointmentId: fixture.appointmentId } }),
    database.auditEvent.count({ where: { actorUserId: fixture.userId, action: { startsWith: "appointment." } } }),
    database.patientAppointment.findUniqueOrThrow({ where: { id: fixture.appointmentId }, select: { updatedAt: true } }),
  ]);
  return { acknowledgements, requests, audits, appointmentVersion: appointment.updatedAt.getTime() };
}

const noWrites = (fixture: PatientFixture) => ({ acknowledgements: 0, requests: 0, audits: 0, appointmentVersion: fixture.version.getTime() });

/** Holds one row lock on its own pooled connection until released. */
async function holdRowLock(sql: Prisma.Sql): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => undefined;
  let acquired: () => void = () => undefined;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<void>((resolve) => { acquired = resolve; });
  const done = database.$transaction(async (transaction) => {
    await transaction.$queryRaw(sql);
    acquired();
    await released;
  }, { timeout: 20_000 });
  await locked;
  return { release: async () => { release(); await done; } };
}

/** Deterministic synchronization on observed PostgreSQL state: backends blocked on a lock. */
async function waitForLockWaiters(count: number): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const rows = await database.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if (rows[0].count >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Expected ${count} lock waiters`);
}

/** NOWAIT probe from an independent connection: 55P03 proves another transaction holds the row lock. */
async function rowIsLocked(table: "User" | "LineAccountBinding", id: string): Promise<boolean> {
  const error = await caught(database.$transaction((transaction) =>
    transaction.$queryRaw(Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id}::uuid FOR UPDATE NOWAIT`)));
  if (error === null) return false;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010" && error.meta?.code === "55P03") return true;
  throw error;
}

function countingDatabase(): { client: PrismaClient; attempts: () => number } {
  let attempts = 0;
  const client = new Proxy(database, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (...args: Parameters<PrismaClient["$transaction"]>) => {
          attempts += 1;
          return (target.$transaction as (...input: unknown[]) => unknown)(...args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return { client, attempts: () => attempts };
}

function lineAccountDependencies(fixture: PatientFixture) {
  return { database, currentSession: async () => ({ userId: fixture.userId, sessionHash: LINE_SESSION_HASH }) };
}

/** The existing Account Unlink service (User -> intent -> binding), never a hand-written stand-in. */
async function prepareUnlink(fixture: PatientFixture): Promise<{ intentId: string; run: () => Promise<unknown> }> {
  const intent = await createLineAccountIntent(LineAccountAction.UNLINK, lineAccountDependencies(fixture));
  return { intentId: intent.intentId, run: () => unlinkLineAccount(intent, lineAccountDependencies(fixture)) };
}

describe("LINE-QA.B2.2 scoped Appointment mutations on PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" ||
        !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("Local disposable PostgreSQL required");
    await database.$connect();
  });
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1000000001");
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    const users = { in: created.users };
    await database.patientAppointmentAcknowledgement.deleteMany({ where: { recordedByUserId: users } });
    await database.patientAppointmentCancellationRequest.deleteMany({ where: { submittedByUserId: users } });
    await database.accountRecovery.deleteMany({ where: { targetUserId: users } });
    await database.auditEvent.deleteMany({ where: { actorUserId: users } });
    await database.lineAccountActionIntent.deleteMany({ where: { userId: users } });
    await database.lineAccountBinding.deleteMany({ where: { userId: users } });
    await database.patientAppointmentAssigneeAcceptance.deleteMany({ where: { appointment: { createdByUserId: users } } });
    await database.patientAppointment.deleteMany({ where: { createdByUserId: users } });
    await database.patientHospitalHealthHistory.deleteMany({ where: { relationship: { hospitalId: { in: created.hospitals } } } });
    await database.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: created.hospitals } } });
    await database.patientProfile.deleteMany({ where: { personId: { in: created.people } } });
    await database.userRole.deleteMany({ where: { userId: users } });
    await database.user.deleteMany({ where: { id: users } });
    await database.person.deleteMany({ where: { id: { in: created.people } } });
    await database.hospital.deleteMany({ where: { id: { in: created.hospitals } } });
    created.people.splice(0); created.users.splice(0); created.hospitals.splice(0);
  });
  afterAll(async () => database.$disconnect());

  describe("A. normal success", () => {
    it("acknowledges with the existing PATIENT_SELF semantics and audit, with no network work under a transaction", async () => {
      const own = await patient();
      const result = await acknowledge(own, {
        liveSession: async () => {
          const open = await database.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::integer AS count FROM pg_stat_activity
            WHERE datname = current_database() AND state LIKE 'idle in transaction%'`;
          expect(open[0].count).toBe(0);
          return { userId: own.userId, sessionId: own.sessionId, authSubject: own.authSubject };
        },
      });
      expect(result).toMatchObject({ appointmentId: own.appointmentId, source: AppointmentInteractionSource.PATIENT_SELF });
      const row = await database.patientAppointmentAcknowledgement.findFirstOrThrow({ where: { appointmentId: own.appointmentId } });
      expect(row).toMatchObject({ recordedByUserId: own.userId, source: AppointmentInteractionSource.PATIENT_SELF, sourceAppointmentUpdatedAt: own.version });
      const audit = await database.auditEvent.findFirstOrThrow({ where: { actorUserId: own.userId, action: "appointment.acknowledged" } });
      expect(audit.metadata).toMatchObject({ appointmentId: own.appointmentId, source: "PATIENT_SELF" });
      expect(await writes(own)).toMatchObject({ acknowledgements: 1, audits: 1, appointmentVersion: own.version.getTime() });
    });

    it("submits a cancellation REQUEST that leaves the Appointment SCHEDULED for Hospital review", async () => {
      const own = await patient();
      const result = await requestCancellation(own);
      expect(result).toMatchObject({ status: AppointmentCancellationRequestStatus.PENDING, source: AppointmentInteractionSource.PATIENT_SELF });
      expect((await database.patientAppointment.findUniqueOrThrow({ where: { id: own.appointmentId } })).status).toBe(AppointmentStatus.SCHEDULED);
      const audit = await database.auditEvent.findFirstOrThrow({ where: { actorUserId: own.userId, action: "appointment.cancellation_requested" } });
      expect(audit.metadata).toMatchObject({ appointmentId: own.appointmentId, source: "PATIENT_SELF" });
      expect(await writes(own)).toMatchObject({ requests: 1, audits: 1, appointmentVersion: own.version.getTime() });
    });
  });

  describe("B. authorization denies without mutation", () => {
    it("denies a missing, expired, tampered or wrong-tuple context", async () => {
      const own = await patient();
      expect(await failure(runLineWorkflowScopedInteraction(undefined, "ACKNOWLEDGE", acknowledgement(own), dependencies(own)))).toBe("SCOPE_MISSING");
      expect(await failure(acknowledge(own, {}, contextFor(own, { issuedAt: new Date(Date.now() - 20 * 60_000) })))).toBe("SCOPE_EXPIRED");
      expect(await failure(acknowledge(own, {}, `${contextFor(own).slice(0, -2)}AA`))).toBe("SCOPE_INVALID");
      expect(await failure(acknowledge(own, {}, contextFor(own, { tuple: { ...configuration, environment: "REVIEW" } })))).toBe("SCOPE_INVALID");
      expect(await writes(own)).toEqual(noWrites(own));
    });

    it("denies a different DEMI User, another session of the same User and a remapped Auth subject", async () => {
      const own = await patient();
      const other = await patient();
      expect(await failure(acknowledge(own, { liveSession: async () => ({ userId: other.userId, sessionId: own.sessionId, authSubject: other.authSubject }) })))
        .toBe("SCOPE_SESSION_MISMATCH");
      expect(await failure(acknowledge(own, { liveSession: async () => ({ userId: own.userId, sessionId: randomUUID(), authSubject: own.authSubject }) })))
        .toBe("SCOPE_SESSION_MISMATCH");
      expect(await failure(acknowledge(own, { liveSession: async () => ({ userId: own.userId, sessionId: own.sessionId, authSubject: randomUUID() }) })))
        .toBe("SCOPE_SESSION_MISMATCH");
      expect(await writes(own)).toEqual(noWrites(own));
    });

    it("denies an inactive User, a removed PATIENT role, removed Patient SELF and credential-recovery quarantine", async () => {
      const inactive = await patient();
      await database.user.update({ where: { id: inactive.userId }, data: { status: UserStatus.SUSPENDED } });
      expect(await failure(acknowledge(inactive))).toBe("WORKFLOW_INELIGIBLE");

      const roleless = await patient();
      await database.userRole.deleteMany({ where: { userId: roleless.userId } });
      expect(await failure(acknowledge(roleless))).toBe("WORKFLOW_INELIGIBLE");

      const selfless = await patient();
      const stranger = await patient();
      const strangerProfile = await database.patientProfile.findUniqueOrThrow({ where: { personId: stranger.personId } });
      await database.patientHospitalRelationship.update({ where: { id: selfless.relationshipId }, data: { patientProfileId: strangerProfile.id } });
      expect(await failure(acknowledge(selfless))).toBe("WORKFLOW_INELIGIBLE");

      const quarantined = await patient();
      await database.accountRecovery.create({ data: {
        targetUserId: quarantined.userId, patientHospitalRelationshipId: quarantined.relationshipId, issuedByUserId: quarantined.userId,
        tokenHash: hex(), expiresAt: new Date(Date.now() + 60_000), claimedAt: new Date(),
      } });
      expect(await failure(acknowledge(quarantined))).toBe("WORKFLOW_INELIGIBLE");

      for (const fixture of [inactive, roleless, selfless, quarantined]) expect(await writes(fixture)).toEqual(noWrites(fixture));
    });

    it("denies an unlinked binding, a changed generation and a mismatched lifecycle tuple", async () => {
      const unlinked = await patient();
      await (await prepareUnlink(unlinked)).run();
      expect(await failure(acknowledge(unlinked))).toBe("SCOPE_REVOKED");

      const regenerated = await patient();
      await database.lineAccountBinding.update({ where: { id: regenerated.bindingId }, data: { lifecycleVersion: { increment: 1 } } });
      expect(await failure(requestCancellation(regenerated))).toBe("SCOPE_REVOKED");

      const miniRemoved = await patient();
      const accountOnly: LineChannelInventory = { channels: [inventory.channels[0]] };
      expect(await failure(acknowledge(miniRemoved, { lifecycleInventory: async () => accountOnly }))).toBe("LIFECYCLE_UNAVAILABLE");

      for (const fixture of [unlinked, regenerated, miniRemoved]) expect(await writes(fixture)).toEqual(noWrites(fixture));
    });

    it("denies another Patient's relationship or appointment through existing domain policy", async () => {
      const own = await patient();
      const other = await patient();
      const foreignRelationship = runLineWorkflowScopedInteraction(contextFor(own), "ACKNOWLEDGE", acknowledgement(other), dependencies(own));
      expect(await caught(foreignRelationship)).toBeInstanceOf(ForbiddenError);
      const foreignAppointment = runLineWorkflowScopedInteraction(contextFor(own), "CANCELLATION_REQUEST",
        { ...cancellation(own), appointmentId: other.appointmentId }, dependencies(own));
      expect(await caught(foreignAppointment)).toBeInstanceOf(NotFoundError);
      expect(await writes(own)).toEqual(noWrites(own));
      expect(await writes(other)).toEqual(noWrites(other));
    });
  });

  describe("C/D. lock order and concurrent Unlink", () => {
    it("locks User then binding before the domain work and holds both through commit (mutation first: Unlink waits)", async () => {
      const own = await patient();
      const unlink = await prepareUnlink(own);
      // Pause the mutation at its acknowledgement INSERT (FK KEY SHARE on the Appointment row), i.e. after the precondition.
      const appointmentLock = await holdRowLock(Prisma.sql`SELECT "id" FROM "PatientAppointment" WHERE "id" = ${own.appointmentId}::uuid FOR UPDATE`);
      const order: string[] = [];
      const mutation = acknowledge(own).then((value) => { order.push("mutation"); return value; });
      await waitForLockWaiters(1);
      expect(await rowIsLocked("User", own.userId)).toBe(true);
      expect(await rowIsLocked("LineAccountBinding", own.bindingId)).toBe(true);
      expect(await writes(own)).toEqual(noWrites(own));

      const unlinking = unlink.run().then((value) => { order.push("unlink"); return value; });
      await waitForLockWaiters(2);
      expect((await database.lineAccountBinding.findUniqueOrThrow({ where: { id: own.bindingId } })).unlinkedAt).toBeNull();

      await appointmentLock.release();
      await expect(mutation).resolves.toMatchObject({ source: AppointmentInteractionSource.PATIENT_SELF });
      await expect(unlinking).resolves.toMatchObject({ status: "UNLINKED" });
      expect(order).toEqual(["mutation", "unlink"]);
      const [ack, binding] = await Promise.all([
        database.patientAppointmentAcknowledgement.findFirstOrThrow({ where: { appointmentId: own.appointmentId } }),
        database.lineAccountBinding.findUniqueOrThrow({ where: { id: own.bindingId } }),
      ]);
      expect(ack.acknowledgedAt.getTime()).toBeLessThanOrEqual(binding.unlinkedAt!.getTime());
      // The authorized-then-completed mutation is allowed; the next one denies.
      expect(await failure(acknowledge(own))).toBe("SCOPE_REVOKED");
    });

    it("denies when Unlink commits before the mutation acquires its authorization locks", async () => {
      const own = await patient();
      await (await prepareUnlink(own)).run();
      expect(await failure(requestCancellation(own))).toBe("SCOPE_REVOKED");
      expect(await writes(own)).toEqual(noWrites(own));
    });

    it("never authorizes from a snapshot older than a concurrent Unlink: aborts, reacquires the locks and denies", async () => {
      const own = await patient();
      const unlink = await prepareUnlink(own);
      // Unlink takes the User lock, then is held at its intent lock.
      const intentLock = await holdRowLock(Prisma.sql`SELECT "id" FROM "LineAccountActionIntent" WHERE "id" = ${unlink.intentId}::uuid FOR UPDATE`);
      const unlinking = unlink.run();
      await waitForLockWaiters(1);
      const counted = countingDatabase();
      // The mutation's Serializable snapshot starts here and waits for the User lock held by Unlink.
      const mutation = failure(acknowledge(own, { database: counted.client }));
      await waitForLockWaiters(2);
      await intentLock.release();
      await expect(unlinking).resolves.toMatchObject({ status: "UNLINKED" });
      expect(await mutation).toBe("SCOPE_REVOKED");
      // Attempt 1 hit the changed binding row (40001) and was retried with a fresh snapshot and fresh locks.
      expect(counted.attempts()).toBe(2);
      expect(await writes(own)).toEqual(noWrites(own));
    });

    it("returns the existing safe conflict, with no write, when that retry budget is exhausted", async () => {
      const own = await patient();
      const unlink = await prepareUnlink(own);
      const intentLock = await holdRowLock(Prisma.sql`SELECT "id" FROM "LineAccountActionIntent" WHERE "id" = ${unlink.intentId}::uuid FOR UPDATE`);
      const unlinking = unlink.run();
      await waitForLockWaiters(1);
      const mutation = caught(requestCancellation(own, cancellation(own), { transactionRetries: 0 }));
      await waitForLockWaiters(2);
      await intentLock.release();
      await unlinking;
      expect(await mutation).toBeInstanceOf(ConflictError);
      expect(await writes(own)).toEqual(noWrites(own));
    });

    it("invalidates an older context after relink, even for the same User and LINE subject", async () => {
      const own = await patient();
      const old = contextFor(own);
      await (await prepareUnlink(own)).run();
      await database.lineAccountBinding.update({ where: { id: own.bindingId }, data: { unlinkedAt: null, providerCleanupState: null, lifecycleVersion: { increment: 1 } } });
      expect(await failure(acknowledge(own, {}, old))).toBe("SCOPE_REVOKED");
      await expect(acknowledge(own, {}, contextFor(own, { bindingVersion: 3 }))).resolves.toMatchObject({ appointmentId: own.appointmentId });
    });

    it("serializes many concurrent interactions against Unlink without deadlock, partial writes or post-Unlink success", async () => {
      const outcomes: string[] = [];
      for (let round = 0; round < 4; round += 1) {
        const own = await patient();
        const unlink = await prepareUnlink(own);
        const results = await Promise.allSettled([acknowledge(own), requestCancellation(own), unlink.run(), acknowledge(own)]);
        for (const result of results) {
          const reason = result.status === "rejected" ? result.reason : null;
          if (reason) {
            expect(String(reason)).not.toMatch(/deadlock|40P01/iu);
            expect(reason instanceof LineWorkflowFailure || reason instanceof ConflictError).toBe(true);
          }
          outcomes.push(result.status === "fulfilled" ? "ok" : reason instanceof LineWorkflowFailure ? reason.code : "CONFLICT");
        }
        expect(results[2].status).toBe("fulfilled");
        const binding = await database.lineAccountBinding.findUniqueOrThrow({ where: { id: own.bindingId } });
        const acks = await database.patientAppointmentAcknowledgement.findMany({ where: { appointmentId: own.appointmentId } });
        const requests = await database.patientAppointmentCancellationRequest.findMany({ where: { appointmentId: own.appointmentId } });
        // Every committed interaction committed before Unlink, and each write has exactly its own audit.
        for (const row of acks) expect(row.acknowledgedAt.getTime()).toBeLessThanOrEqual(binding.unlinkedAt!.getTime());
        for (const row of requests) expect(row.submittedAt.getTime()).toBeLessThanOrEqual(binding.unlinkedAt!.getTime());
        expect(acks.length).toBeLessThanOrEqual(1);
        expect((await writes(own)).audits).toBe(acks.length + requests.length);
      }
      expect(outcomes.every((outcome) => ["ok", "SCOPE_REVOKED", "CONFLICT"].includes(outcome))).toBe(true);
    });
  });

  describe("E/F. retries and idempotency", () => {
    it("returns the same acknowledgement and cancellation request on replay, and reuses the pending request", async () => {
      const own = await patient();
      const first = await acknowledge(own);
      expect(await acknowledge(own)).toEqual(first);
      const input = cancellation(own);
      const request = await requestCancellation(own, input);
      expect(await requestCancellation(own, input)).toEqual(request);
      expect((await requestCancellation(own, cancellation(own))).requestId).toBe(request.requestId);
      expect(await writes(own)).toMatchObject({ acknowledgements: 1, requests: 1, audits: 2 });
    });

    it("rejects a conflicting nonce reuse with the existing conflict", async () => {
      const own = await patient();
      const input = cancellation(own);
      await requestCancellation(own, input);
      const other = await patient();
      const reused = runLineWorkflowScopedInteraction(contextFor(other), "CANCELLATION_REQUEST",
        { ...cancellation(other), submissionNonce: input.submissionNonce }, dependencies(other));
      expect(await caught(reused)).toBeInstanceOf(ConflictError);
      expect(await writes(other)).toEqual(noWrites(other));
    });

    it("converges concurrent duplicate requests through bounded P2002/serialization retries with the precondition rerun", async () => {
      const own = await patient();
      const counted = countingDatabase();
      const input = cancellation(own);
      const results = await Promise.all([
        acknowledge(own, { database: counted.client }), acknowledge(own, { database: counted.client }),
        requestCancellation(own, input, { database: counted.client }), requestCancellation(own, input, { database: counted.client }),
      ]);
      expect(results[0]).toEqual(results[1]);
      expect(results[2]).toEqual(results[3]);
      expect(counted.attempts()).toBeGreaterThanOrEqual(4);
      expect(await writes(own)).toMatchObject({ acknowledgements: 1, requests: 1, audits: 2 });
    });

    it("never turns an existing acknowledgement or request into success after Unlink", async () => {
      const own = await patient();
      await acknowledge(own);
      const input = cancellation(own);
      await requestCancellation(own, input);
      const context = contextFor(own);
      await (await prepareUnlink(own)).run();
      expect(await failure(acknowledge(own, {}, context))).toBe("SCOPE_REVOKED");
      expect(await failure(requestCancellation(own, input, {}, context))).toBe("SCOPE_REVOKED");
      expect(await writes(own)).toMatchObject({ acknowledgements: 1, requests: 1, audits: 2 });
    });
  });

  describe("G. business invariants stay with the Appointment domain", () => {
    it("rejects a stale version and a non-SCHEDULED appointment with the existing conflict", async () => {
      const own = await patient();
      const stale = runLineWorkflowScopedInteraction(contextFor(own), "ACKNOWLEDGE",
        acknowledgement(own, new Date(own.version.getTime() - 1000)), dependencies(own));
      expect(await caught(stale)).toBeInstanceOf(ConflictError);
      const cancelled = await patient({ status: AppointmentStatus.CANCELLED });
      expect(await caught(requestCancellation(cancelled))).toBeInstanceOf(ConflictError);
      expect(await writes(own)).toEqual(noWrites(own));
      expect(await writes(cancelled)).toEqual(noWrites(cancelled));
    });

    it("denies mutation for an ended relationship and a SUSPENDED Hospital while keeping historical read visibility", async () => {
      const ended = await patient();
      await database.patientHospitalRelationship.update({ where: { id: ended.relationshipId }, data: { endedAt: new Date(), endedByUserId: ended.userId, endReason: "สิ้นสุดการดูแลสังเคราะห์" } });
      expect(await caught(acknowledge(ended))).toBeInstanceOf(NotFoundError);
      const suspended = await patient({ hospitalStatus: HospitalStatus.SUSPENDED });
      expect(await caught(requestCancellation(suspended))).toBeInstanceOf(NotFoundError);
      for (const fixture of [ended, suspended]) {
        expect(await writes(fixture)).toEqual(noWrites(fixture));
        const detail = await runLineWorkflowScopedRead(contextFor(fixture), ({ actor, database: snapshot }) =>
          getOwnPatientAppointmentDetail(actor, fixture.relationshipId, fixture.appointmentId, { database: snapshot }), dependencies(fixture));
        expect(detail.appointmentId).toBe(fixture.appointmentId);
      }
    });
  });
});
