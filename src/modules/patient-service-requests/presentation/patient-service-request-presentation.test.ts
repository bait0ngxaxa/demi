import { describe, expect, it } from "vitest";

import {
  patientServiceLabel,
  patientServiceRequestStatusLabel,
} from "./patient-service-request-presentation";

describe("Patient service request presentation", () => {
  it("presents the approved request categories in Thai without implying clinical equivalence", () => {
    expect(patientServiceLabel("SCREENING")).toBe("คัดกรอง");
    expect(patientServiceLabel("FOLLOW_UP")).toBe("ติดตาม");
    expect(patientServiceLabel("EMPOWERMENT")).toBe("เสริมพลัง");
  });

  it("labels PENDING as awaiting Hospital review", () => {
    expect(patientServiceRequestStatusLabel("PENDING")).toBe("รอโรงพยาบาลตรวจสอบ");
  });
});
