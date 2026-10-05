import { describe, expect, it } from "vitest";
import { parseHospitalContentPatientRequest } from "./hospital-content-patient-schemas";
import { ValidationError } from "@/shared/errors/application-error";

describe("Patient Content category and URL boundary", () => {
  it("accepts absent category as all without an ALL value", () => {
    expect(parseHospitalContentPatientRequest({})).toEqual({});
    expect(parseHospitalContentPatientRequest({ category: undefined })).toEqual({ category: undefined });
  });
  it.each(["NCD", "FOOD", "EXERCISE", "OTHER"])("accepts exact %s", (category) => {
    expect(parseHospitalContentPatientRequest({ category })).toEqual({ category });
  });
  it.each([
    { category: "" }, { category: "ALL" }, { category: "food" }, { category: " FOOD" },
    { category: ["FOOD"] }, { category: ["FOOD", "FOOD"] }, { category: null },
    { cursor: ["x", "x"] }, { cursor: "" }, { cursor: "x".repeat(2049) },
    { hospitalId: "x" }, { search: "text" }, { category: { value: "FOOD" } },
  ])("rejects unapproved representations without coercion: %j", (input) => {
    expect(() => parseHospitalContentPatientRequest(input)).toThrow(ValidationError);
  });
});
