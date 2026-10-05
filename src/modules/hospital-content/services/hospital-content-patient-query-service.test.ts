import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role, type PrismaClient } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";
import { getPatientHospitalContent, hospitalContentPatientWhere, listPatientHospitalContent } from "./hospital-content-patient-query-service";

const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
const profile = "33333333-3333-4333-8333-333333333333";
const findProfile = vi.fn();
const many = vi.fn();
const first = vi.fn();
const db = { patientProfile: { findFirst: findProfile }, hospitalContent: { findMany: many, findFirst: first } } as unknown as PrismaClient;
const row = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "ข่าวสาร", category: "FOOD", latestPublishedAt: new Date("2026-10-05T12:00:00.000Z"), firstPublishedAt: new Date("2026-10-01T12:00:00.000Z"), hospital: { hospitalCode: "A", name: "โรงพยาบาล ก" }, body: "body", sourceText: "source", updatedAt: new Date(), hospitalId: "hidden" };
beforeEach(() => { vi.clearAllMocks(); findProfile.mockResolvedValue({ id: profile, hospitalRelationships: [{ id: "r" }] }); many.mockResolvedValue([]); first.mockResolvedValue(null); });
describe("Patient Content query boundaries and classifications", () => {
  it("places the complete current SELF predicate inside every Content query and minimizes projections", async () => {
    many.mockResolvedValue([row]); first.mockResolvedValue(row);
    const page = await listPatientHospitalContent(actor, {}, db);
    const detail = await getPatientHospitalContent(actor, row.id, db);
    expect(many.mock.calls[0][0]).toMatchObject({ where: hospitalContentPatientWhere(actor, profile), take: 26, orderBy: [{ firstPublishedAt: "desc" }, { id: "desc" }] });
    expect(first.mock.calls[0][0]).toMatchObject({ where: { ...hospitalContentPatientWhere(actor, profile), id: row.id } });
    expect(Object.keys(page.items[0]).sort()).toEqual(["category", "hospital", "id", "latestPublishedAt", "title"]);
    expect(Object.keys(detail).sort()).toEqual(["body", "category", "hospital", "id", "latestPublishedAt", "sourceText", "title"]);
    expect(Object.keys(detail.hospital)).toEqual(["hospitalCode", "name"]);
  });
  it("freshly rechecks SELF after an empty query and never maps authority loss to empty", async () => {
    findProfile.mockResolvedValueOnce({ id: profile, hospitalRelationships: [{ id: "r" }] }).mockResolvedValueOnce(null);
    await expect(listPatientHospitalContent(actor, {}, db)).rejects.toBeInstanceOf(ForbiddenError);
    expect(findProfile).toHaveBeenCalledTimes(2);
  });
  it("distinguishes A, B and C with a bounded authorized existence query", async () => {
    findProfile.mockResolvedValue({ id: profile, hospitalRelationships: [] });
    expect((await listPatientHospitalContent(actor, {}, db)).emptyState).toBe("EMPTY_A");
    findProfile.mockResolvedValue({ id: profile, hospitalRelationships: [{ id: "r" }] });
    expect((await listPatientHospitalContent(actor, {}, db)).emptyState).toBe("EMPTY_B");
    first.mockResolvedValue({ id: row.id });
    expect((await listPatientHospitalContent(actor, { category: "NCD" }, db)).emptyState).toBe("EMPTY_C");
    expect(first.mock.calls.at(-1)?.[0]).toEqual({ where: hospitalContentPatientWhere(actor, profile), select: { id: true } });
  });
  it("rechecks authority and eligible Hospitals again after zero all-category existence", async () => {
    findProfile.mockResolvedValueOnce({ id: profile, hospitalRelationships: [{ id: "r" }] }).mockResolvedValueOnce({ id: profile, hospitalRelationships: [{ id: "r" }] }).mockResolvedValueOnce({ id: profile, hospitalRelationships: [] });
    expect((await listPatientHospitalContent(actor, { category: "NCD" }, db)).emptyState).toBe("EMPTY_A");
    findProfile.mockResolvedValueOnce({ id: profile, hospitalRelationships: [{ id: "r" }] }).mockResolvedValueOnce({ id: profile, hospitalRelationships: [{ id: "r" }] }).mockResolvedValueOnce(null);
    await expect(listPatientHospitalContent(actor, { category: "NCD" }, db)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("keeps infrastructure failure distinct from all empty states", async () => {
    many.mockRejectedValue(new Error("database internal detail"));
    await expect(listPatientHospitalContent(actor, {}, db)).rejects.toBeInstanceOf(InfrastructureError);
  });
  it("rejects invalid locators without a Content query; unavailable detail is safe NotFound unless SELF was lost", async () => {
    await expect(getPatientHospitalContent(actor, "invalid", db)).rejects.toBeInstanceOf(NotFoundError);
    expect(first).not.toHaveBeenCalled();
    await expect(getPatientHospitalContent(actor, row.id, db)).rejects.toBeInstanceOf(NotFoundError);
    findProfile.mockResolvedValueOnce({ id: profile, hospitalRelationships: [] }).mockResolvedValueOnce(null);
    await expect(getPatientHospitalContent(actor, row.id, db)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
