import { HospitalStatus, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import { TRUSTED_DEMI_UAT_VERCEL_PROJECT_ID } from "./reporting-deployment-boundary";
import { resolveGlobalReportingAccessContext } from "./global-reporting-access-service";

const actor: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const hospitalId = "11111111-1111-4111-8111-111111111111";

function createDatabase(input: {
  userStatus?: UserStatus;
  roles?: readonly Role[];
  hospitalStatus?: HospitalStatus;
} = {}): PrismaClient {
  const database = {
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
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_ID", TRUSTED_DEMI_UAT_VERCEL_PROJECT_ID);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows an active ADMIN in the trusted UAT project without Hospital membership or reporting flags", async () => {
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
  });

  it("denies suspended users and users without the current ADMIN role", async () => {
    const database = createDatabase();
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      database,
    )).resolves.toMatchObject({ hospital: null });

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

  it("rejects a non-ACTIVE selected Hospital and a non-UAT Vercel production project", async () => {
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      createDatabase({ hospitalStatus: HospitalStatus.SUSPENDED }),
    )).rejects.toBeInstanceOf(ForbiddenError);
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_actual_production");
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      createDatabase(),
    )).rejects.toBeInstanceOf(NotFoundError);
  });

  it("fails closed when Vercel identity is missing or unknown", async () => {
    vi.stubEnv("VERCEL_PROJECT_ID", "");
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      createDatabase(),
    )).rejects.toBeInstanceOf(NotFoundError);
  });
});
