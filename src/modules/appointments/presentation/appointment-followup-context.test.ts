import { describe, expect, it } from "vitest";

import { getAppointmentFollowupContext } from "./appointment-followup-context";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";

describe("getAppointmentFollowupContext", () => {
  it("does not suggest recording when the active Program is readable but not writable", () => {
    const context = getAppointmentFollowupContext({
      activeProgram: { programId },
      appointmentId,
      canRecordProgram: false,
      relationshipId,
    });

    expect(context).toEqual({
      description: "โปรแกรมปัจจุบันยังอ่านได้ แต่บัญชีนี้ไม่มีสิทธิ์บันทึกการติดตามผล",
      href: `/app/patients/${relationshipId}/programs/${programId}`,
      label: "ดูโปรแกรมปัจจุบัน",
    });
    expect(context.description).not.toContain("คุณสามารถบันทึก");
  });

  it("keeps completed Appointment context inside the writable active Program", () => {
    expect(
      getAppointmentFollowupContext({
        activeProgram: { programId },
        appointmentId,
        canRecordProgram: true,
        relationshipId,
      }),
    ).toEqual({
      description: "นัดหมายนี้เสร็จสิ้นแล้ว คุณสามารถบันทึกการติดตามผลในโปรแกรมปัจจุบันได้",
      href: `/app/patients/${relationshipId}/programs/${programId}/followups/new?appointmentId=${appointmentId}`,
      label: "บันทึกการติดตามผลในโปรแกรมปัจจุบัน",
    });
  });

  it("uses the relationship compatibility route only when there is no active Program", () => {
    expect(
      getAppointmentFollowupContext({
        activeProgram: null,
        appointmentId,
        canRecordProgram: false,
        relationshipId,
      }),
    ).toEqual({
      description: "นัดหมายนี้เสร็จสิ้นแล้ว คุณสามารถบันทึกการติดตามผลเป็นรายการใหม่ได้",
      href: `/app/patients/${relationshipId}/followups/new?appointmentId=${appointmentId}`,
      label: "บันทึกการติดตามผล",
    });
  });
});
