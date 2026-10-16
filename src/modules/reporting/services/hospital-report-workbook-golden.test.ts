import { readFile } from "node:fs/promises";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { PatientProgramStatus } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  HospitalReportFollowup,
  HospitalReportProgramRow,
  HospitalReportingDataset,
} from "../projections/hospital-report-projection";
import { generateHospitalReportWorkbook } from "./hospital-report-workbook-service";

/**
 * Golden column contract for the customer workbook DoD (BF-GAP-WB-00 §4).
 * Every customer column of the first data row is pinned. When a slice closes a
 * gap, update the expected value and its DoD status in the same change.
 */

type DodStatus = "SOURCE_READY" | "DECISION_OPEN" | "SOURCE_MISSING";
type CellValue = string | number | null;
type ColumnContract = readonly [column: string, expected: CellValue, status: DodStatus];

const SOURCE_MISSING = "ไม่มีแหล่งข้อมูลในระบบ";
const SEMANTICS_UNAPPROVED = "ยังไม่พร้อมใช้งาน: หน่วยหรือความหมายยังไม่ได้รับรอง";
const NOT_PROGRAM_SCOPED = "ยังไม่พร้อมใช้งาน: ไม่มีข้อมูลที่ผูกกับ Program นี้";
const DERIVATION_UNAPPROVED = "ยังไม่พร้อมใช้งาน: ยังไม่มีสูตรที่ได้รับรอง";
const NO_MORE_FOLLOWUPS = "ไม่มี Follow-up ในช่องที่เหลือ";
const DISCLOSURE_UNAPPROVED = "ยังไม่พร้อมใช้งาน: รอฐานความยินยอมการเปิดเผยข้อมูล";
const UNAVAILABLE_LABELS = new Set([
  SOURCE_MISSING,
  SEMANTICS_UNAPPROVED,
  NOT_PROGRAM_SCOPED,
  DERIVATION_UNAPPROVED,
  DISCLOSURE_UNAPPROVED,
]);

const programId = "33333333-3333-4333-8333-333333333333";
const STARTED_AT = "2026-07-01T03:00:00.000Z";
const COMPLETED_AT = "2026-10-01T03:00:00.000Z";

// Follow-ups 1–4 carry the new structured facts; Follow-up 5 is a legacy record without them.
const ACHIEVED_DAYS = [3, 2, 3, 1] as const;
const FOLLOWUP_TARGET_DAYS = 3;

function followupAt(index: number): HospitalReportFollowup {
  const achievedDays = ACHIEVED_DAYS[index];
  const recordedAt = `2026-0${7 + Math.floor(index / 2)}-${index % 2 === 0 ? "10" : "24"}T03:00:00.000Z`;
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
    roundNumber: index + 1,
    recordedAt,
    // Service dates are a day earlier than the recorded date to prove the report uses them.
    serviceDate: achievedDays === undefined ? null : `2026-0${7 + Math.floor(index / 2)}-${index % 2 === 0 ? "09" : "23"}`,
    planAdjusted: achievedDays === undefined ? null : index % 2 === 1,
    hasObstacle: achievedDays === undefined ? null : index === 3,
    achievement: achievedDays === undefined
      ? null
      : {
          achievedDays,
          targetDays: FOLLOWUP_TARGET_DAYS,
          ratePercent: Math.round((achievedDays * 100) / FOLLOWUP_TARGET_DAYS),
          aboveThreshold: achievedDays * 100 > 70 * FOLLOWUP_TARGET_DAYS,
        },
    measurements: {
      bloodSugar: { state: "RECORDED", value: 120 - index },
      weight: { state: "RECORDED", value: 72 - index * 0.5 },
      waistCircumference: { state: "NOT_RECORDED" },
      systolicBloodPressure: { state: "NOT_RECORDED" },
      diastolicBloodPressure: { state: "NOT_RECORDED" },
    },
    activityProgress: [{
      activityCode: "exercise_walk",
      activityLabel: "เดินออกกำลังกาย",
      status: "DONE",
      achievedDays: achievedDays ?? null,
    }],
  };
}

