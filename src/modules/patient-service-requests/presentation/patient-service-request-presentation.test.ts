import { describe, expect, it } from "vitest";

import {
  formatPatientServiceRequestDate,
  patientServiceLabel,
  patientServiceRequestStatusLabel,
} from "./patient-service-request-presentation";

describe("Patient service request presentation", () => {
  it("formats Hospital request dates in Bangkok regardless of the rendering host timezone", () => {
    const date = new Date("2026-10-01T23:00:00.000Z");
    expect(formatPatientServiceRequestDate(date, "Asia/Bangkok")).toBe(
      new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date),
    );
    expect(formatPatientServiceRequestDate(date, "Asia/Bangkok")).toContain("06:00");
    expect(formatPatientServiceRequestDate(date)).toBe(
      new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date),
    );
  });
  it("presents the approved request categories in Thai without implying clinical equivalence", () => {
    expect(patientServiceLabel("SCREENING")).toBe("คัดกรอง");
    expect(patientServiceLabel("FOLLOW_UP")).toBe("ติดตาม");
    expect(patientServiceLabel("EMPOWERMENT")).toBe("เสริมพลัง");
  });

  it("labels PENDING as awaiting Hospital review", () => {
    expect(patientServiceRequestStatusLabel("PENDING")).toBe("รอโรงพยาบาลตรวจสอบ");
  });
});
