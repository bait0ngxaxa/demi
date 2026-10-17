import type { ParentChildHospitalReportingProjection } from "./hospital-report-projection";

export type ParentChildSummaryField = {
  key: string;
  label: string;
  grain: "PATIENT_HOSPITAL_RELATIONSHIP" | "PATIENT_PROGRAM";
  value: number;
};

/** ADR-0013 §3: the nine allowlisted exact-Child summary values, in display/export order. Nothing else is exported. */
export function parentChildSummaryFields(
  content: ParentChildHospitalReportingProjection["content"],
): readonly ParentChildSummaryField[] {
  const dashboard = content.dashboard.value;
  const serviceProcess = content.serviceProcess.value;
  return [
    { key: "patientHospitalRelationships", label: "จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล", grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: dashboard.patientHospitalRelationships.value },
    { key: "relationshipsWithoutProgram", label: "จำนวนความสัมพันธ์ที่ไม่มี Program", grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: dashboard.relationshipsWithoutProgram.value },
    { key: "programsTotal", label: "Program ทั้งหมด", grain: "PATIENT_PROGRAM", value: dashboard.programs.total },
    { key: "programsActive", label: "Program ที่กำลังดำเนิน", grain: "PATIENT_PROGRAM", value: dashboard.programs.active },
    { key: "programsCompleted", label: "Program ที่สิ้นสุดแล้ว", grain: "PATIENT_PROGRAM", value: dashboard.programs.completed },
    { key: "programsWithRoutineRecord", label: "Program ที่มีบันทึก Routine", grain: "PATIENT_PROGRAM", value: serviceProcess.programsWithRoutineRecord.value },
    { key: "programsWithFloatingChartRecord", label: "Program ที่มีบันทึก Floating Chart", grain: "PATIENT_PROGRAM", value: serviceProcess.programsWithFloatingChartRecord.value },
    { key: "programsWithDreamCardRecord", label: "Program ที่มีบันทึก Dream Card", grain: "PATIENT_PROGRAM", value: serviceProcess.programsWithDreamCardRecord.value },
    { key: "programsWithConfidenceRecord", label: "Program ที่มีบันทึก Confidence", grain: "PATIENT_PROGRAM", value: serviceProcess.programsWithConfidenceRecord.value },
  ];
}
