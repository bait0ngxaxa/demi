import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HealthHistoryAnswer, Role } from "@prisma/client";
import type { ActorContext } from "@/modules/auth/types/actor-context";

const getInformation = vi.hoisted(() => vi.fn());
const getHistory = vi.hoisted(() => vi.fn());
vi.mock("@/modules/patient-hospital-profile/services/patient-health-history-service", () => ({
  getPatientHealthInformation: getInformation,
  getPatientHealthHistory: getHistory,
}));

import { PatientHealthHistorySection } from "./patient-health-history-section";

const actor: ActorContext = { userId: "patient", personId: "person", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };

describe("Hospital health readback", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("displays recorded conditions, uncertainty, family history and Buddhist year read-only", async () => {
    getInformation.mockResolvedValue({ dateOfBirth: null, history: { diabetes: HealthHistoryAnswer.YES, hypertension: HealthHistoryAnswer.NO,
      familyDiabetes: HealthHistoryAnswer.UNKNOWN, familyHypertension: HealthHistoryAnswer.YES,
      familyHeartDisease: HealthHistoryAnswer.NO, familyStroke: HealthHistoryAnswer.UNKNOWN,
      otherConditions: "โรคอื่นที่บันทึก", diagnosisYear: 2560, updatedAt: new Date("2026-10-14") } });
    const markup = renderToStaticMarkup(await PatientHealthHistorySection({ actor, relationshipId: "relationship" }));
    expect(getInformation).toHaveBeenCalledWith(actor, "relationship");
    for (const text of ["ข้อมูลสุขภาพ", "เบาหวาน", "ญาติสายตรง", "โรคอื่นที่บันทึก", "2560", "ไม่ทราบ"]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/<form|<input|<select|<button/u);
    // D10: no birth date, no age.
    expect(markup).not.toContain("อายุ");
  });

  it("preserves missingness when no hospital history was recorded and still shows the age (D10)", async () => {
    vi.useFakeTimers();
    // 2026-10-16 00:30 in Bangkok is the birthday; UTC is still 2026-10-15.
    vi.setSystemTime(new Date("2026-10-15T17:30:00.000Z"));
    getInformation.mockResolvedValue({ history: null, dateOfBirth: new Date("1960-10-16T00:00:00.000Z") });
    const markup = renderToStaticMarkup(await PatientHealthHistorySection({ actor, relationshipId: "relationship" }));
    expect(markup).toContain("โรงพยาบาลยังไม่ได้บันทึกประวัติสุขภาพ");
    expect(markup).not.toContain("ไม่มีโรค");
    expect(markup).toContain("อายุ</span> 66 ปี");
  });

  it("does not read or show the age where the page shows it in the vitals header (D10)", async () => {
    getInformation.mockClear();
    getHistory.mockResolvedValue(null);
    const markup = renderToStaticMarkup(await PatientHealthHistorySection({ actor, relationshipId: "relationship", showAge: false }));
    expect(getHistory).toHaveBeenCalledWith(actor, "relationship");
    expect(getInformation).not.toHaveBeenCalled();
    expect(markup).not.toContain("อายุ");
  });
});
