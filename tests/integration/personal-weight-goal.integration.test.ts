import { randomUUID } from "node:crypto";
import { Prisma, Role, type PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getOwnPersonalWeightGoal } from "@/modules/weight-goals/services/personal-weight-goal-query-service";
import { createPersonalWeightGoal as create, removePersonalWeightGoal as remove, updatePersonalWeightGoal as update } from "@/modules/weight-goals/services/personal-weight-goal-service";
import type { PersonalWeightGoalDto, PersonalWeightGoalMutationResult } from "@/modules/weight-goals/domain/personal-weight-goal";
import { toWeightGoalDateCarrier } from "@/modules/weight-goals/domain/personal-weight-goal";

const db = getPrisma();
const defaultNow = new Date("2026-10-03T17:00:00.000Z");
const dependencies = { database: db, now: () => defaultNow };
const persons: string[] = [];
const users: string[] = [];
const hospitals: string[] = [];
const fields = { targetWeightKg: "72.5", targetDate: "" };

async function actor(roles: Role[] = [Role.PATIENT], profile = true): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ข้อมูลสังเคราะห์" } });
  persons.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: "ACTIVE", roles: { create: roles.map((role) => ({ role })) } } });
  users.push(user.id);
  if (profile) await db.patientProfile.create({ data: { personId: person.id } });
  return { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function owner(value: ActorContext): Promise<string> {
  return (await db.patientProfile.findUniqueOrThrow({ where: { personId: value.personId }, select: { id: true } })).id;
}

function goal(result: PersonalWeightGoalMutationResult): PersonalWeightGoalDto {
  if (!("goal" in result)) throw new Error("Expected a Weight Goal readback");
  return result.goal;
}

function version(value: PersonalWeightGoalDto): { goalId: string; expectedUpdatedAt: string } {
  return { goalId: value.id, expectedUpdatedAt: value.updatedAt };
}

async function make(value: ActorContext, targetWeightKg = fields.targetWeightKg, targetDate = fields.targetDate, nonce = randomUUID(), deps = dependencies): Promise<PersonalWeightGoalDto> {
  const result = await create(value, { submissionNonce: nonce, targetWeightKg, targetDate }, deps);
  return goal(result);
}

function lockBarrierDatabase(expectedCalls: number): PrismaClient {
  let calls = 0;
  let release: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const wrapper = {
    $transaction: async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> =>
      db.$transaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== "$queryRaw") return Reflect.get(target, property, receiver);
            const query = Reflect.get(target, property, target) as (...args: unknown[]) => Promise<unknown>;
            return async (...args: unknown[]): Promise<unknown> => {
              calls += 1;
              if (calls === expectedCalls) release();
              await barrier;
              return query.apply(target, args);
            };
          },
        });
        return operation(proxy);
      }, { ...options, timeout: 15_000 }),
  };
  return wrapper as unknown as PrismaClient;
}

function holdFirstOwnerLockDatabase(onLockHeld: () => void, resume: Promise<void>): PrismaClient {
  let paused = false;
  const wrapper = {
    $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> =>
      db.$transaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== "$queryRaw") return Reflect.get(target, property, receiver);
            const query = Reflect.get(target, property, target) as (...args: unknown[]) => Promise<unknown>;
            return async (...args: unknown[]): Promise<unknown> => {
              const result = await query.apply(target, args);
              if (!paused) {
                paused = true;
                onLockHeld();
                await resume;
              }
              return result;
            };
          },
        });
        return operation(proxy);
      }, { ...options, timeout: 15_000 }),
  };
  return wrapper as unknown as PrismaClient;
}

function failingTransactionDatabase(failAt: "audit" | "receipt"): PrismaClient {
  const wrapper = {
    $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> =>
      db.$transaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== (failAt === "audit" ? "auditEvent" : "personalWeightGoalCreateReceipt")) return Reflect.get(target, property, receiver);
            const delegate = Reflect.get(target, property, receiver) as object;
            return new Proxy(delegate, {
              get(inner, method, delegateReceiver) {
                if (method !== "create") return Reflect.get(inner, method, delegateReceiver);
                return async (): Promise<never> => { throw new Error(`synthetic ${failAt} persistence failure`); };
              },
            });
          },
        });
        return operation(proxy);
      }, options),
  };
  return wrapper as unknown as PrismaClient;
}

function knownCreateFailureDatabase(code: "P2002" | "P2034"): PrismaClient {
  const wrapper = {
    $transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> =>
      db.$transaction(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== "personalWeightGoalCreateReceipt") return Reflect.get(target, property, receiver);
            const delegate = Reflect.get(target, property, receiver) as object;
            return new Proxy(delegate, {
              get(inner, method, delegateReceiver) {
                if (method !== "create") return Reflect.get(inner, method, delegateReceiver);
                return async (): Promise<never> => {
                  throw new Prisma.PrismaClientKnownRequestError("Synthetic transaction conflict", { code, clientVersion: Prisma.prismaVersion.client });
                };
              },
            });
          },
        });
        return operation(proxy);
      }, options),
  };
  return wrapper as unknown as PrismaClient;
}

