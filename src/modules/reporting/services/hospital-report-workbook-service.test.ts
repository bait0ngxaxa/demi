import ExcelJS from "exceljs";
import { PatientProgramStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type {
  HospitalReportFact,
  HospitalReportProgramRow,
  HospitalReportingDataset,
} from "../projections/hospital-report-projection";
import { generateHospitalReportWorkbook } from "./hospital-report-workbook-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const activeProgramId = "33333333-3333-4333-8333-333333333333";
const completedProgramId = "44444444-4444-4444-8444-444444444444";

function unavailable<T>(reason: "SOURCE_MISSING" | "CLINICAL_SEMANTICS_UNAPPROVED" | "NOT_PROGRAM_SCOPED" | "DERIVATION_UNAPPROVED"): HospitalReportFact<T> {
  return { state: "UNAVAILABLE", reason };
}

function program(input: { id: string; status: PatientProgramStatus; followups?: number }): HospitalReportProgramRow {
  const followups = Array.from({ length: input.followups ?? 0 }, (_, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    roundNumber: index + 1,
    recordedAt: new Date(`2026-08-${String(17 + index).padStart(2, "0")}T05:00:00.000Z`).toISOString(),
    serviceDate: null,
    planAdjusted: null,
    hasObstacle: null,
    achievement: null,
    measurements: {
      bloodSugar: { state: "RECORDED" as const, value: index + 1 },
      weight: { state: "NOT_RECORDED" as const },
      waistCircumference: { state: "NOT_RECORDED" as const },
      systolicBloodPressure: { state: "NOT_RECORDED" as const },
      diastolicBloodPressure: { state: "NOT_RECORDED" as const },
    },
    activityProgress: [{
      activityCode: "walk",
      activityLabel: "เดินออกกำลังกาย",
      status: "PARTIAL" as const,
      achievedDays: null,
    }],
  }));

  return {
    patientProgramId: input.id,
    patientHospitalRelationshipId: relationshipId,
    patient: {
      displayName: "สมชาย ใจดี",
      givenName: "สมชาย",
      familyName: "ใจดี",
      hospitalNumber: { state: "RECORDED", value: "LOCAL-001" },
    },
    currentRelationshipOsmAssignment: {
      state: "PRESENT",
      value: { displayName: "อสม. ปัจจุบัน", assignedAt: "2026-08-01T05:00:00.000Z" },
    },
    lifecycle: {
      status: input.status,
      startedAt: "2026-08-17T05:00:00.000Z",
      completedAt: input.status === PatientProgramStatus.COMPLETED
        ? { state: "RECORDED", value: "2026-09-01T05:00:00.000Z" }
        : { state: "NOT_RECORDED" },
    },
    baseline: {
      state: "PRESENT",
      value: {
        recordedOn: "2026-08-16T00:00:00.000Z",
        measurements: {
          bloodSugar: { state: "NOT_RECORDED" },
          weight: { state: "RECORDED", value: 0 },
          waistCircumference: { state: "NOT_RECORDED" },
          systolicBloodPressure: { state: "RECORDED", value: 120 },
          diastolicBloodPressure: { state: "NOT_RECORDED" },
        },
        heightCm: { state: "RECORDED", value: 0 },
        hba1c: unavailable("CLINICAL_SEMANTICS_UNAPPROVED"),
        confidenceScore: unavailable("CLINICAL_SEMANTICS_UNAPPROVED"),
      },
    },
    serviceOne: {
      routine: { state: "PRESENT", value: { recordedAt: "2026-08-18T05:00:00.000Z" } },
      floatingChart: { state: "MISSING" },
      dreamCard: { state: "MISSING" },
      confidence: { state: "MISSING" },
    },
    goalPlans: {
      totalCount: 1,
      hasMore: false,
      items: [{
        id: "55555555-5555-4555-8555-555555555555",
        roundNumber: 1,
        primaryGoalCode: "weight",
        primaryGoalLabel: "น้ำหนัก",
        items: [{
          activityCode: "walk",
          activityLabel: "เดินออกกำลังกาย",
          category: "EXERCISE",
          targetDays: 3,
          targetValue: { state: "RECORDED", value: 0 },
          targetUnit: { state: "RECORDED", value: "นาที" },
        }],
      }],
    },
    followups: { totalCount: followups.length, items: followups, hasMore: false },
    finalAssessment: { state: "MISSING" },
    unavailable: {
      illnessDuration: "SOURCE_MISSING",
      baselineCvdRiskScore: "SOURCE_MISSING",
      baselineBmi: "DERIVATION_UNAPPROVED",
      afterCvdRiskScore: "SOURCE_MISSING",
      afterHba1c: "SOURCE_MISSING",
      afterBmi: "DERIVATION_UNAPPROVED",
      afterHeightCm: "SOURCE_MISSING",
      beforePamScore: "NOT_PROGRAM_SCOPED",
      beforePromsScore: "NOT_PROGRAM_SCOPED",
      beforeWeeklyExercise: "NOT_PROGRAM_SCOPED",
      afterWeeklyExercise: "NOT_PROGRAM_SCOPED",
      serviceRoundMeasurements: "SOURCE_MISSING",
      achievementRate: "DERIVATION_UNAPPROVED",
      outcome: "SOURCE_MISSING",
    },
  };
}

