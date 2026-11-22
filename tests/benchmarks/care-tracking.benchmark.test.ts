import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  AppointmentStatus,
  AppointmentType,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramRoundActivityMode,
  PatientProgramRoundActivitySource,
  PatientProgramRoundOrigin,
  PatientProgramRoundToolCode,
  PatientProgramStatus,
  Prisma,
  PrismaClient,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { assertDisposableIntegrationEnvironment } from "../../scripts/integration-environment.mjs";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { CARE_STAGES, type CareSignal, type CareStage } from "@/modules/care-tracking/domain/care-stage";
import { CARE_TRACKING_PAGE_SIZE } from "@/modules/care-tracking/schemas/care-tracking-schemas";
import {
  careTrackingQueryInternals,
  getCareTrackingPage,
} from "@/modules/care-tracking/services/care-tracking-query-service";

/**
 * Audit P3 measurement: the CT-1 tracking statement (`buildTrackingStatement`) and the whole `getCareTrackingPage`
 * read against one Hospital of 500, 2,000 and 5,000 patients, next to a 2,000-patient Hospital that is out of scope.
 * Run with `npm run test:benchmark -- tests/benchmarks/care-tracking.benchmark.test.ts`. Timings go to stdout;
 * `EXPLAIN (ANALYZE, BUFFERS)` plans and every result row are appended to files as soon as they are measured, so an
 * interrupted run keeps what it measured. Every scenario is timed with the database defaults, which match Supabase
 * (`jit = off`, set in compose.integration.yaml); for the scenarios marked `pageRead`, the whole page read and the
 * statement with `SET LOCAL jit = on` (PostgreSQL's own default) are timed too.
 *
 * Synthetic distribution per patient (deterministic by index): 80% baseline; of those 70% an ACTIVE Program
 * (1-8 opened rounds, every earlier round completed, every 10th with all opened rounds completed, 5% with a final
 * assessment), 15% a COMPLETED Program (6 completed rounds); vitals in rounds 1-2, a follow-up in rounds 3+, one round
 * activity per opened round; appointments: 50% a future one, 15% an overdue one, 30% a completed past one; 3% ended
 * care. Seeding bypasses the round triggers (disposable database only): the read cost depends on row shape, not on
 * how the rows were written.
 */
