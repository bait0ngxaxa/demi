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

type MembershipRow = {
  hospital: typeof hospital;
  membershipType?: MembershipType;
  profession?: null;
  reportExportGrantedAt?: Date | null;
};

const ownerRow: MembershipRow = { hospital, membershipType: MembershipType.OWNER, profession: null, reportExportGrantedAt: null };

function database(membership: MembershipRow | null = ownerRow) {
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

  it("rechecks ACTIVE user, HOSPITAL role, direct OWNER or MEMBER membership, and ACTIVE Hospital in the database", async () => {
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
        membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
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
        membershipType: true,
        profession: true,
        reportExportGrantedAt: true,
        hospital: {
          select: { id: true, hospitalCode: true, name: true, status: true },
        },
      },
    });
  });

  describe("MEMBER reporting parity (ADR-0026, no OWNER grant)", () => {
    const memberActor: ActorContext = {
      ...actor,
      hospitalMemberships: [{ ...actor.hospitalMemberships[0]!, membershipType: MembershipType.MEMBER }],
    };
    const grantedRow: MembershipRow = { hospital, membershipType: MembershipType.MEMBER, profession: null, reportExportGrantedAt: new Date("2026-10-16T00:00:00.000Z") };
    const ungrantedRow: MembershipRow = { ...grantedRow, reportExportGrantedAt: null };

    it.each([["with", grantedRow], ["without", ungrantedRow]] as const)(
      "allows an ACTIVE MEMBER %s a historical grant every capability, recording the access basis",
      async (_label, row) => {
        for (const capability of Object.values(HOSPITAL_REPORT_CAPABILITIES)) {
          const { database: db } = database(row);
          await expect(
            resolveHospitalReportingAccessContext(memberActor, hospitalId, capability, db),
          ).resolves.toMatchObject({ hospital, accessBasis: "MEMBER" });
        }
      },
    );

    it("uses the persisted membership type, not a stale session OWNER claim", async () => {
      const { database: db } = database(ungrantedRow);
      await expect(
        resolveHospitalReportingAccessContext(actor, hospitalId, HOSPITAL_REPORT_CAPABILITIES.dashboardRead, db),
      ).resolves.toMatchObject({ accessBasis: "MEMBER" });
    });

    it("loses access when the membership is no longer ACTIVE (query returns nothing)", async () => {
      const { database: db } = database(null);
      await expect(
        resolveHospitalReportingAccessContext(memberActor, hospitalId, HOSPITAL_REPORT_CAPABILITIES.export, db),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("leaves OWNER access unchanged", async () => {
      const { database: db } = database();
      await expect(
        resolveHospitalReportingAccessContext(actor, hospitalId, HOSPITAL_REPORT_CAPABILITIES.export, db),
      ).resolves.toMatchObject({ accessBasis: "OWNER" });
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

  it("does not accept an OWNER membership from another Hospital", async () => {
    const otherHospitalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { database: db } = database(null);

    await expect(
      resolveHospitalReportingAccessContext(actor, otherHospitalId, HOSPITAL_REPORT_CAPABILITIES.export, db),
    ).rejects.toBeInstanceOf(NotFoundError);
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

  it("lists only database-confirmed active direct OWNER or MEMBER hospitals", async () => {
    const { database: db, findMany } = database();

    await expect(listHospitalReportingHospitals(actor, db)).resolves.toEqual([hospital]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: actorUserId,
          membershipType: { in: [MembershipType.OWNER, MembershipType.MEMBER] },
          status: MembershipStatus.ACTIVE,
          user: { is: { status: UserStatus.ACTIVE, roles: { some: { role: Role.HOSPITAL } } } },
          hospital: { is: { status: HospitalStatus.ACTIVE } },
        }),
      }),
    );
  });
});
