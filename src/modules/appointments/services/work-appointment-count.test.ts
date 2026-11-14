import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const mocks = vi.hoisted(() => ({ query: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $queryRaw: mocks.query, patientAppointment: { count: mocks.count } }) }));
import { countWorkAppointmentsAwaitingMyAcceptance, countWorkAppointmentRequests } from "./work-appointment-query-service";
const actor: ActorContext = { userId: "osm-user", personId: "person", roles: ["OSM"], hospitalMemberships: [], osmHospitalRelationships: [] };
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
    await expect(countWorkAppointmentRequests(actor, "foreign")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await countWorkAppointmentsAwaitingMyAcceptance({ ...actor, roles: ["ADMIN", "OSM"] })).toBe(0);
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