function ambiguousCommitDatabase(): PrismaClient {
  const wrapper = {
    $transaction: async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> => {
      await db.$transaction(operation, options);
      throw new Error("synthetic commit acknowledgement loss");
    },
  };
  return wrapper as unknown as PrismaClient;
}

async function waitForOwnerLockWait(): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ waiting: number }>>`
      SELECT count(*)::int AS waiting
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND wait_event_type = 'Lock'
        AND query ILIKE '%"PatientProfile"%FOR UPDATE%'
    `;
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Weight mutation never entered the expected PatientProfile lock wait");
}

async function cleanup(): Promise<void> {
  if (users.length === 0) return;
  await db.caregiverAppointmentGrant.deleteMany({ where: { OR: [{ caregiverUserId: { in: users } }, { patientPersonId: { in: persons } }] } });
  await db.caregiverRelationship.deleteMany({ where: { OR: [{ caregiverUserId: { in: users } }, { patientProfile: { personId: { in: persons } } }] } });
  await db.caregiverInvitation.deleteMany({ where: { OR: [{ caregiverUserId: { in: users } }, { patientProfile: { personId: { in: persons } } }] } });
  await db.patientOsmAssignment.deleteMany({ where: { osmUserId: { in: users } } });
  await db.hospitalMembership.deleteMany({ where: { userId: { in: users } } });
  await db.osmHospitalRelationship.deleteMany({ where: { userId: { in: users } } });
  if (hospitals.length > 0) await db.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.personalWeightGoalCreateReceipt.deleteMany({ where: { patientProfile: { personId: { in: persons } } } });
  await db.personalWeightGoal.deleteMany({ where: { patientProfile: { personId: { in: persons } } } });
  await db.patientProfile.deleteMany({ where: { personId: { in: persons } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: persons } } });
  if (hospitals.length > 0) await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  persons.length = 0;
  users.length = 0;
  hospitals.length = 0;
}

