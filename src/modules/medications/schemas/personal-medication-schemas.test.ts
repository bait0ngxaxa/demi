import { describe, expect, it } from "vitest";
import { personalMedicationCreateSchema as create, personalMedicationUpdateSchema as update, personalMedicationStopSchema as stop, personalMedicationListSchema as list } from "./personal-medication-schemas";
import { MEDICATION_NAME_MAX_LENGTH, MEDICATION_NAME_RAW_MAX_LENGTH, INSTRUCTION_TEXT_MAX_LENGTH, INSTRUCTION_TEXT_RAW_MAX_LENGTH } from "../domain/personal-medication-definitions";

describe("personal medication strict normalization", () => {
  it("preserves Thai Unicode case and collapses name whitespace to one line", () => {
    expect(create.parse({ medicationName: " \tยาไทย\n ABC  💊  ", instructionText: " \nข้อความ  ภายใน\nบรรทัดสอง \n" })).toEqual({ medicationName: "ยาไทย ABC 💊", instructionText: "ข้อความ  ภายใน\nบรรทัดสอง" });
  });
  it.each([undefined, null, "", " \n\t "])("normalizes optional instruction %s to null", (instructionText) => {
    expect(create.parse({ medicationName: "ยา", instructionText }).instructionText).toBeNull();
  });
  it("rejects empty names", () => { expect(create.safeParse({ medicationName: " \n " }).success).toBe(false); });
  it("bounds raw and normalized inputs exactly in UTF-16 units", () => {
    expect(create.safeParse({ medicationName: "ก".repeat(MEDICATION_NAME_MAX_LENGTH) }).success).toBe(true);
    expect(create.safeParse({ medicationName: "ก".repeat(MEDICATION_NAME_MAX_LENGTH + 1) }).success).toBe(false);
    expect(create.safeParse({ medicationName: " ".repeat(MEDICATION_NAME_RAW_MAX_LENGTH - 1) + "ก" }).success).toBe(true);
    expect(create.safeParse({ medicationName: " ".repeat(MEDICATION_NAME_RAW_MAX_LENGTH) + "ก" }).success).toBe(false);
    expect(create.safeParse({ medicationName: "💊".repeat(100) }).success).toBe(true);
    expect(create.safeParse({ medicationName: "💊".repeat(101) }).success).toBe(false);
    expect(create.safeParse({ medicationName: "ยา", instructionText: "ก".repeat(INSTRUCTION_TEXT_MAX_LENGTH) }).success).toBe(true);
    expect(create.safeParse({ medicationName: "ยา", instructionText: "ก".repeat(INSTRUCTION_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
    expect(create.safeParse({ medicationName: "ยา", instructionText: " ".repeat(INSTRUCTION_TEXT_RAW_MAX_LENGTH) }).success).toBe(true);
    expect(create.safeParse({ medicationName: "ยา", instructionText: " ".repeat(INSTRUCTION_TEXT_RAW_MAX_LENGTH + 1) }).success).toBe(false);
  });
  const version = { medicationId: "11111111-1111-4111-8111-111111111111", expectedUpdatedAt: "2026-10-02T00:00:00.000Z" };
  it.each(["patientProfileId", "personId", "userId", "hospitalId", "patientHospitalRelationshipId", "status", "stoppedAt", "createdAt", "updatedAt", "createdBy", "source", "owner", "schedule"])("rejects authority/unknown %s in all mutations", (key) => {
    expect(create.safeParse({ medicationName: "ยา", [key]: "x" }).success).toBe(false);
    expect(update.safeParse({ ...version, medicationName: "ยา", [key]: "x" }).success).toBe(false);
    expect(stop.safeParse({ ...version, [key]: "x" }).success).toBe(false);
  });
  it("validates locators and ISO versions and full replacement clears omitted instruction", () => {
    expect(update.parse({ ...version, medicationName: "ยา" }).instructionText).toBeNull();
    expect(stop.safeParse({ ...version, medicationId: "bad" }).success).toBe(false);
    expect(stop.safeParse({ ...version, expectedUpdatedAt: "yesterday" }).success).toBe(false);
    expect(list.safeParse({ status: "ACTIVE", cursor: "bad" }).success).toBe(false);
  });
});
