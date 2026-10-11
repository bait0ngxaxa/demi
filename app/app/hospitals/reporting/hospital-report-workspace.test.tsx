import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientProgramStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { HospitalReportFact, HospitalReportProgramRow, HospitalReportingPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";

import { HospitalReportWorkspace } from "./hospital-report-workspace";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const hospitals: readonly HospitalReportingHospital[] = [{
  id: hospitalId,
  hospitalCode: "DEMO-01",
  name: "โรงพยาบาลทดสอบ",
  status: "ACTIVE" as HospitalReportingHospital["status"],
}];

function unavailable<T>(reason: "SOURCE_MISSING" | "CLINICAL_SEMANTICS_UNAPPROVED" = "SOURCE_MISSING"): HospitalReportFact<T> {
  return { state: "UNAVAILABLE", reason };
}

function program(id: string, status: PatientProgramStatus): HospitalReportProgramRow {
  return {
    patientProgramId: id,
    patientHospitalRelationshipId: relationshipId,
    patient: {
      displayName: "สมชาย ใจดี",
      givenName: "สมชาย",
      familyName: "ใจดี",
      hospitalNumber: { state: "RECORDED", value: "LOCAL-01" },
    },
    currentRelationshipOsmAssignment: { state: "MISSING" },
    lifecycle: {
      status,
      startedAt: "2026-08-17T05:00:00.000Z",
      completedAt: status === PatientProgramStatus.COMPLETED
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
        heightCm: { state: "NOT_RECORDED" },
        hba1c: unavailable<number>("CLINICAL_SEMANTICS_UNAPPROVED"),
        confidenceScore: unavailable<number>("CLINICAL_SEMANTICS_UNAPPROVED"),
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
        id: `${id.slice(0, 8)}-5555-4555-8555-555555555555`,
        roundNumber: 1,
        primaryGoalCode: "weight",
        primaryGoalLabel: "น้ำหนัก",
        items: [{
          activityCode: "walk",
          activityLabel: "เดินออกกำลังกาย",
          targetDays: 3,
          targetValue: { state: "RECORDED", value: 0 },
          targetUnit: { state: "RECORDED", value: "นาที" },
        }],
      }],
    },
    followups: {
      totalCount: 7,
      hasMore: true,
      items: [{
        id: `${id.slice(0, 8)}-6666-4666-8666-666666666666`,
        roundNumber: 1,
        recordedAt: "2026-08-18T05:00:00.000Z",
        measurements: {
          bloodSugar: { state: "RECORDED", value: 98 },
          weight: { state: "NOT_RECORDED" },
          waistCircumference: { state: "NOT_RECORDED" },
          systolicBloodPressure: { state: "NOT_RECORDED" },
          diastolicBloodPressure: { state: "NOT_RECORDED" },
        },
        activityProgress: [{ activityCode: "walk", status: "PARTIAL" }],
      }],
    },
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
      achievementDays: "SOURCE_MISSING",
      achievementRate: "DERIVATION_UNAPPROVED",
      achievementOver70Count: "DERIVATION_UNAPPROVED",
      outcome: "SOURCE_MISSING",
      planAdjustment: "SOURCE_MISSING",
      obstacle: "SOURCE_MISSING",
    },
  };
}

function page(items: HospitalReportProgramRow[], total = items.length): HospitalReportingPageProjection {
  return {
    hospital: { id: hospitalId, hospitalCode: "DEMO-01", name: "โรงพยาบาลทดสอบ" },
    counts: {
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 2 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      programs: {
        grain: "PATIENT_PROGRAM",
        total,
        active: items.filter(({ lifecycle }) => lifecycle.status === PatientProgramStatus.ACTIVE).length,
        completed: items.filter(({ lifecycle }) => lifecycle.status === PatientProgramStatus.COMPLETED).length,
      },
    },
    page: { items, pageSize: 20, nextCursor: null },
  };
}