const NO_ACHIEVEMENT = "ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้";

function rateCell(followup: HospitalReportFollowup): CellValue {
  return followup.achievement === null ? NO_ACHIEVEMENT : followup.achievement.ratePercent / 100;
}

function roundVitals(
  serviceDate: string,
  bloodSugar: number,
  weight: number,
): HospitalReportProgramRow["roundVitals"]["round1"] {
  return {
    state: "PRESENT",
    value: {
      serviceDate,
      measurements: {
        bloodSugar: { state: "RECORDED", value: bloodSugar },
        weight: { state: "RECORDED", value: weight },
        waistCircumference: { state: "NOT_RECORDED" },
        systolicBloodPressure: { state: "NOT_RECORDED" },
        diastolicBloodPressure: { state: "NOT_RECORDED" },
      },
      heightCm: { state: "RECORDED", value: 162 },
    },
  };
}

const FOLLOWUPS = Array.from({ length: 5 }, (_, index) => followupAt(index));

function goldenProgram(): HospitalReportProgramRow {
  return {
    patientProgramId: programId,
    patientHospitalRelationshipId: "22222222-2222-4222-8222-222222222222",
    patient: {
      displayName: "สมหญิง รักษ์สุขภาพ",
      givenName: "สมหญิง",
      familyName: "รักษ์สุขภาพ",
      hospitalNumber: { state: "RECORDED", value: "HN-0001" },
    },
    currentRelationshipOsmAssignment: {
      state: "PRESENT",
      value: { displayName: "อสม. สมศรี", assignedAt: "2026-06-15T03:00:00.000Z" },
    },
    lifecycle: {
      status: PatientProgramStatus.COMPLETED,
      startedAt: STARTED_AT,
      completedAt: { state: "RECORDED", value: COMPLETED_AT },
    },
    baseline: {
      state: "PRESENT",
      value: {
        recordedOn: "2026-06-30T00:00:00.000Z",
        measurements: {
          bloodSugar: { state: "RECORDED", value: 128 },
          weight: { state: "RECORDED", value: 74.5 },
          waistCircumference: { state: "RECORDED", value: 92 },
          systolicBloodPressure: { state: "RECORDED", value: 138 },
          diastolicBloodPressure: { state: "RECORDED", value: 88 },
        },
        heightCm: { state: "RECORDED", value: 162 },
        hba1c: { state: "RECORDED", value: 7.4 },
        confidenceScore: { state: "RECORDED", value: 6 },
        cvdRiskScore: { state: "RECORDED", value: 12.5 },
      },
    },
    serviceOne: {
      routine: { state: "PRESENT", value: { recordedAt: "2026-07-02T03:00:00.000Z" } },
      floatingChart: { state: "PRESENT", value: { recordedAt: "2026-07-02T03:00:00.000Z" } },
      dreamCard: { state: "MISSING" },
      confidence: { state: "PRESENT", value: { recordedAt: "2026-07-02T03:00:00.000Z" } },
    },
    goalPlans: {
      totalCount: 1,
      hasMore: false,
      items: [{
        id: "55555555-5555-4555-8555-555555555555",
        roundNumber: 1,
        primaryGoalCode: "weight",
        primaryGoalLabel: "น้ำหนักลด",
        items: [
          {
            activityCode: "stop_sweet",
            activityLabel: "ลดหวาน",
            category: "FOOD",
            targetDays: 4,
            targetValue: { state: "NOT_RECORDED" },
            targetUnit: { state: "NOT_RECORDED" },
          },
          {
            activityCode: "exercise_walk",
            activityLabel: "เดินออกกำลังกาย",
            category: "EXERCISE",
            targetDays: 3,
            targetValue: { state: "RECORDED", value: 30 },
            targetUnit: { state: "RECORDED", value: "minutes" },
          },
        ],
      }],
    },
    followups: { totalCount: FOLLOWUPS.length, items: FOLLOWUPS, hasMore: false },
    finalAssessment: {
      state: "PRESENT",
      value: {
        recordedAt: "2026-09-30T03:00:00.000Z",
        serviceDate: "2026-09-29",
        measurements: {
          bloodSugar: { state: "RECORDED", value: 108 },
          weight: { state: "RECORDED", value: 69 },
          waistCircumference: { state: "RECORDED", value: 86 },
          systolicBloodPressure: { state: "RECORDED", value: 126 },
          diastolicBloodPressure: { state: "RECORDED", value: 80 },
        },
        hba1c: { state: "RECORDED", value: 6.8 },
        cvdRiskScore: { state: "RECORDED", value: 9.8 },
      },
    },
    roundVitals: {
      round1: roundVitals("2026-07-02", 118, 74),
      round2: roundVitals("2026-07-09", 112, 73),
    },
    latestHeightCm: { state: "RECORDED", value: 162 },
    bmi: {
      baseline: { state: "RECORDED", value: 28.4 },
      after: { state: "RECORDED", value: 26.3 },
    },
    screening: {
      state: "PRESENT",
      value: { submittedAt: "2026-07-02T03:00:00.000Z", pamScore: 15, promsScore: 18 },
    },
    illnessDuration: { state: "RECORDED", value: 9 },
    weeklyExercise: { before: { state: "RECORDED", value: 37.5 }, after: { state: "RECORDED", value: 150 } },
    unavailable: {
      achievementRate: "DERIVATION_UNAPPROVED",
      outcome: "SOURCE_MISSING",
    },
  };
}

