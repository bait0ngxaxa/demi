import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HealthHistoryAnswer, Role } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const getHistory = vi.hoisted(() => vi.fn());
vi.mock("@/modules/patient-hospital-profile/services/patient-health-history-service", () => ({ getPatientHealthHistory: getHistory }));

import { PatientHealthHistorySection } from "./patient-health-history-section";

const actor: ActorContext = { userId: "patient", personId: "person", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };

describe("Hospital health readback", () => {
  it("displays recorded conditions, uncertainty, family history and Buddhist year read-only", async () => {
    getHistory.mockResolvedValue({ diabetes: HealthHistoryAnswer.YES, hypertension: HealthHistoryAnswer.NO,
      familyDiabetes: HealthHistoryAnswer.UNKNOWN, familyHypertension: HealthHistoryAnswer.YES,
      familyHeartDisease: HealthHistoryAnswer.NO, familyStroke: HealthHistoryAnswer.UNKNOWN,
      otherConditions: "โรคอื่นที่บันทึก", diagnosisYear: 2560, updatedAt: new Date("2026-10-14") });
    const markup = renderToStaticMarkup(await PatientHealthHistorySection({ actor, relationshipId: "relationship" }));
    expect(getHistory).toHaveBeenCalledWith(actor, "relationship");
    for (const text of ["ข้อมูลสุขภาพ", "เบาหวาน", "ญาติสายตรง", "โรคอื่นที่บันทึก", "2560", "ไม่ทราบ"]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/<form|<input|<select|<button/u);
  });

  it("preserves missingness when no hospital history was recorded", async () => {
    getHistory.mockResolvedValue(null);
    const markup = renderToStaticMarkup(await PatientHealthHistorySection({ actor, relationshipId: "relationship" }));
    expect(markup).toContain("โรงพยาบาลยังไม่ได้บันทึกประวัติสุขภาพ");
    expect(markup).not.toContain("ไม่มีโรค");
  });
});
