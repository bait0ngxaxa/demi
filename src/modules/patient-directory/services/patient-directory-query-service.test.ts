import { describe, expect, it } from "vitest";

import {
  PATIENT_DIRECTORY_PAGE_SIZE,
  patientDirectoryQuerySchema,
} from "@/modules/patient-directory/schemas/patient-directory-schemas";

import { patientDirectoryInternals } from "./patient-directory-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const patientProfileId = "33333333-3333-4333-8333-333333333333";

describe("Patient directory query boundary", () => {
  it("normalizes bounded query input and defaults an empty lookup value", () => {
    expect(
      patientDirectoryInternals.parseDirectoryQuery({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "  สมชาย  ",
        page: "2",
      }),
    ).toEqual({
      targetHospitalId: hospitalId,
      lookupType: "NAME",
      value: "สมชาย",
      page: 2,
    });
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "   ",
        page: "1",
      }).success,
    ).toBe(true);
  });

  it("rejects unbounded page/search input and arbitrary sort values", () => {
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "x".repeat(121),
        page: "1",
      }).success,
    ).toBe(false);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "HOSPITAL_NUMBER",
        value: "x".repeat(65),
        page: "1",
      }).success,
    ).toBe(false);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
        page: String(1_001),
      }).success,
    ).toBe(false);
    expect(
      patientDirectoryQuerySchema.safeParse({
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย",
        page: "1",
        sort: "arbitrary",
      }).success,
    ).toBe(false);
  });

  it("builds name and exact HN filters under the direct Hospital relationship boundary", () => {
    const nameWhere = patientDirectoryInternals.buildPatientRelationshipWhere(
      "44444444-4444-4444-8444-444444444444",
      {
        targetHospitalId: hospitalId,
        lookupType: "NAME",
        value: "สมชาย ผู้ป่วย",
        page: 1,
      },
    );
    const hnWhere = patientDirectoryInternals.buildPatientRelationshipWhere(
      "44444444-4444-4444-8444-444444444444",
      {
        targetHospitalId: hospitalId,
        lookupType: "HOSPITAL_NUMBER",
        value: "HN-001",
        page: 1,
      },
    );

    expect(nameWhere).toMatchObject({ hospitalId, hospital: { status: "ACTIVE" } });
    expect(nameWhere.patientProfile).toMatchObject({
      person: {
        AND: [
          { OR: [{ givenName: { contains: "สมชาย", mode: "insensitive" } }, { familyName: { contains: "สมชาย", mode: "insensitive" } }] },
          { OR: [{ givenName: { contains: "ผู้ป่วย", mode: "insensitive" } }, { familyName: { contains: "ผู้ป่วย", mode: "insensitive" } }] },
        ],
      },
    });
    expect(hnWhere).toMatchObject({ hospitalId, hospitalNumber: "HN-001" });
  });

  it("uses a fixed page size and a deterministic name/id order", () => {
    expect(PATIENT_DIRECTORY_PAGE_SIZE).toBe(25);
    expect(patientDirectoryInternals.patientDirectoryOrderBy).toEqual([
      { patientProfile: { person: { givenName: "asc" } } },
      { patientProfile: { person: { familyName: "asc" } } },
      { id: "asc" },
    ]);
  });

  it("projects only the accepted minimal detail fields", () => {
    const item = patientDirectoryInternals.toPatientDirectoryItem({
      id: relationshipId,
      hospitalNumber: "HN-001",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      patientProfile: {
        id: patientProfileId,
        person: { givenName: "สมชาย", familyName: "ผู้ป่วย" },
      },
    });

    expect(item).toEqual({
      patientProfileId,
      patientHospitalRelationshipId: relationshipId,
      displayName: "สมชาย ผู้ป่วย",
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalNumber: "HN-001",
    });
    expect(Object.keys(patientDirectoryInternals.patientDirectorySelect).sort()).toEqual([
      "hospital",
      "hospitalNumber",
      "id",
      "patientProfile",
    ]);
    expect(JSON.stringify(item)).not.toContain("identityKeyHash");
    expect(JSON.stringify(item)).not.toContain("authSubject");
    expect(JSON.stringify(item)).not.toContain("activation");
    expect(JSON.stringify(item)).not.toContain("clinical");
  });
});
