import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { patientProvisionInputSchema } from "@/modules/patient-provisioning/schemas/patient-provisioning-schemas";
import { ForbiddenError } from "@/shared/errors/application-error";

const mockedAudit = vi.hoisted(() => vi.fn());
const mockedCreateIdentityStore = vi.hoisted(() => vi.fn());
const mockedResolvePerson = vi.hoisted(() => vi.fn());

vi.mock("@/modules/audit/services/audit-service", () => ({
  recordAuditEvent: mockedAudit,
}));

vi.mock("@/modules/identity/services/identity-service", () => ({
  createIdentityStore: mockedCreateIdentityStore,
  resolvePerson: mockedResolvePerson,
}));

import { provisionPatientInTransaction } from "./patient-provisioning-transaction";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const actorPersonId = "33333333-3333-4333-8333-333333333333";
const patientPersonId = "44444444-4444-4444-8444-444444444444";
const patientUserId = "55555555-5555-4555-8555-555555555555";
const patientProfileId = "66666666-6666-4666-8666-666666666666";
const relationshipId = "77777777-7777-4777-8777-777777777777";

const hospitalActor: ActorContext = {
  userId: actorUserId,
  personId: actorPersonId,
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

function validInput() {
  return patientProvisionInputSchema.parse({
    identity: { namespace: "phase-16d1-test", value: "patient-1" },
    givenName: "สมชาย",
    familyName: "ทดสอบ",
    targetHospitalId: hospitalId,
    hospitalNumber: "HN-001",
  });
}

function createTransaction(): Prisma.TransactionClient {
  const transaction = {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({
          status: UserStatus.ACTIVE,
          roles: [{ role: Role.HOSPITAL }],
        })
        .mockResolvedValueOnce(null),
      create: vi.fn().mockResolvedValue({
        id: patientUserId,
        personId: patientPersonId,
        status: UserStatus.PROVISIONED,
        authSubject: null,
      }),
    },
    hospital: {
      findUnique: vi.fn().mockResolvedValue({ status: HospitalStatus.ACTIVE }),
    },
    hospitalMembership: {
      findFirst: vi.fn().mockResolvedValue({
        membershipType: MembershipType.MEMBER,
        status: MembershipStatus.ACTIVE,
      }),
    },
    osmHospitalRelationship: {
      findUnique: vi.fn(),
    },
    person: {
      update: vi.fn(),
    },
    userRole: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    patientProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: patientProfileId }),
    },
    patientHospitalRelationship: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: relationshipId, hospitalNumber: "HN-001" }),
    },
  };

  return transaction as unknown as Prisma.TransactionClient;
}

describe("Patient provisioning transaction operation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateIdentityStore.mockReturnValue({});
    mockedResolvePerson.mockResolvedValue({
      id: patientPersonId,
      identityKeyHash: "not-raw-identity",
      givenName: "สมชาย",
      familyName: "ทดสอบ",
      createdAt: new Date("2026-08-25T00:00:00.000Z"),
      updatedAt: new Date("2026-08-25T00:00:00.000Z"),
    });
    mockedAudit.mockResolvedValue(undefined);
  });

  it("runs on a supplied transaction without requiring a nested transaction", async () => {
    const transaction = createTransaction();

    expect(transaction).not.toHaveProperty("$transaction");
    await expect(
      provisionPatientInTransaction(transaction, hospitalActor, validInput(), "BULK"),
    ).resolves.toMatchObject({
      outcome: "CREATED",
      userId: patientUserId,
      patientProfileId,
      relationshipId,
      hospitalId,
    });

    expect(mockedCreateIdentityStore).toHaveBeenCalledWith(transaction);
    expect(mockedAudit).toHaveBeenCalledWith(expect.anything(), transaction);
  });

  it("does not let a direct transaction caller use OSM scope for bulk provisioning", async () => {
    const transaction = createTransaction();
    const osmActor: ActorContext = {
      ...hospitalActor,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    };

    await expect(
      provisionPatientInTransaction(transaction, osmActor, validInput(), "BULK"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expect(mockedAudit).not.toHaveBeenCalled();
  });
});