function goldenDataset(): HospitalReportingDataset {
  return {
    hospital: { id: "11111111-1111-4111-8111-111111111111", hospitalCode: "GOLD-01", name: "รพ.สต. ทดสอบ" },
    counts: {
      patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 1 },
      relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: 0 },
      programs: { grain: "PATIENT_PROGRAM", total: 1, active: 0, completed: 1 },
    },
    programs: [goldenProgram()],
  };
}

const DATE_CELLS: Readonly<Record<string, string>> = {
  [STARTED_AT]: "date:2026-07-01",
  [COMPLETED_AT]: "date:2026-10-01",
};

function dateToken(iso: string): string {
  return DATE_CELLS[iso] ?? `date:${iso.slice(0, 10)}`;
}

const DASHBOARD_ROUND_LETTERS = ["Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"] as const;

// R24A-D11: round 1 = Service 1, round 2 = Goal Plan, rounds 3–6 = Follow-ups (4 per row).
function dashboardRoundColumns(row: 9 | 10): ColumnContract[] {
  const followups = row === 9 ? FOLLOWUPS.slice(0, 4) : FOLLOWUPS.slice(4);
  return DASHBOARD_ROUND_LETTERS.map((column, index): ColumnContract => {
    const round = Math.floor(index / 3) + 1;
    const field = index % 3;
    if (round <= 2) {
      if (row === 10) return [column, null, "SOURCE_MISSING"];
      // Phase A: rounds 1-2 DTX/BW come from PatientProgramRoundVitals; the rate stays unapproved.
      if (field === 2) return [column, DERIVATION_UNAPPROVED, "SOURCE_MISSING"];
      const vitals = round === 1 ? [118, 74] : [112, 73];
      return [column, vitals[field] ?? null, "SOURCE_READY"];
    }
    const followup = followups[round - 3];
    if (!followup) {
      const isFirstEmptySlot = round - 3 === followups.length && field === 0;
      return [column, isFirstEmptySlot ? NO_MORE_FOLLOWUPS : null, "SOURCE_READY"];
    }
    if (field === 0) return [column, followup.measurements.bloodSugar.state === "RECORDED" ? followup.measurements.bloodSugar.value : null, "SOURCE_READY"];
    if (field === 1) return [column, followup.measurements.weight.state === "RECORDED" ? followup.measurements.weight.value : null, "SOURCE_READY"];
    return [column, rateCell(followup), "SOURCE_READY"];
  });
}

