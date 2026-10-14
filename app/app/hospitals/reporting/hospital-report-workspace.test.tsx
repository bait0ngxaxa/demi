import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatientProgramStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { HospitalReportFact, HospitalReportProgramRow, HospitalReportingPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { HospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";

import { HospitalReportWorkspace } from "./hospital-report-workspace";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const hospitals: readonly HospitalReportingHospital[] = [{
  id: hospitalId,
  hospitalCode: "DEMO-01",
  name: "โรงพยาบาลทดสอบ",
  status: "ACTIVE" as HospitalReportingHospital["status"],
}];
const hierarchy: HospitalHierarchyContext = {
  hospital: {
    id: hospitalId,
    hospitalCode: "DEMO-01",
    name: "โรงพยาบาลทดสอบ",
    status: "ACTIVE" as HospitalReportingHospital["status"],
    parentHospitalId: null,
  },
  classification: "MAIN",
  parentHospital: null,
  directChildCount: 3,
  directChildren: [
    { id: "child-active", hospitalCode: "DEMO-C1", name: "โรงพยาบาลลูกข่ายที่ใช้งาน", status: "ACTIVE", parentHospitalId: hospitalId },
    { id: "child-pending", hospitalCode: "DEMO-C2", name: "โรงพยาบาลลูกข่ายรอยืนยัน", status: "PENDING_VERIFICATION", parentHospitalId: hospitalId },
    { id: "child-suspended", hospitalCode: "DEMO-C3", name: "โรงพยาบาลลูกข่ายที่ถูกระงับ", status: "SUSPENDED", parentHospitalId: hospitalId },
  ],
  issues: [],
};

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
          category: "EXERCISE",
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
        serviceDate: "2026-08-18",
        planAdjusted: false,
        hasObstacle: true,
        achievement: { achievedDays: 2, targetDays: 3, ratePercent: 67, aboveThreshold: false },
        measurements: {
          bloodSugar: { state: "RECORDED", value: 98 },
          weight: { state: "NOT_RECORDED" },
          waistCircumference: { state: "NOT_RECORDED" },
          systolicBloodPressure: { state: "NOT_RECORDED" },
          diastolicBloodPressure: { state: "NOT_RECORDED" },
        },
        activityProgress: [{ activityCode: "walk", activityLabel: "เดินออกกำลังกาย", status: "PARTIAL", achievedDays: 2 }],
      }],
    },
    finalAssessment: { state: "MISSING" },
    roundVitals: { round1: { state: "MISSING" }, round2: { state: "MISSING" } },
    latestHeightCm: { state: "NOT_RECORDED" },
    bmi: { baseline: { state: "NOT_RECORDED" }, after: { state: "NOT_RECORDED" } },
    screening: { state: "MISSING" },
    illnessDuration: { state: "NOT_RECORDED" },
    unavailable: {
      baselineCvdRiskScore: "SOURCE_MISSING",
      afterCvdRiskScore: "SOURCE_MISSING",
      beforeWeeklyExercise: "NOT_PROGRAM_SCOPED",
      afterWeeklyExercise: "NOT_PROGRAM_SCOPED",
      achievementRate: "DERIVATION_UNAPPROVED",
      outcome: "SOURCE_MISSING",
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
], total = items.length, hierarchyContext: HospitalHierarchyContext = hierarchy): string {
  return renderToStaticMarkup(createElement(HospitalReportWorkspace, {
    hospitals,
    hierarchy: hierarchyContext,
    initialView: view,
    page: page(items, total),
    selectedHospitalId: hospitalId,
  }));
}

