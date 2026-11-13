import ExcelJS from "exceljs";
import { PatientProgramStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type {
  HospitalReportProgramRow,
  HospitalReportingDataset,
} from "../projections/hospital-report-projection";
import { generateHospitalReportWorkbook } from "./hospital-report-workbook-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const activeProgramId = "33333333-3333-4333-8333-333333333333";
const completedProgramId = "44444444-4444-4444-8444-444444444444";

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
    rounds: [], extraRoundsCompleted: 0,
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
        hba1c: { state: "RECORDED", value: 7.1 },
        confidenceScore: { state: "RECORDED", value: 6 },
        cvdRiskScore: { state: "NOT_RECORDED" },
      },
    },
    serviceOne: {
      routine: { state: "PRESENT", value: { recordedAt: "2026-08-18T05:00:00.000Z" } },
      floatingChart: { state: "MISSING" },
      dreamCard: { state: "MISSING" },
      // R1-E: the Before ruler (column M) is the round-1 ไม้บรรทัดวัดใจ, not the Baseline score.
      confidence: { state: "PRESENT", value: { recordedAt: "2026-07-02T03:00:00.000Z", score: 6 } },
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
    roundVitals: { round1: { state: "MISSING" }, round2: { state: "MISSING" } },
    latestHeightCm: { state: "NOT_RECORDED" },
    bmi: { baseline: { state: "NOT_RECORDED" }, after: { state: "NOT_RECORDED" } },
    screening: { pam: { state: "MISSING" }, proms: { state: "MISSING" } },
    illnessDuration: { state: "NOT_RECORDED" },
    weeklyExercise: { before: { state: "NOT_RECORDED" }, after: { state: "NOT_RECORDED" } },
    unavailable: {
      outcome: "SOURCE_MISSING",
    },
  };
}

