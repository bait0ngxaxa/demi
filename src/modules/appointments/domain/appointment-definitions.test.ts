import { Profession } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPE_VALUES,
  appointmentResponsiblePresentation,
} from "./appointment-definitions";

describe("appointment type definitions", () => {
  it("matches the three whiteboard classifications and labels", () => {
    expect(APPOINTMENT_TYPE_VALUES).toEqual(["FOLLOW_UP", "ASSESSMENT", "EDUCATION"]);
    expect(APPOINTMENT_TYPE_LABELS).toEqual({
      FOLLOW_UP: "ติดตาม",
      ASSESSMENT: "ประเมิน",
      EDUCATION: "ให้ความรู้",
    });
  });
});

describe("appointment responsible-person presentation", () => {
  it.each([
    [Profession.DOCTOR, "แพทย์ผู้ดูแล"],
    [Profession.NURSE, "พยาบาลผู้ดูแล"],
    // ADR-0027 (AP-1): any staff member may be responsible, whatever the profession.
    [Profession.COORDINATOR, "เจ้าหน้าที่ผู้ดูแล"],
    [Profession.OTHER, "เจ้าหน้าที่ผู้ดูแล"],
    [null, "เจ้าหน้าที่ผู้ดูแล"],
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
