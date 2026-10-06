import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  listEligibleHospitalContactOwnerHospitals,
  readHospitalContactForOwner,
  listOwnPatientHospitalContacts,
  readOwnPatientHospitalContact,
  updateHospitalContact,
} from "@/modules/hospital-contact/services/hospital-contact-service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const prisma = getPrisma();
const execFileAsync = promisify(execFile);
const seedScript = "scripts/seed-hospital-master.mjs";

type UserFixture = {
  userId: string;
  personId: string;
  actor: ActorContext;
};

type OwnerFixture = UserFixture & { membershipId: string };

let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.hospitalContact.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(input: {
  status?: HospitalStatus;
  parentHospitalId?: string;
  hospitalCode?: string;
  name?: string;
} = {}): Promise<{ id: string; hospitalCode: string; name: string }> {
  sequence += 1;
  const code = input.hospitalCode ?? `HC-${randomUUID().slice(0, 8)}-${sequence}`;

  return prisma.hospital.create({
    data: {
      hospitalCode: code,
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
  createPatientProfile?: boolean;
} = {}): Promise<UserFixture> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: `hc-${randomUUID()}`,
      givenName: "ผู้ใช้",
      familyName: `ทดสอบ ${sequence}`,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: randomUUID(),
      status: input.status ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  const roles = input.roles ?? [Role.HOSPITAL];

  for (const role of roles) {
    await prisma.userRole.create({ data: { userId: user.id, role } });
  }

  if (input.createPatientProfile) {
    await prisma.patientProfile.create({ data: { personId: person.id } });
  }

  return {
    userId: user.id,
    personId: person.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles,
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    },
  };
}

async function createOwner(
  hospitalId: string,
  input: {
    membershipType?: MembershipType;
    membershipStatus?: MembershipStatus;
    userStatus?: UserStatus;
    roles?: readonly Role[];
  } = {},
): Promise<OwnerFixture> {
  const user = await createUser({ roles: input.roles, status: input.userStatus });
  const hospital = await prisma.hospital.findUniqueOrThrow({
    where: { id: hospitalId },
    select: { status: true },
  });
  const membership = await prisma.hospitalMembership.create({
    data: {
      userId: user.userId,
      hospitalId,
      membershipType: input.membershipType ?? MembershipType.OWNER,
      status: input.membershipStatus ?? MembershipStatus.ACTIVE,
      profession: "DOCTOR",
    },
    select: { id: true, membershipType: true, status: true },
  });

  return {
    ...user,
    membershipId: membership.id,
    actor: {
      ...user.actor,
      hospitalMemberships: [
        {
          hospitalId,
          membershipType: membership.membershipType,
          profession: "DOCTOR",
          status: membership.status,
          hospitalStatus: hospital.status,
        },
      ],
    },
  };
}

async function createPatient(): Promise<UserFixture & { profileId: string }> {
  const user = await createUser({ roles: [Role.PATIENT], createPatientProfile: true });
  const profile = await prisma.patientProfile.findUniqueOrThrow({
    where: { personId: user.personId },
    select: { id: true },
  });
  return { ...user, profileId: profile.id };
}

async function createPatientRelationship(
  profileId: string,
  hospitalId: string,
): Promise<{ id: string }> {
  return prisma.patientHospitalRelationship.create({
    data: { patientProfileId: profileId, hospitalId, hospitalNumber: `HN-${sequence}` },
    select: { id: true },
  });
}

function desiredState(
  hospitalId: string,
  expectedUpdatedAt: string | null,
  addressText: string | null,
  phoneNumber: string | null,
): Record<string, unknown> {
  return { hospitalId, expectedUpdatedAt, addressText, phoneNumber };
}

async function runHospitalMasterSeed(): Promise<void> {
  await execFileAsync(process.execPath, [seedScript], {
    cwd: process.cwd(),
    env: process.env,
  });
}

async function waitForPostgresLockWait(expectedWaiters: number): Promise<void> {
  const deadline = Date.now() + 7_000;
  let lastWaiters = 0;

  while (Date.now() < deadline) {
    const activity = await prisma.$queryRaw<Array<{ wait_event_type: string | null }>>(Prisma.sql`
      SELECT "wait_event_type"
      FROM pg_stat_activity
      WHERE "datname" = current_database()
        AND "pid" <> pg_backend_pid()
    `);
    const waiting = activity.filter(({ wait_event_type }) => wait_event_type === "Lock");
    lastWaiters = waiting.length;

    if (waiting.length >= expectedWaiters) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`PostgreSQL lock wait count was ${lastWaiters}; expected at least ${expectedWaiters}`);
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function contactReadBarrier(): {
  database: PrismaClient;
  waitUntilReached: () => Promise<void>;
  release: () => void;
} {
  const reached = deferred();
  const resume = deferred();
  let paused = false;
  const database = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$queryRaw") {
        return async <T = unknown>(query: Prisma.Sql): Promise<T> => {
          if (!paused) {
            if (!query.sql.includes('"HospitalContact"')) {
              throw new Error("Expected the Contact-producing SQL statement at the read barrier");
            }
            paused = true;
            reached.resolve();
            await resume.promise;
          }

          return target.$queryRaw<T>(query);
        };
      }

      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient;

  return {
    database,
    async waitUntilReached(): Promise<void> {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          reached.promise,
          new Promise<void>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("Contact read SQL barrier was not reached")), 8_000);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
    release: () => resume.resolve(),
  };
}