const SIZES = [500, 2_000, 5_000] as const;
const NOISE_PATIENTS = 2_000;
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 10;
const BATCH = 500;
const NOW = new Date("2026-11-22T03:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const FAMILY_NAMES = ["สมบูรณ์", "ใจดี", "รักไทย", "มีสุข", "ศรีสวัสดิ์", "ทองดี", "แก้วใส", "บุญมา", "พรหมมา", "สายทอง"];

const databaseUrl = assertDisposableIntegrationEnvironment(process.env);
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type Scenario = {
  name: string;
  stages?: CareStage[];
  signals?: CareSignal[];
  search?: string;
  includeEnded?: boolean;
  /** "last" is resolved from the default page's total. */
  page?: number | "last";
  /** Also time the whole `getCareTrackingPage` read and record the plan. */
  pageRead?: boolean;
};

const SCENARIOS: Scenario[] = [
  { name: "default page", pageRead: true },
  ...CARE_STAGES.map((stage): Scenario => ({
    name: `stage ${stage}`,
    stages: [stage],
    includeEnded: stage === "PROGRAM_COMPLETED" || stage === "CARE_ENDED",
  })),
  { name: "signal overdueAppointment", signals: ["overdueAppointment"] },
  { name: "name search (one surname, ~10%)", search: "สมบูรณ์", pageRead: true },
  { name: "HN exact search", search: "BENCH-HN-7" },
  { name: "last page", page: "last", pageRead: true },
];

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function createOwnedHospital(name: string): Promise<{ hospitalId: string; actor: ActorContext }> {
  const hospital = await prisma.hospital.create({
    data: { hospitalCode: `BENCH-CT-${randomUUID().slice(0, 12)}`, name, status: HospitalStatus.ACTIVE },
    select: { id: true },
  });
  const person = await prisma.person.create({
    data: { identityKeyHash: `bench-ct-owner-${randomUUID()}`, givenName: "เจ้าหน้าที่", familyName: name },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: { userId: user.id, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
  });
  return {
    hospitalId: hospital.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [{
        hospitalId: hospital.id,
        membershipType: MembershipType.OWNER,
        profession: null,
        status: MembershipStatus.ACTIVE,
        hospitalStatus: HospitalStatus.ACTIVE,
      }],
      osmHospitalRelationships: [],
    },
  };
}

/** Adds patients `from`..`to - 1` to the Hospital with the distribution described above. */
async function seedPatients(hospitalId: string, staffUserId: string, from: number, to: number): Promise<void> {
  for (const indexes of chunks(Array.from({ length: to - from }, (_, offset) => from + offset), BATCH)) {
    const patients = indexes.map((index) => ({
      index,
      personId: randomUUID(),
      userId: randomUUID(),
      profileId: randomUUID(),
      relationshipId: randomUUID(),
      programId: randomUUID(),
    }));
    await prisma.$transaction(async (tx) => {
      // Disposable database only: skip the round lifecycle triggers for synthetic history.
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      await tx.person.createMany({
        data: patients.map(({ index, personId }) => ({
          id: personId,
          identityKeyHash: `bench-ct-${randomUUID()}`,
          givenName: `ผู้รับบริการ${index}`,
          familyName: FAMILY_NAMES[index % FAMILY_NAMES.length] ?? "ทดสอบ",
        })),
      });
      await tx.user.createMany({
        data: patients.map(({ personId, userId }) => ({ id: userId, personId, authSubject: randomUUID(), status: UserStatus.ACTIVE })),
      });
      await tx.userRole.createMany({ data: patients.map(({ userId }) => ({ userId, role: Role.PATIENT })) });
      await tx.patientProfile.createMany({ data: patients.map(({ personId, profileId }) => ({ id: profileId, personId })) });
      await tx.patientHospitalRelationship.createMany({
        data: patients.map(({ index, profileId, relationshipId }) => ({
          id: relationshipId,
          patientProfileId: profileId,
          hospitalId,
          hospitalNumber: `BENCH-HN-${index}`,
          ...(index % 33 === 0 ? { endedAt: daysAgo(5), endedByUserId: staffUserId, endReason: "สิ้นสุดการดูแล" } : {}),
        })),
      });

      const withBaseline = patients.filter(({ index }) => index % 5 !== 0);
      await tx.patientBaseline.createMany({
        data: withBaseline.map(({ index, relationshipId }) => ({
          patientHospitalRelationshipId: relationshipId,
          recordedOn: daysAgo(100 + (index % 20)),
          recordedByUserId: staffUserId,
        })),
      });

      const programKind = (index: number): "ACTIVE" | "COMPLETED" | null => {
        const bucket = index % 20;
        if (index % 5 === 0) return null;
        if (bucket < 14) return "ACTIVE";
        if (bucket < 17) return "COMPLETED";
        return null;
      };
      const programs = withBaseline.flatMap((patient) => {
        const kind = programKind(patient.index);
        return kind ? [{ ...patient, kind }] : [];
      });
      await tx.patientProgram.createMany({
        data: programs.map(({ index, programId, relationshipId, kind }) => ({
          id: programId,
          patientHospitalRelationshipId: relationshipId,
          createdByUserId: staffUserId,
          status: kind === "ACTIVE" ? PatientProgramStatus.ACTIVE : PatientProgramStatus.COMPLETED,
          startedAt: daysAgo(90 + (index % 30)),
          completedAt: kind === "COMPLETED" ? daysAgo(10 + (index % 20)) : null,
        })),
      });

      const rounds: Prisma.PatientProgramRoundCreateManyInput[] = [];
      const completions: Prisma.PatientProgramRoundCompletionCreateManyInput[] = [];
      const vitals: Prisma.PatientProgramRoundVitalsCreateManyInput[] = [];
      const followups: Prisma.PatientFollowupCreateManyInput[] = [];
      const activities: Prisma.PatientProgramRoundActivityCreateManyInput[] = [];
      const finals: Prisma.PatientFinalAssessmentCreateManyInput[] = [];
      for (const { index, programId, relationshipId, kind } of programs) {
        const opened = kind === "COMPLETED" ? 6 : 1 + (index % 8);
        const completedRounds = kind === "COMPLETED" || index % 10 === 1 ? opened : opened - 1;
        for (let round = 1; round <= opened; round += 1) {
          const openedAt = daysAgo(90 - round * 12 + (index % 5));
          const link = { patientProgramId: programId, patientHospitalRelationshipId: relationshipId, roundNumber: round };
          rounds.push({
            ...link,
            origin: round > 6 ? PatientProgramRoundOrigin.EXTRA : PatientProgramRoundOrigin.GUIDELINE,
            openedAt,
            openedByUserId: staffUserId,
            submissionNonce: randomUUID(),
          });
          if (round <= completedRounds) {
            completions.push({ ...link, completedByUserId: staffUserId, submissionNonce: randomUUID(), completedAt: new Date(openedAt.getTime() + 3 * DAY_MS) });
          }
          if (round <= 2) {
            vitals.push({
              ...link,
              serviceDate: openedAt,
              weight: 70,
              recordedByUserId: staffUserId,
              submissionNonce: randomUUID(),
              recordedAt: openedAt,
            });
          } else {
            followups.push({
              ...link,
              createdByUserId: staffUserId,
              submissionNonce: randomUUID(),
              submissionRequestHash: randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
              recordedAt: new Date(openedAt.getTime() + DAY_MS),
            });
          }
          activities.push({
            ...link,
            toolCode: PatientProgramRoundToolCode.PAM,
            source: PatientProgramRoundActivitySource.PLANNED,
            mode: PatientProgramRoundActivityMode.RECORDED,
            performedAt: new Date(openedAt.getTime() + 2 * DAY_MS),
            recordedByUserId: staffUserId,
            submissionNonce: randomUUID(),
          });
        }
        if (kind === "COMPLETED" || (kind === "ACTIVE" && index % 20 === 3)) {
          finals.push({
            patientProgramId: programId,
            patientHospitalRelationshipId: relationshipId,
            weight: 68,
            recordedByUserId: staffUserId,
            recordedAt: daysAgo(12),
          });
        }
      }
      for (const rows of chunks(rounds, 2_000)) await tx.patientProgramRound.createMany({ data: rows });
      for (const rows of chunks(completions, 2_000)) await tx.patientProgramRoundCompletion.createMany({ data: rows });
      for (const rows of chunks(vitals, 2_000)) await tx.patientProgramRoundVitals.createMany({ data: rows });
      for (const rows of chunks(followups, 2_000)) await tx.patientFollowup.createMany({ data: rows });
      for (const rows of chunks(activities, 2_000)) await tx.patientProgramRoundActivity.createMany({ data: rows });
      if (finals.length > 0) await tx.patientFinalAssessment.createMany({ data: finals });

      const appointments = patients.flatMap(({ index, relationshipId }): Prisma.PatientAppointmentCreateManyInput[] => {
        const base = { patientHospitalRelationshipId: relationshipId, createdByUserId: staffUserId, type: AppointmentType.FOLLOW_UP };
        const rows: Prisma.PatientAppointmentCreateManyInput[] = [];
        if (index % 2 === 0) rows.push({ ...base, scheduledAt: new Date(NOW.getTime() + (1 + (index % 40)) * DAY_MS), submissionNonce: randomUUID() });
        if (index % 20 < 3) rows.push({ ...base, scheduledAt: daysAgo(1 + (index % 10)), submissionNonce: randomUUID() });
        if (index % 10 < 3) {
          rows.push({ ...base, scheduledAt: daysAgo(20 + (index % 30)), status: AppointmentStatus.COMPLETED, submissionNonce: randomUUID() });
        }
        return rows;
      });
      for (const rows of chunks(appointments, 2_000)) await tx.patientAppointment.createMany({ data: rows });
    }, { timeout: 10 * 60 * 1000, maxWait: 60_000 });
  }
}

type Stats = { p50: number; p95: number };

function stats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((left, right) => left - right);
  const rank = (percentile: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1))] ?? 0;
  return { p50: rank(50), p95: rank(95) };
}

