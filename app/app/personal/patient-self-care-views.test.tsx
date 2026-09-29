import {
  AppointmentLocationType,
  AppointmentStatus,
  AppointmentType,
  FollowupActivityProgressStatus,
  HospitalStatus,
  PatientProgramStatus,
} from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  PatientSelfAppointmentHistory,
  PatientSelfCareJourney,
  PatientSelfFollowupDetail,
  PatientSelfGoalPlanDetail,
  PatientSelfProgramDetail,
} from "@/modules/patient-self/services/patient-self-care-query-service";

import { PatientSelfCareJourneyView } from "./patient-self-care-journey-view";
import {
  PatientSelfAppointmentDetailView,
  PatientSelfAppointmentHistoryView,
  PatientSelfFollowupDetailView,
  PatientSelfGoalPlanDetailView,
} from "./patient-self-record-detail-views";
import { PatientSelfProgramDetailView } from "./patient-self-program-detail-view";
import { PatientSelfRelationshipNavigation } from "./patient-self-relationship-navigation";

const ownRelationship = {
  relationshipId: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "H-001",
  hospitalName: "โรงพยาบาล ก",
  hospitalNumber: "HN-001",
  hospitalStatus: HospitalStatus.SUSPENDED,
};

const anotherRelationship = {
  relationshipId: "22222222-2222-4222-8222-222222222222",
  hospitalCode: "H-002",
  hospitalName: "โรงพยาบาล ข",
  hospitalNumber: null,
  hospitalStatus: HospitalStatus.ACTIVE,
};

const startedAt = new Date("2026-01-03T00:00:00.000Z");
const recordedAt = new Date("2026-08-05T10:30:00.000Z");
const program = {
  status: PatientProgramStatus.COMPLETED,
  startedAt,
  completedAt: recordedAt,
};

const journey: PatientSelfCareJourney = {
  relationship: ownRelationship,
  screenings: [{ submittedAt: recordedAt, status: "RECORDED" }],
  baseline: {
    recordedOn: new Date("2026-01-02T00:00:00.000Z"),
    measurements: {
      weight: 72,
      heightCm: 165,
      waistCircumference: 88,
      systolicBloodPressure: 120,
      diastolicBloodPressure: 80,
      bloodSugarDtx: 106,
      hba1c: 5.6,
    },
  },
  programs: [
    {
      programId: "33333333-3333-4333-8333-333333333333",
      ...program,
    },
  ],
  goalPlans: [
    {
      goalPlanId: "44444444-4444-4444-8444-444444444444",
      roundNumber: 7,
      createdAt: recordedAt,
      primaryGoalLabel: "น้ำหนักลด",
      program,
    },
  ],
  followups: [
    {
      followupId: "55555555-5555-4555-8555-555555555555",
      roundNumber: 7,
      recordedAt,
      program,
    },
  ],
};

const programDetail: PatientSelfProgramDetail = {
  relationship: ownRelationship,
  programId: "33333333-3333-4333-8333-333333333333",
  ...program,
  serviceOne: [
    { label: "Routine", recordedAt },
    { label: "Floating Chart", recordedAt: null },
    { label: "Dream Card", recordedAt },
    { label: "Confidence", recordedAt },
  ],
  goalPlans: journey.goalPlans,
  followups: journey.followups,
  finalAssessment: {
    recordedAt,
    measurements: {
      weight: 68,
      waistCircumference: 84,
      systolicBloodPressure: 118,
      diastolicBloodPressure: 78,
      bloodSugar: 101,
    },
  },
};

const goalPlanDetail: PatientSelfGoalPlanDetail = {
  relationship: ownRelationship,
  ...journey.goalPlans[0],
  primaryGoalNote: "บันทึกเป้าหมายตามที่บันทึกไว้",
  weeklyNote: null,
  items: [
    {
      activityLabel: "เดินออกกำลังกาย",
      targetDays: 3,
      targetValue: 15,
      targetUnit: "minutes",
    },
  ],
};

