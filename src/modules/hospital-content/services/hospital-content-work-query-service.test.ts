import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, type PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ValidationError } from "@/shared/errors/application-error";
import { hospitalContentWorkQueryInternals as internals, listHospitalWorkContent } from "./hospital-content-work-query-service";

const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: [Role.HOSPITAL], hospitalMemberships: [], osmHospitalRelationships: [] };
const hospitalA = "44444444-4444-4444-8444-444444444444";
const hospitalB = "55555555-5555-4555-8555-555555555555";
const findUser = vi.fn();
const many = vi.fn();
const db = { user: { findFirst: findUser }, hospitalContent: { findMany: many } } as unknown as PrismaClient;
const row = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "ข่าวทีมงาน", body: "body", category: "NEWS", sourceText: null, latestPublishedAt: new Date("2026-10-05T12:00:00.000Z"), firstPublishedAt: new Date("2026-10-01T12:00:00.000Z"), hospital: { hospitalCode: "A", name: "โรงพยาบาล ก" }, images: [] };

beforeEach(() => { vi.resetAllMocks(); findUser.mockResolvedValue({ id: actor.userId }); many.mockResolvedValue([]); });

describe("Work Content Hospital filter", () => {
  it("keeps the unfiltered feed on the full authorized predicate and page size", async () => {
    await listHospitalWorkContent(actor, {}, db);
    const query = many.mock.calls[0]?.[0];
    expect(query?.where.hospital).toEqual({ is: internals.activeWorkHospitalWhere(actor) });
    expect(query?.take).toBe(26);
  });

  it("narrows inside the authorized predicate and returns the requested home limit", async () => {
    many.mockResolvedValue([row, row, row, row]);
    const page = await listHospitalWorkContent(actor, { hospitalId: hospitalA.toUpperCase(), limit: 3 }, db);
    const query = many.mock.calls[0]?.[0];
    expect(query?.where.hospital).toEqual({ is: { AND: [internals.activeWorkHospitalWhere(actor), { id: hospitalA }] } });
    expect(query?.take).toBe(4);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
  });

  it("binds the cursor to the selected Hospital and rejects it elsewhere", async () => {
    many.mockResolvedValue([row, row]);
    const { nextCursor } = await listHospitalWorkContent(actor, { hospitalId: hospitalA, limit: 1 }, db);
    expect(nextCursor).toBeTruthy();
    many.mockResolvedValue([]);
    await expect(listHospitalWorkContent(actor, { hospitalId: hospitalA, cursor: nextCursor ?? "" }, db)).resolves.toMatchObject({ items: [] });
    await expect(listHospitalWorkContent(actor, { hospitalId: hospitalB, cursor: nextCursor ?? "" }, db)).rejects.toBeInstanceOf(ValidationError);
    await expect(listHospitalWorkContent(actor, { cursor: nextCursor ?? "" }, db)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unfiltered cursor on a filtered request", async () => {
    many.mockResolvedValue(Array.from({ length: 26 }, () => row));
    const { nextCursor } = await listHospitalWorkContent(actor, {}, db);
    await expect(listHospitalWorkContent(actor, { hospitalId: hospitalA, cursor: nextCursor ?? "" }, db)).rejects.toBeInstanceOf(ValidationError);
  });

  it.each([{ hospitalId: "not-a-uuid" }, { limit: 0 }, { limit: 26 }])("rejects malformed request %j before querying", async (input) => {
    await expect(listHospitalWorkContent(actor, input, db)).rejects.toBeInstanceOf(ValidationError);
    expect(many).not.toHaveBeenCalled();
  });
});