function dataset(): HospitalReportingDataset {
  return {
    hospital: { id: hospitalId, hospitalCode: "DEMO-A", name: "โรงพยาบาลทดสอบ" },
    counts: {
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
      programs: { grain: "PATIENT_PROGRAM", total: 2, active: 1, completed: 1 },
    },
    programs: [
      program({ id: activeProgramId, status: PatientProgramStatus.ACTIVE, followups: 7 }),
      program({ id: completedProgramId, status: PatientProgramStatus.COMPLETED }),
    ],
  };
}

describe("Hospital reporting customer workbook export", () => {
  it("generates the two customer worksheets, retains zero/missing distinctions and continues all Follow-ups", async () => {
    const bytes = await generateHospitalReportWorkbook(dataset(), new Date("2026-10-11T05:00:00.000Z"));
    const workbook = new ExcelJS.Workbook();
    const workbookBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (!(workbookBytes instanceof ArrayBuffer)) throw new Error("Workbook bytes are unavailable");
    await workbook.xlsx.load(workbookBytes);

    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      "Dashboard ภาพรวม",
      "รายงานการจัดบริการ",
    ]);

    const dashboard = workbook.getWorksheet("Dashboard ภาพรวม");
    const service = workbook.getWorksheet("รายงานการจัดบริการ");
    expect(dashboard).toBeDefined();
    expect(service).toBeDefined();
    if (!dashboard || !service) throw new Error("Expected report sheets to exist");

    expect(dashboard.getCell("A1").value).toContain("โรงพยาบาลทดสอบ");
    expect(dashboard.getCell("B2").value).toBe(1);
    expect(dashboard.getCell("D2").value).toContain("นิยาม");
    expect(dashboard.getCell("B9").value).toBe("สมชาย");
    expect(dashboard.getCell("C9").value).toBe("ใจดี");
    expect(dashboard.getCell("D9").value).toBe("LOCAL-001");
    expect(dashboard.getCell("J9").value).toBe("ยังไม่บันทึก");
    expect(dashboard.getCell("K9").value).toBe(0);
    expect(dashboard.getCell("Q9").value).toBe("ไม่มีแหล่งข้อมูลในระบบ");
    expect(dashboard.getCell("Q10").value).toBeNull();
    expect(dashboard.getCell("W9").value).toBe(1);
    expect(dashboard.getCell("W10").value).toBe(5);
    expect(dashboard.getCell("AC10").value).toBe(7);
    expect(dashboard.getCell("AS9").value).toBe(activeProgramId);
    expect(dashboard.getCell("AS11").value).toBe(completedProgramId);
    expect(dashboard.getCell("AI9").value).toBe("ยังดำเนิน Program");
    expect(dashboard.getCell("AI11").value).toBeInstanceOf(Date);
    expect(dashboard.getCell("H9").value).toContain("ไม่มีแหล่งข้อมูล");
    expect(dashboard.getCell("W11").value).toBe("ไม่มี Follow-up ในช่องที่เหลือ");

    expect(service.getCell("A1").value).toContain("โรงพยาบาลทดสอบ");
    expect(service.getCell("B9").value).toBe("สมชาย");
    expect(service.getCell("D9").value).toBe("LOCAL-001");
    expect(service.getCell("S8").value).toBe("ทำ");
    expect(service.getCell("T9").value).toBe("ไม่ทำ");
    expect(service.getCell("W9").value).toBe("ทำ");
    expect(service.getCell("AD9").value).toBe("มี");
    expect(service.getCell("AF9").value).toBe(3);
    expect(service.getCell("AG9").value).toBe("ยังไม่บันทึกเวลาครบทุกกิจกรรม");
    expect(service.getCell("AH9").value).toBeInstanceOf(Date);
    expect(service.getCell("AH10").value).toBeInstanceOf(Date);
    expect(service.getCell("AH11").value).toBe("ไม่มี Follow-up ในช่องที่เหลือ");
    expect(service.getCell("BN9").value).toBe(PatientProgramStatus.ACTIVE);

    const progressRows: number[] = [];
    for (let rowNumber = 1; rowNumber <= service.rowCount; rowNumber += 1) {
      if (service.getCell(rowNumber, 4).value === "สถานะกิจกรรมที่บันทึก") progressRows.push(rowNumber);
    }
    expect(progressRows).toHaveLength(7);
    expect(service.getCell(progressRows.at(-1) ?? 0, 7).value).toBe(7);
    expect(service.getCell(progressRows.at(-1) ?? 0, 14).value).toBe("บันทึกว่าทำได้บางส่วน");

    const serialized = JSON.stringify({ dashboard: dashboard.getSheetValues(), service: service.getSheetValues() });
    expect(serialized).toContain("ไม่มีแหล่งข้อมูลในระบบ");
    expect(serialized).toContain("เป้าหมายกิจกรรม");
    const serviceText = service.getSheetValues().flat(2).filter((value): value is string => typeof value === "string").join(" ");
    expect(serviceText).toContain("generatedAt");
    expect(serviceText).toContain("ไม่ใช่ dataAsOf");
  });
});