describe("Hospital reporting dashboard presentation", () => {
  it("shows source-backed grains and a separate card for every Program", () => {
    const markup = render("overview");
    expect(markup).toContain(`href="/app#hospital-workspace-${hospitalId}"`);
    expect(markup).toContain("<h1");
    expect(markup).toContain("Dashboard ภาพรวม");
    expect(markup).toContain("รายงานการจัดบริการ");
    expect(markup).toContain("ความสัมพันธ์ผู้ป่วยกับโรงพยาบาล");
    expect(markup).toContain("ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program");
    expect(markup).toContain("ยังสรุปไม่ได้");
    expect(markup).toContain("ก่อนเริ่ม · ข้อมูลตั้งต้น");
    expect(markup).toContain("ระหว่าง Program · การติดตามผล");
    expect(markup).toContain("หลัง Program · การประเมินครั้งสุดท้าย");
    expect(markup).toContain("ยังไม่บันทึก");
    expect(markup).toContain("โรงพยาบาลแม่ข่าย");
    expect(markup).toContain("หน่วยบริการในเครือโดยตรง 3 แห่ง");
    expect(markup).toContain("ใช้งานอยู่");
    expect(markup).toContain("โรงพยาบาลลูกข่ายรอยืนยัน");
    expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
    expect(markup).toContain("รายงานนี้เป็นของโรงพยาบาลที่เลือกเท่านั้น");
    expect(markup).toContain("ยังไม่ได้รับอนุญาต");
    expect(markup).toContain("HbA1c: มีข้อมูลต้นทาง แต่ความหมายหรือหน่วยยังไม่ได้รับรอง");
    expect(markup).toContain("0 กก.");
    expect(markup.match(/รหัสผู้ป่วยในโรงพยาบาล/gu)).toHaveLength(2);
    expect(markup).not.toContain("Program ID:");
    expect(markup).not.toContain("Illness duration:");
    expect(markup).toContain("/app/patients/22222222-2222-4222-8222-222222222222/programs/33333333-3333-4333-8333-333333333333/report");
    const visibleText = markup.replace(/<[^>]*>/gu, "");
    expect(visibleText).not.toContain("33333333-3333-4333-8333-333333333333");
    expect(visibleText).not.toContain("walk");
    expect(markup).not.toContain("<table");
  });

  it("shows service presence, recorded targets and all progress facts without claiming delivery or success", () => {
    const markup = render("service", [program("33333333-3333-4333-8333-333333333333", PatientProgramStatus.ACTIVE)]);

    expect(markup).toContain("บริการ 1 · รู้จักตัวเอง");
    expect(markup).toContain("บริการ 2 · ทำแผนสุขภาพ");
    expect(markup).toContain("บริการ 3 เป็นต้นไป · การติดตามผลและความคืบหน้า");
    expect(markup).toContain("มีบันทึก");
    expect(markup).toContain("ไม่มีบันทึกใน Program นี้");
    expect(markup).toContain("เดินออกกำลังกาย");
    expect(markup).toContain("เป้าหมาย 3 วัน/สัปดาห์ · 0 นาที");
    expect(markup).toContain("แบบประเมิน PAM / PROMs: ไม่มีแบบประเมินที่บันทึกในครั้งที่ 1");
    expect(markup).toContain("จำนวนครั้งที่ผลสำเร็จมากกว่า 70%: ดูได้ในไฟล์ Excel (แสดงการติดตามไม่ครบในหน้านี้)");
    expect(markup).toContain("ครั้งที่ 1");
    expect(markup).toContain("วันที่ทำได้ / อัตราความสำเร็จ: 2/3 วัน · 67%");
    expect(markup).toContain("ปรับแผนใหม่: ไม่ปรับ · อุปสรรค: มี");
    expect(markup).toContain("บันทึกว่าทำได้บางส่วน");
    expect(markup).toContain("ไม่ใช่คะแนนผลสำเร็จ");
    expect(markup).toContain("ผลลัพธ์ที่ได้: ไม่มีแหล่งข้อมูลในระบบ");
    expect(markup).toContain("ส่งออก Excel");
  });

  it("uses Global exact-Hospital export and never links ADMIN-only users to Program detail", () => {
    const markup = renderToStaticMarkup(createElement(HospitalReportWorkspace, {
      hospitals,
      hierarchy,
      initialView: "overview",
      page: page([program("33333333-3333-4333-8333-333333333333", PatientProgramStatus.ACTIVE)]),
      selectedHospitalId: hospitalId,
      audience: "GLOBAL_ADMIN",
    }));

    expect(markup).toContain("Platform ADMIN → โรงพยาบาลที่เลือก → รายงาน Patient/Program เฉพาะโรงพยาบาลนี้");
    expect(markup).toContain("ส่งออก Excel");
    expect(markup).not.toContain("/app/patients/");
    expect(markup).toContain("การเปิดรายละเอียด Program ใช้สิทธิ์ Hospital แยกต่างหาก");
    expect(markup).toContain("รายงานนี้ใช้ข้อมูลของ Hospital ที่เลือกเท่านั้น");
  });

  it("does not create a fake Program row when only a relationship without a Program exists", () => {
    const markup = render("overview", [], 0);
    expect(markup).toContain("ยังไม่มี Program ที่รายงานได้");
    expect(markup).toContain("มีความสัมพันธ์ผู้ป่วย 1 รายที่ยังไม่มี Program");
    expect(markup).not.toContain("Program ID:");
  });

  it("distinguishes an empty continuation page from an empty Hospital report", () => {
    const markup = render("overview", [], 3);
    expect(markup).toContain("ไม่มี Program ในหน้านี้");
    expect(markup).toContain("กลับไปหน้าแรก");
    expect(markup).not.toContain("ยังไม่มี Program ที่รายงานได้");
  });

  it("shows a subordinate Hospital's parent identity without sibling structure", () => {
    const childHierarchy: HospitalHierarchyContext = {
      hospital: {
        id: "child-id",
        hospitalCode: "DEMO-CHILD",
        name: "รพ.สต.ทดสอบ",
        status: "ACTIVE" as HospitalReportingHospital["status"],
        parentHospitalId: "parent-id",
      },
      classification: "SUBORDINATE",
      parentHospital: {
        id: "parent-id",
        hospitalCode: "DEMO-PARENT",
        name: "โรงพยาบาลแม่ข่ายทดสอบ",
        status: "ACTIVE" as HospitalReportingHospital["status"],
        parentHospitalId: null,
      },
      directChildCount: 0,
      directChildren: [],
      issues: [],
    };
    const markup = render("overview", [], 0, childHierarchy);

    expect(markup).toContain("รพ.สต.ทดสอบ (DEMO-CHILD)");
    expect(markup).toContain("โรงพยาบาลแม่ข่ายทดสอบ (DEMO-PARENT)");
    expect(markup).not.toContain("โรงพยาบาลลูกข่ายที่ใช้งาน");
    expect(markup).not.toContain("หน่วยบริการในเครือโดยตรง");
    expect(markup).toContain("ข้อมูลผู้ป่วยและ Program ในรายงานนี้เป็นของโรงพยาบาลที่เลือกเท่านั้น");
  });
});
