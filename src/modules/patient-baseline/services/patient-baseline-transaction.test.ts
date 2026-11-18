import { describe, expect, it } from "vitest";

import { auditMetadataSchema } from "@/modules/audit/schemas/audit-schemas";

import { patientBaselineCreateRequestSchema } from "../schemas/patient-baseline-schemas";
import { patientBaselineTransactionInternals } from "./patient-baseline-transaction";

const { changedEditableFields, normalizeInput, pickEditableValues } = patientBaselineTransactionInternals;

function editableValues(overrides: Record<string, unknown> = {}) {
  return pickEditableValues(
    normalizeInput(
      patientBaselineCreateRequestSchema.parse({
        patientHospitalRelationshipId: "22222222-2222-4222-8222-222222222222",
        recordedOn: "2026-11-01",
        weight: 70,
        ...overrides,
      }),
    ),
  );
}

describe("Baseline edit change detection", () => {
  it("names added, changed and cleared fields, and compares the recorded date by value", () => {
    const current = editableValues({ hba1c: 6.8, summary: "เดิม" });
    const next = editableValues({ weight: 71, cvdRiskScore: 12.5, summary: null });

    expect(changedEditableFields(current, next)).toEqual(["weight", "hba1c", "cvdRiskScore", "summary"]);
    expect(changedEditableFields(current, editableValues({ hba1c: 6.8, summary: "เดิม" }))).toEqual([]);
    expect(changedEditableFields(current, editableValues({ hba1c: 6.8, summary: "เดิม", recordedOn: "2026-11-02" })))
      .toEqual(["recordedOn"]);
  });

  it("fits every changed field name in one audit metadata value", () => {
    const current = editableValues({ weight: null });
    const next = editableValues({
      recordedOn: "2026-11-02",
      weight: 71,
      heightCm: 168,
      waistCircumference: 90,
      bloodPressureSystolic: 132,
      bloodPressureDiastolic: 84,
      bloodSugarDtx: 118,
      hba1c: 6.8,
      cvdRiskScore: 12,
      adaptationSummary: "ก",
      adaptationObstacles: "ข",
      adaptationOpportunities: "ค",
      confidenceScore: 7,
      confidenceImprovementPlan: "ง",
      summary: "จ",
      recommendations: "ฉ",
    });
    const changedFields = changedEditableFields(current, next);

    expect(changedFields).toHaveLength(16);
    expect(auditMetadataSchema.safeParse({ changedFields: changedFields.join(",") }).success).toBe(true);
  });
});
