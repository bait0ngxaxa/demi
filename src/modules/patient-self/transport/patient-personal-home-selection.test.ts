import { HospitalStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { PatientSelfContext } from "@/modules/patient-self/services/patient-self-query-service";
import { getActivePatientHospitals, selectPatientPersonalHomeHospital } from "./patient-personal-home-selection";

const firstRelationshipId = "11111111-1111-4111-8111-111111111111";
const secondRelationshipId = "22222222-2222-4222-8222-222222222222";

const patient: PatientSelfContext = {
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  hospitalRelationships: [
    {
      relationshipId: firstRelationshipId,
      hospitalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      hospitalCode: "H-001",
      hospitalName: "โรงพยาบาล ก",
      hospitalNumber: null,
      hospitalStatus: HospitalStatus.ACTIVE,
      careEndedAt: null,
    },
    {
      relationshipId: "33333333-3333-4333-8333-333333333333",
      hospitalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      hospitalCode: "H-002",
      hospitalName: "โรงพยาบาล ข",
      hospitalNumber: null,
      hospitalStatus: HospitalStatus.ACTIVE,
      careEndedAt: new Date("2026-10-01T00:00:00.000Z"),
    },
    {
      relationshipId: "44444444-4444-4444-8444-444444444444",
      hospitalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      hospitalCode: "H-003",
      hospitalName: "โรงพยาบาล ค",
      hospitalNumber: null,
      hospitalStatus: HospitalStatus.SUSPENDED,
      careEndedAt: null,
    },
    {
      relationshipId: secondRelationshipId,
      hospitalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      hospitalCode: "H-004",
      hospitalName: "โรงพยาบาล ง",
      hospitalNumber: null,
      hospitalStatus: HospitalStatus.ACTIVE,
      careEndedAt: null,
    },
  ],
};

describe("Patient Personal Home Hospital selection", () => {
  it("lists only active relationships with active Hospitals", () => {
    expect(getActivePatientHospitals(patient).map(({ relationshipId }) => relationshipId)).toEqual([
      firstRelationshipId,
      secondRelationshipId,
    ]);
  });

  it.each([undefined, null, [secondRelationshipId], "not-a-relationship", "55555555-5555-4555-8555-555555555555"])(
    "falls back to the first ordered candidate for an invalid or missing locator (%s)",
    (requested) => {
      expect(selectPatientPersonalHomeHospital(patient, requested)?.relationshipId).toBe(firstRelationshipId);
    },
  );

  it("selects only a matching eligible relationship and ignores UUID case", () => {
    expect(selectPatientPersonalHomeHospital(patient, secondRelationshipId.toUpperCase())?.relationshipId)
      .toBe(secondRelationshipId);
  });

  it("returns no selection when there are no active candidates", () => {
    expect(selectPatientPersonalHomeHospital({ ...patient, hospitalRelationships: [] }, "forged")).toBeNull();
  });
});