const DASHBOARD_ROW_9: readonly ColumnContract[] = [
  ["A", 1, "SOURCE_READY"],
  ["B", "สมหญิง", "SOURCE_READY"],
  ["C", "รักษ์สุขภาพ", "SOURCE_READY"],
  ["D", "HN-0001", "SOURCE_READY"],
  ["E", 9, "SOURCE_READY"],
  ["F", "อสม. สมศรี (มอบหมายปัจจุบัน)", "SOURCE_READY"],
  ["G", dateToken(STARTED_AT), "SOURCE_READY"],
  // D7/D8: staff-entered CVD risk % and HbA1c %.
  ["H", 12.5, "SOURCE_READY"],
  ["I", 7.4, "SOURCE_READY"],
  ["J", 128, "SOURCE_READY"],
  ["K", 74.5, "SOURCE_READY"],
  ["L", 28.4, "SOURCE_READY"],
  ["M", 162, "SOURCE_READY"],
  ["N", 92, "SOURCE_READY"],
  ["O", 138, "SOURCE_READY"],
  ["P", 88, "SOURCE_READY"],
  ...dashboardRoundColumns(9),
  ["AI", dateToken(COMPLETED_AT), "SOURCE_READY"],
  ["AJ", 9.8, "SOURCE_READY"],
  ["AK", 6.8, "SOURCE_READY"],
  ["AL", 108, "SOURCE_READY"],
  ["AM", 69, "SOURCE_READY"],
  ["AN", 26.3, "SOURCE_READY"],
  ["AO", 86, "SOURCE_READY"],
  ["AP", 126, "SOURCE_READY"],
  ["AQ", 80, "SOURCE_READY"],
];

function followupServiceColumns(row: 9 | 10): ColumnContract[] {
  const starts = ["AH", "AP", "AX", "BF"];
  const blocks = [
    ["AH", "AI", "AJ", "AK", "AL", "AM", "AN", "AO"],
    ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW"],
    ["AX", "AY", "AZ", "BA", "BB", "BC", "BD", "BE"],
    ["BF", "BG", "BH", "BI", "BJ", "BK", "BL", "BM"],
  ] as const;
  const followups = row === 9 ? FOLLOWUPS.slice(0, 4) : FOLLOWUPS.slice(4);
  return blocks.flatMap((block, slot): ColumnContract[] => {
    const followup = followups[slot];
    if (!followup) {
      return block.map((column): ColumnContract => [
        column,
        column === starts[followups.length] ? NO_MORE_FOLLOWUPS : null,
        column === block[3] ? "SOURCE_MISSING" : "SOURCE_READY",
      ]);
    }
    const answer = (value: boolean | null, labels: readonly [string, string]): [CellValue, CellValue] =>
      value === null ? ["ไม่ได้บันทึก", null] : value ? [labels[0], null] : [null, labels[1]];
    const [adjusted, notAdjusted] = answer(followup.planAdjusted, ["ปรับ", "ไม่ปรับ"]);
    const [obstacle, noObstacle] = answer(followup.hasObstacle, ["มี", "ไม่มี"]);
    return [
      [block[0], dateToken(followup.serviceDate === null ? followup.recordedAt : `${followup.serviceDate}T00:00:00.000Z`), "SOURCE_READY"],
      [block[1], followup.achievement?.achievedDays ?? NO_ACHIEVEMENT, "SOURCE_READY"],
      [block[2], rateCell(followup), "SOURCE_READY"],
      [block[3], SOURCE_MISSING, "SOURCE_MISSING"],
      [block[4], adjusted, "SOURCE_READY"],
      [block[5], notAdjusted, "SOURCE_READY"],
      [block[6], obstacle, "SOURCE_READY"],
      [block[7], noObstacle, "SOURCE_READY"],
    ];
  });
}

