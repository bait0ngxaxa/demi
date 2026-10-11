import { HospitalStatus, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import {
  GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV,
  GLOBAL_REPORTING_DEMO_ENABLED_ENV,
  GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV,
} from "./global-reporting-demo-release-control";
import { resolveGlobalReportingAccessContext } from "./global-reporting-access-service";

const actor: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const hospitalId = "11111111-1111-4111-8111-111111111111";
const syntheticDatabaseUrl = "postgresql://demo:secret@127.0.0.1:5432/demi_synthetic";

function createDatabase(input: {
  databaseName?: string;
  userStatus?: UserStatus;
  roles?: readonly Role[];
  hospitalStatus?: HospitalStatus;
} = {}): PrismaClient {
  const database = {
    $queryRaw: vi.fn().mockResolvedValue([{ database_name: input.databaseName ?? "demi_synthetic" }]),
    user: {
      findUnique: vi.fn().mockResolvedValue({
        status: input.userStatus ?? UserStatus.ACTIVE,
        roles: (input.roles ?? [Role.ADMIN]).map((role) => ({ role })),
      }),
    },
    hospital: {
      findUnique: vi.fn().mockResolvedValue({
        id: hospitalId,
        hospitalCode: "SYNTHETIC-A",
        name: "โรงพยาบาลสังเคราะห์ A",
        status: input.hospitalStatus ?? HospitalStatus.ACTIVE,
      }),
    },
  };
  return database as unknown as PrismaClient;
}

describe("Global Reporting access service", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv(GLOBAL_REPORTING_DEMO_ENABLED_ENV, "true");
    vi.stubEnv(GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV, actor.userId);
    vi.stubEnv("DATABASE_URL", syntheticDatabaseUrl);
    vi.stubEnv(GLOBAL_REPORTING_SYNTHETIC_DATABASE_URL_ENV, syntheticDatabaseUrl);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows an explicitly configured active ADMIN without Hospital membership", async () => {
    const database = createDatabase();
    const access = await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      database,
    );

    expect(access.actor).toBe(actor);
    expect(access.hospital).toMatchObject({ id: hospitalId, status: HospitalStatus.ACTIVE });
    expect(database.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: actor.userId },
    }));
    expect(database.$queryRaw).toHaveBeenCalledOnce();
  });

  it("denies missing, revoked, suspended, and non-ADMIN identities", async () => {
    const database = createDatabase();
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      database,
    )).resolves.toMatchObject({ hospital: null });

    vi.stubEnv(GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV, "33333333-3333-4333-8333-333333333333");
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      database,
    )).rejects.toBeInstanceOf(NotFoundError);

    vi.stubEnv(GLOBAL_REPORTING_DEMO_ADMIN_USER_IDS_ENV, actor.userId);
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      createDatabase({ userStatus: UserStatus.SUSPENDED }),
    )).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      createDatabase({ roles: [Role.HOSPITAL] }),
    )).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a non-ACTIVE selected Hospital and a runtime database name mismatch", async () => {
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      createDatabase({ hospitalStatus: HospitalStatus.SUSPENDED }),
    )).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      createDatabase({ databaseName: "not_the_designated_database" }),
    )).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot be enabled in Production, even with explicit demo flags and identity", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      createDatabase(),
    )).rejects.toBeInstanceOf(NotFoundError);
  });
});
