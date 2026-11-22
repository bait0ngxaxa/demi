import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  PrismaClient,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertDisposableIntegrationEnvironment } from "../../scripts/integration-environment.mjs";
import type { ActorContext } from "@/modules/auth/types/actor-context";

/**
 * Audit P2 measurement: the Parent area overview against the production pool size, and what it does to every other
 * query sharing that pool. Run with `npm run test:benchmark -- tests/benchmarks/parent-area-overview.benchmark.test.ts`.
 *
 * - Pool: `connection_limit=5`, as `docs/operations/SUPABASE_PRODUCTION.md` sets for the Session pooler.
 * - "scheduler" scenario: one more connection held for the whole run, as the scheduler tick holds its lock.
 * - Probe: a trivial query issued every PROBE_INTERVAL_MS on the same pool while the overview runs. Its latency is
 *   almost entirely pool wait, i.e. what any concurrent page (for example patient detail) would wait first.
 */
const CHILD_COUNTS = [5, 20, 50] as const;
const PATIENTS_PER_CHILD = 20;
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 10;
const PROBE_INTERVAL_MS = 20;
const POOL_CONNECTION_LIMIT = 5;

const databaseUrl = assertDisposableIntegrationEnvironment(process.env);
const seed = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const pool = new PrismaClient({ datasources: { db: { url: `${databaseUrl}?connection_limit=${POOL_CONNECTION_LIMIT}` } } });
const benchmarkActor: { current: ActorContext | null } = { current: null };

vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => pool }));
vi.mock("@/modules/auth/services/request-application-actor", () => ({
  getRequestApplicationActor: async (): Promise<ActorContext> => {
    if (!benchmarkActor.current) throw new Error("benchmark actor is not seeded");
    return benchmarkActor.current;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string): never => {
    throw new Error(`unexpected redirect to ${destination}`);
  },
}));

const { getParentAreaOverviewContext } = await import("@/modules/reporting/transport/parent-area-overview-context");

type Seeded = { actor: ActorContext; childIds: string[] };
type Stats = { p50: number; p95: number; max: number; count: number };

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = (percentile: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1))] ?? 0;
  return { p50: rank(50), p95: rank(95), max: sorted.at(-1) ?? 0, count: sorted.length };
}

function format(value: number): string {
  return value.toFixed(1);
}