function dataset(): HospitalReportingDataset {
  return {
    hospital: { id: hospitalId, hospitalCode: "DEMO-A", name: "โรงพยาบาลทดสอบ" },
    cohort: "ACTIVE",
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
  it("keeps columns 1-6 and exports completed extras, not-done and patient-recorded counts", async () => {
    const record = program({ id: activeProgramId, status: PatientProgramStatus.ACTIVE });
    record.rounds = Array.from({ length: 8 }, (_, index) => ({ roundNumber: index + 1, title: `ครั้งที่ ${index + 1}`, completed: true, plannedItems: 3, doneItems: 1, skippedItems: 2, notDoneAtCloseItems: 2, patientRecordedItems: 1, vitals: { weight: 66, bloodSugar: 123 } }));
    record.extraRoundsCompleted = 2;
    const workbook = new ExcelJS.Workbook();
    const bytes = await generateHospitalReportWorkbook({ ...dataset(), programs: [record] });
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    const dashboard = workbook.getWorksheet("Dashboard ภาพรวม");
    const service = workbook.getWorksheet("รายงานการจัดบริการ");
    expect(dashboard?.getCell("AR8").value).toBe("ครั้งเพิ่มเติม (จำนวน)");
    expect(dashboard?.getCell("AR9").value).toBe(2);
    expect(dashboard?.getCell("W9").value).toBe(123);
    expect(dashboard?.getCell("X9").value).toBe(66);
    expect(service?.getCell("BN9").value).toBe(2);
    expect(dashboard?.getCell("AS8").text).toContain("ครั้งที่ 1");
    expect(dashboard?.getCell("AX8").text).toContain("ครั้งที่ 6");
    expect(dashboard?.getCell("AS9").text).toContain("ทำแล้ว 1/3");
    expect(dashboard?.getCell("AS9").text).toContain("ยังไม่ได้ทำเมื่อจบบริการ 2");
    expect(dashboard?.getCell("AY9").text).toContain("ครั้งที่ 8");
    expect(dashboard?.getCell("AY9").text).toContain("ผู้ป่วยบันทึกเอง 1");
  });

  it("generates the two customer worksheets, retains zero/missing distinctions and continues all Follow-ups", async () => {
    const bytes = await generateHospitalReportWorkbook(dataset(), new Date("2026-10-11T05:00:00.000Z"));
    const workbook = new ExcelJS.Workbook();
    const workbookBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (!(workbookBytes instanceof ArrayBuffer)) throw new Error("Workbook bytes are unavailable");
    await workbook.xlsx.load(workbookBytes);

    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      "Dashboard ภาพรวม",
      "รายงานการจัดบริการ",
      "คำอธิบาย",
    ]);

    const dashboard = workbook.getWorksheet("Dashboard ภาพรวม");
    const service = workbook.getWorksheet("รายงานการจัดบริการ");
    expect(dashboard).toBeDefined();
    expect(service).toBeDefined();
    if (!dashboard || !service) throw new Error("Expected report sheets to exist");

    expect(dashboard.getCell("A1").value).toContain("โรงพยาบาลทดสอบ");
    expect(dashboard.getCell("A1").value).not.toContain("DEMO-A");
    expect(dashboard.getCell("B2").value).toBe(1);
    expect(dashboard.getCell("C2").value).toBe("เบาหวาน (DM)");
    expect(dashboard.getCell("D2").value ?? null).toBeNull();
    expect(dashboard.columnCount).toBe(52);
    expect(dashboard.getCell("B9").value).toBe("สมชาย");
    expect(dashboard.getCell("C9").value).toBe("ใจดี");
    expect(dashboard.getCell("D9").value).toBe("LOCAL-001");
    expect(dashboard.getCell("J9").value).toBeNull();
    expect(dashboard.getCell("K9").value).toBe(0);
    // No round vitals recorded for rounds 1-2 in this fixture.
    expect(dashboard.getCell("Q9").value).toBeNull();
    expect(dashboard.getCell("Q10").value).toBeNull();
    expect(dashboard.getCell("W9").value).toBe(1);
    expect(dashboard.getCell("W10").value).toBeNull();
    expect(dashboard.getCell("AZ9").text).toContain("ครั้งที่ 7");
    expect(dashboard.getCell("AZ9").text).toContain("น้ำตาล 5");
    expect(dashboard.getCell("AC10").value).toBeNull();
    expect(dashboard.getCell("AZ9").text).toContain("ครั้งที่ 9");
    expect(dashboard.getCell("A10").value).toBe("");
    expect(dashboard.getCell("B10").value).toBe("สมชาย");
    expect(dashboard.getCell("D10").value).toBe("LOCAL-001");
    expect(dashboard.getCell("A11").value).toBe(2);
    expect(dashboard.getCell("AI9").value).toBeNull();
    expect(dashboard.getCell("AI11").value).toBeInstanceOf(Date);
    // D7/D8: CVD not recorded on this Baseline; HbA1c is approved and reported as recorded.
    expect(dashboard.getCell("H9").value).toBeNull();
    expect(dashboard.getCell("I9").value).toBe(7.1);
    expect(dashboard.getCell("AJ9").value).toBeNull();
    expect(dashboard.getCell("W11").value).toBeNull();

    expect(service.getCell("A1").value).toBe("Service Process record");
    expect(service.getCell("A2").value).toContain("โรงพยาบาลทดสอบ");
    expect(service.getCell("A2").value).not.toContain("DEMO-A");
    expect(service.getCell("B3").value).toBe(1);
    expect(service.columnCount).toBe(74);
    expect(service.getCell("B9").value).toBe("สมชาย");
    expect(service.getCell("D9").value).toBe("LOCAL-001");
    expect(service.getCell("S8").value).toBe("ทำ");
    expect(service.getCell("T9").value).toBe("\u2713");
    expect(service.getCell("W9").value).toBe("\u2713");
    expect(service.getCell("AD9").value).toBe("\u2713");
    expect(service.getCell("AF9").value).toBe(3);
    // The exercise target is in "นาที", not the "minutes" unit, so the weekly total cannot be computed.
    expect(service.getCell("AG9").value).toBeNull();
    expect(service.getCell("AH9").value).toBeInstanceOf(Date);
    expect(service.getCell("AH10").value).toBeNull();
    expect(service.getCell("BV9").text).toContain("ครั้งที่ 7");
    expect(service.getCell("AH11").value).toBeNull();
    expect(service.getCell("A10").value).toBe("");
    expect(service.getCell("B10").value).toBe("สมชาย");
    expect(service.getCell("D10").value).toBe("LOCAL-001");
    expect(service.getCell("A11").value).toBe(2);
    // D8/D9: confidence ruler 0-10 from the Baseline; self-reported exercise with no entries.
    expect(service.getCell("M9").value).toBe(6);
    expect(service.getCell("N9").value).toBeNull();
    expect(service.getCell("Q9").value).toBeNull();

    const serialized = JSON.stringify({ dashboard: dashboard.getSheetValues(), service: service.getSheetValues() });
    expect(serialized).not.toContain("ไม่มีแหล่งข้อมูลในระบบ");
    expect(serialized).not.toContain("รายละเอียดเป้าหมายและความคืบหน้าที่บันทึก");
    expect(serialized).not.toContain("generatedAt");
  });

  it("keeps only the template-native Service Process guidance when there are few Programs", async () => {
    const bytes = await generateHospitalReportWorkbook(dataset(), new Date("2026-10-11T05:00:00.000Z"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

    // Template data-entry grids: Dashboard rows 9–29, รายงานการจัดบริการ rows 9–30. This fixture fills 2 and 3 rows.
    for (const [name, gridEnd, dataEnd] of [["Dashboard ภาพรวม", 29, 11], ["รายงานการจัดบริการ", 30, 11]] as const) {
      const sheet = workbook.getWorksheet(name)!;
      for (let rowNumber = dataEnd + 1; rowNumber <= gridEnd; rowNumber += 1) {
        const values = (sheet.getRow(rowNumber).values as unknown[]).filter((value) => value !== null && value !== undefined && value !== "");
        expect({ name, rowNumber, values }).toEqual({ name, rowNumber, values: [] });
      }
      for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
        expect(sheet.getCell(rowNumber, 1).value).not.toBe("หมายเหตุ");
      }
    }
    const service = workbook.getWorksheet("รายงานการจัดบริการ")!;
    expect(service.getCell("AH31").value).toBe("หมายเหตุ");
    expect(service.getCell("AI35").value).toContain("ติดตามประมาณ 2-4 ครั้ง/โปรแกรม");
    expect(service.getCell("AH37").value).toContain("ภาพรวมความครบถ้วนการจัดบริการ");
    expect(JSON.stringify(service.getSheetValues())).not.toContain("รายละเอียดเป้าหมายและความคืบหน้าที่บันทึก");
  });

  it("continues rows inside the customer columns and shifts native guidance below overflow data", async () => {
    const many = dataset();
    many.programs = Array.from({ length: 25 }, (_, index) =>
      program({ id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`, status: PatientProgramStatus.ACTIVE }));
    const bytes = await generateHospitalReportWorkbook(many, new Date("2026-10-11T05:00:00.000Z"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const dashboard = workbook.getWorksheet("Dashboard ภาพรวม")!;
    const service = workbook.getWorksheet("รายงานการจัดบริการ")!;
    expect(dashboard.getCell(33, 2).value).toBe("สมชาย");
    expect(service.getCell(33, 2).value).toBe("สมชาย");
    expect(dashboard.columnCount).toBe(52);
    expect(service.columnCount).toBe(74);
    expect(service.getCell("AH34").value).toBe("หมายเหตุ");
    expect(service.getCell("AH40").value).toContain("ภาพรวมความครบถ้วนการจัดบริการ");
  });

  it("keeps the canonical empty workbook structure when there are no Programs", async () => {
    const empty = dataset();
    empty.programs = [];
    empty.counts.programs = { grain: "PATIENT_PROGRAM", total: 0, active: 0, completed: 0 };
    const bytes = await generateHospitalReportWorkbook(empty, new Date("2026-10-11T05:00:00.000Z"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

    expect(workbook.worksheets.map(({ name }) => name)).toEqual(["Dashboard ภาพรวม", "รายงานการจัดบริการ", "คำอธิบาย"]);
    expect(workbook.getWorksheet("Dashboard ภาพรวม")?.columnCount).toBe(52);
    expect(workbook.getWorksheet("รายงานการจัดบริการ")?.columnCount).toBe(74);
    expect(workbook.getWorksheet("Dashboard ภาพรวม")?.getCell("A9").value ?? null).toBeNull();
    expect(workbook.getWorksheet("รายงานการจัดบริการ")?.getCell("A9").value ?? null).toBeNull();
  });
});

// Every explanatory text the workbook used to write for a missing, not-recorded or unavailable value.
const REMOVED_PLACEHOLDERS = [
  "ยังไม่บันทึก",
  "ไม่ได้บันทึก",
  "ไม่มีบันทึก",
  "ไม่มี Baseline ที่เชื่อมกับ Program",
  "ไม่มี Final Assessment",
  "ไม่มีแบบประเมินที่บันทึกในครั้งที่ 1",
  "ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้",
  "ไม่มีข้อมูล",
  "ครั้งนี้ไม่ได้ติดตามผล",
  "ไม่มีแหล่งข้อมูลในระบบ",
  "ยังไม่พร้อมใช้งาน",
  "ไม่ระบุชื่อ",
  "ไม่ระบุนามสกุล",
  "ไม่ทราบปีวินิจฉัย",
  "มอบหมายปัจจุบัน",
  "ยังไม่เปิดครั้งบริการ",
  "ไม่มีครั้งเพิ่มเติม",
  "ไม่มีการติดตาม",
  "ไม่มี Follow-up ในช่องที่เหลือ",
  "ไม่มี Goal Plan ที่ผูกกับ Program นี้",
  "ยังดำเนิน Program",
  "ยังไม่มีนิยามและตัวหารที่ได้รับรอง",
] as const;

async function loadSheets(input: HospitalReportingDataset): Promise<{ dashboard: ExcelJS.Worksheet; service: ExcelJS.Worksheet }> {
  const bytes = await generateHospitalReportWorkbook(input, new Date("2026-10-11T05:00:00.000Z"));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  const dashboard = workbook.getWorksheet("Dashboard ภาพรวม");
  const service = workbook.getWorksheet("รายงานการจัดบริการ");
  if (!dashboard || !service) throw new Error("Expected report sheets to exist");
  return { dashboard, service };
}

function dataRowTexts(sheet: ExcelJS.Worksheet, rows: readonly number[]): string[] {
  return rows.flatMap((rowNumber) => {
    const texts: string[] = [];
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => texts.push(cell.text));
    return texts;
  });
}

function emptyValue(sheet: ExcelJS.Worksheet, address: string): unknown {
  return sheet.getCell(address).value ?? null;
}

describe("Hospital reporting workbook blanks", () => {
  function missingEverything(): HospitalReportProgramRow {
    const record = program({ id: activeProgramId, status: PatientProgramStatus.ACTIVE, followups: 6 });
    return {
      ...record,
      patient: { displayName: "ไม่ทราบ", givenName: null, familyName: null, hospitalNumber: { state: "NOT_RECORDED" } },
      currentRelationshipOsmAssignment: { state: "MISSING" },
      baseline: { state: "MISSING" },
      finalAssessment: { state: "MISSING" },
      serviceOne: { ...record.serviceOne, confidence: { state: "MISSING" } },
      goalPlans: { totalCount: 0, hasMore: false, items: [] },
      rounds: [
        { roundNumber: 5, title: "ครั้งที่ 5", completed: true, vitals: null, doneItems: 0, plannedItems: 0, skippedItems: 0, notDoneAtCloseItems: 0, patientRecordedItems: 0, achieveScore: null, followup: null },
        { roundNumber: 7, title: "ครั้งที่ 7", completed: false, vitals: null, doneItems: 0, plannedItems: 1, skippedItems: 0, notDoneAtCloseItems: 0, patientRecordedItems: 0, achieveScore: null, followup: null },
      ],
    };
  }

  it("leaves every missing, not-recorded and unavailable value empty and writes no placeholder text", async () => {
    const { dashboard, service } = await loadSheets({ ...dataset(), programs: [missingEverything()] });

    // Identity: name, family name, HN, illness duration, current อสม. assignment.
    for (const sheet of [dashboard, service]) {
      for (const column of ["B", "C", "D", "E", "F"]) expect(emptyValue(sheet, `${column}9`), `${sheet.name}!${column}9`).toBeNull();
      expect(emptyValue(sheet, "D2")).toBeNull();
    }
    expect(emptyValue(service, "D3")).toBeNull();
    expect(emptyValue(service, "D4")).toBeNull();
    // Dashboard: Baseline H–P, rounds 1–2 vitals and score, round 5 ended without Follow-up, end date, Final Assessment AJ–AQ.
    for (const column of ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "AC", "AD", "AE", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ"]) {
      expect(emptyValue(dashboard, `${column}9`), `Dashboard!${column}9`).toBeNull();
    }
    // Service: end date, Baseline, PAM/PROMs, ruler, exercise, Final Assessment, >70% count, Goal Plan, Follow-up gaps.
    for (const column of ["H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "Y", "Z", "AC", "AD", "AE", "AF", "AG", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AX", "AY", "AZ", "BA", "BB", "BC", "BD", "BE"]) {
      expect(emptyValue(service, `${column}9`), `Service!${column}9`).toBeNull();
    }
    // Rounds never opened, and the Follow-up list after round 4 has two items but no measurements beyond DTX.
    expect(emptyValue(dashboard, "AS9")).toBeNull();
    expect(dashboard.getCell("AY9").text).toBe("ครั้งที่ 7 (ยังไม่จบบริการ): ทำแล้ว 0/1 รายการในแผน; ข้าม 0; ยังไม่ได้ทำเมื่อจบบริการ 0; ผู้ป่วยบันทึกเอง 0");
    expect(dashboard.getCell("AZ9").text).toBe([
      "ครั้งที่ 7: 2026-08-21T05:00:00.000Z; น้ำตาล 5",
      "ครั้งที่ 8: 2026-08-22T05:00:00.000Z; น้ำตาล 6",
    ].join("\n"));

    const texts = [...dataRowTexts(dashboard, [9, 10]), ...dataRowTexts(service, [9, 10])];
    for (const placeholder of REMOVED_PLACEHOLDERS) {
      expect(texts.filter((text) => text.includes(placeholder)), placeholder).toEqual([]);
    }
  });

  it("leaves the multi-record cells empty when there is nothing to list", async () => {
    const { dashboard, service } = await loadSheets({ ...dataset(), programs: [program({ id: completedProgramId, status: PatientProgramStatus.COMPLETED })] });
    for (const [sheet, extraRounds, extraFollowups] of [[dashboard, "AY", "AZ"], [service, "BU", "BV"]] as const) {
      expect(emptyValue(sheet, `${extraRounds}9`)).toBeNull();
      expect(emptyValue(sheet, `${extraFollowups}9`)).toBeNull();
    }
  });

  it("keeps recorded zeros as 0", async () => {
    const record = program({ id: completedProgramId, status: PatientProgramStatus.COMPLETED, followups: 1 });
    const [followup] = record.followups.items;
    if (!followup) throw new Error("Expected a Follow-up");
    record.followups = {
      ...record.followups,
      items: [{ ...followup, achievement: { achievedDays: 0, targetDays: 3, ratePercent: 0, aboveThreshold: false }, measurements: { ...followup.measurements, bloodSugar: { state: "RECORDED", value: 0 } } }],
    };
    record.illnessDuration = { state: "RECORDED", value: 0 };
    record.weeklyExercise = { before: { state: "RECORDED", value: 0 }, after: { state: "NOT_RECORDED" } };
    const { dashboard, service } = await loadSheets({ ...dataset(), programs: [record] });

    expect(dashboard.getCell("E9").value).toBe(0);
    expect(dashboard.getCell("K9").value).toBe(0);
    expect(dashboard.getCell("M9").value).toBe(0);
    expect(dashboard.getCell("W9").value).toBe(0);
    expect(dashboard.getCell("Y9").value).toBe(0);
    expect(service.getCell("N9").value).toBe(0);
    expect(service.getCell("R9").value).toBe(0);
    expect(service.getCell("AI9").value).toBe(0);
    expect(service.getCell("AJ9").value).toBe(0);
  });
});

describe("Hospital reporting workbook check marks and explanation sheet", () => {
  const CHECK = "\u2713";

  async function loadWorkbook(input: HospitalReportingDataset): Promise<ExcelJS.Workbook> {
    const bytes = await generateHospitalReportWorkbook(input, new Date("2026-10-11T05:00:00.000Z"));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
    return workbook;
  }

  function pairs(record: HospitalReportProgramRow): HospitalReportProgramRow {
    const [first] = record.followups.items;
    if (!first) throw new Error("Expected Follow-ups");
    const followups = [
      { ...first, roundNumber: 1, planAdjusted: true, hasObstacle: false },
      { ...first, roundNumber: 2, planAdjusted: false, hasObstacle: true },
      { ...first, roundNumber: 3, planAdjusted: null, hasObstacle: null },
      { ...first, roundNumber: 5, planAdjusted: true, hasObstacle: null },
    ];
    return { ...record, followups: { totalCount: followups.length, hasMore: false, items: followups } };
  }

  it("marks the applicable pair column with a centered ✓ and leaves unknown answers empty", async () => {
    const workbook = await loadWorkbook({ ...dataset(), programs: [pairs(program({ id: activeProgramId, status: PatientProgramStatus.ACTIVE, followups: 1 }))] });
    const service = workbook.getWorksheet("รายงานการจัดบริการ");
    if (!service) throw new Error("Expected the service sheet");
    const pair = (left: string): [unknown, unknown] => {
      const right = service.getColumn(service.getColumn(left).number + 1).letter;
      return [service.getCell(`${left}9`).value ?? null, service.getCell(`${right}9`).value ?? null];
    };

    // Service 1 presence (BR-02): routine recorded; floating chart and dream card not recorded -> ไม่ทำ.
    expect(pair("S")).toEqual([null, CHECK]);
    expect(pair("U")).toEqual([null, CHECK]);
    expect(pair("W")).toEqual([CHECK, null]);
    // Goal Plan (BR-03): no food items -> ไม่มี both; exercise item -> มี.
    expect(pair("Y")).toEqual([null, CHECK]);
    expect(pair("AA")).toEqual([null, CHECK]);
    expect(pair("AD")).toEqual([CHECK, null]);
    // Follow-ups 1-3: true, false, null for ปรับแผน / อุปสรรค.
    expect(pair("AL")).toEqual([CHECK, null]);
    expect(pair("AN")).toEqual([null, CHECK]);
    expect(pair("AT")).toEqual([null, CHECK]);
    expect(pair("AV")).toEqual([CHECK, null]);
    expect(pair("BB")).toEqual([null, null]);
    expect(pair("BD")).toEqual([null, null]);

    for (const column of ["S", "T", "W", "X", "AL", "AM", "BB", "BC"]) {
      expect(service.getCell(`${column}9`).alignment, column).toMatchObject({ horizontal: "center", vertical: "middle" });
    }
    // Other cells keep their style: the data cell next to the pairs and the unused template grid rows.
    expect(service.getCell("AH9").alignment).toEqual(service.getCell("AH12").alignment);
    expect(service.getCell("AK9").alignment).toEqual(service.getCell("AK12").alignment);
    expect(service.getCell("S12").alignment?.horizontal).toBeUndefined();
    expect(service.getCell("AL12").alignment?.horizontal).toBeUndefined();

    // Free text keeps the words and drops the unknown answer.
    const extraFollowups = service.getCell("BV9").text;
    expect(extraFollowups).toContain("ปรับแผน ปรับ");
    expect(extraFollowups).not.toContain("อุปสรรค");
    expect(extraFollowups).not.toContain(CHECK);
  });

  it("appends the explanation sheet last and lists exactly the never-filled cells", async () => {
    const workbook = await loadWorkbook(dataset());
    const names = workbook.worksheets.map(({ name }) => name);
    expect(names.at(-1)).toBe("คำอธิบาย");
    const sheet = workbook.getWorksheet("คำอธิบาย");
    if (!sheet) throw new Error("Expected the explanation sheet");

    const rows = Array.from({ length: sheet.rowCount }, (_, index) => (sheet.getRow(index + 1).values as unknown[]).slice(1));
    expect(rows[2]?.[0]).toBe("ช่องว่าง");
    expect(rows[3]?.[0]).toBe(CHECK);
    const listStart = rows.findIndex((row) => row[0] === "แผ่นงาน") + 1;
    expect(listStart).toBeGreaterThan(0);
    expect(rows.slice(listStart)).toEqual([
      ["Dashboard ภาพรวม", "D2", "เบาหวาน (DM)"],
      ["Dashboard ภาพรวม", "D3", "กลุ่มเสี่ยง (Pre-DM)"],
      ["รายงานการจัดบริการ", "D3", "เบาหวาน (DM)"],
      ["รายงานการจัดบริการ", "D4", "กลุ่มเสี่ยง (Pre-DM)"],
      ["รายงานการจัดบริการ", "AK", "บริการครั้งที่ 3 : ติดตามการฝึกซ้อมพฤติกรรม · ผลลัพธ์ที่ได้"],
      ["รายงานการจัดบริการ", "AS", "บริการครั้งที่ 4 : ติดตามการฝึกซ้อมพฤติกรรม · ผลลัพธ์ที่ได้"],
      ["รายงานการจัดบริการ", "BA", "บริการครั้งที่ 5 : ติดตามการฝึกซ้อมพฤติกรรม · ผลลัพธ์ที่ได้"],
      ["รายงานการจัดบริการ", "BI", "บริการครั้งที่ 6 : ติดตามการฝึกซ้อมพฤติกรรม · ผลลัพธ์ที่ได้"],
    ]);

    // Every listed cell is empty in the data the workbook exported.
    const service = workbook.getWorksheet("รายงานการจัดบริการ");
    const dashboard = workbook.getWorksheet("Dashboard ภาพรวม");
    if (!service || !dashboard) throw new Error("Expected report sheets to exist");
    for (const column of ["AK", "AS", "BA", "BI"]) {
      for (const rowNumber of [9, 10, 11]) expect(service.getCell(`${column}${rowNumber}`).value ?? null, `${column}${rowNumber}`).toBeNull();
    }
    for (const [target, address] of [[dashboard, "D2"], [dashboard, "D3"], [service, "D3"], [service, "D4"]] as const) {
      expect(target.getCell(address).value ?? null, `${target.name}!${address}`).toBeNull();
    }
  });
});
