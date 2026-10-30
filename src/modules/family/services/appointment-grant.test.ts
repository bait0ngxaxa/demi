import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  FAMILY_APPOINTMENT_ACCEPTANCE_TEXT,
  FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2,
  FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V3,
  FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS,
  FAMILY_APPOINTMENT_LATEST_READ_CONTRACT,
  FAMILY_APPOINTMENT_READ_CONTRACTS,
  olderFamilyAppointmentReadContracts,
  type FamilyAppointmentReadContract,
} from "../domain/appointment-grant-contract";
import { appointmentGrantIdSchema, proposeAppointmentGrantSchema } from "../schemas/appointment-grant-schemas";
import { appointmentGrantCaregiverWhere } from "../policies/appointment-grant-policy";
import { appointmentGrantNow } from "./appointment-grant-service";
import {
  delegatedAppointmentSelect,
  delegatedAppointmentV2Select,
  delegatedAppointmentV3Select,
  listDelegatedAppointments,
} from "./delegated-appointment-query-service";
import { appointmentGrantManagementSelects } from "./appointment-grant-management-query-service";

const caregiver = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] };

describe("appointment grant contract", () => {
  it("strict input has only two locators, never client-selected authority", () => {
    const input = { caregiverRelationshipId: caregiver.userId, patientHospitalRelationshipId: caregiver.personId };
    expect(proposeAppointmentGrantSchema.safeParse(input).success).toBe(true);
    for (const key of ["patientProfileId", "caregiverUserId", "hospitalId", "status", "contractVersion", "fields", "capability", "role"]) expect(proposeAppointmentGrantSchema.safeParse({ ...input, [key]: "untrusted" }).success).toBe(false);
    expect(appointmentGrantIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });
  it("dedicated select fetches exactly locators plus five appointment source fields", () => {
    expect(delegatedAppointmentSelect).toEqual({ id: true, type: true, scheduledAt: true, durationMinutes: true, locationType: true, status: true });
    const serialized = JSON.stringify(appointmentGrantManagementSelects);
    expect(serialized).not.toMatch(/hospitalNumber|hospitalCode|dateOfBirth|identityKeyHash|phone|email|appointments|note|locationDetail/);
  });
  it("requires current known accepted account-bound authority without caregiver role inheritance", () => {
    const where = appointmentGrantCaregiverWhere(caregiver, "ACTIVE");
    expect(where).toMatchObject({ contractVersion: { in: ["family-appointment-read-v1", "family-appointment-read-v2", "family-appointment-read-v3"] }, status: "ACTIVE", acceptedByUserId: caregiver.userId,
      caregiverUserId: caregiver.userId, caregiverPersonId: caregiver.personId, caregiverUser: { is: { status: "ACTIVE", personId: caregiver.personId } },
      proposedByUser: { is: { status: "ACTIVE", roles: { some: { role: "PATIENT" } } } },
      caregiverRelationship: { is: { status: "ACTIVE", sourceInvitation: { is: { caregiverPersonId: caregiver.personId, status: "ACCEPTED" } } } },
      patientHospitalRelationship: { is: { hospital: { is: { status: "ACTIVE" } } } } });
    expect(JSON.stringify(where)).not.toMatch(/ADMIN|HOSPITAL|OSM|membership|assignment/);
  });
  it("accepts injected valid clock and rejects invalid server time", () => {
    const now = new Date("2026-10-02T00:00:00Z"); const clock = vi.fn(() => now);
    expect(appointmentGrantNow({ now: clock })).toBe(now); expect(clock).toHaveBeenCalledTimes(1);
    expect(() => appointmentGrantNow({ now: () => new Date(NaN) })).toThrow();
  });
});

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("SR-C1 appointment consent versions", () => {
  it("pins the v1 and v2 acceptance texts a caregiver already accepted", () => {
    expect(sha256(FAMILY_APPOINTMENT_ACCEPTANCE_TEXT)).toBe("89cbe2c3e5bba29ac7ae0c585fbec2e036397e5100944967368083b39cea643a");
    expect(sha256(FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2)).toBe("987fcf8326a984831faac523ead036dd847f568ea3537da91b03c980ad818f8a");
    for (const text of [FAMILY_APPOINTMENT_ACCEPTANCE_TEXT, FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2]) expect(text).not.toContain("บริการและที่มาของนัด");
  });

  it("v3 is the v2 text plus service and source, and new proposals use it", () => {
    expect(FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V3).toBe(FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2.replace("ประเภทนัด ", "ประเภทนัด บริการและที่มาของนัด "));
    expect(FAMILY_APPOINTMENT_READ_CONTRACTS).toEqual(["family-appointment-read-v1", "family-appointment-read-v2", "family-appointment-read-v3"]);
    expect(FAMILY_APPOINTMENT_LATEST_READ_CONTRACT).toBe("family-appointment-read-v3");
    expect(FAMILY_APPOINTMENT_ACCEPTANCE_TEXTS["family-appointment-read-v3"]).toBe(FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V3);
    expect(olderFamilyAppointmentReadContracts("family-appointment-read-v3")).toEqual(["family-appointment-read-v1", "family-appointment-read-v2"]);
    expect(olderFamilyAppointmentReadContracts("family-appointment-read-v2")).toEqual(["family-appointment-read-v1"]);
    expect(olderFamilyAppointmentReadContracts("family-appointment-read-v1")).toEqual([]);
  });

  it("selects service and source locator only for v3", () => {
    const v2 = delegatedAppointmentV2Select("hospital");
    expect(v2).not.toHaveProperty("serviceCode");
    expect(v2).not.toHaveProperty("sourceServiceRequestId");
    expect(delegatedAppointmentV3Select("hospital")).toEqual({ ...v2, serviceCode: true, sourceServiceRequestId: true });
  });

  const grantId = "33333333-3333-4333-8333-333333333333";
  const appointmentId = "44444444-4444-4444-8444-444444444444";
  const now = new Date("2026-10-30T00:00:00Z");
  // Every column the projection could read; the fake returns only the keys the query selected, as Prisma does.
  const stored = { id: appointmentId, type: "FOLLOW_UP", serviceCode: "SCREENING", sourceServiceRequestId: "55555555-5555-4555-8555-555555555555",
    scheduledAt: new Date("2026-11-01T03:00:00Z"), durationMinutes: 30, locationType: "HOME_VISIT", status: "SCHEDULED",
    locationDetail: "บ้านเลขที่ 1", responsibleUser: null, osmAssignmentAtCreation: null, note: "INTERNAL" };
  function fakeDatabase(contractVersion: FamilyAppointmentReadContract) {
    const pick = ({ select }: { select: Record<string, unknown> }) => Object.fromEntries(Object.keys(select).map((key) => [key, stored[key as keyof typeof stored]]));
    const transaction = {
      caregiverAppointmentGrant: { findFirst: vi.fn(async () => ({ contractVersion, patientHospitalRelationshipId: "phr",
        patientHospitalRelationship: { hospital: { id: "hospital", name: "หน่วยบริการทดสอบ", serviceAreaAssignments: [] } } })) },
      patientAppointment: { findMany: vi.fn(async (args: { select: Record<string, unknown> }) => [pick(args)]),
        findFirst: vi.fn(async (args: { select: Record<string, unknown> }) => pick(args)) },
    };
    return { database: { $transaction: async (run: (tx: typeof transaction) => unknown) => run(transaction) } as unknown as PrismaClient, transaction };
  }
  const baseKeys = ["appointmentId", "durationMinutes", "extension", "hospitalName", "locationType", "scheduledAt", "status", "type"];

  it.each([
    ["family-appointment-read-v1", baseKeys],
    ["family-appointment-read-v2", baseKeys],
    ["family-appointment-read-v3", [...baseKeys, "serviceCode", "source"].sort()],
  ] as const)("projects exactly the %s keys", async (version, keys) => {
    const { database, transaction } = fakeDatabase(version);
    const page = await listDelegatedAppointments(caregiver, { grantId }, { database, now: () => now });
    expect(Object.keys(page.appointments[0] ?? {}).sort()).toEqual(keys);
    const select = transaction.patientAppointment.findMany.mock.calls[0]?.[0].select ?? {};
    expect("serviceCode" in select && "sourceServiceRequestId" in select).toBe(version === "family-appointment-read-v3");
    if (version === "family-appointment-read-v3") expect(page.appointments[0]).toMatchObject({ serviceCode: "SCREENING", source: "PATIENT_REQUEST" });
    expect(page.appointments[0]).not.toHaveProperty("sourceServiceRequestId");
  });
});
