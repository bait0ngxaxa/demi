import { describe, expect, it } from "vitest";
import { parseWeightGoalForm } from "./weight-goal-form";

describe("bounded Weight Goal FormData parser", () => {
  it("accepts only operation-specific fields and ignores framework action metadata", () => {
    const form = new FormData();
    form.set("submissionNonce", "11111111-1111-4111-8111-111111111111");
    form.set("targetWeightKg", "70.500");
    form.set("targetDate", "");
    form.set("$ACTION_ID_test", "opaque");
    expect(parseWeightGoalForm(form, "create")).toEqual({
      submissionNonce: "11111111-1111-4111-8111-111111111111",
      targetWeightKg: "70.500",
      targetDate: "",
    });
    expect(parseWeightGoalForm(new FormData(), "read")).toEqual({});
  });

  it.each([
    ["unknown owner", "patientProfileId", "11111111-1111-4111-8111-111111111111"],
    ["unknown weight source", "currentWeight", "70"],
    ["oversize raw decimal", "targetWeightKg", "1000000.0000"],
    ["oversize date", "targetDate", "2026-10-041"],
  ])("rejects %s", (_label, key, value) => {
    const form = new FormData();
    form.set(key, value);
    expect(() => parseWeightGoalForm(form, key === "targetWeightKg" || key === "targetDate" ? "create" : "read")).toThrow();
  });

  it("rejects duplicate fields and File values", () => {
    const duplicate = new FormData();
    duplicate.append("targetWeightKg", "70");
    duplicate.append("targetWeightKg", "71");
    expect(() => parseWeightGoalForm(duplicate, "create")).toThrow();

    const file = new FormData();
    file.set("targetWeightKg", new File(["70"], "target.txt", { type: "text/plain" }));
    expect(() => parseWeightGoalForm(file, "create")).toThrow();
  });

  it("rejects owner inputs on read and unsupported fields on each mutation", () => {
    for (const [operation, field] of [["read", "userId"], ["create", "progress"], ["update", "status"], ["remove", "goalPlanId"]] as const) {
      const form = new FormData();
      form.set(field, "forbidden");
      expect(() => parseWeightGoalForm(form, operation)).toThrow();
    }
  });
});
