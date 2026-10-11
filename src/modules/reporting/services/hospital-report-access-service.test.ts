import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  HOSPITAL_REPORT_CAPABILITIES,
} from "../policies/hospital-report-policy";
import {
  listHospitalReportingHospitals,
  resolveHospitalReportingAccessContext,
  type HospitalReportAccessDatabase,
} from "./hospital-report-access-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const actor: ActorContext = {
  userId: actorUserId,
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.OWNER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

const hospital = {
  id: hospitalId,
  hospitalCode: "DEMO-01",
  name: "โรงพยาบาลทดสอบ",
  status: HospitalStatus.ACTIVE,
};
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

function database(membership: { hospital: typeof hospital } | null = { hospital }) {
  const findFirst = vi.fn().mockResolvedValue(membership);
  const findMany = vi.fn().mockResolvedValue(membership ? [{ hospital: membership.hospital }] : []);
  return {
    database: {
      hospitalMembership: { findFirst, findMany },
    } as unknown as HospitalReportAccessDatabase,
    findFirst,
    findMany,
  };
}

describe("Hospital reporting access service", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(runtimeEnvironments)("allows the same direct ACTIVE OWNER on %s", async (_name, environment) => {
    simulateRuntimeEnvironment(environment);
    const { database: db, findFirst } = database();

    await expect(
      resolveHospitalReportingAccessContext(actor, hospitalId, HOSPITAL_REPORT_CAPABILITIES.dashboardRead, db),
    ).resolves.toMatchObject({ actor, hospital });
    expect(findFirst).toHaveBeenCalledOnce();
  });

  it("rechecks ACTIVE user, HOSPITAL role, direct OWNER membership, and ACTIVE Hospital in the database", async () => {
    const { database: db, findFirst } = database();

    await expect(
      resolveHospitalReportingAccessContext(
        actor,
        hospitalId.toUpperCase(),
        HOSPITAL_REPORT_CAPABILITIES.dashboardRead,
        db,
      ),
    ).resolves.toMatchObject({ hospital });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: actorUserId,
        hospitalId,
        membershipType: MembershipType.OWNER,
        status: MembershipStatus.ACTIVE,
        user: {
          is: {
            status: UserStatus.ACTIVE,
            roles: { some: { role: Role.HOSPITAL } },
          },
        },
        hospital: { is: { status: HospitalStatus.ACTIVE } },
      },
      select: {
        hospital: {
          select: { id: true, hospitalCode: true, name: true, status: true },
        },
      },
    });
  });

  it("denies a revoked membership on a subsequent report read or export", async () => {
    const { database: db, findFirst } = database(null);

    await expect(
      resolveHospitalReportingAccessContext(actor, hospitalId, HOSPITAL_REPORT_CAPABILITIES.rowRead, db),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      resolveHospitalReportingAccessContext(actor, hospitalId, HOSPITAL_REPORT_CAPABILITIES.export, db),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("does not let an ADMIN-only ActorContext use a Hospital Owner membership snapshot", async () => {
    const { database: db } = database();

    await expect(
      resolveHospitalReportingAccessContext(
        { ...actor, roles: [Role.ADMIN] },
        hospitalId,
        HOSPITAL_REPORT_CAPABILITIES.export,
        db,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists only database-confirmed active direct Owner hospitals", async () => {
    const { database: db, findMany } = database();

    await expect(listHospitalReportingHospitals(actor, db)).resolves.toEqual([hospital]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: actorUserId,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
          user: { is: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
          hospital: { is: { status: HospitalStatus.ACTIVE } },
        }),
      }),
    );
  });
});
