import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { HospitalServiceRequestListInput } from "../schemas/patient-service-request-schemas";
import { hospitalServiceRequestListSchema } from "../schemas/patient-service-request-schemas";

const mocks = vi.hoisted(() => ({ user: vi.fn(), memberships: vi.fn(), requests: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({
  user: { findUnique: mocks.user },
  hospitalMembership: { findMany: mocks.memberships },
  patientServiceRequest: { findMany: mocks.requests },
}) }));
import { listHospitalPatientServiceRequests } from "./patient-service-request-service";

const hospitalA = "11111111-1111-4111-8111-111111111111";
const hospitalB = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const createdAt = new Date("2026-10-01T00:00:00.000Z");
const actor: ActorContext = { userId: "reviewer", personId: "person", roles: ["HOSPITAL"], hospitalMemberships: [], osmHospitalRelationships: [] };

function row(id: string = requestId) {
  return {
    id, hospitalId: hospitalA, status: "PENDING", createdAt,
    offering: { code: "SCREENING" }, preferredOsm: null,
    relationship: { id: "relationship-a", hospital: { name: "โรงพยาบาล ก", hospitalCode: "H-A" }, patientProfile: { person: { givenName: "สมใจ", familyName: "ผู้ป่วย" } } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ status: "ACTIVE", roles: [{ role: "HOSPITAL" }] });
  mocks.memberships.mockResolvedValue([{ hospitalId: hospitalA }, { hospitalId: hospitalB }]);
  mocks.requests.mockResolvedValue([]);
});

describe("bounded Hospital request list", () => {
  it("defaults to reviewable status, bounded rows and deterministic ordering without claiming totals", async () => {
    const page = await listHospitalPatientServiceRequests(actor);
    expect(page).toEqual({ requests: [], group: "PENDING", after: undefined, nextCursor: null });
    expect(mocks.requests).toHaveBeenCalledOnce();
    expect(mocks.requests).toHaveBeenCalledWith(expect.objectContaining({
      where: { hospitalId: { in: [hospitalA, hospitalB] }, relationship: { is: { endedAt: null } }, status: "PENDING" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
    }));
    expect(mocks.memberships).toHaveBeenCalledWith({
      where: { userId: actor.userId, membershipType: { in: ["OWNER", "MEMBER"] }, status: "ACTIVE", hospital: { status: "ACTIVE" } },
      select: { hospitalId: true },
    });
    expect(page).not.toHaveProperty("total");
  });

  it.each([
    ["PENDING", "PENDING"],
    ["APPROVED", "APPROVED"],
    ["HISTORY", { in: ["STARTED", "REJECTED", "WITHDRAWN"] }],
  ] as const)("queries only persisted statuses for %s", async (group, status) => {
    await listHospitalPatientServiceRequests(actor, {}, { group });
    expect(mocks.requests).toHaveBeenCalledWith(expect.objectContaining({ where: { hospitalId: { in: [hospitalA, hospitalB] }, relationship: { is: { endedAt: null } }, status } }));
  });

  it.each([0, 19, 20, 21])("uses lookahead for %i rows and never treats page size as total", async (size) => {
    mocks.requests.mockResolvedValue(Array.from({ length: size }, (_, index) => row(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`)));
    const page = await listHospitalPatientServiceRequests(actor);
    expect(page.requests).toHaveLength(Math.min(size, 20));
    expect(page.nextCursor).toEqual(size > 20 ? { createdAt: createdAt.toISOString(), requestId: page.requests.at(-1)?.requestId } : null);
    expect(page).not.toHaveProperty("total");
  });

  it("keeps scope/status predicates on a forged cursor and does not fetch its detail", async () => {
    const after = { createdAt: createdAt.toISOString(), requestId };
    await listHospitalPatientServiceRequests(actor, {}, { group: "HISTORY", after });
    expect(mocks.requests).toHaveBeenCalledWith(expect.objectContaining({ where: {
      hospitalId: { in: [hospitalA, hospitalB] }, relationship: { is: { endedAt: null } }, status: { in: ["STARTED", "REJECTED", "WITHDRAWN"] },
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: requestId } }],
    } }));
    expect(mocks.requests).toHaveBeenCalledOnce();
  });

  it("projects distinct request and relationship associations for the same Person across Hospitals", async () => {
    const a = row();
    const b = { ...row(hospitalB), hospitalId: hospitalB, relationship: { ...a.relationship, id: "relationship-b", hospital: { name: "โรงพยาบาล ข", hospitalCode: "H-B" } } };
    mocks.requests.mockResolvedValue([a, b]);
    const page = await listHospitalPatientServiceRequests(actor);
    expect(page.requests.map(({ requestId, relationshipId, hospitalId, hospitalCode }) => ({ requestId, relationshipId, hospitalId, hospitalCode }))).toEqual([
      { requestId, relationshipId: "relationship-a", hospitalId: hospitalA, hospitalCode: "H-A" },
      { requestId: hospitalB, relationshipId: "relationship-b", hospitalId: hospitalB, hospitalCode: "H-B" },
    ]);
  });

  it.each([
    null,
    { status: "SUSPENDED", roles: [{ role: "HOSPITAL" }] },
    { status: "ACTIVE", roles: [{ role: "ADMIN" }] },
    { status: "ACTIVE", roles: [{ role: "ADMIN" }, { role: "HOSPITAL" }] },
    { status: "ACTIVE", roles: [{ role: "OSM" }] },
    { status: "ACTIVE", roles: [{ role: "PATIENT" }] },
  ])("denies persisted inactive/unsupported reviewers before loading requests", async (user) => {
    mocks.user.mockResolvedValue(user);
    await expect(listHospitalPatientServiceRequests(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.requests).not.toHaveBeenCalled();
    expect(mocks.memberships).not.toHaveBeenCalled();
  });

  it("denies when no eligible active direct membership remains", async () => {
    mocks.memberships.mockResolvedValue([]);
    await expect(listHospitalPatientServiceRequests(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.requests).not.toHaveBeenCalled();
  });

  it.each([
    { group: "STARTED" }, { group: ["PENDING"] },
    { after: { requestId } }, { after: { requestId: "forged", createdAt: createdAt.toISOString() } },
    { after: { requestId, createdAt: "yesterday" } },
    { hospitalId: hospitalA }, { take: 500 },
  ])("rejects invalid parameters without querying: %j", async (input) => {
    await expect(listHospitalPatientServiceRequests(actor, {}, input)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.requests).not.toHaveBeenCalled();
    expect(hospitalServiceRequestListSchema.safeParse(input).success).toBe(false);
  });

  it("accepts the typed cursor contract", () => {
    const input: HospitalServiceRequestListInput = { group: "APPROVED", after: { requestId, createdAt: createdAt.toISOString() } };
    expect(hospitalServiceRequestListSchema.parse(input)).toEqual(input);
  });
});
