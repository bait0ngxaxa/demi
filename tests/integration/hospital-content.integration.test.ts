import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  HospitalContentCategory,
  HospitalContentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Profession,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { HospitalContentMutationResult } from "@/modules/hospital-content/types/hospital-content-projections";
import {
  archiveHospitalContent,
  createHospitalContent,
  editHospitalContentDraft,
  listEligibleHospitalContentOwnerHospitals,
  listHospitalContentForOwner,
  publishHospitalContent,
  readHospitalContentForOwner,
  reconcileHospitalContentCreate,
  withdrawHospitalContent,
} from "@/modules/hospital-content/services/hospital-content-service";
import { HospitalContentCategory as ContentCategory } from "@prisma/client";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const database = getPrisma();
const execFileAsync = promisify(execFile);
const seedScript = "scripts/seed-hospital-master.mjs";
const migrationPath = "prisma/migrations/20261005120000_hospital_content_publishing/migration.sql";
const fixedNow = new Date("2026-10-05T12:00:00.000Z");
let sequence = 0;
let databaseConnected = false;

type UserFixture = { userId: string; personId: string; actor: ActorContext };
type OwnerFixture = UserFixture & { membershipId: string };
type HospitalFixture = { id: string; hospitalCode: string; name: string };

function requireDisposableDatabase(): void {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (
    !url ||
    process.env.DATABASE_URL !== url ||
    process.env.DIRECT_URL !== url ||
    process.env.NODE_ENV === "production" ||
    !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)
  ) {
    throw new Error("Verified local disposable PostgreSQL is required for Hospital Content integration tests");
  }
}

async function clearDatabase(): Promise<void> {
  await database.hospitalContent.deleteMany();
  await database.hospitalContact.deleteMany();
  await database.auditEvent.deleteMany();
  await database.patientOsmAssignment.deleteMany();
  await database.patientHospitalRelationship.deleteMany();
  await database.patientProfile.deleteMany();
  await database.osmHospitalRelationship.deleteMany();
  await database.hospitalMembership.deleteMany();
  await database.userRole.deleteMany();
  await database.user.deleteMany();
  await database.hospital.updateMany({ data: { parentHospitalId: null } });
  await database.hospital.deleteMany();
  await database.person.deleteMany();
}

async function dropAuditFailureTrigger(): Promise<void> {
  await database.$executeRaw`DROP TRIGGER IF EXISTS hospital_content_test_fail_audit ON "AuditEvent"`;
  await database.$executeRaw`DROP FUNCTION IF EXISTS public.hospital_content_test_fail_audit()`;
}

async function dropRollbackRaceAuditTrigger(): Promise<void> {
  await database.$executeRaw`DROP TRIGGER IF EXISTS hospital_content_test_rollback_race_audit ON "AuditEvent"`;
  await database.$executeRaw`DROP FUNCTION IF EXISTS public.hospital_content_test_rollback_race_audit()`;
  await database.$executeRaw`DROP TABLE IF EXISTS public.hospital_content_test_audit_control`;
}

