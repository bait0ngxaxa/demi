import { HospitalStatus, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import { resolveGlobalReportingAccessContext } from "./global-reporting-access-service";

const actor: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const hospitalId = "11111111-1111-4111-8111-111111111111";
const runtimeEnvironments = [
  ["local development", { NODE_ENV: "development" }],
  ["Vercel Preview", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_PROJECT_ID: "preview-project" }],
  ["Vercel Production", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "production-project" }],
  ["VPS production", { NODE_ENV: "production" }],
  ["Docker production", { NODE_ENV: "production", CONTAINER_RUNTIME: "docker" }],
  ["non-Vercel production", { NODE_ENV: "production", VERCEL: "0" }],
] as const;

function simulateRuntimeEnvironment(environment: Readonly<Record<string, string>>): void {
  for (const key of ["NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "CONTAINER_RUNTIME"]) {
    vi.stubEnv(key, environment[key] ?? "");
  }
}

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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(runtimeEnvironments)("allows the same active ADMIN without Hospital membership on %s", async (_name, environment) => {
    simulateRuntimeEnvironment(environment);
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
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.directoryRead,
      undefined,
      createDatabase({ roles: [Role.HOSPITAL] }),
    )).rejects.toBeInstanceOf(ForbiddenError);
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

  it("rejects a non-ACTIVE selected Hospital", async () => {
    await expect(resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.hospitalRead,
      hospitalId,
      createDatabase({ hospitalStatus: HospitalStatus.SUSPENDED }),
    )).rejects.toBeInstanceOf(ForbiddenError);
  });
});
