import { describe, expect, it } from "vitest";
import { hasServiceAreaEligibility, isEligibleServiceAreaPair, type ServiceAreaFacility } from "./service-area-eligibility";
import { serviceAreaAttachSchema, serviceAreaEndSchema } from "../schemas/hospital-service-area-schemas";

const parent: ServiceAreaFacility = { id: "parent", status: "ACTIVE",
  serviceAreaEligibility: { kind: "PARENT" } };
const child: ServiceAreaFacility = { id: "child", status: "ACTIVE",
  serviceAreaEligibility: { kind: "CHILD" } };

describe("service area eligibility", () => {
  it("requires ADMIN-governed network roles, not canonical placement", () => {
    expect(isEligibleServiceAreaPair(parent, child)).toBe(true);
    expect(isEligibleServiceAreaPair(parent, { ...child, serviceAreaEligibility: null })).toBe(false);
    expect(isEligibleServiceAreaPair({ ...parent, serviceAreaEligibility: null }, child)).toBe(false);
    expect(isEligibleServiceAreaPair(child, parent)).toBe(false);
    expect(isEligibleServiceAreaPair(parent, { ...child, id: parent.id })).toBe(false);
  });
  it.each(["SUSPENDED", "PENDING_VERIFICATION"] as const)("denies %s facilities", (status) => {
    expect(isEligibleServiceAreaPair({ ...parent, status }, child)).toBe(false);
    expect(isEligibleServiceAreaPair(parent, { ...child, status })).toBe(false);
  });
  it("denies wrong or missing kind", () => {
    expect(hasServiceAreaEligibility(child, "PARENT")).toBe(false);
    expect(hasServiceAreaEligibility({ ...child, serviceAreaEligibility: null }, "CHILD")).toBe(false);
  });
  it("rejects identity edits, arbitrary metadata and unconfirmed termination", () => {
    const ids = { parentHospitalId: "10000000-0000-4000-8000-000000000001", childHospitalId: "10000000-0000-4000-8000-000000000002" };
    expect(serviceAreaAttachSchema.safeParse({ ...ids, name: "forged" }).success).toBe(false);
    expect(serviceAreaEndSchema.safeParse({ ...ids, areaId: ids.childHospitalId, endReason: "end", confirm: true }).success).toBe(false);
    expect(serviceAreaEndSchema.safeParse({ parentHospitalId: ids.parentHospitalId, areaId: ids.childHospitalId, endReason: "end", confirm: false }).success).toBe(false);
  });
});
