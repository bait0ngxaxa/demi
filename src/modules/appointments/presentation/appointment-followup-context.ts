type AppointmentFollowupContextInput = {
  relationshipId: string;
  appointmentId: string;
  activeProgram: { programId: string } | null;
  canRecordProgram: boolean;
};

export type AppointmentFollowupContext = {
  description: string;
  href: string;
  label: string;
};

export function getAppointmentFollowupContext({
  activeProgram,
  appointmentId,
  canRecordProgram,
  relationshipId,
}: AppointmentFollowupContextInput): AppointmentFollowupContext {
  const encodedRelationshipId = encodeURIComponent(relationshipId);
  const encodedAppointmentId = encodeURIComponent(appointmentId);

  if (activeProgram && canRecordProgram) {
    return {
      description: "นัดหมายนี้เสร็จสิ้นแล้ว คุณสามารถบันทึกการติดตามผลในโปรแกรมปัจจุบันได้",
      href: `/app/patients/${encodedRelationshipId}/programs/${encodeURIComponent(activeProgram.programId)}/followups/new?appointmentId=${encodedAppointmentId}`,
      label: "บันทึกการติดตามผลในโปรแกรมปัจจุบัน",
    };
  }

  if (activeProgram) {
    return {
      description: "โปรแกรมปัจจุบันยังอ่านได้ แต่บัญชีนี้ไม่มีสิทธิ์บันทึกการติดตามผล",
      href: `/app/patients/${encodedRelationshipId}/programs/${encodeURIComponent(activeProgram.programId)}`,
      label: "ดูโปรแกรมปัจจุบัน",
    };
  }

  return {
    description: "นัดหมายนี้เสร็จสิ้นแล้ว คุณสามารถบันทึกการติดตามผลเป็นรายการใหม่ได้",
    href: `/app/patients/${encodedRelationshipId}/followups/new?appointmentId=${encodedAppointmentId}`,
    label: "บันทึกการติดตามผล",
  };
}
