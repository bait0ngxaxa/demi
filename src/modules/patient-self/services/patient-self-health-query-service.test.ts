import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, NotFoundError } from "@/shared/errors/application-error";
import type { PatientSelfQueryDatabase } from "./patient-self-query-service";
import { getOwnCurrentAssignedOsm, getOwnLatestStaffMeasurements } from "./patient-self-health-query-service";

const id = "44444444-4444-4444-8444-444444444444";
const actor: ActorContext = { userId: "user", personId: "person", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
const date = new Date("2026-10-20T00:00:00Z");

function setup({ ended = false, hospitalStatus = "ACTIVE", own = true } = {}) {
  const person = vi.fn().mockResolvedValue(own ? { patientProfile: { hospitalRelationships: [{ id,
    endedAt: ended ? date : null, hospitalNumber: null,
    hospital: { name: "โรงพยาบาล", hospitalCode: "H", status: hospitalStatus } }] } } : null);
  const raw = vi.fn().mockResolvedValue([]);
  const assignment = vi.fn().mockResolvedValue(null);
  const database = { person: { findFirst: person }, $queryRaw: raw,
    patientOsmAssignment: { findFirst: assignment } } as unknown as PatientSelfQueryDatabase;
  return { database, person, raw, assignment };
}

describe("PH-1 staff measurements SELF read", () => {
  it("returns four empty facts when no staff record exists", async () => {
    const f = setup();
    expect(await getOwnLatestStaffMeasurements(actor, id, f)).toEqual({ weight: null, heightCm: null, waistCircumference: null, bmi: null });
    expect(f.raw).toHaveBeenCalledOnce();
    expect(f.raw.mock.calls[0][0].text).not.toContain("PatientSelfMeasurement");
  });
  it("carries the independently latest height into BMI and preserves both provenances", async () => {
    const f = setup();
    f.raw.mockResolvedValue([
      { field: "weight", value: 70, date, source: "ติดตามผล" },
      { field: "heightCm", value: 160, date: new Date("2026-01-01"), source: "ข้อมูลตั้งต้น" },
      { field: "waistCircumference", value: 80, date, source: "ประเมินสุดท้าย" },
    ]);
    const result = await getOwnLatestStaffMeasurements(actor, id, f);
    expect(result.bmi).toEqual({ value: 27.3, date, source: "ติดตามผล", heightDate: new Date("2026-01-01"), heightSource: "ข้อมูลตั้งต้น" });
    expect(result.waistCircumference?.value).toBe(80);
    expect(f.raw).toHaveBeenCalledOnce();
  });
  it("does not compute BMI without height", async () => {
    const f = setup();
    f.raw.mockResolvedValue([{ field: "weight", value: 70, date, source: "ข้อมูลตั้งต้น" }]);
    expect((await getOwnLatestStaffMeasurements(actor, id, f)).bmi).toBeNull();
  });
  it("keeps ended SELF history readable", async () => {
    const f = setup({ ended: true });
    await getOwnLatestStaffMeasurements(actor, id, f);
    expect(f.raw).toHaveBeenCalledOnce();
  });
  it("sanitizes SQL failures", async () => {
    const f = setup();
    f.raw.mockRejectedValue(new Error("private SQL"));
    await expect(getOwnLatestStaffMeasurements(actor, id, f)).rejects.toBeInstanceOf(InfrastructureError);
  });
});

describe("PH-1 current OSM SELF read", () => {
  it("returns only the current display name and relationship phone", async () => {
    const f = setup();
    f.assignment.mockResolvedValue({ osmUser: { id: "private", person: { givenName: "สมศรี", familyName: "ใจดี" },
      osmHospitalRelationships: [{ contactPhone: "0812345678", id: "private" }] } });
    expect(await getOwnCurrentAssignedOsm(actor, id, f)).toEqual({ displayName: "สมศรี ใจดี", contactPhone: "0812345678" });
    expect(f.assignment.mock.calls[0][0].where).toMatchObject({ patientHospitalRelationshipId: id, endedAt: null,
      osmUser: { status: "ACTIVE", roles: { some: { role: "OSM" } }, osmHospitalRelationships: { some: { status: "ACTIVE",
        hospital: { status: "ACTIVE", patientRelationships: { some: { id, endedAt: null } } } } } } });
  });
  it("returns null for no current assignment and a nullable phone for a legacy OSM", async () => {
    const f = setup();
    expect(await getOwnCurrentAssignedOsm(actor, id, f)).toBeNull();
    f.assignment.mockResolvedValue({ osmUser: { person: { givenName: "สมศรี", familyName: null }, osmHospitalRelationships: [{ contactPhone: null }] } });
    expect(await getOwnCurrentAssignedOsm(actor, id, f)).toEqual({ displayName: "สมศรี", contactPhone: null });
  });
  it.each([{ ended: true }, { hospitalStatus: "SUSPENDED" }])("denies unavailable current care %j", async (options) => {
    const f = setup(options);
    await expect(getOwnCurrentAssignedOsm(actor, id, f)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.assignment).not.toHaveBeenCalled();
  });
});

describe.each([getOwnLatestStaffMeasurements, getOwnCurrentAssignedOsm])("SELF authorization %s", (read) => {
  it.each([Role.ADMIN, Role.HOSPITAL, Role.OSM, Role.CAREGIVER])("denies a %s-only actor", async (role) => {
    const f = setup();
    await expect(read({ ...actor, roles: [role] }, id, f)).rejects.toBeInstanceOf(ForbiddenError);
    expect(f.person).not.toHaveBeenCalled();
    expect(f.raw).not.toHaveBeenCalled();
    expect(f.assignment).not.toHaveBeenCalled();
  });
  it("denies another patient's relationship before reading any data", async () => {
    const f = setup({ own: false });
    await expect(read(actor, id, f)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.person.mock.calls[0][0].where).toEqual({ id: actor.personId,
      user: { is: { id: actor.userId, status: "ACTIVE", roles: { some: { role: "PATIENT" } } } } });
    expect(f.raw).not.toHaveBeenCalled();
    expect(f.assignment).not.toHaveBeenCalled();
  });
  it("rejects malformed locators", async () => {
    const f = setup();
    await expect(read(actor, "invalid", f)).rejects.toBeInstanceOf(NotFoundError);
    expect(f.person).not.toHaveBeenCalled();
  });
});