async function measure(run: () => Promise<unknown>): Promise<Stats> {
  for (let attempt = 0; attempt < WARMUP_RUNS; attempt += 1) await run();
  const samples: number[] = [];
  for (let attempt = 0; attempt < MEASURED_RUNS; attempt += 1) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  return stats(samples);
}

/** The same statement with JIT compilation enabled for its transaction only (`SET LOCAL`). */
function withJit<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL jit = on`;
    return run(tx);
  }, { timeout: 120_000 });
}

function statement(hospitalId: string, scenario: Scenario, page: number): Prisma.Sql {
  return careTrackingQueryInternals.buildTrackingStatement(
    { hospitalId, includeEndedRelationships: scenario.includeEnded ?? false, assignedOsmUserId: null, search: scenario.search },
    {
      now: NOW,
      stages: scenario.stages ?? [],
      signals: scenario.signals ?? [],
      includeEnded: scenario.includeEnded ?? false,
      page,
      pageSize: CARE_TRACKING_PAGE_SIZE,
    },
  );
}

describe("CT-1 care tracking read under growing Hospital size", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports statement and page timings with plans for 500, 2,000 and 5,000 patients", async () => {
    const noise = await createOwnedHospital("โรงพยาบาลนอกขอบเขต");
    await seedPatients(noise.hospitalId, noise.actor.userId, 0, NOISE_PATIENTS);
    const target = await createOwnedHospital("โรงพยาบาลวัดผล");
    const outputDirectory = join(tmpdir(), "demi-benchmarks");
    mkdirSync(outputDirectory, { recursive: true });
    const planPath = join(outputDirectory, "care-tracking-plans.txt");
    const resultPath = join(outputDirectory, "care-tracking-results.md");
    writeFileSync(planPath, "", "utf8");
    writeFileSync(resultPath, [
      `${MEASURED_RUNS} measured runs after ${WARMUP_RUNS} warm-up run; out-of-scope Hospital: ${NOISE_PATIENTS} patients (ms)`,
      "| patients | scenario | rows matched | statement p50 | statement p95 | jit on p50 | jit on p95 | page p50 | page p95 |",
      "|---:|---|---:|---:|---:|---:|---:|---:|---:|",
      "",
    ].join("\n"), "utf8");
    process.stdout.write(`\nResults: ${resultPath}\nPlans: ${planPath}\n\n`);
    let plans = 0;

    let seeded = 0;
    for (const size of SIZES) {
      await seedPatients(target.hospitalId, target.actor.userId, seeded, size);
      seeded = size;
      await prisma.$executeRaw`ANALYZE`;

      const defaultRows = await prisma.$queryRaw<{ total: number }[]>(statement(target.hospitalId, SCENARIOS[0] as Scenario, 1));
      const lastPage = Math.max(1, Math.ceil((defaultRows[0]?.total ?? 0) / CARE_TRACKING_PAGE_SIZE));
      for (const scenario of SCENARIOS) {
        const page = scenario.page === "last" ? lastPage : scenario.page ?? 1;
        const sql = statement(target.hospitalId, scenario, page);
        if (scenario.pageRead) {
          const plan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
          const planText = plan.map((line) => line["QUERY PLAN"]).join("\n");
          appendFileSync(planPath, `### ${size} patients — ${scenario.name}\n\n${planText}\n\n`, "utf8");
          const jitOnPlan = await withJit((tx) =>
            tx.$queryRaw<{ "QUERY PLAN": string }[]>(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) ${sql}`));
          const jitOnText = jitOnPlan.map((line) => line["QUERY PLAN"]).join("\n");
          appendFileSync(planPath, `### ${size} patients — ${scenario.name} (jit = on)\n\n${jitOnText}\n\n`, "utf8");
          plans += 1;
        }
        const result = await prisma.$queryRaw<{ total: number }[]>(sql);
        const statementStats = await measure(() => prisma.$queryRaw(sql));
        // With JIT the cost is the same compile for every filter, so it is timed only for the page scenarios.
        const jitOnStats = scenario.pageRead ? await measure(() => withJit((tx) => tx.$queryRaw(sql))) : null;
        const pageStats = scenario.pageRead
          ? await measure(() => getCareTrackingPage(target.actor, {
            hospitalId: target.hospitalId,
            page,
            ...(scenario.stages ? { stages: scenario.stages } : {}),
            ...(scenario.signals ? { signals: scenario.signals } : {}),
            ...(scenario.search ? { search: scenario.search } : {}),
            ...(scenario.includeEnded ? { includeEnded: true } : {}),
          }, { database: prisma, now: () => NOW }))
          : null;
        const row = `| ${size} | ${scenario.name} | ${result[0]?.total ?? 0} | ${statementStats.p50.toFixed(1)} | ` +
          `${statementStats.p95.toFixed(1)} | ${jitOnStats?.p50.toFixed(1) ?? "-"} | ${jitOnStats?.p95.toFixed(1) ?? "-"} | ` +
          `${pageStats?.p50.toFixed(1) ?? "-"} | ${pageStats?.p95.toFixed(1) ?? "-"} |`;
        appendFileSync(resultPath, `${row}\n`, "utf8");
        process.stdout.write(`${row}\n`);
      }
    }

    expect(plans).toBeGreaterThan(0);
  });
});
