import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const mocks = vi.hoisted(() => ({ query: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $queryRaw: mocks.query, patientAppointment: { count: mocks.count } }) }));
import { countWorkAppointmentsAwaitingMyAcceptance, countWorkAppointmentRequestsByHospital } from "./work-appointment-query-service";
const actor: ActorContext = { userId: "osm-user", personId: "person", roles: ["OSM"], hospitalMemberships: [], osmHospitalRelationships: [] };
const operator: ActorContext = { ...actor, userId: "staff-user", roles: ["HOSPITAL"], hospitalMemberships: [
  { hospitalId: "mine", membershipType: "MEMBER", profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" },
  { hospitalId: "owned", membershipType: "OWNER", profession: null, status: "ACTIVE", hospitalStatus: "ACTIVE" },
] };
beforeEach(() => { vi.clearAllMocks(); });

describe("aggregate work action counts", () => {
  it("counts a large acceptance queue in SQL without loading record IDs or per-Hospital queries", async () => {
    mocks.query.mockResolvedValue([{ hospitalId: "one", count: 10000 }, { hospitalId: "two", count: 5 }]);
    expect(await countWorkAppointmentsAwaitingMyAcceptance(actor)).toBe(10005);
    expect(mocks.query).toHaveBeenCalledOnce();
    const query = mocks.query.mock.calls[0]?.[0] as { text: string; values: unknown[] };
    expect(query.text).toContain('COUNT(*)::int');
    expect(query.text).toContain('GROUP BY hospital."id"');
    expect(query.text).not.toContain('SELECT appointment."id"');
    expect(query.text).toContain('NOT EXISTS');
    expect(query.values).toContain(actor.userId);
  });
  it("keeps forbidden Hospital and ADMIN actors out of Hospital request counts", async () => {
    await expect(countWorkAppointmentRequestsByHospital(actor, ["foreign"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin: ActorContext = { ...operator, roles: ["ADMIN", "HOSPITAL"] };
    await expect(countWorkAppointmentRequestsByHospital(admin, ["mine"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(countWorkAppointmentRequestsByHospital(operator, ["mine", "foreign"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await countWorkAppointmentsAwaitingMyAcceptance({ ...actor, roles: ["ADMIN", "OSM"] })).toBe(0);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("counts many Hospitals' pending requests in one parameterized grouped query without loading IDs", async () => {
    mocks.query.mockResolvedValue([{ hospitalId: "owned", count: 10000 }]);
    expect(await countWorkAppointmentRequestsByHospital(operator, ["mine", "owned", "mine"])).toEqual([
      { hospitalId: "mine", count: 0 }, { hospitalId: "owned", count: 10000 },
    ]);
    expect(mocks.query).toHaveBeenCalledOnce();
    expect(mocks.count).not.toHaveBeenCalled();
    const query = mocks.query.mock.calls[0]?.[0] as { text: string; values: unknown[] };
    expect(query.text).toContain('GROUP BY hospital."id"');
    expect(query.text).not.toContain('SELECT appointment."id"');
    expect(query.text).not.toContain("staff-user");
    expect(query.values).toEqual(["mine", "owned", "staff-user"]);
    expect(await countWorkAppointmentRequestsByHospital(operator, [])).toEqual([]);
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("reports a failed count as an infrastructure error", async () => {
    mocks.query.mockRejectedValue(new Error("timeout"));
    await expect(countWorkAppointmentRequestsByHospital(operator, ["mine"])).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
  });
});
