import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { resolvePatientImportTemplateTarget } from "./patient-import-template-service";
import type { PatientRosterImportDatabase } from "./patient-roster-import-types";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";

function actorWith(
  overrides: Partial<ActorContext["hospitalMemberships"][number]> | null = {},
  targetHospitalId = hospitalId,
): ActorContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: overrides
      ? [
          {
            hospitalId: targetHospitalId,
            membershipType: MembershipType.OWNER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospitalStatus: HospitalStatus.ACTIVE,
            ...overrides,
          },
        ]
      : [],
    osmHospitalRelationships: [],
  };
}

function createDatabase(options: {
  hospital?: { hospitalCode: string; name: string; status?: HospitalStatus } | null;
  membership?: boolean;
  fail?: boolean;
} = {}) {
  const hospital = options.hospital === undefined
    ? { hospitalCode: "SYN-A", name: "โรงพยาบาลสังเคราะห์เอ", status: HospitalStatus.ACTIVE }
    : options.hospital;
  const findUniqueHospital = vi.fn(async (args: { select: { status?: boolean } }) => {
    if (options.fail) {
      throw new Error("database down");
    }

    return args.select.status ? (hospital ? { status: hospital.status ?? HospitalStatus.ACTIVE } : null) : hospital;
  });

  return {
    database: {
      user: { findUnique: vi.fn(async () => ({ status: UserStatus.ACTIVE, roles: [{ role: Role.HOSPITAL }] })) },
      hospital: { findUnique: findUniqueHospital },
      hospitalMembership: {
        findFirst: vi.fn(async () =>
          options.membership === false
            ? null
            : { membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
        ),
      },
    } as unknown as PatientRosterImportDatabase,
    findUniqueHospital,
  };
}

describe("resolvePatientImportTemplateTarget", () => {
  it("resolves the hospital code and name for a direct Owner of an active hospital", async () => {
    const { database } = createDatabase();

    await expect(resolvePatientImportTemplateTarget(actorWith(), hospitalId, database)).resolves.toEqual({
      hospitalId,
      hospitalCode: "SYN-A",
      hospitalName: "โรงพยาบาลสังเคราะห์เอ",
    });
  });

  it("allows direct OWNER", async () => {
    const { database } = createDatabase();

    await expect(
      resolvePatientImportTemplateTarget(actorWith({ membershipType: MembershipType.OWNER }), hospitalId, database),
    ).resolves.toMatchObject({ hospitalCode: "SYN-A" });
  });

  it("denies an out-of-scope hospital without reading it", async () => {
    const { database, findUniqueHospital } = createDatabase();

    await expect(
      resolvePatientImportTemplateTarget(actorWith(), otherHospitalId, database),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(findUniqueHospital).not.toHaveBeenCalled();
  });

  it("denies an actor without any membership, an anonymous caller and an OSM-only actor", async () => {
    const { database } = createDatabase();

    await expect(resolvePatientImportTemplateTarget(actorWith(null), hospitalId, database)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(resolvePatientImportTemplateTarget(null, hospitalId, database)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      resolvePatientImportTemplateTarget(
        { ...actorWith(null), roles: [Role.OSM], osmHospitalRelationships: [
          { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
        ] },
        hospitalId,
        database,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("denies a suspended membership even when the cached actor still looks active", async () => {
    const { database } = createDatabase({ membership: false });

    await expect(resolvePatientImportTemplateTarget(actorWith(), hospitalId, database)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("denies an inactive hospital", async () => {
    const { database } = createDatabase({
      hospital: { hospitalCode: "SYN-A", name: "x", status: HospitalStatus.SUSPENDED },
    });

    await expect(resolvePatientImportTemplateTarget(actorWith(), hospitalId, database)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects a malformed hospital id and reports infrastructure failures", async () => {
    const { database } = createDatabase();
    const failing = createDatabase({ fail: true });

    await expect(resolvePatientImportTemplateTarget(actorWith(), "not-a-uuid", database)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      resolvePatientImportTemplateTarget(actorWith(), hospitalId, failing.database),
    ).rejects.toBeInstanceOf(InfrastructureError);
  });
});