const SERVICE_ROW_9: readonly ColumnContract[] = [
  ["A", 1, "SOURCE_READY"],
  ["B", "สมหญิง", "SOURCE_READY"],
  ["C", "รักษ์สุขภาพ", "SOURCE_READY"],
  ["D", "HN-0001", "SOURCE_READY"],
  ["E", 9, "SOURCE_READY"],
  ["F", "อสม. สมศรี (มอบหมายปัจจุบัน)", "SOURCE_READY"],
  ["G", dateToken(STARTED_AT), "SOURCE_READY"],
  ["H", dateToken(COMPLETED_AT), "SOURCE_READY"],
  ["I", 128, "SOURCE_READY"],
  ["J", 74.5, "SOURCE_READY"],
  ["K", 15, "SOURCE_READY"],
  ["L", 18, "SOURCE_READY"],
  // D8: confidence ruler 0-10; D9: self-reported exercise minutes per week.
  ["M", 6, "SOURCE_READY"],
  ["N", 37.5, "SOURCE_READY"],
  ["O", 108, "SOURCE_READY"],
  ["P", 69, "SOURCE_READY"],
  ["Q", 150, "SOURCE_READY"],
  ["R", 2, "SOURCE_READY"],
  ["S", "ทำ", "SOURCE_READY"],
  ["T", null, "SOURCE_READY"],
  ["U", null, "SOURCE_READY"],
  ["V", "ไม่ทำ", "SOURCE_READY"],
  ["W", "ทำ", "SOURCE_READY"],
  ["X", null, "SOURCE_READY"],
  ["Y", null, "SOURCE_READY"],
  ["Z", "ไม่มี", "SOURCE_READY"],
  ["AA", "มี", "SOURCE_READY"],
  ["AB", null, "SOURCE_READY"],
  ["AC", 4, "SOURCE_READY"],
  ["AD", "มี", "SOURCE_READY"],
  ["AE", null, "SOURCE_READY"],
  ["AF", 3, "SOURCE_READY"],
  ["AG", 90, "SOURCE_READY"],
  ...followupServiceColumns(9),
];

function normalizedCell(sheet: ExcelJS.Worksheet, address: string): CellValue {
  const value = sheet.getCell(address).value;
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return `date:${value.toISOString().slice(0, 10)}`;
  if (typeof value === "string" || typeof value === "number") return value;
  throw new Error(`Unexpected cell value type at ${sheet.name}!${address}`);
}

function headerValues(sheet: ExcelJS.Worksheet, rows: readonly number[], lastColumn: number): Array<CellValue> {
  return rows.flatMap((rowNumber) => Array.from({ length: lastColumn }, (_, index) => {
    const value = sheet.getRow(rowNumber).getCell(index + 1).value;
    return typeof value === "string" || typeof value === "number" ? value : null;
  }));
}

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (!(buffer instanceof ArrayBuffer)) throw new Error("Workbook bytes are unavailable");
  await workbook.xlsx.load(buffer);
  return workbook;
}

function sheetOrThrow(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`Missing worksheet ${name}`);
  return sheet;
}