function render(view: string, items: HospitalReportProgramRow[] = [
  program("33333333-3333-4333-8333-333333333333", PatientProgramStatus.ACTIVE),
  program("44444444-4444-4444-8444-444444444444", PatientProgramStatus.COMPLETED),
], total = items.length): string {
  return renderToStaticMarkup(createElement(HospitalReportWorkspace, {
    hospitals,
    initialView: view,
    page: page(items, total),
    selectedHospitalId: hospitalId,
  }));
}

describe("Hospital reporting dashboard presentation", () => {
  it("shows source-backed grains and a separate card for every Program", () => {
    const markup = render("overview");
    expect(markup).toContain("<h1");
    expect(markup).toContain("Dashboard ภาพรวม");
    expect(markup).toContain("รายงานการจัดบริการ");
    expect(markup).toContain("ความสัมพันธ์ผู้ป่วยกับโรงพยาบาล");
    expect(markup).toContain("Relationship ที่ยังไม่มี Program");
    expect(markup).toContain("ยังสรุปไม่ได้");
    expect(markup).toContain("Before · Baseline");
    expect(markup).toContain("ระหว่าง Program · Follow-up");
    expect(markup).toContain("After · Final Assessment");
    expect(markup).toContain("ยังไม่บันทึก");
    expect(markup).toContain("HbA1c: มีข้อมูลต้นทาง แต่ความหมายหรือหน่วยยังไม่ได้รับรอง");
    expect(markup).toContain("0 กก.");
    expect(markup.match(/Program ID:/gu)).toHaveLength(2);
    expect(markup).toContain("/app/patients/22222222-2222-4222-8222-222222222222/programs/33333333-3333-4333-8333-333333333333/report");
    expect(markup).not.toContain("<table");
  });

  it("shows service presence, recorded targets and all progress facts without claiming delivery or success", () => {
    const markup = render("service", [program("33333333-3333-4333-8333-333333333333", PatientProgramStatus.ACTIVE)]);

    expect(markup).toContain("Service 1 · รู้จักตัวเอง");
    expect(markup).toContain("Service 2 · ทำแผนสุขภาพ / Goal Plan");
    expect(markup).toContain("Service 3 เป็นต้นไป · Follow-up และความคืบหน้า");
    expect(markup).toContain("มีบันทึก");
    expect(markup).toContain("ไม่มีบันทึกใน Program นี้");
    expect(markup).toContain("เดินออกกำลังกาย");
    expect(markup).toContain("เป้าหมาย 3 วัน/สัปดาห์ · 0 นาที");
    expect(markup).toContain("PAM / PROMs: ข้อมูลที่มีไม่ได้ผูกกับ Program นี้ /");
    expect(markup).toContain("จำนวนครั้งที่ผลสำเร็จมากกว่า 70%: ยังไม่มีสูตรคำนวณที่ได้รับรอง");
    expect(markup).toContain("ครั้งที่ 1");
    expect(markup).toContain("บันทึกว่าทำได้บางส่วน");
    expect(markup).toContain("ไม่ใช่คะแนนผลสำเร็จ");
    expect(markup).toContain("อุปสรรค: ไม่มีแหล่งข้อมูลในระบบ");
    expect(markup).toContain("ส่งออก Excel");
  });

  it("does not create a fake Program row when only a relationship without a Program exists", () => {
    const markup = render("overview", [], 0);
    expect(markup).toContain("ยังไม่มี Program ที่รายงานได้");
    expect(markup).toContain("1 relationship ที่ยังไม่มี Program");
    expect(markup).not.toContain("Program ID:");
  });

  it("distinguishes an empty continuation page from an empty Hospital report", () => {
    const markup = render("overview", [], 3);
    expect(markup).toContain("ไม่มี Program ในหน้านี้");
    expect(markup).toContain("กลับไปหน้าแรก");
    expect(markup).not.toContain("ยังไม่มี Program ที่รายงานได้");
  });
});
