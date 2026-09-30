import { Profession } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { appointmentResponsiblePresentation } from "./appointment-definitions";

describe("appointment responsible-person presentation", () => {
  it.each([
    [Profession.DOCTOR, "แพทย์ผู้ดูแล"],
    [Profession.NURSE, "พยาบาลผู้ดูแล"],
    [Profession.COORDINATOR, "ผู้รับผิดชอบเดิม"],
    [Profession.OTHER, "ผู้รับผิดชอบเดิม"],
    [null, "ผู้รับผิดชอบเดิม"],
  ] as const)("uses a factual heading for %s", (profession, heading) => {
    expect(appointmentResponsiblePresentation("สมชาย ผู้รับผิดชอบ", profession)).toEqual({
      heading,
      displayName: "สมชาย ผู้รับผิดชอบ",
    });
  });

  it("shows an unassigned person as not specified", () => {
    expect(appointmentResponsiblePresentation(null, null)).toEqual({
      heading: "ผู้รับผิดชอบ",
      displayName: "ยังไม่ระบุ",
    });
  });
});