async function readAfterCommittedRevocation<T>(
  read: (database: PrismaClient) => Promise<T>,
  revoke: () => Promise<void>,
): Promise<T> {
  const barrier = contactReadBarrier();
  const result = read(barrier.database);
  let failed = false;
  let failure: unknown;

  try {
    await barrier.waitUntilReached();
    await revoke();
  } catch (error: unknown) {
    failed = true;
    failure = error;
  } finally {
    barrier.release();
  }

  if (failed) {
    await result.catch(() => undefined);
    throw failure;
  }

  return result;
}

describe("Phase 17I.1 Hospital Contact PostgreSQL behavior", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await clearDatabase();
    await prisma.$disconnect();
  });

  it("keeps the forward migration additive and free of Contact backfill", () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20261005100000_hospital_contact/migration.sql"),
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE "HospitalContact"');
    expect(migration).toContain('"addressText" VARCHAR(500)');
    expect(migration).toContain('"phoneNumber" VARCHAR(32)');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+"HospitalContact"/iu);
    expect(migration).not.toMatch(/\bUPDATE\s+"HospitalContact"/iu);
    expect(migration).not.toContain('HospitalContact_hospitalId_idx');
  });

  it("enforces the singleton foreign key, Restrict deletion, and leaves Hospital identity unchanged", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const identityBefore = await prisma.hospital.findUniqueOrThrow({
      where: { id: hospital.id },
      select: { id: true, hospitalCode: true, name: true, status: true, parentHospitalId: true },
    });

    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "เลขที่ 1", null),
    );
    expect(created.outcome).toBe("CREATED");
    expect(
      await prisma.hospital.findUniqueOrThrow({
        where: { id: hospital.id },
        select: { id: true, hospitalCode: true, name: true, status: true, parentHospitalId: true },
      }),
    ).toEqual(identityBefore);
    expect(await prisma.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(1);

    await expect(
      prisma.hospitalContact.create({
        data: { hospitalId: hospital.id, addressText: null, phoneNumber: "02 123 4567" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await prisma.hospitalMembership.delete({ where: { id: owner.membershipId } });
    await expect(prisma.hospital.delete({ where: { id: hospital.id } })).rejects.toMatchObject({
      code: "P2003",
    });

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT "column_name"
      FROM information_schema.columns
      WHERE "table_schema" = current_schema() AND "table_name" = 'PatientHospitalRelationship'
    `);
    expect(columns.map(({ column_name }) => column_name)).not.toContain("status");
  });

  it("allows only exact direct active Owners, including ADMIN only through Owner authority", async () => {
    const parent = await createHospital();
    const child = await createHospital({ parentHospitalId: parent.id });
    const other = await createHospital();
    const owner = await createOwner(parent.id);
    const childOwner = await createOwner(child.id);
    const member = await createOwner(other.id, { membershipType: MembershipType.MEMBER });
    const admin = await createUser({ roles: [Role.ADMIN] });
    const adminAndOwner = await createOwner(other.id, { roles: [Role.ADMIN, Role.HOSPITAL] });

    await expect(
      updateHospitalContact(owner.actor, desiredState(parent.id, null, "ที่อยู่", null)),
    ).resolves.toMatchObject({ outcome: "CREATED" });
    await expect(readHospitalContactForOwner(owner.actor, parent.id)).resolves.toMatchObject({
      hospital: { id: parent.id, hospitalCode: parent.hospitalCode, name: parent.name },
      addressText: "ที่อยู่",
      phoneNumber: null,
    });
    await expect(listEligibleHospitalContactOwnerHospitals(owner.actor)).resolves.toEqual([
      { id: parent.id, hospitalCode: parent.hospitalCode, name: parent.name },
    ]);
    await expect(readHospitalContactForOwner(member.actor, other.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listEligibleHospitalContactOwnerHospitals(member.actor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(member.actor, desiredState(other.id, null, "ที่อยู่", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readHospitalContactForOwner(owner.actor, child.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(owner.actor, desiredState(child.id, null, "ที่อยู่", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readHospitalContactForOwner(childOwner.actor, parent.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(childOwner.actor, desiredState(parent.id, null, "ที่อยู่", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readHospitalContactForOwner(admin.actor, other.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(admin.actor, desiredState(other.id, null, "ที่อยู่", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(adminAndOwner.actor, desiredState(other.id, null, "ที่อยู่", null)),
    ).resolves.toMatchObject({ outcome: "CREATED" });
    await expect(readHospitalContactForOwner(adminAndOwner.actor, other.id)).resolves.toMatchObject({
      hospital: { id: other.id },
      addressText: "ที่อยู่",
      phoneNumber: null,
    });

    const assignedOsm = await createUser({ roles: [Role.OSM] });
    await prisma.osmHospitalRelationship.create({
      data: { userId: assignedOsm.userId, hospitalId: other.id, status: MembershipStatus.ACTIVE },
    });
    await expect(readHospitalContactForOwner(assignedOsm.actor, other.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(assignedOsm.actor, desiredState(other.id, null, "ที่อยู่", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const patient = await createPatient();
    await expect(readHospitalContactForOwner(patient.actor, other.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateHospitalContact(patient.actor, desiredState(other.id, null, "ที่อยู่", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(
      await prisma.auditEvent.count({ where: { action: "hospital_contact.created" } }),
    ).toBe(2);
  });

  it("denies editor writes after persisted actor, role, membership, or Hospital authority is revoked", async () => {
    const cases = ["user", "role", "demotion", "suspended-membership", "removed-membership", "hospital"] as const;

    for (const authorityChange of cases) {
      const hospital = await createHospital();
      const owner = await createOwner(hospital.id);

      if (authorityChange === "user") {
        await prisma.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } });
      } else if (authorityChange === "role") {
        await prisma.userRole.delete({ where: { userId_role: { userId: owner.userId, role: Role.HOSPITAL } } });
      } else if (authorityChange === "demotion") {
        await prisma.hospitalMembership.update({
          where: { id: owner.membershipId },
          data: { membershipType: MembershipType.MEMBER },
        });
      } else if (authorityChange === "suspended-membership") {
        await prisma.hospitalMembership.update({
          where: { id: owner.membershipId },
          data: { status: MembershipStatus.SUSPENDED },
        });
      } else if (authorityChange === "removed-membership") {
        await prisma.hospitalMembership.delete({ where: { id: owner.membershipId } });
      } else {
        await prisma.hospital.update({
          where: { id: hospital.id },
          data: { status: HospitalStatus.SUSPENDED },
        });
      }

      await expect(
        updateHospitalContact(owner.actor, desiredState(hospital.id, null, "ข้อมูลลับ", null)),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(readHospitalContactForOwner(owner.actor, hospital.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listEligibleHospitalContactOwnerHospitals(owner.actor)).resolves.toEqual([]);
      expect(await prisma.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(0);
      expect(await prisma.auditEvent.count({ where: { action: "hospital_contact.created" } })).toBe(0);
      await clearDatabase();
    }
  });

  it.each([
    "HOSPITAL role removal",
    "OWNER membership demotion",
    "OWNER membership removal",
    "User suspension",
    "Hospital suspension",
  ] as const)("does not return Owner Contact when %s commits before its authorized SQL statement", async (change) => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    await updateHospitalContact(owner.actor, desiredState(hospital.id, null, "ที่อยู่ลับ", "02-555-0101"));

    await expect(readHospitalContactForOwner(owner.actor, hospital.id)).resolves.toMatchObject({
      addressText: "ที่อยู่ลับ",
      phoneNumber: "02-555-0101",
    });

    const read = readAfterCommittedRevocation(
      (database) => readHospitalContactForOwner(owner.actor, hospital.id, database),
      async () => {
        if (change === "HOSPITAL role removal") {
          await prisma.userRole.delete({ where: { userId_role: { userId: owner.userId, role: Role.HOSPITAL } } });
        } else if (change === "OWNER membership demotion") {
          await prisma.hospitalMembership.update({
            where: { id: owner.membershipId },
            data: { membershipType: MembershipType.MEMBER },
          });
        } else if (change === "OWNER membership removal") {
          await prisma.hospitalMembership.delete({ where: { id: owner.membershipId } });
        } else if (change === "User suspension") {
          await prisma.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } });
        } else {
          await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
        }
      },
    );

    await expect(read).rejects.toBeInstanceOf(NotFoundError);
  });

  it("isolates a multi-Hospital Owner directory to exact ACTIVE direct memberships", async () => {
    const first = await createHospital({ name: "โรงพยาบาล ข" });
    const second = await createHospital({ name: "โรงพยาบาล ก" });
    const inactive = await createHospital({ status: HospitalStatus.SUSPENDED });
    const shared = await createUser({ roles: [Role.HOSPITAL] });
    const memberships: ActorContext["hospitalMemberships"][number][] = [];

    for (const hospital of [first, second, inactive]) {
      const membership = await prisma.hospitalMembership.create({
        data: {
          userId: shared.userId,
          hospitalId: hospital.id,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        select: { membershipType: true, status: true },
      });
      const currentHospital = await prisma.hospital.findUniqueOrThrow({
        where: { id: hospital.id },
        select: { status: true },
      });
      memberships.push({
        hospitalId: hospital.id,
        membershipType: membership.membershipType,
        profession: null,
        status: membership.status,
        hospitalStatus: currentHospital.status,
      });
    }

    const actor: ActorContext = { ...shared.actor, hospitalMemberships: memberships };
    const eligible = await listEligibleHospitalContactOwnerHospitals(actor);
    expect(eligible.map(({ id }) => id)).toEqual([second.id, first.id]);
    expect(eligible.every(({ id }) => id !== inactive.id)).toBe(true);

    await expect(
      updateHospitalContact(actor, desiredState(first.id, null, "ที่อยู่แรก", null)),
    ).resolves.toMatchObject({ outcome: "CREATED" });
    await expect(
      updateHospitalContact(actor, desiredState(second.id, null, null, "02 123 4567")),
    ).resolves.toMatchObject({ outcome: "CREATED" });
    expect(await prisma.hospitalContact.count()).toBe(2);
  });

  it("creates, updates, clears, retains the row, and advances monotonic millisecond versions", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const fixedTime = new Date("2026-10-05T02:03:04.005Z");
    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ที่อยู่ ก", null),
      { now: () => fixedTime },
    );
    expect(created.outcome).toBe("CREATED");
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const firstRow = await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } });
    expect(firstRow.createdAt.getTime()).toBe(fixedTime.getTime());
    expect(firstRow.updatedAt.getTime()).toBe(fixedTime.getTime());

    const updated = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, created.contact.expectedUpdatedAt, "ที่อยู่ ก", "02-123-4567"),
      { now: () => new Date(fixedTime.getTime() - 5_000) },
    );
    expect(updated.outcome).toBe("UPDATED");
    if (updated.outcome !== "UPDATED") throw new Error("Expected contact update");
    const updatedAt = updated.contact.expectedUpdatedAt;
    if (updatedAt === null) throw new Error("Expected an updated contact version");
    expect(new Date(updatedAt).getTime()).toBe(fixedTime.getTime() + 1);

    const cleared = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, updated.contact.expectedUpdatedAt, null, null),
      { now: () => fixedTime },
    );
    expect(cleared.outcome).toBe("UPDATED");
    const retained = await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } });
    expect(retained.id).toBe(firstRow.id);
    expect(retained.createdAt).toEqual(firstRow.createdAt);
    expect(retained.addressText).toBeNull();
    expect(retained.phoneNumber).toBeNull();
    expect(retained.updatedAt.getTime()).toBe(fixedTime.getTime() + 2);
    await expect(
      updateHospitalContact(owner.actor, desiredState(hospital.id, null, null, null)),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.auditEvent.count({ where: { resourceType: "HospitalContact" } })).toBe(3);
  });

  it("clears either optional field independently and audits each changed state", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ที่อยู่", "02-123-4567"),
    );
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const createdAt = created.contact.expectedUpdatedAt;
    if (!createdAt) throw new Error("Expected a persisted Contact version");

    const addressCleared = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, createdAt, null, "02-123-4567"),
    );
    expect(addressCleared.outcome).toBe("UPDATED");
    if (addressCleared.outcome !== "UPDATED") throw new Error("Expected address clear update");
    expect(addressCleared.contact.addressText).toBeNull();
    expect(addressCleared.contact.phoneNumber).toBe("02-123-4567");

    const phoneCleared = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, addressCleared.contact.expectedUpdatedAt, null, null),
    );
    expect(phoneCleared.outcome).toBe("UPDATED");
    expect(await prisma.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(1);

    const audits = await prisma.auditEvent.findMany({
      where: { resourceType: "HospitalContact" },
      select: { action: true, metadata: true },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "hospital_contact.created",
      "hospital_contact.updated",
      "hospital_contact.updated",
    ]);
    expect(audits.every(({ metadata }) => JSON.stringify(metadata) === JSON.stringify({ hospitalId: hospital.id }))).toBe(true);
  });

  it("treats absent-empty as NOOP, fresh equality as NOOP, and stale equality as Conflict", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    await expect(
      updateHospitalContact(owner.actor, desiredState(hospital.id, null, null, null)),
    ).resolves.toMatchObject({ outcome: "NOOP" });
    expect(await prisma.hospitalContact.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);

    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ที่อยู่", null),
    );
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const createdAt = created.contact.expectedUpdatedAt;
    if (!createdAt) throw new Error("Expected a persisted Contact version");
    await expect(
      updateHospitalContact(
        owner.actor,
        desiredState(hospital.id, createdAt, "ที่อยู่", null),
      ),
    ).resolves.toMatchObject({ outcome: "NOOP" });
    await expect(
      updateHospitalContact(
        owner.actor,
        desiredState(hospital.id, null, "ที่อยู่", null),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      updateHospitalContact(
        owner.actor,
        desiredState(hospital.id, new Date(Date.parse(createdAt) - 1).toISOString(), "ที่อยู่", null),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it.each([
    ["different", "ที่อยู่ ก", "ที่อยู่ ข"],
    ["identical", "ที่อยู่เหมือนกัน", "ที่อยู่เหมือนกัน"],
  ] as const)("serializes concurrent first creation with %s desired values", async (_kind, firstAddress, secondAddress) => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const outcomes = await Promise.allSettled([
      updateHospitalContact(owner.actor, desiredState(hospital.id, null, firstAddress, null)),
      updateHospitalContact(owner.actor, desiredState(hospital.id, null, secondAddress, null)),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "hospital_contact.created" } })).toBe(1);
  });

  it("serializes concurrent updates from one version to one winner and one conflict", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "เริ่มต้น", null),
    );
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const outcomes = await Promise.allSettled([
      updateHospitalContact(
        owner.actor,
        desiredState(hospital.id, created.contact.expectedUpdatedAt, "ผู้ชนะ ก", null),
      ),
      updateHospitalContact(
        owner.actor,
        desiredState(hospital.id, created.contact.expectedUpdatedAt, "ผู้ชนะ ข", null),
      ),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") expect(rejected.reason).toBeInstanceOf(ConflictError);
    expect(await prisma.auditEvent.count()).toBe(2);
  });

  it("does not serialize independent Hospital mutations behind a different Hospital lock", async () => {
    const first = await createHospital();
    const second = await createHospital();
    const ownerFirst = await createOwner(first.id);
    const ownerSecond = await createOwner(second.id);
    let releaseLock: (() => void) | undefined;
    let locked: (() => void) | undefined;
    const lockAcquired = new Promise<void>((resolve) => { locked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holdingTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Hospital" WHERE "id" = ${first.id}::uuid FOR UPDATE`);
      locked?.();
      await release;
    });
    await lockAcquired;

    try {
      await expect(
        updateHospitalContact(ownerSecond.actor, desiredState(second.id, null, "อีกโรงพยาบาล", null)),
      ).resolves.toMatchObject({ outcome: "CREATED" });
      expect(await prisma.hospitalContact.count({ where: { hospitalId: second.id } })).toBe(1);
      expect(await prisma.hospitalContact.count({ where: { hospitalId: first.id } })).toBe(0);
    } finally {
      releaseLock?.();
      await holdingTransaction;
    }

    expect(ownerFirst.userId).not.toBe(ownerSecond.userId);
  });

  it.each([
    ["user suspension", "user"],
    ["HOSPITAL role removal", "role"],
    ["OWNER demotion", "demotion"],
    ["membership suspension", "suspended-membership"],
    ["membership removal", "removed-membership"],
    ["Hospital suspension", "hospital"],
  ] as const)("orders concurrent %s after an authorized Contact mutation", async (_label, change) => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ก่อน", null),
    );
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const expectedUpdatedAt = created.contact.expectedUpdatedAt;
    if (!expectedUpdatedAt) throw new Error("Expected a persisted Contact version");

    let releaseContactLock: (() => void) | undefined;
    let signalContactLock: (() => void) | undefined;
    const contactLockAcquired = new Promise<void>((resolve) => { signalContactLock = resolve; });
    const release = new Promise<void>((resolve) => { releaseContactLock = resolve; });
    const lockTransaction = prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id" FROM "HospitalContact" WHERE "hospitalId" = ${hospital.id}::uuid FOR UPDATE
      `);
      signalContactLock?.();
      await release;
    }, { timeout: 15_000 });
    await contactLockAcquired;

    const mutationPromise = updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, expectedUpdatedAt, "หลัง", null),
    );
    void mutationPromise.catch(() => undefined);

    let waitError: unknown;
    try {
      await waitForPostgresLockWait(1);
    } catch (error: unknown) {
      waitError = error;
    }

    let revoke: Promise<unknown> = Promise.resolve();
    if (!waitError) {
      if (change === "user") {
        revoke = prisma.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } });
      } else if (change === "role") {
        revoke = prisma.userRole.delete({ where: { userId_role: { userId: owner.userId, role: Role.HOSPITAL } } });
      } else if (change === "demotion") {
        revoke = prisma.hospitalMembership.update({
          where: { id: owner.membershipId },
          data: { membershipType: MembershipType.MEMBER },
        });
      } else if (change === "suspended-membership") {
        revoke = prisma.hospitalMembership.update({
          where: { id: owner.membershipId },
          data: { status: MembershipStatus.SUSPENDED },
        });
      } else if (change === "removed-membership") {
        revoke = prisma.hospitalMembership.delete({ where: { id: owner.membershipId } });
      } else {
        revoke = prisma.hospital.update({
          where: { id: hospital.id },
          data: { status: HospitalStatus.SUSPENDED },
        });
      }
      void revoke.catch(() => undefined);

      try {
        await waitForPostgresLockWait(2);
      } catch (error: unknown) {
        waitError = error;
      }
    }

    releaseContactLock?.();

    const results = await Promise.allSettled([mutationPromise, revoke, lockTransaction]);
    if (waitError) throw waitError;
    for (const settled of results) {
      if (settled.status === "rejected") throw settled.reason;
    }
    const mutationResult = results[0];
    if (mutationResult.status !== "fulfilled") throw new Error("Contact mutation did not finish");
    const result = mutationResult.value;
    expect(result.outcome).toBe("UPDATED");
    expect(await prisma.auditEvent.count({ where: { action: "hospital_contact.updated" } })).toBe(1);

    if (change === "user") {
      await expect(prisma.user.findUniqueOrThrow({ where: { id: owner.userId }, select: { status: true } })).resolves.toEqual({ status: UserStatus.SUSPENDED });
    } else if (change === "role") {
      expect(await prisma.userRole.count({ where: { userId: owner.userId, role: Role.HOSPITAL } })).toBe(0);
    } else if (change === "demotion") {
      await expect(prisma.hospitalMembership.findUniqueOrThrow({ where: { id: owner.membershipId }, select: { membershipType: true } })).resolves.toEqual({ membershipType: MembershipType.MEMBER });
    } else if (change === "suspended-membership") {
      await expect(prisma.hospitalMembership.findUniqueOrThrow({ where: { id: owner.membershipId }, select: { status: true } })).resolves.toEqual({ status: MembershipStatus.SUSPENDED });
    } else if (change === "removed-membership") {
      expect(await prisma.hospitalMembership.findUnique({ where: { id: owner.membershipId }, select: { id: true } })).toBeNull();
    } else {
      await expect(prisma.hospital.findUniqueOrThrow({ where: { id: hospital.id }, select: { status: true } })).resolves.toEqual({ status: HospitalStatus.SUSPENDED });
    }
  }, 20_000);

  it("reads only an exact Patient SELF relationship and withholds non-ACTIVE Hospital values", async () => {
    const hospital = await createHospital();
    const foreignHospital = await createHospital();
    const patient = await createPatient();
    const otherPatient = await createPatient();
    const ownRelationship = await createPatientRelationship(patient.profileId, hospital.id);
    const foreignRelationship = await createPatientRelationship(otherPatient.profileId, hospital.id);
    const owner = await createOwner(hospital.id);
    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ถนนติดต่อ", "02-123-4567"),
    );
    expect(created.outcome).toBe("CREATED");

    await expect(readOwnPatientHospitalContact(patient.actor, ownRelationship.id)).resolves.toEqual({
      relationshipId: ownRelationship.id,
      availability: "AVAILABLE",
      contact: {
        hospital: { hospitalCode: hospital.hospitalCode, name: hospital.name },
        addressText: "ถนนติดต่อ",
        phoneNumber: "02-123-4567",
      },
    });
    await expect(listOwnPatientHospitalContacts(patient.actor)).resolves.toEqual([
      {
        relationshipId: ownRelationship.id,
        availability: "AVAILABLE",
        contact: {
          hospital: { hospitalCode: hospital.hospitalCode, name: hospital.name },
          addressText: "ถนนติดต่อ",
          phoneNumber: "02-123-4567",
        },
      },
    ]);
    await expect(
      readOwnPatientHospitalContact(patient.actor, foreignRelationship.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      readOwnPatientHospitalContact(patient.actor, randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundError);

    const mixedRolePatient: ActorContext = {
      ...patient.actor,
      roles: [Role.PATIENT, Role.HOSPITAL, Role.ADMIN],
      hospitalMemberships: owner.actor.hospitalMemberships,
    };
    await prisma.userRole.createMany({
      data: [
        { userId: patient.userId, role: Role.HOSPITAL },
        { userId: patient.userId, role: Role.ADMIN },
      ],
    });
    await prisma.hospitalMembership.create({
      data: {
        userId: patient.userId,
        hospitalId: hospital.id,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    await expect(
      readOwnPatientHospitalContact(mixedRolePatient, ownRelationship.id),
    ).resolves.toMatchObject({
      relationshipId: ownRelationship.id,
      availability: "AVAILABLE",
      contact: { addressText: "ถนนติดต่อ", phoneNumber: "02-123-4567" },
    });
    await expect(
      readOwnPatientHospitalContact(mixedRolePatient, foreignRelationship.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(listOwnPatientHospitalContacts(mixedRolePatient)).resolves.toMatchObject([
      { relationshipId: ownRelationship.id, availability: "AVAILABLE" },
    ]);

    await prisma.hospital.update({
      where: { id: hospital.id },
      data: { status: HospitalStatus.SUSPENDED },
    });
    await expect(readOwnPatientHospitalContact(patient.actor, ownRelationship.id)).resolves.toEqual({
      relationshipId: ownRelationship.id,
      availability: "UNAVAILABLE",
    });
    expect(foreignHospital.id).not.toBe(hospital.id);
  });

  it("returns Forbidden for broken persisted Patient SELF binding, missing profile, inactive account, and removed role", async () => {
    const hospital = await createHospital();
    const activePatient = await createPatient();
    const otherPatient = await createPatient();
    const relationship = await createPatientRelationship(activePatient.profileId, hospital.id);
    const brokenBinding: ActorContext = { ...activePatient.actor, personId: otherPatient.personId };
    await expect(
      readOwnPatientHospitalContact(brokenBinding, relationship.id),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const noProfile = await createUser({ roles: [Role.PATIENT] });
    await expect(
      readOwnPatientHospitalContact(noProfile.actor, randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listOwnPatientHospitalContacts(noProfile.actor)).rejects.toBeInstanceOf(ForbiddenError);

    const suspendedPatient = await createPatient();
    await prisma.user.update({ where: { id: suspendedPatient.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(
      readOwnPatientHospitalContact(suspendedPatient.actor, randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await prisma.userRole.delete({
      where: { userId_role: { userId: activePatient.userId, role: Role.PATIENT } },
    });
    await expect(
      readOwnPatientHospitalContact(activePatient.actor, relationship.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each(["exact read", "relationship list"] as const)(
    "rejects persisted Patient SELF lost before the %s Contact statement",
    async (readKind) => {
      for (const change of ["PATIENT role removal", "User suspension", "User↔Person binding change"] as const) {
        const hospital = await createHospital();
        const patient = await createPatient();
        const relationship = await createPatientRelationship(patient.profileId, hospital.id);
        const owner = await createOwner(hospital.id);
        await updateHospitalContact(owner.actor, desiredState(hospital.id, null, "ข้อมูลส่วนตัว", "02-555-0202"));

        const authorizedRead = readKind === "exact read"
          ? readOwnPatientHospitalContact(patient.actor, relationship.id)
          : listOwnPatientHospitalContacts(patient.actor);
        await expect(authorizedRead).resolves.toMatchObject(
          readKind === "exact read"
            ? { availability: "AVAILABLE", contact: { addressText: "ข้อมูลส่วนตัว" } }
            : [{ availability: "AVAILABLE", contact: { addressText: "ข้อมูลส่วนตัว" } }],
        );

        const read = readAfterCommittedRevocation<unknown>(
          async (database) => {
            if (readKind === "exact read") {
              return readOwnPatientHospitalContact(patient.actor, relationship.id, database);
            }

            return listOwnPatientHospitalContacts(patient.actor, database);
          },
          async () => {
            if (change === "PATIENT role removal") {
              await prisma.userRole.delete({ where: { userId_role: { userId: patient.userId, role: Role.PATIENT } } });
            } else if (change === "User suspension") {
              await prisma.user.update({ where: { id: patient.userId }, data: { status: UserStatus.SUSPENDED } });
            } else {
              const replacementPerson = await prisma.person.create({
                data: { identityKeyHash: `hc-${randomUUID()}` },
                select: { id: true },
              });
              await prisma.user.update({ where: { id: patient.userId }, data: { personId: replacementPerson.id } });
            }
          },
        );

        await expect(read).rejects.toBeInstanceOf(ForbiddenError);
        await clearDatabase();
      }
    },
  );

  it.each(["exact read", "relationship list"] as const)(
    "does not expose Contact after the own relationship is deleted before the %s statement",
    async (readKind) => {
      const hospital = await createHospital();
      const patient = await createPatient();
      const relationship = await createPatientRelationship(patient.profileId, hospital.id);
      const owner = await createOwner(hospital.id);
      await updateHospitalContact(owner.actor, desiredState(hospital.id, null, "ข้อมูลก่อนลบความสัมพันธ์", "02-555-0303"));

      const read = readAfterCommittedRevocation<unknown>(
        async (database) => {
          if (readKind === "exact read") {
            return readOwnPatientHospitalContact(patient.actor, relationship.id, database);
          }

          return listOwnPatientHospitalContacts(patient.actor, database);
        },
        async () => {
          await prisma.patientHospitalRelationship.delete({ where: { id: relationship.id } });
        },
      );

      if (readKind === "exact read") {
        await expect(read).rejects.toBeInstanceOf(NotFoundError);
      } else {
        await expect(read).resolves.toEqual([]);
      }
    },
  );

  it.each(["exact read", "relationship list"] as const)(
    "keeps a Patient relationship but withholds Contact when Hospital suspension commits before the %s statement",
    async (readKind) => {
      const hospital = await createHospital();
      const patient = await createPatient();
      const relationship = await createPatientRelationship(patient.profileId, hospital.id);
      const owner = await createOwner(hospital.id);
      await updateHospitalContact(owner.actor, desiredState(hospital.id, null, "ข้อมูลโรงพยาบาลที่พักใช้", "02-555-0404"));

      const read = readAfterCommittedRevocation<unknown>(
        async (database) => {
          if (readKind === "exact read") {
            return readOwnPatientHospitalContact(patient.actor, relationship.id, database);
          }

          return listOwnPatientHospitalContacts(patient.actor, database);
        },
        async () => {
          await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
        },
      );

      if (readKind === "exact read") {
        await expect(read).resolves.toEqual({ relationshipId: relationship.id, availability: "UNAVAILABLE" });
      } else {
        await expect(read).resolves.toEqual([{ relationshipId: relationship.id, availability: "UNAVAILABLE" }]);
      }
      expect(await prisma.patientHospitalRelationship.count({ where: { id: relationship.id } })).toBe(1);
      expect(await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } })).toMatchObject({
        addressText: "ข้อมูลโรงพยาบาลที่พักใช้",
        phoneNumber: "02-555-0404",
      });
    },
  );

  it("does not inherit a parent Hospital Contact through a child SELF relationship", async () => {
    const parent = await createHospital();
    const child = await createHospital({ parentHospitalId: parent.id });
    const owner = await createOwner(parent.id);
    await updateHospitalContact(owner.actor, desiredState(parent.id, null, "ข้อมูลของแม่", "02-111-1111"));
    const patient = await createPatient();
    const relationship = await createPatientRelationship(patient.profileId, child.id);

    await expect(readOwnPatientHospitalContact(patient.actor, relationship.id)).resolves.toEqual({
      relationshipId: relationship.id,
      availability: "AVAILABLE",
      contact: {
        hospital: { hospitalCode: child.hospitalCode, name: child.name },
        addressText: null,
        phoneNumber: null,
      },
    });
  });

  it("returns successful null/null to SELF for both absent and retained cleared Contact rows", async () => {
    const hospital = await createHospital();
    const patient = await createPatient();
    const relationship = await createPatientRelationship(patient.profileId, hospital.id);
    const owner = await createOwner(hospital.id);

    await expect(readOwnPatientHospitalContact(patient.actor, relationship.id)).resolves.toMatchObject({
      availability: "AVAILABLE",
      contact: { addressText: null, phoneNumber: null },
    });

    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ที่อยู่", "02 123 4567"),
    );
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const cleared = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, created.contact.expectedUpdatedAt, null, null),
    );
    expect(cleared.outcome).toBe("UPDATED");
    await expect(readOwnPatientHospitalContact(patient.actor, relationship.id)).resolves.toMatchObject({
      availability: "AVAILABLE",
      contact: { addressText: null, phoneNumber: null },
    });
    expect(await prisma.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(1);
  });

  it("emits exact minimized audit rows and leaves NOOP, Conflict, and Forbidden unaudited", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const created = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "private address", "02 123 4567"),
    );
    if (created.outcome !== "CREATED") throw new Error("Expected contact creation");
    const contact = await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } });
    const createdAudit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "hospital_contact.created" },
    });
    expect(createdAudit).toMatchObject({
      actorUserId: owner.userId,
      action: "hospital_contact.created",
      resourceType: "HospitalContact",
      resourceId: contact.id,
      metadata: { hospitalId: hospital.id },
    });
    expect(createdAudit.metadata).toEqual({ hospitalId: hospital.id });
    expect(JSON.stringify(createdAudit.metadata)).not.toContain("private address");
    expect(JSON.stringify(createdAudit.metadata)).not.toContain("02 123 4567");

    await expect(
      updateHospitalContact(
        owner.actor,
        desiredState(hospital.id, created.contact.expectedUpdatedAt, "private address", "02 123 4567"),
      ),
    ).resolves.toMatchObject({ outcome: "NOOP" });
    await expect(
      updateHospitalContact(owner.actor, desiredState(hospital.id, null, "private address", "02 123 4567")),
    ).rejects.toBeInstanceOf(ConflictError);
    const member = await createOwner(hospital.id, { membershipType: MembershipType.MEMBER });
    await expect(
      updateHospitalContact(member.actor, desiredState(hospital.id, null, "ข้อมูลลับ", null)),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it("rolls back Contact create and update when the PostgreSQL audit insert fails", async () => {
    await prisma.$executeRaw(Prisma.sql`
      CREATE OR REPLACE FUNCTION hospital_contact_test_reject_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW."action" LIKE 'hospital_contact.%' THEN
          RAISE EXCEPTION 'test audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRaw(Prisma.sql`
      CREATE TRIGGER hospital_contact_test_reject_audit_trigger
      BEFORE INSERT ON "AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION hospital_contact_test_reject_audit()
    `);

    try {
      const hospital = await createHospital();
      const owner = await createOwner(hospital.id);
      await expect(
        updateHospitalContact(owner.actor, desiredState(hospital.id, null, "ไม่ควรบันทึก", null)),
      ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await prisma.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(0);
      expect(await prisma.auditEvent.count({ where: { action: { startsWith: "hospital_contact." } } })).toBe(0);

      const safeContact = await prisma.hospitalContact.create({
        data: { hospitalId: hospital.id, addressText: "ค่าก่อน", phoneNumber: null },
      });
      await expect(
        updateHospitalContact(
          owner.actor,
          desiredState(hospital.id, safeContact.updatedAt.toISOString(), "ค่าหลัง", null),
        ),
      ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(
        await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } }),
      ).toMatchObject({ id: safeContact.id, addressText: "ค่าก่อน", updatedAt: safeContact.updatedAt });
    } finally {
      await prisma.$executeRaw(Prisma.sql`DROP TRIGGER IF EXISTS hospital_contact_test_reject_audit_trigger ON "AuditEvent"`);
      await prisma.$executeRaw(Prisma.sql`DROP FUNCTION IF EXISTS hospital_contact_test_reject_audit()`);
    }
  });

  it("keeps Master seed identity-only when rerun after a real Contact exists", async () => {
    await runHospitalMasterSeed();
    const hospital = await prisma.hospital.findUniqueOrThrow({
      where: { hospitalCode: "KANG" },
      select: { id: true, hospitalCode: true, name: true },
    });
    await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.ACTIVE } });
    const owner = await createOwner(hospital.id);
    const mutation = await updateHospitalContact(
      owner.actor,
      desiredState(hospital.id, null, "ถนนโรงพยาบาล", "02-345-6789"),
    );
    expect(mutation.outcome).toBe("CREATED");
    const before = await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } });
    const beforeHospital = await prisma.hospital.findUniqueOrThrow({
      where: { id: hospital.id },
      select: { id: true, hospitalCode: true, name: true, status: true, parentHospitalId: true },
    });

    await runHospitalMasterSeed();

    expect(await prisma.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } })).toEqual(before);
    expect(
      await prisma.hospital.findUniqueOrThrow({
        where: { id: hospital.id },
        select: { id: true, hospitalCode: true, name: true, status: true, parentHospitalId: true },
      }),
    ).toEqual(beforeHospital);
  });
});