async function installAuditFailureTrigger(): Promise<void> {
  await dropAuditFailureTrigger();
  await database.$executeRaw`
    CREATE FUNCTION public.hospital_content_test_fail_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW."resourceType" = 'HospitalContent' THEN
        RAISE EXCEPTION 'test audit sink failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await database.$executeRaw`
    CREATE TRIGGER hospital_content_test_fail_audit
    BEFORE INSERT ON "AuditEvent"
    FOR EACH ROW EXECUTE FUNCTION public.hospital_content_test_fail_audit()
  `;
}

async function createHospital(input: {
  status?: HospitalStatus;
  parentHospitalId?: string;
  hospitalCode?: string;
  name?: string;
} = {}): Promise<HospitalFixture> {
  sequence += 1;
  return database.hospital.create({
    data: {
      hospitalCode: input.hospitalCode ?? `HC-${randomUUID().slice(0, 8)}-${sequence}`,
      name: input.name ?? `โรงพยาบาลทดสอบ ${sequence}`,
      status: input.status ?? HospitalStatus.ACTIVE,
      parentHospitalId: input.parentHospitalId,
    },
    select: { id: true, hospitalCode: true, name: true },
  });
}

async function createUser(input: {
  roles?: readonly Role[];
  status?: UserStatus;
} = {}): Promise<UserFixture> {
  sequence += 1;
  const person = await database.person.create({
    data: {
      identityKeyHash: `hc-${randomUUID()}`,
      givenName: "ผู้ใช้",
      familyName: `ทดสอบ ${sequence}`,
    },
    select: { id: true },
  });
  const user = await database.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: input.status ?? UserStatus.ACTIVE },
    select: { id: true },
  });
  const roles = input.roles ?? [Role.HOSPITAL];
  for (const role of roles) await database.userRole.create({ data: { userId: user.id, role } });
  return {
    userId: user.id,
    personId: person.id,
    actor: { userId: user.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] },
  };
}

async function addMembership(
  user: UserFixture,
  hospitalId: string,
  input: { membershipType?: MembershipType; status?: MembershipStatus; profession?: Profession | null } = {},
): Promise<OwnerFixture> {
  const hospital = await database.hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: { status: true } });
  const membership = await database.hospitalMembership.create({
    data: {
      userId: user.userId,
      hospitalId,
      membershipType: input.membershipType ?? MembershipType.OWNER,
      status: input.status ?? MembershipStatus.ACTIVE,
      profession: input.profession === undefined ? Profession.DOCTOR : input.profession,
    },
    select: { id: true, membershipType: true, status: true, profession: true },
  });
  const nextActor: ActorContext = {
    ...user.actor,
    hospitalMemberships: [
      ...user.actor.hospitalMemberships,
      {
        hospitalId,
        membershipType: membership.membershipType,
        profession: membership.profession,
        status: membership.status,
        hospitalStatus: hospital.status,
      },
    ],
  };
  return { ...user, membershipId: membership.id, actor: nextActor };
}

async function createOwner(
  hospitalId: string,
  input: { membershipType?: MembershipType; membershipStatus?: MembershipStatus; userStatus?: UserStatus; roles?: readonly Role[] } = {},
): Promise<OwnerFixture> {
  const user = await createUser({ roles: input.roles, status: input.userStatus });
  return addMembership(user, hospitalId, { membershipType: input.membershipType, status: input.membershipStatus });
}

function createInput(hospitalId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hospitalId,
    submissionNonce: randomUUID(),
    title: "ข้อมูลสุขภาพที่โรงพยาบาลจัดทำ",
    body: "เนื้อหาฉบับร่าง\nบรรทัดที่สอง",
    category: ContentCategory.OTHER,
    sourceText: "เอกสารอ้างอิงหนึ่งรายการ",
    ...overrides,
  };
}

function assertConfirmedMutation(result: HospitalContentMutationResult): asserts result is Exclude<HospitalContentMutationResult, { outcome: "UNCONFIRMED" }> {
  if (result.outcome === "UNCONFIRMED") throw new Error("Expected a confirmed PostgreSQL mutation result");
}

function expectOneConflict<T>(results: readonly PromiseSettledResult<T>[]): void {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
}

function dependencies(now: Date = fixedNow, db: PrismaClient = database) {
  return { database: db, now: () => new Date(now.getTime()), random: () => 0, sleep: async () => undefined };
}

async function createContent(owner: OwnerFixture, hospitalId: string, overrides: Record<string, unknown> = {}) {
  const result = await createHospitalContent(owner.actor, createInput(hospitalId, overrides), dependencies());
  if (result.outcome !== "CREATED") throw new Error(`Expected CREATED, received ${result.outcome}`);
  return result.content;
}

async function auditRows(contentId?: string) {
  return database.auditEvent.findMany({
    where: { resourceType: "HospitalContent", ...(contentId ? { resourceId: contentId } : {}) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { actorUserId: true, action: true, resourceType: true, resourceId: true, metadata: true },
  });
}

async function runHospitalMasterSeed(): Promise<void> {
  await execFileAsync(process.execPath, [seedScript], { cwd: process.cwd(), env: process.env });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function withContentReadRevocationBarrier(onContentQuery: () => Promise<void>): PrismaClient {
  let revoked = false;
  const revokeBeforeContentQuery = async (): Promise<void> => {
    if (revoked) return;
    revoked = true;
    await onContentQuery();
  };

  const hospitalDelegate = new Proxy(database.hospital, {
    get(delegateTarget, property, receiver) {
      if (property === "findFirst") {
        return async (args: Prisma.HospitalFindFirstArgs): Promise<unknown> => {
          const select = args.select as unknown as Record<string, unknown> | undefined;
          const relationSelect = select?.contents;
          if (typeof relationSelect !== "object" || relationSelect === null) {
            return delegateTarget.findFirst(args);
          }

          const parentSelectFields = { ...select };
          delete parentSelectFields.contents;
          const parentSelect = { id: true, ...parentSelectFields } as unknown as Prisma.HospitalSelect;
          const parent = await delegateTarget.findFirst({ ...args, select: parentSelect });
          if (!parent) return null;

          await revokeBeforeContentQuery();
          const relationArgs = relationSelect as unknown as Prisma.HospitalContentFindManyArgs;
          const contents = await database.hospitalContent.findMany({
            ...relationArgs,
            where: { hospitalId: parent.id, ...(relationArgs.where ?? {}) },
          });
          return { ...parent, contents };
        };
      }
      const value = Reflect.get(delegateTarget, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(delegateTarget) : value;
    },
  });

  const hospitalContentDelegate = new Proxy(database.hospitalContent, {
    get(delegateTarget, property, receiver) {
      if (property === "findFirst") {
        return async (args: Prisma.HospitalContentFindFirstArgs): Promise<unknown> => {
          await revokeBeforeContentQuery();
          return delegateTarget.findFirst(args);
        };
      }
      if (property === "findMany") {
        return async (args: Prisma.HospitalContentFindManyArgs): Promise<unknown> => {
          await revokeBeforeContentQuery();
          return delegateTarget.findMany(args);
        };
      }
      const value = Reflect.get(delegateTarget, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(delegateTarget) : value;
    },
  });

  return new Proxy(database, {
    get(target, property, receiver) {
      if (property === "hospital") return hospitalDelegate;
      if (property === "hospitalContent") return hospitalContentDelegate;
      return Reflect.get(target, property, receiver) as unknown;
    },
  }) as PrismaClient;
}

async function waitForLockWait(expectedWaiters: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  let waiters = 0;
  while (Date.now() < deadline) {
    const activity = await database.$queryRaw<Array<{ wait_event_type: string | null }>>(Prisma.sql`
      SELECT "wait_event_type"
      FROM pg_stat_activity
      WHERE "datname" = current_database() AND "pid" <> pg_backend_pid()
    `);
    waiters = activity.filter(({ wait_event_type }) => wait_event_type === "Lock").length;
    if (waiters >= expectedWaiters) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`PostgreSQL lock waiter count was ${waiters}; expected at least ${expectedWaiters}`);
}

function withMembershipLockBarrier(onLocked: () => Promise<void>): PrismaClient {
  const wrapped = new Proxy(database, {
    get(target, property) {
      if (property === "$transaction") {
        return (
          callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
          options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number },
        ) => target.$transaction(async (transaction) => {
          const wrappedTransaction = new Proxy(transaction, {
            get(transactionTarget, transactionProperty) {
              if (transactionProperty === "user") {
                const userDelegate = transactionTarget.user;
                return new Proxy(userDelegate, {
                  get(delegateTarget, delegateProperty, receiver) {
                    if (delegateProperty === "findFirst") {
                      return async (args: Prisma.UserFindFirstArgs) => {
                        const result = await delegateTarget.findFirst(args);
                        await onLocked();
                        return result;
                      };
                    }
                    const value = Reflect.get(delegateTarget, delegateProperty, receiver) as unknown;
                    return typeof value === "function" ? value.bind(delegateTarget) : value;
                  },
                });
              }
              if (transactionProperty === "$queryRaw") {
                return async <T>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T> => {
                  const result = await transactionTarget.$queryRaw<T>(query, ...values);
                  const queryText = typeof query === "object" && "sql" in query ? query.sql : "";
                  if (typeof queryText === "string" && queryText.includes('FROM "HospitalMembership"') && queryText.includes("FOR SHARE")) {
                    await onLocked();
                  }
                  return result;
                };
              }
              const value = Reflect.get(transactionTarget, transactionProperty, transactionTarget) as unknown;
              return typeof value === "function" ? value.bind(transactionTarget) : value;
            },
          }) as Prisma.TransactionClient;
          return callback(wrappedTransaction);
        }, options);
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient;
  return wrapped;
}

describe("Phase 17I.2 Hospital Content PostgreSQL behavior", () => {
  beforeAll(async () => {
    requireDisposableDatabase();
    await database.$connect();
    databaseConnected = true;
    await clearDatabase();
  });

  afterEach(async () => {
    if (!databaseConnected) return;
    await dropAuditFailureTrigger();
    await dropRollbackRaceAuditTrigger();
    await clearDatabase();
  });

  afterAll(async () => {
    if (!databaseConnected) return;
    await dropAuditFailureTrigger();
    await dropRollbackRaceAuditTrigger();
    await clearDatabase();
    await database.$disconnect();
  });

  it("matches the additive migration, exact indexes/checks, no-backfill rule and conditional Data API revocation", async () => {
    const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
    expect(migration).toContain('CREATE TYPE "HospitalContentStatus"');
    expect(migration).toContain('CREATE TYPE "HospitalContentCategory"');
    expect(migration).toContain('CREATE TABLE "HospitalContent"');
    expect(migration).toContain('HospitalContent_hospital_nonce_key');
    expect(migration).toContain('HospitalContent_publication_pair_check');
    expect(migration).toContain('HospitalContent_published_time_check');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE RESTRICT');
    expect(migration).toContain("FROM pg_roles");
    expect(migration).toMatch(/REVOKE\s+ALL\s+PRIVILEGES/iu);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+"HospitalContent"/iu);
    expect(migration).not.toMatch(/\bUPDATE\s+"HospitalContact"/iu);

    const noContentHospital = await createHospital();
    expect(await database.hospitalContent.count({ where: { hospitalId: noContentHospital.id } })).toBe(0);

    const indexes = await database.$queryRaw<Array<{ indexname: string; indexdef: string }>>(Prisma.sql`
      SELECT "indexname", "indexdef"
      FROM pg_indexes
      WHERE "schemaname" = current_schema() AND "tablename" = 'HospitalContent'
    `);
    const definitions = new Map(indexes.map(({ indexname, indexdef }) => [indexname, indexdef]));
    expect(definitions.get("HospitalContent_hospital_nonce_key")).toMatch(/UNIQUE.*\("hospitalId", "submissionNonce"\)/u);
    expect(definitions.get("HospitalContent_publisher_order_idx")).toMatch(/\("hospitalId", "updatedAt" DESC, (?:"id"|id) DESC\)/u);
    expect(definitions.get("HospitalContent_patient_order_idx")).toMatch(/\("hospitalId", (?:"status"|status), "firstPublishedAt" DESC, (?:"id"|id) DESC\)/u);
    expect(definitions.get("HospitalContent_patient_category_order_idx")).toMatch(/\("hospitalId", (?:"status"|status), (?:"category"|category), "firstPublishedAt" DESC, (?:"id"|id) DESC\)/u);
    expect(indexes).toHaveLength(5);

    const checks = await database.$queryRaw<Array<{ conname: string; definition: string }>>(Prisma.sql`
      SELECT "conname", pg_get_constraintdef("oid") AS "definition"
      FROM pg_constraint
      WHERE "conrelid" = 'public."HospitalContent"'::regclass AND "contype" = 'c'
    `);
    expect(checks.map(({ conname }) => conname).sort()).toEqual([
      "HospitalContent_publication_pair_check",
      "HospitalContent_published_time_check",
    ]);
    expect(checks.find(({ conname }) => conname === "HospitalContent_publication_pair_check")?.definition).toContain('"firstPublishedAt" IS NULL');
    expect(checks.find(({ conname }) => conname === "HospitalContent_published_time_check")?.definition).toContain('"latestPublishedAt" IS NOT NULL');

    const roles = await database.$queryRaw<Array<{ rolname: string; canSelect: boolean; canInsert: boolean; canUpdate: boolean; canDelete: boolean }>>(Prisma.sql`
      SELECT "rolname",
        has_table_privilege("rolname", 'public."HospitalContent"', 'SELECT') AS "canSelect",
        has_table_privilege("rolname", 'public."HospitalContent"', 'INSERT') AS "canInsert",
        has_table_privilege("rolname", 'public."HospitalContent"', 'UPDATE') AS "canUpdate",
        has_table_privilege("rolname", 'public."HospitalContent"', 'DELETE') AS "canDelete"
      FROM pg_roles WHERE "rolname" IN ('anon', 'authenticated', 'service_role')
    `);
    expect(roles).toHaveLength(0);
    const canCreateRoles = await database.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
      SELECT "rolsuper" OR "rolcreaterole" AS "allowed" FROM pg_roles WHERE "rolname" = current_user
    `);
    expect(canCreateRoles[0]?.allowed).toBe(true);
    try {
      await database.$executeRaw`
        DO $$
        DECLARE role_name NAME;
        BEGIN
          FOR role_name IN SELECT unnest(ARRAY['anon', 'authenticated', 'service_role']::NAME[])
          LOOP
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
              EXECUTE format('CREATE ROLE %I NOLOGIN', role_name);
            END IF;
          END LOOP;
        END
        $$
      `;
      const hardeningSql = migration.slice(migration.indexOf("DO $$"));
      await database.$executeRawUnsafe(hardeningSql);
      const providerRoles = await database.$queryRaw<Array<{ rolname: string; canSelect: boolean; canInsert: boolean; canUpdate: boolean; canDelete: boolean }>>(Prisma.sql`
        SELECT "rolname",
          has_table_privilege("rolname", 'public."HospitalContent"', 'SELECT') AS "canSelect",
          has_table_privilege("rolname", 'public."HospitalContent"', 'INSERT') AS "canInsert",
          has_table_privilege("rolname", 'public."HospitalContent"', 'UPDATE') AS "canUpdate",
          has_table_privilege("rolname", 'public."HospitalContent"', 'DELETE') AS "canDelete"
        FROM pg_roles WHERE "rolname" IN ('anon', 'authenticated', 'service_role')
      `);
      expect(providerRoles.map(({ rolname }) => rolname).sort()).toEqual(["anon", "authenticated", "service_role"]);
      for (const role of providerRoles) {
        expect([role.canSelect, role.canInsert, role.canUpdate, role.canDelete], role.rolname).toEqual([false, false, false, false]);
      }
    } finally {
      await database.$executeRaw`DROP ROLE IF EXISTS service_role, authenticated, anon`;
    }
  });

  it("enforces nonce uniqueness, restrictive Hospital ownership and both publication checks", async () => {
    const hospital = await createHospital();
    const createdAt = fixedNow;
    const id = randomUUID();
    const submissionNonce = randomUUID();
    const data = {
      id,
      hospitalId: hospital.id,
      submissionNonce,
      title: "ร่างทดสอบ",
      body: "ข้อความ",
      category: HospitalContentCategory.NCD,
      updatedAt: createdAt,
    };
    const record = await database.hospitalContent.create({ data });
    expect(record.status).toBe(HospitalContentStatus.DRAFT);
    expect(record.firstPublishedAt).toBeNull();
    expect(record.latestPublishedAt).toBeNull();
    await expect(database.hospitalContent.create({ data: { ...data, id: randomUUID() } })).rejects.toMatchObject({ code: "P2002" });
    await expect(database.hospital.delete({ where: { id: hospital.id } })).rejects.toMatchObject({ code: "P2003" });
    await expect(database.$executeRaw(Prisma.sql`
      UPDATE "Hospital" SET "id" = ${randomUUID()}::uuid WHERE "id" = ${hospital.id}::uuid
    `)).rejects.toThrow();

    const later = new Date(createdAt.getTime() + 1);
    const insertRaw = (input: {
      status: HospitalContentStatus;
      first: Date | null;
      latest: Date | null;
    }) => database.$executeRaw(Prisma.sql`
      INSERT INTO "HospitalContent" (
        "id", "hospitalId", "submissionNonce", "title", "body", "category", "status",
        "firstPublishedAt", "latestPublishedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid, ${hospital.id}::uuid, ${randomUUID()}::uuid, 'valid title', 'valid body',
        'NCD'::"HospitalContentCategory", ${input.status}::"HospitalContentStatus",
        ${input.first}, ${input.latest}, ${createdAt}, ${createdAt}
      )
    `);
    await expect(insertRaw({ status: HospitalContentStatus.DRAFT, first: createdAt, latest: null })).rejects.toThrow();
    await expect(insertRaw({ status: HospitalContentStatus.DRAFT, first: later, latest: createdAt })).rejects.toThrow();
    await expect(insertRaw({ status: HospitalContentStatus.PUBLISHED, first: null, latest: null })).rejects.toThrow();
    await expect(insertRaw({ status: HospitalContentStatus.DRAFT, first: createdAt, latest: later })).resolves.toBe(1);
    await expect(insertRaw({ status: HospitalContentStatus.ARCHIVED, first: createdAt, latest: later })).resolves.toBe(1);
  });

  it("authorizes fresh exact direct OWNER scope and rejects role, hierarchy, OSM, Patient and ADMIN-only substitutes", async () => {
    const parent = await createHospital();
    const child = await createHospital({ parentHospitalId: parent.id });
    const parentOwner = await createOwner(parent.id);
    const childOwner = await createOwner(child.id);
    const childContent = await createContent(childOwner, child.id);

    await expect(createHospitalContent(parentOwner.actor, createInput(child.id), dependencies())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(editHospitalContentDraft(parentOwner.actor, {
      contentId: childContent.id,
      expectedUpdatedAt: childContent.expectedUpdatedAt,
      title: "เปลี่ยนชื่อ",
      body: childContent.body,
      category: childContent.category,
      sourceText: childContent.sourceText,
    }, dependencies())).rejects.toBeInstanceOf(ForbiddenError);

    const parentContent = await createContent(parentOwner, parent.id);
    await expect(readHospitalContentForOwner(childOwner.actor, parentContent.id)).rejects.toThrow();
    await expect(createHospitalContent(childOwner.actor, createInput(parent.id), dependencies())).rejects.toBeInstanceOf(ForbiddenError);

    const member = await createOwner(parent.id, { membershipType: MembershipType.MEMBER });
    const otherOwner = await createOwner(await createHospital().then(({ id }) => id));
    const osmUser = await createUser({ roles: [Role.OSM] });
    await database.osmHospitalRelationship.create({ data: { userId: osmUser.userId, hospitalId: parent.id, status: MembershipStatus.ACTIVE } });
    const patient = await createUser({ roles: [Role.PATIENT] });
    const profile = await database.patientProfile.create({ data: { personId: patient.personId }, select: { id: true } });
    const relationship = await database.patientHospitalRelationship.create({
      data: { patientProfileId: profile.id, hospitalId: parent.id, hospitalNumber: `HN-${sequence}` },
      select: { id: true },
    });
    await database.patientOsmAssignment.create({
      data: { patientHospitalRelationshipId: relationship.id, osmUserId: osmUser.userId, assignedByUserId: parentOwner.userId },
    });
    const osmActor: ActorContext = {
      ...osmUser.actor,
      osmHospitalRelationships: [{ hospitalId: parent.id, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    };
    const admin = await createUser({ roles: [Role.ADMIN] });
    const inactive = await createOwner(parent.id, { userStatus: UserStatus.SUSPENDED });
    const removedRole = await createOwner(parent.id);
    await database.userRole.delete({ where: { userId_role: { userId: removedRole.userId, role: Role.HOSPITAL } } });
    const suspendedMembership = await createOwner(parent.id, { membershipStatus: MembershipStatus.SUSPENDED });
    const demoted = await createOwner(parent.id);
    await database.hospitalMembership.update({ where: { id: demoted.membershipId }, data: { membershipType: MembershipType.MEMBER } });
    const suspendedHospital = await createHospital({ status: HospitalStatus.SUSPENDED });
    const suspendedOwner = await createOwner(suspendedHospital.id);

    for (const deniedActor of [member.actor, otherOwner.actor, osmActor, patient.actor, admin.actor, inactive.actor, removedRole.actor, suspendedMembership.actor, demoted.actor, suspendedOwner.actor]) {
      await expect(createHospitalContent(deniedActor, createInput(parent.id), dependencies())).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(createHospitalContent({ ...parentOwner.actor, personId: randomUUID() }, createInput(parent.id), dependencies())).rejects.toBeInstanceOf(ForbiddenError);

    const adminOwner = await createOwner(parent.id, { roles: [Role.ADMIN, Role.HOSPITAL] });
    const adminCreated = await createContent(adminOwner, parent.id);
    expect(adminCreated.hospital.id).toBe(parent.id);
  });

  it("keeps a multi-Hospital Owner isolated by exact Hospital selectors, reconciliation and lists", async () => {
    const firstHospital = await createHospital({ name: "โรงพยาบาล ก" });
    const secondHospital = await createHospital({ name: "โรงพยาบาล ข" });
    const ownerUser = await createUser();
    const firstOwner = await addMembership(ownerUser, firstHospital.id);
    const secondOwner = await addMembership(ownerUser, secondHospital.id);
    const firstContent = await createContent(firstOwner, firstHospital.id);
    const secondContent = await createContent(secondOwner, secondHospital.id);
    const selector = await listEligibleHospitalContentOwnerHospitals(firstOwner.actor);
    expect(selector.map(({ id }) => id)).toEqual([firstHospital.id, secondHospital.id]);
    expect((await listHospitalContentForOwner(firstOwner.actor, firstHospital.id)).items.map(({ id }) => id)).toEqual([firstContent.id]);
    expect((await listHospitalContentForOwner(secondOwner.actor, secondHospital.id)).items.map(({ id }) => id)).toEqual([secondContent.id]);
    expect((await reconcileHospitalContentCreate(firstOwner.actor, {
      hospitalId: firstHospital.id,
      submissionNonce: (await database.hospitalContent.findUniqueOrThrow({ where: { id: firstContent.id }, select: { submissionNonce: true } })).submissionNonce,
    })).status).toBe("FOUND");
    await expect(listHospitalContentForOwner(firstOwner.actor, firstHospital.id, "malformed-cursor")).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails the publisher list closed when membership is revoked before its Content query", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const content = await createContent(owner, hospital.id);
    const databaseWithRevocationBarrier = withContentReadRevocationBarrier(async () => {
      await database.hospitalMembership.update({
        where: { id: owner.membershipId },
        data: { status: MembershipStatus.SUSPENDED },
      });
    });

    await expect(listHospitalContentForOwner(owner.actor, hospital.id, undefined, databaseWithRevocationBarrier))
      .rejects.toBeInstanceOf(NotFoundError);
    expect(await database.hospitalContent.findUnique({ where: { id: content.id }, select: { id: true } })).toEqual({ id: content.id });
  });

  it("does not return reconciliation Content when membership is revoked before its Content query", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const content = await createContent(owner, hospital.id);
    const record = await database.hospitalContent.findUniqueOrThrow({
      where: { id: content.id },
      select: { submissionNonce: true },
    });
    const databaseWithRevocationBarrier = withContentReadRevocationBarrier(async () => {
      await database.hospitalMembership.update({
        where: { id: owner.membershipId },
        data: { status: MembershipStatus.SUSPENDED },
      });
    });

    await expect(reconcileHospitalContentCreate(owner.actor, {
      hospitalId: hospital.id,
      submissionNonce: record.submissionNonce,
    }, databaseWithRevocationBarrier)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates one complete DRAFT per nonce, returns current REPLAY without write/audit and reconciles exact ABSENT/FOUND", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const input = createInput(hospital.id, { submissionNonce: randomUUID() });
    const created = await createHospitalContent(owner.actor, input, dependencies());
    expect(created.outcome).toBe("CREATED");
    if (created.outcome !== "CREATED") throw new Error("Expected create result");
    expect(created.content.status).toBe(HospitalContentStatus.DRAFT);
    expect(created.content.firstPublishedAt).toBeNull();
    expect(created.content.latestPublishedAt).toBeNull();
    expect(created.content.title).toBe(input.title);
    expect(created.content.body).toBe(input.body);
    expect(created.content.sourceText).toBe(input.sourceText);
    expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id, submissionNonce: String(input.submissionNonce) } })).toBe(1);
    const createdAudits = await auditRows(created.content.id);
    expect(createdAudits).toHaveLength(1);
    expect(createdAudits[0]).toMatchObject({
      actorUserId: owner.userId,
      action: "hospital_content.created",
      resourceType: "HospitalContent",
      resourceId: created.content.id,
      metadata: { hospitalId: hospital.id },
    });
    expect(JSON.stringify(createdAudits[0])).not.toContain(String(input.title));
    expect(JSON.stringify(createdAudits[0])).not.toContain(String(input.body));
    expect(JSON.stringify(createdAudits[0])).not.toContain(String(input.submissionNonce));
    expect(createdAudits[0].metadata).toEqual({ hospitalId: hospital.id });

    await readHospitalContentForOwner(owner.actor, created.content.id);
    await listHospitalContentForOwner(owner.actor, hospital.id);
    await reconcileHospitalContentCreate(owner.actor, { hospitalId: hospital.id, submissionNonce: input.submissionNonce });
    expect(await auditRows(created.content.id)).toHaveLength(1);

    const edited = await editHospitalContentDraft(owner.actor, {
      contentId: created.content.id,
      expectedUpdatedAt: created.content.expectedUpdatedAt,
      title: "หัวข้อปัจจุบัน",
      body: "เนื้อหาปัจจุบัน",
      category: "NCD",
      sourceText: null,
    }, dependencies(new Date(fixedNow.getTime() + 100)));
    assertConfirmedMutation(edited);
    expect(edited.outcome).toBe("UPDATED");
    const replay = await createHospitalContent(owner.actor, createInput(hospital.id, {
      submissionNonce: input.submissionNonce,
      title: "ข้อความซ้ำที่ห้ามบันทึก",
      body: "บทความซ้ำที่ห้ามบันทึก",
      category: "FOOD",
    }), dependencies(new Date(fixedNow.getTime() + 200)));
    expect(replay.outcome).toBe("REPLAY");
    if (replay.outcome !== "REPLAY") throw new Error("Expected replay result");
    expect(replay.content.title).toBe("หัวข้อปัจจุบัน");
    expect(replay.content.body).toBe("เนื้อหาปัจจุบัน");
    expect(replay.content.category).toBe(HospitalContentCategory.NCD);
    expect(replay.content.expectedUpdatedAt).toBe(edited.content.expectedUpdatedAt);
    expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } })).toBe(1);
    expect(await auditRows(created.content.id)).toHaveLength(2);

    const archived = await archiveHospitalContent(owner.actor, {
      contentId: created.content.id,
      expectedUpdatedAt: edited.content.expectedUpdatedAt,
    }, dependencies(new Date(fixedNow.getTime() + 300)));
    assertConfirmedMutation(archived);
    const archivedReplay = await createHospitalContent(owner.actor, createInput(hospital.id, {
      submissionNonce: input.submissionNonce,
      title: "อีก payload ที่ห้ามบันทึก",
      body: "ข้อความเก่าที่ห้ามเขียนทับคลัง",
    }), dependencies(new Date(fixedNow.getTime() + 400)));
    expect(archivedReplay.outcome).toBe("REPLAY");
    if (archivedReplay.outcome !== "REPLAY") throw new Error("Expected archived replay result");
    expect(archivedReplay.content.status).toBe(HospitalContentStatus.ARCHIVED);
    expect(archivedReplay.content.title).toBe("หัวข้อปัจจุบัน");
    expect(await auditRows(created.content.id)).toHaveLength(3);

    expect((await reconcileHospitalContentCreate(owner.actor, { hospitalId: hospital.id, submissionNonce: input.submissionNonce })).status).toBe("FOUND");
    expect(await reconcileHospitalContentCreate(owner.actor, { hospitalId: hospital.id, submissionNonce: randomUUID() })).toEqual({ status: "ABSENT" });
    await expect(reconcileHospitalContentCreate(owner.actor, { hospitalId: otherId(), submissionNonce: input.submissionNonce })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("serializes concurrent same-nonce creates as one CREATED and one REPLAY", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const input = createInput(hospital.id, { submissionNonce: randomUUID() });
    const results = await Promise.all([
      createHospitalContent(owner.actor, input, dependencies()),
      createHospitalContent(owner.actor, { ...input, title: "อีกค่าที่ส่งพร้อมกัน" }, dependencies()),
    ]);
    expect(results.map(({ outcome }) => outcome).sort()).toEqual(["CREATED", "REPLAY"]);
    expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } })).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  });

  it("lets a same-nonce waiter create after the winning insert rolls back", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const input = createInput(hospital.id, { submissionNonce: randomUUID() });
    await database.$executeRaw`
      CREATE TABLE public.hospital_content_test_audit_control (
        "id" BOOLEAN PRIMARY KEY DEFAULT TRUE,
        "failContentAudit" BOOLEAN NOT NULL
      )
    `;
    await database.$executeRaw`INSERT INTO public.hospital_content_test_audit_control ("id", "failContentAudit") VALUES (TRUE, TRUE)`;
    await database.$executeRaw`
      CREATE FUNCTION public.hospital_content_test_rollback_race_audit() RETURNS trigger AS $$
      DECLARE should_fail BOOLEAN;
      BEGIN
        IF NEW."resourceType" = 'HospitalContent' THEN
          SELECT "failContentAudit" INTO should_fail FROM public.hospital_content_test_audit_control WHERE "id" = TRUE;
          IF should_fail THEN
            PERFORM pg_sleep(3);
            RAISE EXCEPTION 'test first transaction audit rollback';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    await database.$executeRaw`
      CREATE TRIGGER hospital_content_test_rollback_race_audit
      BEFORE INSERT ON "AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION public.hospital_content_test_rollback_race_audit()
    `;

    const firstAttempt = createHospitalContent(owner.actor, input, dependencies());
    const deadline = Date.now() + 2_000;
    let sleepingTriggers = 0;
    while (Date.now() < deadline && sleepingTriggers === 0) {
      const sleeping = await database.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count" FROM pg_stat_activity
        WHERE "datname" = current_database() AND "pid" <> pg_backend_pid() AND "wait_event" = 'PgSleep'
      `);
      sleepingTriggers = sleeping[0]?.count ?? 0;
      if (sleepingTriggers === 0) await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    expect(sleepingTriggers).toBeGreaterThan(0);

    const waitingAttempt = createHospitalContent(owner.actor, { ...input, title: "ผู้รอ nonce เดิม" }, dependencies());
    await waitForLockWait(1);
    await database.$executeRaw`UPDATE public.hospital_content_test_audit_control SET "failContentAudit" = FALSE WHERE "id" = TRUE`;
    const [firstResult, waitingResult] = await Promise.allSettled([firstAttempt, waitingAttempt]);
    expect(firstResult.status).toBe("rejected");
    if (firstResult.status === "rejected") expect(firstResult.reason).toBeInstanceOf(InfrastructureError);
    expect(waitingResult.status).toBe("fulfilled");
    if (waitingResult.status !== "fulfilled") throw new Error("The same-nonce waiter should create after rollback");
    expect(waitingResult.value.outcome).toBe("CREATED");
    expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } })).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  }, 15_000);

  it("implements DRAFT edit NOOP/version ordering, publish event time, withdraw and same-ms republication", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const created = await createContent(owner, hospital.id);
    const noOp = await editHospitalContentDraft(owner.actor, {
      contentId: created.id,
      expectedUpdatedAt: created.expectedUpdatedAt,
      title: created.title,
      body: created.body,
      category: created.category,
      sourceText: created.sourceText,
    }, dependencies());
    assertConfirmedMutation(noOp);
    expect(noOp.outcome).toBe("NOOP");
    expect(noOp.content.expectedUpdatedAt).toBe(created.expectedUpdatedAt);
    expect(await auditRows(created.id)).toHaveLength(1);
    await expect(editHospitalContentDraft(owner.actor, {
      contentId: created.id,
      expectedUpdatedAt: new Date(fixedNow.getTime() - 1).toISOString(),
      title: created.title,
      body: created.body,
      category: created.category,
      sourceText: created.sourceText,
    }, dependencies())).rejects.toBeInstanceOf(ConflictError);

    const firstPublish = await publishHospitalContent(owner.actor, { contentId: created.id, expectedUpdatedAt: created.expectedUpdatedAt }, dependencies());
    assertConfirmedMutation(firstPublish);
    expect(firstPublish.outcome).toBe("PUBLISHED");
    if (firstPublish.outcome !== "PUBLISHED") throw new Error("Expected publish result");
    expect(firstPublish.content.firstPublishedAt).toBe(fixedNow.toISOString());
    expect(firstPublish.content.latestPublishedAt).toBe(fixedNow.toISOString());
    expect(firstPublish.content.expectedUpdatedAt).toBe(new Date(fixedNow.getTime() + 1).toISOString());
    await expect(publishHospitalContent(owner.actor, { contentId: created.id, expectedUpdatedAt: firstPublish.content.expectedUpdatedAt }, dependencies())).rejects.toBeInstanceOf(ConflictError);

    const withdrawn = await withdrawHospitalContent(owner.actor, { contentId: created.id, expectedUpdatedAt: firstPublish.content.expectedUpdatedAt }, dependencies(new Date(fixedNow.getTime() + 100)));
    assertConfirmedMutation(withdrawn);
    expect(withdrawn.outcome).toBe("WITHDRAWN");
    expect(withdrawn.content.status).toBe(HospitalContentStatus.DRAFT);
    expect(withdrawn.content.firstPublishedAt).toBe(firstPublish.content.firstPublishedAt);
    expect(withdrawn.content.latestPublishedAt).toBe(firstPublish.content.latestPublishedAt);

    const edited = await editHospitalContentDraft(owner.actor, {
      contentId: created.id,
      expectedUpdatedAt: withdrawn.content.expectedUpdatedAt,
      title: "แก้ไขหลังถอน",
      body: created.body,
      category: created.category,
      sourceText: created.sourceText,
    }, dependencies(new Date(fixedNow.getTime() + 200)));
    assertConfirmedMutation(edited);
    const updatedBeforeRepublish = new Date(edited.content.expectedUpdatedAt).getTime();
    const republished = await publishHospitalContent(owner.actor, { contentId: created.id, expectedUpdatedAt: edited.content.expectedUpdatedAt }, dependencies());
    assertConfirmedMutation(republished);
    expect(republished.outcome).toBe("PUBLISHED");
    expect(republished.content.firstPublishedAt).toBe(firstPublish.content.firstPublishedAt);
    expect(republished.content.latestPublishedAt).toBe(firstPublish.content.latestPublishedAt);
    expect(new Date(republished.content.expectedUpdatedAt).getTime()).toBeGreaterThan(updatedBeforeRepublish);
    expect((await auditRows(created.id)).map(({ action }) => action)).toEqual([
      "hospital_content.created",
      "hospital_content.published",
      "hospital_content.withdrawn",
      "hospital_content.updated",
      "hospital_content.published",
    ]);

    const withdrawnAgain = await withdrawHospitalContent(owner.actor, { contentId: created.id, expectedUpdatedAt: republished.content.expectedUpdatedAt }, dependencies(new Date(fixedNow.getTime() + 300)));
    assertConfirmedMutation(withdrawnAgain);
    const laterPublishTime = new Date(fixedNow.getTime() + 400);
    const laterRepublish = await publishHospitalContent(owner.actor, { contentId: created.id, expectedUpdatedAt: withdrawnAgain.content.expectedUpdatedAt }, dependencies(laterPublishTime));
    assertConfirmedMutation(laterRepublish);
    expect(laterRepublish.content.firstPublishedAt).toBe(firstPublish.content.firstPublishedAt);
    expect(laterRepublish.content.latestPublishedAt).toBe(laterPublishTime.toISOString());
    const lifecycleAudits = await auditRows(created.id);
    expect(lifecycleAudits.map(({ action }) => action)).toEqual([
      "hospital_content.created",
      "hospital_content.published",
      "hospital_content.withdrawn",
      "hospital_content.updated",
      "hospital_content.published",
      "hospital_content.withdrawn",
      "hospital_content.published",
    ]);
    for (const audit of lifecycleAudits) {
      expect(audit).toMatchObject({
        actorUserId: owner.userId,
        resourceType: "HospitalContent",
        resourceId: created.id,
      });
      expect(audit.metadata).toEqual({ hospitalId: hospital.id });
      expect(JSON.stringify(audit)).not.toContain("ข้อมูลสุขภาพที่โรงพยาบาลจัดทำ");
      expect(JSON.stringify(audit)).not.toContain("เนื้อหาฉบับร่าง");
      expect(JSON.stringify(audit)).not.toContain("แก้ไขหลังถอน");
    }
  });

  it("rolls back backward-clock republish and preserves archive history and terminal behavior", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const first = await createContent(owner, hospital.id);
    const published = await publishHospitalContent(owner.actor, { contentId: first.id, expectedUpdatedAt: first.expectedUpdatedAt }, dependencies());
    assertConfirmedMutation(published);
    const withdrawn = await withdrawHospitalContent(owner.actor, { contentId: first.id, expectedUpdatedAt: published.content.expectedUpdatedAt }, dependencies(new Date(fixedNow.getTime() + 10)));
    assertConfirmedMutation(withdrawn);
    const auditCount = (await auditRows(first.id)).length;
    await expect(publishHospitalContent(owner.actor, { contentId: first.id, expectedUpdatedAt: withdrawn.content.expectedUpdatedAt }, dependencies(new Date(fixedNow.getTime() - 1)))).rejects.toBeInstanceOf(InfrastructureError);
    const afterClockFailure = await readHospitalContentForOwner(owner.actor, first.id);
    expect(afterClockFailure.status).toBe(HospitalContentStatus.DRAFT);
    expect(afterClockFailure.firstPublishedAt).toBe(published.content.firstPublishedAt);
    expect(afterClockFailure.latestPublishedAt).toBe(published.content.latestPublishedAt);
    expect(afterClockFailure.expectedUpdatedAt).toBe(withdrawn.content.expectedUpdatedAt);
    expect(await auditRows(first.id)).toHaveLength(auditCount);

    const neverPublished = await createContent(owner, hospital.id);
    const archivedDraft = await archiveHospitalContent(owner.actor, { contentId: neverPublished.id, expectedUpdatedAt: neverPublished.expectedUpdatedAt }, dependencies());
    assertConfirmedMutation(archivedDraft);
    expect(archivedDraft.outcome).toBe("ARCHIVED");
    expect(archivedDraft.content.status).toBe(HospitalContentStatus.ARCHIVED);
    expect(archivedDraft.content.firstPublishedAt).toBeNull();
    expect(archivedDraft.content.latestPublishedAt).toBeNull();
    await expect(editHospitalContentDraft(owner.actor, {
      contentId: neverPublished.id,
      expectedUpdatedAt: archivedDraft.content.expectedUpdatedAt,
      title: "ต้องห้าม",
      body: "ต้องห้าม",
      category: "OTHER",
      sourceText: null,
    }, dependencies())).rejects.toBeInstanceOf(ConflictError);
    await expect(publishHospitalContent(owner.actor, { contentId: neverPublished.id, expectedUpdatedAt: archivedDraft.content.expectedUpdatedAt }, dependencies())).rejects.toBeInstanceOf(ConflictError);
    await expect(withdrawHospitalContent(owner.actor, { contentId: neverPublished.id, expectedUpdatedAt: archivedDraft.content.expectedUpdatedAt }, dependencies())).rejects.toBeInstanceOf(ConflictError);
    await expect(archiveHospitalContent(owner.actor, { contentId: neverPublished.id, expectedUpdatedAt: archivedDraft.content.expectedUpdatedAt }, dependencies())).rejects.toBeInstanceOf(ConflictError);

    const archivePublished = await archiveHospitalContent(owner.actor, { contentId: first.id, expectedUpdatedAt: withdrawn.content.expectedUpdatedAt }, dependencies());
    assertConfirmedMutation(archivePublished);
    expect(archivePublished.content.firstPublishedAt).toBe(published.content.firstPublishedAt);
    expect(archivePublished.content.latestPublishedAt).toBe(published.content.latestPublishedAt);
  });

  it("rolls every content mutation back when the real PostgreSQL audit trigger fails", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const createInputForFailure = createInput(hospital.id, { submissionNonce: randomUUID() });
    await installAuditFailureTrigger();
    await expect(createHospitalContent(owner.actor, createInputForFailure, dependencies())).rejects.toBeInstanceOf(InfrastructureError);
    await dropAuditFailureTrigger();
    expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } })).toBe(0);

    const scenarios = ["updated", "published", "withdrawn", "archived"] as const;
    for (const scenario of scenarios) {
      let record = await createContent(owner, hospital.id);
      if (scenario === "withdrawn") {
        const publish = await publishHospitalContent(owner.actor, { contentId: record.id, expectedUpdatedAt: record.expectedUpdatedAt }, dependencies());
        assertConfirmedMutation(publish);
        record = publish.content;
      }
      await installAuditFailureTrigger();
      const before = await readHospitalContentForOwner(owner.actor, record.id);
      const auditsBefore = (await auditRows(record.id)).length;
      const failure = scenario === "updated"
        ? editHospitalContentDraft(owner.actor, {
          contentId: record.id,
          expectedUpdatedAt: record.expectedUpdatedAt,
          title: "ข้อความที่จะ rollback",
          body: record.body,
          category: record.category,
          sourceText: record.sourceText,
        }, dependencies())
        : scenario === "published"
          ? publishHospitalContent(owner.actor, { contentId: record.id, expectedUpdatedAt: record.expectedUpdatedAt }, dependencies())
          : scenario === "withdrawn"
            ? withdrawHospitalContent(owner.actor, { contentId: record.id, expectedUpdatedAt: record.expectedUpdatedAt }, dependencies())
            : archiveHospitalContent(owner.actor, { contentId: record.id, expectedUpdatedAt: record.expectedUpdatedAt }, dependencies());
      await expect(failure).rejects.toBeInstanceOf(InfrastructureError);
      await dropAuditFailureTrigger();
      const after = await readHospitalContentForOwner(owner.actor, record.id);
      expect(after).toEqual(before);
      expect(await auditRows(record.id)).toHaveLength(auditsBefore);
    }
  });

  it("allows only one same-version edit and does not serialize independent content rows", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const record = await createContent(owner, hospital.id);
    const competingEdits = await Promise.allSettled([
      editHospitalContentDraft(owner.actor, {
        contentId: record.id,
        expectedUpdatedAt: record.expectedUpdatedAt,
        title: "ผู้เขียนคนที่หนึ่ง",
        body: record.body,
        category: record.category,
        sourceText: record.sourceText,
      }, dependencies(new Date(fixedNow.getTime() + 1))),
      editHospitalContentDraft(owner.actor, {
        contentId: record.id,
        expectedUpdatedAt: record.expectedUpdatedAt,
        title: "ผู้เขียนคนที่สอง",
        body: record.body,
        category: record.category,
        sourceText: record.sourceText,
      }, dependencies(new Date(fixedNow.getTime() + 1))),
    ]);
    expect(competingEdits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competingEdits.filter((result) => result.status === "rejected")).toHaveLength(1);
    const second = await createContent(owner, hospital.id);
    const locked = deferred();
    const release = deferred();
    const holder = database.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "HospitalContent" WHERE "id" = ${record.id}::uuid FOR UPDATE
      `);
      locked.resolve();
      await release.promise;
    }, { timeout: 10_000 });
    await locked.promise;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unrelated: Awaited<ReturnType<typeof editHospitalContentDraft>>;
    try {
      unrelated = await Promise.race([
        editHospitalContentDraft(owner.actor, {
          contentId: second.id,
          expectedUpdatedAt: second.expectedUpdatedAt,
          title: "แถวอิสระ",
          body: second.body,
          category: second.category,
          sourceText: second.sourceText,
        }, dependencies(new Date(fixedNow.getTime() + 2))),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Independent HospitalContent row blocked")), 4_000); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      release.resolve();
    }
    expect(unrelated.outcome).toBe("UPDATED");
    await holder;
  });

  it("serializes edit/publish/archive/withdraw command races to one versioned winner", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);

    const editPublishRecord = await createContent(owner, hospital.id);
    const editPublishRace = await Promise.allSettled([
      editHospitalContentDraft(owner.actor, {
        contentId: editPublishRecord.id,
        expectedUpdatedAt: editPublishRecord.expectedUpdatedAt,
        title: "แก้ไขพร้อมเผยแพร่",
        body: editPublishRecord.body,
        category: editPublishRecord.category,
        sourceText: editPublishRecord.sourceText,
      }, dependencies()),
      publishHospitalContent(owner.actor, { contentId: editPublishRecord.id, expectedUpdatedAt: editPublishRecord.expectedUpdatedAt }, dependencies()),
    ]);
    expectOneConflict(editPublishRace);
    expect((await auditRows(editPublishRecord.id)).map(({ action }) => action)).toHaveLength(2);

    const publishArchiveRecord = await createContent(owner, hospital.id);
    const publishArchiveRace = await Promise.allSettled([
      publishHospitalContent(owner.actor, { contentId: publishArchiveRecord.id, expectedUpdatedAt: publishArchiveRecord.expectedUpdatedAt }, dependencies()),
      archiveHospitalContent(owner.actor, { contentId: publishArchiveRecord.id, expectedUpdatedAt: publishArchiveRecord.expectedUpdatedAt }, dependencies()),
    ]);
    expectOneConflict(publishArchiveRace);
    expect((await auditRows(publishArchiveRecord.id)).map(({ action }) => action)).toHaveLength(2);

    const withdrawArchiveRecord = await createContent(owner, hospital.id);
    const initiallyPublished = await publishHospitalContent(owner.actor, {
      contentId: withdrawArchiveRecord.id,
      expectedUpdatedAt: withdrawArchiveRecord.expectedUpdatedAt,
    }, dependencies());
    assertConfirmedMutation(initiallyPublished);
    const withdrawArchiveRace = await Promise.allSettled([
      withdrawHospitalContent(owner.actor, { contentId: withdrawArchiveRecord.id, expectedUpdatedAt: initiallyPublished.content.expectedUpdatedAt }, dependencies()),
      archiveHospitalContent(owner.actor, { contentId: withdrawArchiveRecord.id, expectedUpdatedAt: initiallyPublished.content.expectedUpdatedAt }, dependencies()),
    ]);
    expectOneConflict(withdrawArchiveRace);
    expect((await auditRows(withdrawArchiveRecord.id)).map(({ action }) => action)).toHaveLength(3);

    const withdrawEditRecord = await createContent(owner, hospital.id);
    const publishedForWithdrawEdit = await publishHospitalContent(owner.actor, {
      contentId: withdrawEditRecord.id,
      expectedUpdatedAt: withdrawEditRecord.expectedUpdatedAt,
    }, dependencies());
    assertConfirmedMutation(publishedForWithdrawEdit);
    const withdrawEditRace = await Promise.allSettled([
      withdrawHospitalContent(owner.actor, { contentId: withdrawEditRecord.id, expectedUpdatedAt: publishedForWithdrawEdit.content.expectedUpdatedAt }, dependencies()),
      editHospitalContentDraft(owner.actor, {
        contentId: withdrawEditRecord.id,
        expectedUpdatedAt: publishedForWithdrawEdit.content.expectedUpdatedAt,
        title: "แก้โดยตรงขณะเผยแพร่",
        body: withdrawEditRecord.body,
        category: withdrawEditRecord.category,
        sourceText: withdrawEditRecord.sourceText,
      }, dependencies()),
    ]);
    expectOneConflict(withdrawEditRace);
    expect((await auditRows(withdrawEditRecord.id)).map(({ action }) => action)).toEqual([
      "hospital_content.created",
      "hospital_content.published",
      "hospital_content.withdrawn",
    ]);
  });

  it("serializes revocation-first for User, role, OWNER, membership and Hospital authority", async () => {
    const revokeKinds = ["user", "role", "demote", "suspend-membership", "remove-membership", "hospital"] as const;
    for (const kind of revokeKinds) {
      const hospital = await createHospital();
      const owner = await createOwner(hospital.id);
      if (kind === "user") await database.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } });
      if (kind === "role") await database.userRole.delete({ where: { userId_role: { userId: owner.userId, role: Role.HOSPITAL } } });
      if (kind === "demote") await database.hospitalMembership.update({ where: { id: owner.membershipId }, data: { membershipType: MembershipType.MEMBER } });
      if (kind === "suspend-membership") await database.hospitalMembership.update({ where: { id: owner.membershipId }, data: { status: MembershipStatus.SUSPENDED } });
      if (kind === "remove-membership") await database.hospitalMembership.delete({ where: { id: owner.membershipId } });
      if (kind === "hospital") await database.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
      await expect(createHospitalContent(owner.actor, createInput(hospital.id), dependencies())).rejects.toBeInstanceOf(ForbiddenError);
      expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } })).toBe(0);
    }
  });

  it("holds exact authority SHARE locks through Content commit so concurrent revocation waits", async () => {
    const revokeKinds = ["user", "role", "demote", "suspend-membership", "remove-membership", "hospital"] as const;
    for (const kind of revokeKinds) {
      const hospital = await createHospital();
      const owner = await createOwner(hospital.id);
      const authorityLocked = deferred();
      const releaseOperation = deferred();
      let paused = false;
      const wrapped = withMembershipLockBarrier(async () => {
        if (paused) return;
        paused = true;
        authorityLocked.resolve();
        await releaseOperation.promise;
      });
      const operation = createHospitalContent(owner.actor, createInput(hospital.id), dependencies(fixedNow, wrapped));
      await authorityLocked.promise;
      const revoke = Promise.resolve(kind === "user"
        ? database.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } })
        : kind === "role"
          ? database.userRole.delete({ where: { userId_role: { userId: owner.userId, role: Role.HOSPITAL } } })
          : kind === "demote"
            ? database.hospitalMembership.update({ where: { id: owner.membershipId }, data: { membershipType: MembershipType.MEMBER } })
            : kind === "suspend-membership"
              ? database.hospitalMembership.update({ where: { id: owner.membershipId }, data: { status: MembershipStatus.SUSPENDED } })
              : kind === "remove-membership"
                ? database.hospitalMembership.delete({ where: { id: owner.membershipId } })
                : database.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } }));
      let waitError: unknown;
      try {
        await waitForLockWait(1);
      } catch (error: unknown) {
        waitError = error;
      } finally {
        releaseOperation.resolve();
      }
      const created = await operation;
      await revoke;
      if (waitError) throw waitError;
      expect(created.outcome, kind).toBe("CREATED");
      expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } }), kind).toBe(1);
    }
  }, 60_000);

  it("serves bounded signed 25-row seek pages in updatedAt/id descending order for the exact Hospital", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const ownerUser = await createUser();
    const owner = await addMembership(ownerUser, hospital.id);
    const secondOwner = await addMembership(ownerUser, otherHospital.id);
    const rows = Array.from({ length: 27 }, (_unused, index) => {
      const number = index + 1;
      const id = `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
      return {
        id,
        hospitalId: hospital.id,
        submissionNonce: randomUUID(),
        title: `รายการ ${number}`,
        body: "ต้องไม่อยู่ใน projection",
        category: HospitalContentCategory.OTHER,
        status: number === 27 ? HospitalContentStatus.PUBLISHED : number === 20 ? HospitalContentStatus.ARCHIVED : HospitalContentStatus.DRAFT,
        firstPublishedAt: number === 27 ? fixedNow : null,
        latestPublishedAt: number === 27 ? fixedNow : null,
        createdAt: fixedNow,
        updatedAt: new Date(fixedNow.getTime() + (number > 20 ? 2 : 1)),
      };
    });
    await database.hospitalContent.createMany({ data: rows });
    const otherRecord = await createContent(secondOwner, otherHospital.id);
    const firstPage = await listHospitalContentForOwner(owner.actor, hospital.id);
    expect(firstPage.items).toHaveLength(25);
    expect(firstPage.items[0]?.id).toBe(rows[26]?.id);
    expect(new Set(firstPage.items.map(({ status }) => status))).toEqual(new Set(Object.values(HospitalContentStatus)));
    expect(firstPage.items[6]?.id).toBe(rows[20]?.id);
    expect(firstPage.nextCursor).toMatch(/^hcontentcur_v1_/u);
    expect(JSON.stringify(firstPage)).not.toContain("projection");
    expect(firstPage.items.every((item) => Object.keys(item).sort().join(",") === "category,expectedUpdatedAt,firstPublishedAt,id,latestPublishedAt,status,title")).toBe(true);
    const secondPage = await listHospitalContentForOwner(owner.actor, hospital.id, firstPage.nextCursor);
    expect(secondPage.items.map(({ id }) => id)).toEqual([rows[1]?.id, rows[0]?.id]);
    expect(secondPage.items.some(({ id }) => id === otherRecord.id)).toBe(false);
    await expect(listHospitalContentForOwner(owner.actor, hospital.id, `${firstPage.nextCursor}x`)).rejects.toBeInstanceOf(ValidationError);

    const movingId = secondPage.items[0]?.id;
    if (!movingId || !firstPage.nextCursor) throw new Error("Expected continuation row and cursor");
    await database.hospitalContent.update({ where: { id: movingId }, data: { updatedAt: new Date(fixedNow.getTime() + 5) } });
    const continuation = await listHospitalContentForOwner(owner.actor, hospital.id, firstPage.nextCursor);
    expect(continuation.items.some(({ id }) => id === movingId)).toBe(false);
    expect((await listHospitalContentForOwner(owner.actor, hospital.id)).items[0]?.id).toBe(movingId);
  });

  it("preserves seeded Hospital identity, Content and Contact across the real Master seed rerun", async () => {
    await runHospitalMasterSeed();
    const seeded = await database.hospital.findFirstOrThrow({ where: { hospitalCode: "KANG" }, select: { id: true, hospitalCode: true, name: true, parentHospitalId: true } });
    await database.hospital.update({ where: { id: seeded.id }, data: { status: HospitalStatus.ACTIVE } });
    const owner = await createOwner(seeded.id);
    const content = await createContent(owner, seeded.id);
    const contact = await database.hospitalContact.create({ data: { hospitalId: seeded.id, addressText: "ที่อยู่ทดสอบ", phoneNumber: "02-123-4567" } });
    const beforeHospital = await database.hospital.findUniqueOrThrow({ where: { id: seeded.id }, select: { id: true, hospitalCode: true, name: true, parentHospitalId: true } });
    const beforeContent = await database.hospitalContent.findUniqueOrThrow({ where: { id: content.id } });
    const beforeContact = await database.hospitalContact.findUniqueOrThrow({ where: { id: contact.id } });

    await runHospitalMasterSeed();

    expect(await database.hospital.findUniqueOrThrow({ where: { id: seeded.id }, select: { id: true, hospitalCode: true, name: true, parentHospitalId: true } })).toEqual(beforeHospital);
    expect(await database.hospitalContent.findUniqueOrThrow({ where: { id: content.id } })).toEqual(beforeContent);
    expect(await database.hospitalContact.findUniqueOrThrow({ where: { id: contact.id } })).toEqual(beforeContact);
    expect(await database.hospitalContent.count({ where: { hospitalId: seeded.id } })).toBe(1);
  });
});

function otherId(): string {
  return "99999999-9999-4999-8999-999999999999";
}