describe("Personal Weight Goal real PostgreSQL", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Verified local disposable DB required");
    }
    await db.$connect();
  });
  afterEach(cleanup);
  afterAll(async () => { await db.$disconnect(); });

  it("persists exact decimal strings, current 0..1 state, replay, NOOP, edit and physical removal", async () => {
    const patient = await actor();
    const nonce = randomUUID();
    const first = await make(patient, "72.555", "2026-10-04", nonce);
    expect(first.targetWeightKg).toBe("72.555");
    expect(first.targetDate).toBe("2026-10-04");
    expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(first);
    const replay = await create(patient, { submissionNonce: nonce, targetWeightKg: "1", targetDate: "2020-01-01" }, dependencies);
    expect(replay).toEqual({ outcome: "REPLAY", goal: first });
    expect(await update(patient, { ...version(first), targetWeightKg: "072.555", targetDate: "2026-10-04" }, dependencies)).toEqual({ outcome: "NOOP", goal: first });
    const changed = goal(await update(patient, { ...version(first), targetWeightKg: "70.500", targetDate: "2026-10-04" }, dependencies));
    expect(changed).toMatchObject({ id: first.id, targetWeightKg: "70.5", targetDate: "2026-10-04", createdAt: first.createdAt });
    expect(changed.updatedAt).toBe(new Date(defaultNow.getTime() + 1).toISOString());
    expect(await db.personalWeightGoal.count({ where: { patientProfileId: await owner(patient) } })).toBe(1);
    const stored = await db.personalWeightGoal.findUniqueOrThrow({ where: { id: first.id }, select: { targetWeightKg: true } });
    expect(stored.targetWeightKg.toFixed(3)).toBe("70.500");
    const audits = await db.auditEvent.findMany({ where: { resourceId: first.id }, select: { action: true, resourceType: true, metadata: true } });
    expect(audits).toEqual([
      { action: "personal_weight_goal.created", resourceType: "PersonalWeightGoal", metadata: null },
      { action: "personal_weight_goal.updated", resourceType: "PersonalWeightGoal", metadata: null },
    ]);
    expect(await remove(patient, version(changed), dependencies)).toEqual({ outcome: "DELETED", goalId: first.id });
    expect(await getOwnPersonalWeightGoal(patient, db)).toBeNull();
    expect(await db.personalWeightGoal.count({ where: { id: first.id } })).toBe(0);
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId: await owner(patient) } })).toBe(1);
    expect(await create(patient, { submissionNonce: nonce, ...fields }, dependencies)).toEqual({ outcome: "CREATE_CONSUMED" });
    expect(await db.personalWeightGoal.count({ where: { patientProfileId: await owner(patient) } })).toBe(0);
  });

  it("round-trips minimum, common scales and exact structural maximum through NUMERIC(10,3)", async () => {
    const patient = await actor();
    for (const value of ["0.001", "1", "72.5", "72.55", "72.555", "1000000", "1000000.000"]) {
      const row = await make(patient, value);
      expect(typeof row.targetWeightKg).toBe("string");
      expect(row.targetWeightKg).toBe(value === "1000000.000" ? "1000000" : value);
      expect((await getOwnPersonalWeightGoal(patient, db))?.targetWeightKg).toBe(row.targetWeightKg);
      await remove(patient, version(row), dependencies);
    }
  });

  it("round-trips PostgreSQL DATE civil values independently of process timezone", async () => {
    const patient = await actor();
    const patientProfileId = await owner(patient);
    const originalTimezone = process.env.TZ;
    try {
      for (const date of ["0001-01-01", "2024-02-29", "9999-12-31"]) {
        const id = randomUUID();
        await db.personalWeightGoal.create({ data: {
          id, patientProfileId, targetWeightKg: new Prisma.Decimal("72.5"), targetDate: toWeightGoalDateCarrier(date),
          createdAt: defaultNow, updatedAt: defaultNow,
        } });
        for (const timezone of ["UTC", "Asia/Bangkok", "America/Los_Angeles"]) {
          process.env.TZ = timezone;
          expect((await getOwnPersonalWeightGoal(patient, db))?.targetDate).toBe(date);
        }
        const current = await getOwnPersonalWeightGoal(patient, db);
        if (current === null) throw new Error("Expected persisted Weight Goal");
        await remove(patient, version(current), dependencies);
      }
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("commits terminal receipts for occupied-slot rejection and prevents stale retry resurrection", async () => {
    const patient = await actor();
    const original = await make(patient, "70");
    const rejectedNonce = randomUUID();
    expect(await create(patient, { submissionNonce: rejectedNonce, targetWeightKg: "72.5" }, dependencies)).toEqual({ outcome: "CREATE_CONSUMED" });
    const receipt = await db.personalWeightGoalCreateReceipt.findUniqueOrThrow({ where: { patientProfileId_submissionNonce: { patientProfileId: await owner(patient), submissionNonce: rejectedNonce } } });
    expect(receipt.intendedWeightGoalId).not.toBe(original.id);
    expect(Object.keys(receipt).sort()).toEqual(["createdAt", "intendedWeightGoalId", "patientProfileId", "submissionNonce"].sort());
    expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.created" } })).toBe(1);
    await remove(patient, version(original), dependencies);
    expect(await create(patient, { submissionNonce: rejectedNonce, targetWeightKg: "72.5" }, dependencies)).toEqual({ outcome: "CREATE_CONSUMED" });
    expect(await getOwnPersonalWeightGoal(patient, db)).toBeNull();
    const fresh = await make(patient, "72.5");
    expect(fresh.id).not.toBe(original.id);
    expect(await create(patient, { submissionNonce: rejectedNonce, targetWeightKg: "72.5" }, dependencies)).toEqual({ outcome: "CREATE_CONSUMED" });
    expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(fresh);
  });

  it("does not consume malformed or past-date create input, but accepts today/future and clear", async () => {
    const patient = await actor();
    const profileId = await owner(patient);
    const malformedNonce = randomUUID();
    await expect(create(patient, { submissionNonce: malformedNonce, targetWeightKg: "70\n" }, dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(create(patient, { submissionNonce: randomUUID(), targetWeightKg: 72.5 }, dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(create(patient, { submissionNonce: malformedNonce, targetWeightKg: "70", targetDate: "2026-10-03" }, dependencies)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId: profileId } })).toBe(0);
    expect((await make(patient, "72.5", "2026-10-04")).targetDate).toBe("2026-10-04");
    const futureOwner = await actor();
    expect((await make(futureOwner, "72.5", "2026-10-05")).targetDate).toBe("2026-10-05");

    const boundaryBeforeOwner = await actor();
    expect((await make(boundaryBeforeOwner, "72.5", "2026-10-03", randomUUID(), { database: db, now: () => new Date("2026-10-03T16:59:59.999Z") })).targetDate).toBe("2026-10-03");
    const boundaryOwner = await actor();
    const boundaryNonce = randomUUID();
    await expect(create(boundaryOwner, { submissionNonce: boundaryNonce, targetWeightKg: "72.5", targetDate: "2026-10-03" }, { database: db, now: () => new Date("2026-10-03T17:00:00.000Z") })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId: await owner(boundaryOwner) } })).toBe(0);
    expect((await create(boundaryOwner, { submissionNonce: boundaryNonce, targetWeightKg: "72.5", targetDate: "2026-10-04" }, { database: db, now: () => new Date("2026-10-03T17:00:00.000Z") })).outcome).toBe("CREATED");
  });

  it("retains naturally passed dates for unchanged edits and applies the new-date rule only to replacements", async () => {
    const patient = await actor();
    const earlier = { database: db, now: () => new Date("2026-09-29T17:00:00.000Z") };
    const later = { database: db, now: () => new Date("2026-10-10T16:59:59.999Z") };
    const created = await make(patient, "70", "2026-10-01", randomUUID(), earlier);
    const retained = goal(await update(patient, { ...version(created), targetWeightKg: "72.5", targetDate: "2026-10-01" }, later));
    expect(retained.targetDate).toBe("2026-10-01");
    await expect(update(patient, { ...version(retained), targetWeightKg: "73", targetDate: "2026-10-02" }, later)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(update(patient, { ...version(created), targetWeightKg: "73", targetDate: "2026-10-02" }, later)).rejects.toMatchObject({ code: "CONFLICT" });
    const today = goal(await update(patient, { ...version(retained), targetWeightKg: "72.5", targetDate: "2026-10-10" }, later));
    expect(today.targetDate).toBe("2026-10-10");
    const future = goal(await update(patient, { ...version(today), targetWeightKg: "72.5", targetDate: "2026-10-11" }, later));
    expect(future.targetDate).toBe("2026-10-11");
    const cleared = goal(await update(patient, { ...version(future), targetWeightKg: "72.5", targetDate: "" }, later));
    expect(cleared.targetDate).toBeNull();
    await expect(update(patient, { ...version(created), targetWeightKg: "70", targetDate: "2026-10-01" }, later)).rejects.toMatchObject({ code: "CONFLICT" });

    const clearedPastOwner = await actor();
    const past = await make(clearedPastOwner, "70", "2026-10-01", randomUUID(), earlier);
    expect(goal(await update(clearedPastOwner, { ...version(past), targetWeightKg: "71", targetDate: "" }, later)).targetDate).toBeNull();
  });

  it("enforces stale-version conflict before NOOP and guarded edit/remove version progression", async () => {
    const patient = await actor();
    const first = await make(patient);
    const updated = goal(await update(patient, { ...version(first), targetWeightKg: "73", targetDate: "" }, dependencies));
    await expect(update(patient, { ...version(first), targetWeightKg: "72.5", targetDate: "" }, dependencies)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await update(patient, { ...version(updated), targetWeightKg: "73", targetDate: "" }, dependencies)).toMatchObject({ outcome: "NOOP" });
    const removed = await remove(patient, version(updated), dependencies);
    expect(removed).toEqual({ outcome: "DELETED", goalId: first.id });
    await expect(update(patient, { ...version(updated), targetWeightKg: "74", targetDate: "" }, dependencies)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("serializes different concurrent nonces into one goal, two receipts and one create audit", async () => {
    const patient = await actor();
    const race = { database: lockBarrierDatabase(2), now: () => defaultNow };
    const nonceOne = randomUUID();
    const nonceTwo = randomUUID();
    const outcomes = await Promise.all([
      create(patient, { submissionNonce: nonceOne, targetWeightKg: "70" }, race),
      create(patient, { submissionNonce: nonceTwo, targetWeightKg: "71" }, race),
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(["CREATED", "CREATE_CONSUMED"]);
    const patientProfileId = await owner(patient);
    expect(await db.personalWeightGoal.count({ where: { patientProfileId } })).toBe(1);
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId } })).toBe(2);
    expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.created" } })).toBe(1);
    const loserNonce = outcomes[0]?.outcome === "CREATE_CONSUMED" ? nonceOne : nonceTwo;
    const winner = await getOwnPersonalWeightGoal(patient, db);
    if (winner === null) throw new Error("Expected one serialized winner");
    await remove(patient, version(winner), dependencies);
    expect(await create(patient, { submissionNonce: loserNonce, targetWeightKg: "72" }, dependencies)).toEqual({ outcome: "CREATE_CONSUMED" });
    expect(await getOwnPersonalWeightGoal(patient, db)).toBeNull();
  });

  it("serializes same-nonce concurrent create into one receipt, one goal and one audit", async () => {
    const patient = await actor();
    const nonce = randomUUID();
    const race = { database: lockBarrierDatabase(2), now: () => defaultNow };
    const results = await Promise.all([
      create(patient, { submissionNonce: nonce, targetWeightKg: "72.5" }, race),
      create(patient, { submissionNonce: nonce, targetWeightKg: "1" }, race),
    ]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual(["CREATED", "REPLAY"]);
    const patientProfileId = await owner(patient);
    expect(await db.personalWeightGoal.count({ where: { patientProfileId } })).toBe(1);
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.created" } })).toBe(1);
  });

  it("waits on the owner row and observes a committed goal in a later ReadCommitted statement", async () => {
    const patient = await actor();
    const patientProfileId = await owner(patient);
    let locked: () => void = () => undefined;
    let release: () => void = () => undefined;
    const hasLock = new Promise<void>((resolve) => { locked = resolve; });
    const canCommit = new Promise<void>((resolve) => { release = resolve; });
    const holder = db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PatientProfile" WHERE "id" = ${patientProfileId}::uuid FOR UPDATE`);
      locked();
      await canCommit;
      await tx.personalWeightGoal.create({ data: { id: randomUUID(), patientProfileId, targetWeightKg: new Prisma.Decimal("70"), createdAt: defaultNow, updatedAt: defaultNow } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await hasLock;
    const request = create(patient, { submissionNonce: randomUUID(), targetWeightKg: "72.5" }, dependencies);
    try {
      await waitForOwnerLockWait();
    } finally {
      release();
    }
    await holder;
    expect(await request).toEqual({ outcome: "CREATE_CONSUMED" });
    expect(await db.personalWeightGoal.count({ where: { patientProfileId } })).toBe(1);
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId } })).toBe(1);
    expect(await db.auditEvent.count({ where: { actorUserId: patient.userId } })).toBe(0);
  });

  it.each(["create-first", "remove-first"] as const)("serializes concurrent create/remove when %s acquires the owner lock first", async (order) => {
    const patient = await actor();
    const current = await make(patient, "70");
    const createNonce = randomUUID();
    let notifyLockHeld: () => void = () => undefined;
    let releaseLock: () => void = () => undefined;
    const ownerLockHeld = new Promise<void>((resolve) => { notifyLockHeld = resolve; });
    const resumeFirst = new Promise<void>((resolve) => { releaseLock = resolve; });
    const firstDependencies = {
      database: holdFirstOwnerLockDatabase(notifyLockHeld, resumeFirst),
      now: () => defaultNow,
    };

    const firstRequest = order === "create-first"
      ? create(patient, { submissionNonce: createNonce, targetWeightKg: "72.5" }, firstDependencies)
      : remove(patient, version(current), firstDependencies);
    await ownerLockHeld;

    const secondRequest = order === "create-first"
      ? remove(patient, version(current), dependencies)
      : create(patient, { submissionNonce: createNonce, targetWeightKg: "72.5" }, dependencies);

    let lockWaitObserved = true;
    try {
      await waitForOwnerLockWait();
    } catch {
      lockWaitObserved = false;
    } finally {
      releaseLock();
    }

    const [firstResult, secondResult] = await Promise.allSettled([firstRequest, secondRequest]);
    expect(lockWaitObserved).toBe(true);
    expect(firstResult.status).toBe("fulfilled");
    expect(secondResult.status).toBe("fulfilled");
    if (firstResult.status !== "fulfilled" || secondResult.status !== "fulfilled") {
      throw new Error("Expected both owner-serialized mutations to complete");
    }

    const patientProfileId = await owner(patient);
    if (order === "create-first") {
      expect(firstResult.value).toEqual({ outcome: "CREATE_CONSUMED" });
      expect(secondResult.value).toEqual({ outcome: "DELETED", goalId: current.id });
      expect(await create(patient, { submissionNonce: createNonce, targetWeightKg: "73" }, dependencies)).toEqual({ outcome: "CREATE_CONSUMED" });
      expect(await getOwnPersonalWeightGoal(patient, db)).toBeNull();
      expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId, submissionNonce: createNonce } })).toBe(1);
      expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.created" } })).toBe(1);
      expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.deleted" } })).toBe(1);
    } else {
      expect(firstResult.value).toEqual({ outcome: "DELETED", goalId: current.id });
      expect(secondResult.value).toMatchObject({ outcome: "CREATED" });
      if (!("goal" in secondResult.value)) throw new Error("Expected the post-removal create to return its goal");
      expect(secondResult.value.goal.id).not.toBe(current.id);
      expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(secondResult.value.goal);
      expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId, submissionNonce: createNonce } })).toBe(1);
      expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.created" } })).toBe(2);
      expect(await db.auditEvent.count({ where: { actorUserId: patient.userId, action: "personal_weight_goal.deleted" } })).toBe(1);
    }
  });

  it.each(["edit/edit", "edit/remove", "remove/remove"] as const)("owner lock serializes %s with one old-version winner", async (raceType) => {
    const patient = await actor();
    const current = await make(patient);
    const race = { database: lockBarrierDatabase(2), now: () => defaultNow };
    const first = raceType.startsWith("edit")
      ? update(patient, { ...version(current), targetWeightKg: "73", targetDate: "" }, race)
      : remove(patient, version(current), race);
    const second = raceType.endsWith("edit")
      ? update(patient, { ...version(current), targetWeightKg: "74", targetDate: "" }, race)
      : remove(patient, version(current), race);
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === "rejected")).toHaveLength(1);
    const rejected = outcomes.find((entry) => entry.status === "rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toMatchObject({ code: expect.stringMatching(/^(CONFLICT|NOT_FOUND)$/u) });
    const row = await db.personalWeightGoal.findFirst({ where: { patientProfileId: await owner(patient) }, select: { id: true, updatedAt: true } });
    if (row) expect(row.updatedAt.getTime()).toBe(current.updatedAt ? new Date(current.updatedAt).getTime() + 1 : defaultNow.getTime());
    expect(await db.auditEvent.count({ where: { actorUserId: patient.userId } })).toBe(2);
  });

  it("returns UNCONFIRMED on create transaction, receipt, audit and commit-ack failures, then reconciles by the same nonce", async () => {
    const patient = await actor();
    const receiptFailureNonce = randomUUID();
    expect(await create(patient, { submissionNonce: receiptFailureNonce, targetWeightKg: "72.5" }, { database: failingTransactionDatabase("receipt"), now: () => defaultNow })).toEqual({ outcome: "UNCONFIRMED" });
    expect(await db.personalWeightGoal.count({ where: { patientProfileId: await owner(patient) } })).toBe(0);
    const recovered = goal(await create(patient, { submissionNonce: receiptFailureNonce, targetWeightKg: "72.5" }, dependencies));
    expect(recovered.targetWeightKg).toBe("72.5");
    await remove(patient, version(recovered), dependencies);

    const auditFailureNonce = randomUUID();
    expect(await create(patient, { submissionNonce: auditFailureNonce, targetWeightKg: "73" }, { database: failingTransactionDatabase("audit"), now: () => defaultNow })).toEqual({ outcome: "UNCONFIRMED" });
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId: await owner(patient), submissionNonce: auditFailureNonce } })).toBe(0);

    const committedNonce = randomUUID();
    expect(await create(patient, { submissionNonce: committedNonce, targetWeightKg: "74" }, { database: ambiguousCommitDatabase(), now: () => defaultNow })).toEqual({ outcome: "UNCONFIRMED" });
    expect(await create(patient, { submissionNonce: committedNonce, targetWeightKg: "1" }, dependencies)).toMatchObject({ outcome: "REPLAY" });
  });

  it.each(["P2002", "P2034"] as const)("does not report %s as a definitive occupancy rejection", async (code) => {
    const patient = await actor();
    const nonce = randomUUID();
    expect(await create(patient, { submissionNonce: nonce, targetWeightKg: "72.5" }, { database: knownCreateFailureDatabase(code), now: () => defaultNow })).toEqual({ outcome: "UNCONFIRMED" });
    expect(await db.personalWeightGoalCreateReceipt.count({ where: { patientProfileId: await owner(patient), submissionNonce: nonce } })).toBe(0);
    expect(goal(await create(patient, { submissionNonce: nonce, targetWeightKg: "72.5" }, dependencies)).targetWeightKg).toBe("72.5");
  });

  it("rolls back edit/remove when minimized audit cannot commit", async () => {
    const patient = await actor();
    const current = await make(patient);
    await expect(update(patient, { ...version(current), targetWeightKg: "73", targetDate: "" }, { database: failingTransactionDatabase("audit"), now: () => defaultNow })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(current);
    await expect(remove(patient, version(current), { database: failingTransactionDatabase("audit"), now: () => defaultNow })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(current);
    expect(await db.auditEvent.count({ where: { resourceId: current.id } })).toBe(1);
  });

  it("revalidates exact persisted SELF for reads and mutations after session/role changes", async () => {
    const patient = await actor();
    const nonce = randomUUID();
    const current = await make(patient, "72.5", "", nonce);
    const patientProfileId = await owner(patient);
    await db.user.update({ where: { id: patient.userId }, data: { status: "SUSPENDED" } });
    await Promise.all([
      getOwnPersonalWeightGoal(patient, db),
      create(patient, { submissionNonce: nonce, targetWeightKg: "72.5" }, dependencies),
      update(patient, { ...version(current), targetWeightKg: "73", targetDate: "" }, dependencies),
      remove(patient, version(current), dependencies),
    ].map((request) => expect(request).rejects.toMatchObject({ code: "FORBIDDEN" })));
    expect(await db.personalWeightGoal.count({ where: { patientProfileId } })).toBe(1);
    await db.user.update({ where: { id: patient.userId }, data: { status: "ACTIVE" } });
    await db.userRole.deleteMany({ where: { userId: patient.userId, role: Role.PATIENT } });
    await expect(getOwnPersonalWeightGoal(patient, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["role_removed", "invalid_binding"] as const)("denies %s using request-time persisted SELF resolution", async (change) => {
    const patient = await actor();
    const nonce = randomUUID();
    const current = await make(patient, "72.5", "", nonce);
    let staleActor = patient;
    if (change === "role_removed") await db.userRole.deleteMany({ where: { userId: patient.userId, role: Role.PATIENT } });
    else staleActor = { ...patient, personId: (await actor()).personId };
    await Promise.all([
      getOwnPersonalWeightGoal(staleActor, db),
      create(staleActor, { submissionNonce: nonce, targetWeightKg: "72.5" }, dependencies),
      update(staleActor, { ...version(current), targetWeightKg: "73", targetDate: "" }, dependencies),
      remove(staleActor, version(current), dependencies),
    ].map((request) => expect(request).rejects.toMatchObject({ code: "FORBIDDEN" })));
    expect(await db.auditEvent.count({ where: { resourceId: current.id } })).toBe(1);
  });

  it("denies a missing PatientProfile before read and every mutation", async () => {
    const patient = await actor([Role.PATIENT], false);
    const input = { goalId: randomUUID(), expectedUpdatedAt: defaultNow.toISOString(), targetWeightKg: "72.5", targetDate: "" };
    await Promise.all([
      getOwnPersonalWeightGoal(patient, db),
      create(patient, { submissionNonce: randomUUID(), targetWeightKg: "72.5" }, dependencies),
      update(patient, input, dependencies),
      remove(patient, { goalId: input.goalId, expectedUpdatedAt: input.expectedUpdatedAt }, dependencies),
    ].map((request) => expect(request).rejects.toMatchObject({ code: "FORBIDDEN" })));
  });

  it("keeps other Patient goals isolated and supports a Patient with a Work role only in SELF", async () => {
    const first = await actor();
    const second = await actor([Role.PATIENT, Role.HOSPITAL]);
    const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 20), name: "สังเคราะห์", status: "ACTIVE" } });
    hospitals.push(hospital.id);
    await db.hospitalMembership.create({ data: { hospitalId: hospital.id, userId: second.userId, membershipType: "MEMBER", status: "ACTIVE" } });
    const firstGoal = await make(first);
    expect(await getOwnPersonalWeightGoal(second, db)).toBeNull();
    await expect(update(second, { ...version(firstGoal), targetWeightKg: "73", targetDate: "" }, dependencies)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const ownGoal = await make(second, "73");
    expect(await getOwnPersonalWeightGoal(second, db)).toEqual(ownGoal);
  });

  it("denies Hospital MEMBER/OWNER, assigned OSM, Family grant and ADMIN-only actors", async () => {
    const patient = await actor();
    const patientProfileId = await owner(patient);
    const target = await make(patient);
    const hospital = await db.hospital.create({ data: { hospitalCode: randomUUID().slice(0, 20), name: "สังเคราะห์", status: "ACTIVE" } });
    hospitals.push(hospital.id);
    const relationship = await db.patientHospitalRelationship.create({ data: { patientProfileId, hospitalId: hospital.id, hospitalNumber: randomUUID() } });
    const member = await actor([Role.HOSPITAL]);
    const ownerActor = await actor([Role.HOSPITAL]);
    await db.hospitalMembership.createMany({ data: [
      { hospitalId: hospital.id, userId: member.userId, membershipType: "MEMBER", status: "ACTIVE" },
      { hospitalId: hospital.id, userId: ownerActor.userId, membershipType: "OWNER", status: "ACTIVE" },
    ] });
    const osm = await actor([Role.OSM]);
    await db.osmHospitalRelationship.create({ data: { userId: osm.userId, hospitalId: hospital.id, status: "ACTIVE" } });
    await db.patientOsmAssignment.create({ data: { osmUserId: osm.userId, patientHospitalRelationshipId: relationship.id, assignedByUserId: patient.userId } });
    const family = await actor([]);
    const invitation = await db.caregiverInvitation.create({ data: {
      patientProfileId, caregiverUserId: family.userId, caregiverPersonId: family.personId, issuedByUserId: patient.userId,
      tokenHash: randomUUID(), issuedAt: defaultNow, expiresAt: new Date(defaultNow.getTime() + 86_400_000), status: "ACCEPTED",
      acceptedAt: defaultNow, acceptanceContractVersion: "family-delegation-v1",
    } });
    const caregiverRelationship = await db.caregiverRelationship.create({ data: { patientProfileId, caregiverUserId: family.userId, sourceInvitationId: invitation.id, activatedAt: defaultNow } });
    await db.caregiverAppointmentGrant.create({ data: {
      caregiverRelationshipId: caregiverRelationship.id, patientProfileId, patientPersonId: patient.personId,
      caregiverUserId: family.userId, caregiverPersonId: family.personId, patientHospitalRelationshipId: relationship.id,
      contractVersion: "family-appointment-read-v1", proposedByUserId: patient.userId, proposedAt: defaultNow,
      status: "ACTIVE", acceptedByUserId: family.userId, acceptedAt: defaultNow,
    } });
    const admin = await actor([Role.ADMIN]);
    for (const deniedActor of [member, ownerActor, osm, family, admin]) {
      await expect(getOwnPersonalWeightGoal(deniedActor, db)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(create(deniedActor, { submissionNonce: randomUUID(), targetWeightKg: "72.5" }, dependencies)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(update(deniedActor, { ...version(target), targetWeightKg: "73", targetDate: "" }, dependencies)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(remove(deniedActor, version(target), dependencies)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(target);
  });

  it("enforces numeric/date database checks, owner uniqueness and payload-free receipt structure", async () => {
    const patient = await actor();
    const patientProfileId = await owner(patient);
    const columns = await db.$queryRaw<Array<{ column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; datetime_precision: number | null }>>`
      SELECT column_name, data_type, numeric_precision, numeric_scale, datetime_precision
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PersonalWeightGoal'
    `;
    expect(columns.find((column) => column.column_name === "targetWeightKg")).toMatchObject({ data_type: "numeric", numeric_precision: 10, numeric_scale: 3 });
    expect(columns.find((column) => column.column_name === "targetDate")?.data_type).toBe("date");
    expect(columns.find((column) => column.column_name === "createdAt")?.datetime_precision).toBe(3);
    const rangeOwner = await actor();
    const rangeOwnerId = await owner(rangeOwner);
    await expect(db.personalWeightGoal.create({ data: { id: randomUUID(), patientProfileId: rangeOwnerId, targetWeightKg: new Prisma.Decimal("0"), createdAt: defaultNow, updatedAt: defaultNow } })).rejects.toThrow();
    await expect(db.personalWeightGoal.create({ data: { id: randomUUID(), patientProfileId: rangeOwnerId, targetWeightKg: new Prisma.Decimal("1000000.001"), createdAt: defaultNow, updatedAt: defaultNow } })).rejects.toThrow();
    await expect(db.$executeRaw`
      INSERT INTO "PersonalWeightGoal" ("id", "patientProfileId", "targetWeightKg", "targetDate", "createdAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${rangeOwnerId}::uuid, 70, DATE '10000-01-01', ${defaultNow}, ${defaultNow})
    `).rejects.toThrow();
    const current = await make(patient);
    const definitions = await db.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid IN ('"PersonalWeightGoal"'::regclass, '"PersonalWeightGoalCreateReceipt"'::regclass)
      ORDER BY conrelid::regclass::text, conname
    `;
    expect(definitions.some(({ definition }) => definition.includes("patientProfileId") && definition.includes("UNIQUE"))).toBe(true);
    expect(definitions.some(({ definition }) => definition.includes("targetWeightKg") && definition.includes("1000000"))).toBe(true);
    expect(definitions.some(({ definition }) => definition.includes("targetDate") && definition.includes("9999-12-31"))).toBe(true);
    const receiptFks = await db.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = '"PersonalWeightGoalCreateReceipt"'::regclass AND contype = 'f'
    `;
    expect(receiptFks).toHaveLength(1);
    expect(receiptFks[0]?.definition).toContain('REFERENCES "PatientProfile"');
    expect(receiptFks[0]?.definition).not.toContain('PersonalWeightGoal"');
    const receiptColumns = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'PersonalWeightGoalCreateReceipt'
    `;
    expect(receiptColumns.map(({ column_name }) => column_name).sort()).toEqual(["createdAt", "intendedWeightGoalId", "patientProfileId", "submissionNonce"].sort());
    await expect(db.personalWeightGoal.create({ data: { id: randomUUID(), patientProfileId, targetWeightKg: new Prisma.Decimal("70"), createdAt: defaultNow, updatedAt: defaultNow } })).rejects.toThrow();
    expect(await getOwnPersonalWeightGoal(patient, db)).toEqual(current);
    await remove(patient, version(current), dependencies);
    const survivingReceipt = await db.personalWeightGoalCreateReceipt.findFirst({ where: { patientProfileId } });
    expect(survivingReceipt).not.toBeNull();
  });
});