async function seedParentWithChildren(childCount: number): Promise<Seeded> {
  const parent = await seed.hospital.create({
    data: {
      hospitalCode: `BENCH-P-${randomUUID().slice(0, 16)}`,
      name: `Benchmark Parent ${childCount}`,
      status: HospitalStatus.ACTIVE,
      serviceAreaEligibility: { create: { kind: "PARENT", verifiedAt: new Date() } },
    },
    select: { id: true, status: true },
  });
  const ownerPerson = await seed.person.create({
    data: { identityKeyHash: `bench-owner-${randomUUID()}`, givenName: "ผู้ดูแล", familyName: "ทดสอบ" },
    select: { id: true },
  });
  const owner = await seed.user.create({
    data: { personId: ownerPerson.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await seed.userRole.create({ data: { userId: owner.id, role: Role.HOSPITAL } });
  await seed.hospitalMembership.create({
    data: { userId: owner.id, hospitalId: parent.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
  });

  const childIds: string[] = [];
  for (let childIndex = 0; childIndex < childCount; childIndex += 1) {
    const child = await seed.hospital.create({
      data: {
        hospitalCode: `BENCH-C-${randomUUID().slice(0, 16)}`,
        name: `Benchmark Child ${childCount}-${childIndex}`,
        status: HospitalStatus.ACTIVE,
        serviceAreaEligibility: { create: { kind: "CHILD", verifiedAt: new Date() } },
      },
      select: { id: true },
    });
    childIds.push(child.id);

    const people = Array.from({ length: PATIENTS_PER_CHILD }, (_, index) => ({
      id: randomUUID(),
      identityKeyHash: `bench-patient-${randomUUID()}`,
      givenName: "ผู้รับบริการ",
      familyName: `${childIndex}-${index}`,
    }));
    await seed.person.createMany({ data: people });
    const profiles = people.map(({ id }) => ({ id: randomUUID(), personId: id }));
    await seed.patientProfile.createMany({ data: profiles });
    const relationships = profiles.map(({ id }, index) => ({
      id: randomUUID(),
      patientProfileId: id,
      hospitalId: child.id,
      hospitalNumber: `BENCH-${childIndex}-${index}`,
    }));
    await seed.patientHospitalRelationship.createMany({ data: relationships });
    // 60% active, 40% completed; active programs carry 0-3 recorded follow-up rounds.
    const programs = relationships.map(({ id }, index) => {
      const completed = index % 5 >= 3;
      return {
        id: randomUUID(),
        patientHospitalRelationshipId: id,
        createdByUserId: owner.id,
        status: completed ? PatientProgramStatus.COMPLETED : PatientProgramStatus.ACTIVE,
        startedAt: new Date("2026-08-17T05:00:00.000Z"),
        completedAt: completed ? new Date("2026-09-01T05:00:00.000Z") : null,
      };
    });
    await seed.patientProgram.createMany({ data: programs });
    const followups = programs.flatMap((program, index) =>
      program.status === PatientProgramStatus.ACTIVE
        ? Array.from({ length: index % 4 }, (_, round) => ({
          patientHospitalRelationshipId: program.patientHospitalRelationshipId,
          patientProgramId: program.id,
          createdByUserId: owner.id,
          roundNumber: round + 1,
          submissionNonce: randomUUID(),
          submissionRequestHash: randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
          recordedAt: new Date(Date.UTC(2026, 7, 18 + round, 5)),
        }))
        : [],
    );
    if (followups.length > 0) await seed.patientFollowup.createMany({ data: followups });
  }

  await seed.hospitalServiceArea.createMany({
    data: childIds.map((childHospitalId) => ({ parentHospitalId: parent.id, childHospitalId, createdByUserId: owner.id })),
  });

  return {
    childIds,
    actor: {
      userId: owner.id,
      personId: ownerPerson.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [{
        hospitalId: parent.id,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: parent.status,
      }],
      osmHospitalRelationships: [],
    },
  };
}

/** Holds one pool connection open until released, as the scheduler tick holds its lock connection. */
function holdOneConnection(): { ready: Promise<void>; release: () => Promise<void> } {
  let releaseHold: () => void = () => undefined;
  let markReady: () => void = () => undefined;
  const released = new Promise<void>((resolve) => { releaseHold = resolve; });
  const ready = new Promise<void>((resolve) => { markReady = resolve; });
  const transaction = pool.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1`;
    markReady();
    await released;
  }, { maxWait: 60_000, timeout: 30 * 60 * 1000 });
  return {
    ready,
    release: async (): Promise<void> => {
      releaseHold();
      await transaction;
    },
  };
}

async function measureScenario(seeded: Seeded, holdSchedulerConnection: boolean): Promise<{
  overview: Stats;
  probe: Stats;
  probeFailures: number;
}> {
  benchmarkActor.current = seeded.actor;
  const hold = holdSchedulerConnection ? holdOneConnection() : null;
  await hold?.ready;
  try {
    for (let run = 0; run < WARMUP_RUNS; run += 1) await getParentAreaOverviewContext();

    const overviewSamples: number[] = [];
    const probeSamples: number[] = [];
    let probeFailures = 0;
    for (let run = 0; run < MEASURED_RUNS; run += 1) {
      let running = true;
      const probing = (async (): Promise<void> => {
        while (running) {
          const started = performance.now();
          try {
            await pool.$queryRaw`SELECT 1`;
            probeSamples.push(performance.now() - started);
          } catch {
            probeFailures += 1;
          }
          await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS));
        }
      })();
      const started = performance.now();
      const groups = await getParentAreaOverviewContext();
      overviewSamples.push(performance.now() - started);
      running = false;
      await probing;
      expect(groups.flatMap(({ areas }) => areas)).toHaveLength(seeded.childIds.length);
    }
    return { overview: stats(overviewSamples), probe: stats(probeSamples), probeFailures };
  } finally {
    await hold?.release();
  }
}

describe("Parent area overview under the production pool size", () => {
  beforeAll(async () => {
    await pool.$connect();
  });

  afterAll(async () => {
    await pool.$disconnect();
    await seed.$disconnect();
  });

  it("reports overview and concurrent probe latency for 5, 20 and 50 Children", async () => {
    const rows: string[] = [
      `connection_limit=${POOL_CONNECTION_LIMIT}, ${PATIENTS_PER_CHILD} patients per Child, ${MEASURED_RUNS} measured runs (ms)`,
      "| Children | scheduler held | overview p50 | overview p95 | probe p50 | probe p95 | probe max | probe failures |",
      "|---:|:---:|---:|---:|---:|---:|---:|---:|",
    ];
    for (const childCount of CHILD_COUNTS) {
      const seeded = await seedParentWithChildren(childCount);
      for (const holdSchedulerConnection of [false, true]) {
        const result = await measureScenario(seeded, holdSchedulerConnection);
        rows.push(`| ${childCount} | ${holdSchedulerConnection ? "yes" : "no"} | ${format(result.overview.p50)} | ` +
          `${format(result.overview.p95)} | ${format(result.probe.p50)} | ${format(result.probe.p95)} | ` +
          `${format(result.probe.max)} | ${result.probeFailures} |`);
      }
    }
    process.stdout.write(`\n${rows.join("\n")}\n\n`);
  });
});