describe("customer workbook golden column contract (BF-GAP-WB-00)", () => {
  let dashboard: ExcelJS.Worksheet;
  let service: ExcelJS.Worksheet;
  let template: ExcelJS.Workbook;

  beforeAll(async () => {
    const generated = await loadWorkbook(
      await generateHospitalReportWorkbook(goldenDataset(), new Date("2026-10-12T03:00:00.000Z")),
    );
    dashboard = sheetOrThrow(generated, "Dashboard ภาพรวม");
    service = sheetOrThrow(generated, "รายงานการจัดบริการ");
    template = await loadWorkbook(await readFile(join(process.cwd(), "docs", "Dashboard App Demi.xlsx")));
  });

  it("pins every Dashboard ภาพรวม customer column A–AQ and continues the fifth Follow-up", () => {
    expect(DASHBOARD_ROW_9).toHaveLength(43);
    for (const [column, expected] of DASHBOARD_ROW_9) {
      expect(normalizedCell(dashboard, `${column}9`), `Dashboard ภาพรวม!${column}9`).toEqual(expected);
    }
    for (const [column, expected] of dashboardRoundColumns(10)) {
      expect(normalizedCell(dashboard, `${column}10`), `Dashboard ภาพรวม!${column}10`).toEqual(expected);
    }
  });

  it("pins every รายงานการจัดบริการ customer column A–BM and continues the fifth Follow-up", () => {
    expect(SERVICE_ROW_9).toHaveLength(65);
    for (const [column, expected] of SERVICE_ROW_9) {
      expect(normalizedCell(service, `${column}9`), `รายงานการจัดบริการ!${column}9`).toEqual(expected);
    }
    for (const [column, expected] of followupServiceColumns(10)) {
      expect(normalizedCell(service, `${column}10`), `รายงานการจัดบริการ!${column}10`).toEqual(expected);
    }
    expect(normalizedCell(service, "A10")).toBeNull();
    expect(normalizedCell(service, "BP10")).toBe(2);
  });

  it("never shows an unavailable label in a SOURCE_READY column", () => {
    for (const [column, expected, status] of [...DASHBOARD_ROW_9, ...SERVICE_ROW_9]) {
      if (status !== "SOURCE_READY") continue;
      expect(typeof expected === "string" && UNAVAILABLE_LABELS.has(expected), column).toBe(false);
    }
  });

  it("keeps the customer header rows from the workbook template", () => {
    const templateDashboard = sheetOrThrow(template, "Dashboard ภาพรวม");
    const templateService = sheetOrThrow(template, "รายงานการจัดบริการ");
    expect(headerValues(dashboard, [4, 5, 6, 7], 43)).toEqual(headerValues(templateDashboard, [4, 5, 6, 7], 43));
    expect(headerValues(service, [5, 6, 7, 8], 65)).toEqual(headerValues(templateService, [5, 6, 7, 8], 65));
  });

  it("identifies the Hospital by name only in both worksheet headers", () => {
    expect(normalizedCell(dashboard, "A1")).toBe("โรงพยาบาล: รพ.สต. ทดสอบ");
    expect(normalizedCell(service, "A1")).toBe("Service Process record · โรงพยาบาล: รพ.สต. ทดสอบ");
    expect(normalizedCell(dashboard, "A1")).not.toContain("GOLD-01");
    expect(normalizedCell(service, "A1")).not.toContain("GOLD-01");
  });

  it("labels the self-reported exercise columns as gated while disclosure is unapproved (WB-PD-06)", async () => {
    const gated: HospitalReportProgramRow["weeklyExercise"]["before"] = { state: "UNAVAILABLE", reason: "DISCLOSURE_UNAPPROVED" };
    const dataset = goldenDataset();
    const generated = await loadWorkbook(
      await generateHospitalReportWorkbook(
        { ...dataset, programs: dataset.programs.map((program) => ({ ...program, weeklyExercise: { before: gated, after: gated } })) },
        new Date("2026-10-12T03:00:00.000Z"),
      ),
    );
    const gatedService = sheetOrThrow(generated, "รายงานการจัดบริการ");

    expect(normalizedCell(gatedService, "N9")).toBe(DISCLOSURE_UNAPPROVED);
    expect(normalizedCell(gatedService, "Q9")).toBe(DISCLOSURE_UNAPPROVED);
  });

  // Coverage of the capability with the D9 disclosure gate open; N/Q are gated by default (WB-PD-06).
  it("reports the current DoD coverage of the customer columns", () => {
    const count = (status: DodStatus): number =>
      [...DASHBOARD_ROW_9, ...SERVICE_ROW_9].filter(([, , columnStatus]) => columnStatus === status).length;
    expect({
      SOURCE_READY: count("SOURCE_READY"),
      DECISION_OPEN: count("DECISION_OPEN"),
      SOURCE_MISSING: count("SOURCE_MISSING"),
    }).toEqual({ SOURCE_READY: 102, DECISION_OPEN: 0, SOURCE_MISSING: 6 });
  });
});