const followupDetail: PatientSelfFollowupDetail = {
  relationship: ownRelationship,
  ...journey.followups[0],
  measurements: {
    weight: 70,
    waistCircumference: 87,
    systolicBloodPressure: 121,
    diastolicBloodPressure: 81,
    bloodSugar: 109,
  },
  activityProgress: [
    { activityLabel: "เดินออกกำลังกาย", status: FollowupActivityProgressStatus.DONE },
  ],
};

const appointment: PatientSelfAppointmentHistory["appointments"][number] = {
  appointmentId: "66666666-6666-4666-8666-666666666666",
  type: AppointmentType.CONSULTATION,
  scheduledAt: recordedAt,
  durationMinutes: 30,
  locationType: AppointmentLocationType.CLINIC,
  locationDetail: "อาคารผู้ป่วยนอก",
  status: AppointmentStatus.SCHEDULED,
};

describe("Patient Personal care read views", () => {
  it("keeps each Hospital relationship as a separate navigation choice", () => {
    const markup = renderToStaticMarkup(
      <PatientSelfRelationshipNavigation
        emptyMessage="ยังไม่มีประวัติ"
        relationships={[ownRelationship, anotherRelationship]}
      />,
    );

    expect(markup).toContain("โรงพยาบาล ก");
    expect(markup).toContain("โรงพยาบาล ข");
    expect(markup).toContain('href="/app/personal/care/11111111-1111-4111-8111-111111111111"');
    expect(markup).toContain('href="/app/personal/appointments/22222222-2222-4222-8222-222222222222"');
    expect(markup).toContain("สถานะโรงพยาบาล: ถูกระงับการใช้งาน");
    expect(markup).not.toContain("โรงพยาบาลหลัก");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("min-w-0");
  });

  it("shows factual care history including Follow-up round 7 without gated interpretation", () => {
    const markup = renderToStaticMarkup(<PatientSelfCareJourneyView journey={journey} />);

    for (const content of [
      "การคัดกรอง",
      "บันทึกแล้ว",
      "ข้อมูลเริ่มต้น / Baseline",
      "72 kg",
      "165 cm",
      "แผนเป้าหมาย รอบที่ 7",
      "การติดตาม",
      "ติดตาม รอบที่ 7",
      "โปรแกรมการดูแล",
      "โรงพยาบาล ก",
    ]) {
      expect(markup).toContain(content);
    }

    for (const withheld of ["PAM", "PROM", "คะแนน", "ระดับความเสี่ยง", "BMI", "การวินิจฉัย", "คำแนะนำทางการแพทย์"]) {
      expect(markup).not.toContain(withheld);
    }
    expect(markup).not.toContain("<table");
    expect(markup).toContain("break-words");
  });

  it("presents Program and Final records as workflow facts without an outcome judgment", () => {
    const markup = renderToStaticMarkup(
      <PatientSelfProgramDetailView detail={programDetail} relationshipId={ownRelationship.relationshipId} />,
    );

    for (const content of [
      "สิ้นสุดแล้ว",
      "ไม่ใช่การประเมินผลสุขภาพ",
      "Routine",
      "Floating Chart",
      "Dream Card",
      "Confidence",
      "แผนเป้าหมาย รอบที่ 7",
      "ติดตาม รอบที่ 7",
      "การประเมินสิ้นสุด",
      "68 kg",
    ]) {
      expect(markup).toContain(content);
    }

    for (const withheld of ["สำเร็จ", "หายดี", "ผลลัพธ์ทางคลินิก", "confidenceScore", "improvementPlan"]) {
      expect(markup).not.toContain(withheld);
    }
  });

  it("shows canonical Goal Plan and raw Follow-up detail, including round 7", () => {
    const goalMarkup = renderToStaticMarkup(
      <PatientSelfGoalPlanDetailView detail={goalPlanDetail} />,
    );
    const followupMarkup = renderToStaticMarkup(
      <PatientSelfFollowupDetailView detail={followupDetail} />,
    );

    expect(goalMarkup).toContain("แผนเป้าหมาย รอบที่ 7");
    expect(goalMarkup).toContain("เดินออกกำลังกาย");
    expect(goalMarkup).toContain("เป้าหมาย 3 วัน");
    expect(goalMarkup).not.toContain("Health Plan");
    expect(goalMarkup).not.toContain("PAM");

    expect(followupMarkup).toContain("การติดตาม รอบที่ 7");
    expect(followupMarkup).toContain("70 kg");
    expect(followupMarkup).toContain("121 / 81 mmHg");
    expect(followupMarkup).toContain("เดินออกกำลังกาย");
    expect(followupMarkup).not.toContain("confidenceScore");
    expect(followupMarkup).not.toContain("สำเร็จ");
  });

  it("shows appointment facts only and exposes no response or management actions", () => {
    const history: PatientSelfAppointmentHistory = {
      relationship: ownRelationship,
      appointments: [appointment],
    };
    const historyMarkup = renderToStaticMarkup(
      <PatientSelfAppointmentHistoryView history={history} />,
    );
    const detailMarkup = renderToStaticMarkup(
      <PatientSelfAppointmentDetailView detail={{ ...appointment, relationship: ownRelationship }} />,
    );

    for (const content of ["อาคารผู้ป่วยนอก", "30 นาที", "โรงพยาบาล ก"]) {
      expect(historyMarkup).toContain(content);
      expect(detailMarkup).toContain(content);
    }
    for (const withheld of ["ผู้รับผิดชอบ", "เจ้าหน้าที่", "internal note", "responsibleUserId", "ยืนยันนัด", "เลื่อนนัด", "ยกเลิกนัด"]) {
      expect(historyMarkup).not.toContain(withheld);
      expect(detailMarkup).not.toContain(withheld);
    }
    expect(historyMarkup).toContain('href="/app/personal/appointments/11111111-1111-4111-8111-111111111111/66666666-6666-4666-8666-666666666666"');
  });

  it("renders honest empty states across care and appointment history", () => {
    const emptyJourney: PatientSelfCareJourney = {
      relationship: ownRelationship,
      screenings: [],
      baseline: null,
      programs: [],
      goalPlans: [],
      followups: [],
    };
    const emptyProgram: PatientSelfProgramDetail = {
      relationship: ownRelationship,
      programId: "33333333-3333-4333-8333-333333333333",
      status: PatientProgramStatus.ACTIVE,
      startedAt,
      completedAt: null,
      serviceOne: [
        { label: "Routine", recordedAt: null },
        { label: "Floating Chart", recordedAt: null },
        { label: "Dream Card", recordedAt: null },
        { label: "Confidence", recordedAt: null },
      ],
      goalPlans: [],
      followups: [],
      finalAssessment: null,
    };
    const emptyAppointmentHistory: PatientSelfAppointmentHistory = {
      relationship: ownRelationship,
      appointments: [],
    };

    const journeyMarkup = renderToStaticMarkup(
      <PatientSelfCareJourneyView journey={emptyJourney} />,
    );
    const programMarkup = renderToStaticMarkup(
      <PatientSelfProgramDetailView detail={emptyProgram} relationshipId={ownRelationship.relationshipId} />,
    );
    const appointmentMarkup = renderToStaticMarkup(
      <PatientSelfAppointmentHistoryView history={emptyAppointmentHistory} />,
    );

    for (const emptyState of [
      "ยังไม่มีข้อมูลการคัดกรอง",
      "ยังไม่มีข้อมูลเริ่มต้น",
      "ยังไม่มีโปรแกรมการดูแล",
      "ยังไม่มีแผนเป้าหมาย",
      "ยังไม่มีข้อมูลติดตาม",
    ]) {
      expect(journeyMarkup).toContain(emptyState);
    }
    expect(programMarkup).toContain("ยังไม่มีการประเมินสิ้นสุด");
    expect(appointmentMarkup).toContain("ยังไม่มีรายการนัดหมาย");
  });
});
