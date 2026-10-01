import { beforeEach, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const mocks = vi.hoisted(() => ({ current: vi.fn(), upsert: vi.fn(), audit: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $transaction: mocks.transaction }) }));
vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: mocks.audit }));
import { setHospitalServiceOffering } from "./patient-service-catalog-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const offeringId = "22222222-2222-4222-8222-222222222222";
const actor: ActorContext = {
  userId: "owner", personId: "person", roles: ["HOSPITAL"],
  hospitalMemberships: [{ hospitalId, membershipType: "OWNER", status: "ACTIVE", hospitalStatus: "ACTIVE", profession: null }],
  osmHospitalRelationships: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.current.mockResolvedValue(null);
  mocks.upsert.mockResolvedValue({ id: offeringId });
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: { findUnique: async () => ({ status: "ACTIVE", roles: [{ role: "HOSPITAL" }] }) },
    hospitalMembership: { findFirst: async () => ({ id: "membership" }) },
    hospitalServiceOffering: { findUnique: mocks.current, upsert: mocks.upsert },
  }));
});

it.each([null, { id: offeringId, enabled: false }])("audits the actual persisted offering ID on create/update", async (current) => {
  mocks.current.mockResolvedValue(current);
  await setHospitalServiceOffering(actor, { hospitalId, code: "SCREENING", enabled: true });
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ resourceId: offeringId }), expect.anything());
});

it("does not audit or upsert a true no-op", async () => {
  mocks.current.mockResolvedValue({ id: offeringId, enabled: true });
  await setHospitalServiceOffering(actor, { hospitalId, code: "SCREENING", enabled: true });
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
