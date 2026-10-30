import "server-only";

import {
  NO_FOLLOWUP_LABEL,
  roundAchieveScore,
  roundAchieveScoreText,
  roundEndedWithoutFollowup,
  type RoundReport,
} from "../projections/round-report-projection";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import ExcelJS from "exceljs";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { summarizeFollowupAchievements } from "@/modules/followups/domain/followup-achievement";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { PROMS_RESULT_LABELS } from "@/modules/screening/presentation/screening-labels";
import { ValidationError } from "@/shared/errors/application-error";

import type {
  HospitalReportFact,
  HospitalReportFollowup,
  HospitalReportGoalPlan,
  HospitalReportProgramRow,
  HospitalReportingDataset,
} from "../projections/hospital-report-projection";
import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import { hospitalReportExportRequestSchema } from "../schemas/hospital-report-schemas";
import {
  HospitalReportExportLimitError,
  getGlobalAdminHospitalReportingDatasetForExport,
  getHospitalReportingDatasetForExport,
} from "./hospital-report-query-service";
import { resolveHospitalReportingAccessContext } from "./hospital-report-access-service";
import {
  globalReportingAuditReasonForError,
  recordGlobalReportingAudit,
  resolveGlobalReportingAccessContext,
} from "./global-reporting-access-service";

const WORKBOOK_TEMPLATE_PATH = join(process.cwd(), "docs", "Dashboard App Demi.xlsx");
const DASHBOARD_SHEET_NAME = "Dashboard ภาพรวม";
const SERVICE_SHEET_NAME = "รายงานการจัดบริการ";
const DATA_START_ROW = 9;
// Dashboard rounds 1–6 (R24A-D11): round 1 = Service 1, round 2 = Goal Plan, rounds 3–6 = Follow-ups.
const DASHBOARD_FOLLOWUPS_PER_ROW = 4;
const SERVICE_FOLLOWUPS_PER_ROW = 4;
const EXCEL_CELL_TEXT_LIMIT = 32_767;
// Owner decision BR-03: "การลดมื้ออาหาร" is the reduce-rice/starch goal; other FOOD goals are "การเปลี่ยนอาหาร".
const REDUCE_MEAL_ACTIVITY_CODE = "reduce_rice";
const GOAL_TARGET_MINUTES_UNIT = "minutes";

const unavailableLabels = {
  SOURCE_MISSING: "ไม่มีแหล่งข้อมูลในระบบ",
  CLINICAL_SEMANTICS_UNAPPROVED: "ยังไม่พร้อมใช้งาน: หน่วยหรือความหมายยังไม่ได้รับรอง",
  NOT_PROGRAM_SCOPED: "ยังไม่พร้อมใช้งาน: ไม่มีข้อมูลที่ผูกกับ Program นี้",
  DERIVATION_UNAPPROVED: "ยังไม่พร้อมใช้งาน: ยังไม่มีสูตรที่ได้รับรอง",
} as const;

function assertCellText(value: string): string {
  if (value.length > EXCEL_CELL_TEXT_LIMIT) {
    throw new HospitalReportExportLimitError("ข้อความในรายงานยาวเกินขีดจำกัดของ Excel");
  }
  return value;
}

function excelArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (!(copy instanceof ArrayBuffer)) throw new Error("Workbook bytes are not available as an ArrayBuffer");
  return copy;
}

function factCell<T extends number | string>(fact: HospitalReportFact<T>): number | string {
  if (fact.state === "RECORDED") return fact.value;
  if (fact.state === "NOT_RECORDED") return "ยังไม่บันทึก";
  return unavailableLabels[fact.reason];
}

function toExcelDate(isoDate: string): Date {
  return new Date(isoDate);
}

function setExcelDate(row: ExcelJS.Row, column: number): void {
  const cell = row.getCell(column);
  // Template cells share one style object; assigning numFmt in place would date-format the whole row.
  cell.style = { ...cell.style, numFmt: "dd/mm/yyyy" };
}

function setExcelPercent(row: ExcelJS.Row, column: number, ratePercent: number, numFmt = "0%"): void {
  const cell = row.getCell(column);
  cell.value = ratePercent / 100;
  cell.style = { ...cell.style, numFmt };
}

// AS-D1: the staff-entered Achieve score keeps its one decimal.
function setStaffAchieveScore(row: ExcelJS.Row, column: number, round: RoundReport | undefined): boolean {
  const score = roundAchieveScore(round);
  if (score.kind !== "STAFF") return false;
  setExcelPercent(row, column, score.percent, "0.0%");
  return true;
}

function roundReport(program: HospitalReportProgramRow, roundNumber: number): RoundReport | undefined {
  return program.rounds.find((round) => round.roundNumber === roundNumber);
}

const NO_ACHIEVEMENT_LABEL = "ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้";
const NOT_RECORDED_LEGACY_LABEL = "ไม่ได้บันทึก";

// Owner decision BR-04: the Follow-up achievement rate as a percentage cell, or why it is missing.
function writeAchievementRateCell(row: ExcelJS.Row, column: number, followup: HospitalReportFollowup): void {
  if (followup.achievement === null) {
    row.getCell(column).value = NO_ACHIEVEMENT_LABEL;
    return;
  }
  setExcelPercent(row, column, followup.achievement.ratePercent);
}

// Yes/no pair columns (e.g. ปรับ/ไม่ปรับ); Follow-ups recorded before the answer existed say so.
function setAnswerCells(
  row: ExcelJS.Row,
  column: number,
  answer: boolean | null,
  labels: readonly [string, string],
): void {
  if (answer === null) {
    row.getCell(column).value = NOT_RECORDED_LEGACY_LABEL;
    row.getCell(column + 1).value = "";
    return;
  }
  row.getCell(column).value = answer ? labels[0] : "";
  row.getCell(column + 1).value = answer ? "" : labels[1];
}

// Owner decision BR-01: report the service date; older Follow-ups fall back to the recorded date.
function followupDate(followup: HospitalReportFollowup): Date {
  return followup.serviceDate === null
    ? toExcelDate(followup.recordedAt)
    : toExcelDate(`${followup.serviceDate}T00:00:00.000Z`);
}

// Owner decision BR-04: number of scorable Follow-ups with an achievement rate strictly above 70%.
function achievementOver70Cell(program: HospitalReportProgramRow): number | string {
  if (program.followups.items.length === 0) return "ไม่มีการติดตาม";
  const summary = summarizeFollowupAchievements(program.followups.items.map((followup) => followup.achievement));
  return summary.scoredCount === 0 ? "ไม่มีการติดตามที่คำนวณได้" : summary.aboveThresholdCount;
}

function unavailable(reason: keyof typeof unavailableLabels): string {
  return unavailableLabels[reason];
}

function assignmentCell(program: HospitalReportProgramRow): string {
  return program.currentRelationshipOsmAssignment.state === "PRESENT"
    ? `${program.currentRelationshipOsmAssignment.value.displayName} (มอบหมายปัจจุบัน)`
    : "ไม่มีการมอบหมายปัจจุบัน";
}

function finalMeasurementCell(
  program: HospitalReportProgramRow,
  key: "bloodSugar" | "weight" | "waistCircumference" | "systolicBloodPressure" | "diastolicBloodPressure",
): number | string {
  if (program.finalAssessment.state === "MISSING") return "ไม่มี Final Assessment";
  return factCell(program.finalAssessment.value.measurements[key]);
}

function baselineMeasurementCell(
  program: HospitalReportProgramRow,
  key: "bloodSugar" | "weight" | "waistCircumference" | "systolicBloodPressure" | "diastolicBloodPressure",
): number | string {
  if (program.baseline.state === "MISSING") return "ไม่มี Baseline ที่เชื่อมกับ Program";
  return factCell(program.baseline.value.measurements[key]);
}

const NO_BASELINE_LABEL = "ไม่มี Baseline ที่เชื่อมกับ Program";
const NO_FINAL_ASSESSMENT_LABEL = "ไม่มี Final Assessment";
const NO_ROUND_VITALS_LABEL = "ยังไม่บันทึกสัญญาณชีพครั้งนี้";
const NO_PROGRAM_SCREENING_LABEL = "ไม่มีแบบประเมินที่บันทึกในครั้งที่ 1";

// Phase A: Dashboard rounds 1-2 DTX/BW come from PatientProgramRoundVitals (WB-DF-01).
function roundVitalsCell(
  record: HospitalReportProgramRow["roundVitals"]["round1"],
  key: "bloodSugar" | "weight",
): number | string {
  return record.state === "MISSING" ? NO_ROUND_VITALS_LABEL : factCell(record.value.measurements[key]);
}

function baselineBmiCell(program: HospitalReportProgramRow): number | string {
  return program.baseline.state === "MISSING" ? NO_BASELINE_LABEL : factCell(program.bmi.baseline);
}

function afterBmiCell(program: HospitalReportProgramRow): number | string {
  return program.finalAssessment.state === "MISSING" ? NO_FINAL_ASSESSMENT_LABEL : factCell(program.bmi.after);
}

function afterHba1cCell(program: HospitalReportProgramRow): number | string {
  return program.finalAssessment.state === "MISSING"
    ? NO_FINAL_ASSESSMENT_LABEL
    : factCell(program.finalAssessment.value.hba1c);
}

// D7: staff-entered Baseline facts (HbA1c %, CVD risk %).
function baselineFactCell(
  program: HospitalReportProgramRow,
  key: "hba1c" | "cvdRiskScore",
): number | string {
  return program.baseline.state === "MISSING" ? NO_BASELINE_LABEL : factCell(program.baseline.value[key]);
}

// D8 + R1-E: the Before ruler is the round-1 ไม้บรรทัดวัดใจ (0-10); skipped or missing = not recorded.
function roundOneConfidenceCell(program: HospitalReportProgramRow): number | string {
  const confidence = program.serviceOne.confidence;
  return factCell(confidence.state === "PRESENT" ? { state: "RECORDED", value: confidence.value.score } : { state: "NOT_RECORDED" });
}

function afterCvdRiskCell(program: HospitalReportProgramRow): number | string {
  return program.finalAssessment.state === "MISSING"
    ? NO_FINAL_ASSESSMENT_LABEL
    : factCell(program.finalAssessment.value.cvdRiskScore);
}

const NO_EXERCISE_RECORD_LABEL = "ไม่มีบันทึก";

// D9: Patient self-reported minutes per week; After needs the Final Assessment service date.
function weeklyExerciseCell(program: HospitalReportProgramRow, stage: "before" | "after"): number | string {
  if (stage === "after" && program.finalAssessment.state === "MISSING") return NO_FINAL_ASSESSMENT_LABEL;
  const fact = program.weeklyExercise[stage];
  return fact.state === "RECORDED" ? fact.value : NO_EXERCISE_RECORD_LABEL;
}

/** "PAM score" = the PAM total (R2-C). */
function pamScoreCell(program: HospitalReportProgramRow): number | string {
  const pam = program.screening.pam;
  return pam.state === "MISSING" ? NO_PROGRAM_SCREENING_LABEL : pam.value.score;
}

/** Q6: PROMs is reported as มีปัญหา/ไม่มีปัญหา, never a total; a legacy combined screening keeps its total. */
function promsCell(program: HospitalReportProgramRow): number | string {
  const proms = program.screening.proms;

  if (proms.state === "MISSING") return NO_PROGRAM_SCREENING_LABEL;
  if ("legacyTotal" in proms.value) return proms.value.legacyTotal;
  return proms.value.hasProblem ? PROMS_RESULT_LABELS.problem : PROMS_RESULT_LABELS.noProblem;
}

function rowsPerProgram(program: HospitalReportProgramRow, followupsPerRow: number): number {
  return Math.max(1, Math.ceil(program.followups.items.length / followupsPerRow));
}

function programContinuationGroups(
  programs: readonly HospitalReportProgramRow[],
  followupsPerRow: number,
): Array<{ program: HospitalReportProgramRow; followups: readonly HospitalReportFollowup[]; continuation: number }> {
  return programs.flatMap((program) => {
    const rowCount = rowsPerProgram(program, followupsPerRow);
    return Array.from({ length: rowCount }, (_, index) => ({
      program,
      followups: program.followups.items.slice(index * followupsPerRow, (index + 1) * followupsPerRow),
      continuation: index + 1,
    }));
  });
}

function copyDataStyle(sheet: ExcelJS.Worksheet, rowNumber: number, width: number): void {
  const row = sheet.getRow(rowNumber);
  const templateRow = sheet.getRow(DATA_START_ROW);
  const templateWidth = sheet.name === DASHBOARD_SHEET_NAME ? 43 : 65;
  if (rowNumber <= 29 && rowNumber <= sheet.rowCount) {
    for (let column = templateWidth + 1; column <= width; column += 1) {
      const templateCell = templateRow.getCell(templateWidth);
      const cell = row.getCell(column);
      cell.style = {
        ...templateCell.style,
        alignment: { ...templateCell.style.alignment, vertical: "top", wrapText: true },
      };
    }
    return;
  }

  row.height = templateRow.height;
  for (let column = 1; column <= width; column += 1) {
    const templateCell = templateRow.getCell(Math.min(column, templateWidth));
    const cell = row.getCell(column);
    cell.style = {
      ...templateCell.style,
      alignment: {
        ...templateCell.style.alignment,
        vertical: "top",
        wrapText: true,
      },
    };
  }
}

/** Last row of the template's bordered data-entry grid, read before any row is written. */
function templateDataEndRow(sheet: ExcelJS.Worksheet): number {
  let lastRow = DATA_START_ROW - 1;
  for (let rowNumber = DATA_START_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    if (Object.keys(sheet.getRow(rowNumber).getCell(1).border ?? {}).length === 0) break;
    lastRow = rowNumber;
  }
  return lastRow;
}

function insertOverflowRowsBeforeNativeContent(
  sheet: ExcelJS.Worksheet,
  dataRowCount: number,
  templateEndRow: number,
): number {
  const templateRowCount = templateEndRow - DATA_START_ROW + 1;
  const overflowRowCount = Math.max(0, dataRowCount - templateRowCount);
  if (overflowRowCount > 0) {
    sheet.spliceRows(
      templateEndRow + 1,
      0,
      ...Array.from({ length: overflowRowCount }, (): [] => []),
    );
  }
  return overflowRowCount;
}

function clearReportBody(sheet: ExcelJS.Worksheet, endRow: number): void {
  for (let rowNumber = DATA_START_ROW; rowNumber <= endRow; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
    });
  }
}

function setHeaderFacts(sheet: ExcelJS.Worksheet, dataset: HospitalReportingDataset): void {
  const hospitalLabel = `โรงพยาบาล: ${assertCellText(dataset.hospital.name)}`;
  const classificationUnavailable = "ยังไม่มีนิยามและตัวหารที่ได้รับรอง";
  if (sheet.name === SERVICE_SHEET_NAME) {
    sheet.getCell("A2").value = hospitalLabel;
    sheet.getCell("A3").value = "จำนวนเคส";
    sheet.getCell("B3").value = dataset.counts.patientHospitalRelationships.value;
    sheet.getCell("C3").value = "เบาหวาน (DM)";
    sheet.getCell("D3").value = classificationUnavailable;
    sheet.getCell("E3").value = "Program ทั้งหมด";
    sheet.getCell("F3").value = dataset.counts.programs.total;
    sheet.getCell("A4").value = "ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program";
    sheet.getCell("B4").value = dataset.counts.relationshipsWithoutProgram.value;
    sheet.getCell("C4").value = "กลุ่มเสี่ยง (Pre-DM)";
    sheet.getCell("D4").value = classificationUnavailable;
    sheet.getCell("E4").value = "Program ACTIVE / COMPLETED";
    sheet.getCell("F4").value = `${dataset.counts.programs.active} / ${dataset.counts.programs.completed}`;
    return;
  }

  sheet.getCell("A1").value = hospitalLabel;
  sheet.getCell("A2").value = "จำนวนเคส";
  sheet.getCell("B2").value = dataset.counts.patientHospitalRelationships.value;
  sheet.getCell("C2").value = "เบาหวาน (DM)";
  sheet.getCell("D2").value = classificationUnavailable;
  sheet.getCell("E2").value = "Program ทั้งหมด";
  sheet.getCell("F2").value = dataset.counts.programs.total;
  sheet.getCell("A3").value = "ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program";
  sheet.getCell("B3").value = dataset.counts.relationshipsWithoutProgram.value;
  sheet.getCell("C3").value = "กลุ่มเสี่ยง (Pre-DM)";
  sheet.getCell("D3").value = classificationUnavailable;
  sheet.getCell("E3").value = "Program ACTIVE / COMPLETED";
  sheet.getCell("F3").value = `${dataset.counts.programs.active} / ${dataset.counts.programs.completed}`;
}

function programIdentity(program: HospitalReportProgramRow): readonly (string | number | Date)[] {
  return [
    "",
    program.patient.givenName ?? "ไม่ระบุชื่อ",
    program.patient.familyName ?? "ไม่ระบุนามสกุล",
    program.patient.hospitalNumber.state === "RECORDED"
      ? program.patient.hospitalNumber.value
      : program.patient.hospitalNumber.state === "NOT_RECORDED"
        ? "ยังไม่บันทึก"
        : unavailable(program.patient.hospitalNumber.reason),
    program.illnessDuration.state === "RECORDED" ? program.illnessDuration.value : "ไม่ทราบปีวินิจฉัย",
    assignmentCell(program),
    toExcelDate(program.lifecycle.startedAt),
  ];
}

function writeDashboardRows(sheet: ExcelJS.Worksheet, programs: readonly HospitalReportProgramRow[]): void {
  const groups = programContinuationGroups(programs, DASHBOARD_FOLLOWUPS_PER_ROW);
  const startColumn = 17;
  const followupStartColumn = startColumn + 6;
  let programNumber = 0;

  groups.forEach(({ program, followups, continuation }, index) => {
    const rowNumber = DATA_START_ROW + index;
    copyDataStyle(sheet, rowNumber, 43);
    const row = sheet.getRow(rowNumber);
    const identity = programIdentity(program);
    const startsProgram = index === 0 || groups[index - 1]?.program.patientProgramId !== program.patientProgramId;
    if (startsProgram) programNumber += 1;
    row.getCell(1).value = startsProgram ? programNumber : "";
    row.getCell(2).value = identity[1];
    row.getCell(3).value = identity[2];
    row.getCell(4).value = identity[3];
    row.getCell(5).value = identity[4];
    row.getCell(6).value = identity[5];
    row.getCell(7).value = identity[6];
    setExcelDate(row, 7);
    row.getCell(8).value = baselineFactCell(program, "cvdRiskScore");
    row.getCell(9).value = baselineFactCell(program, "hba1c");
    row.getCell(10).value = baselineMeasurementCell(program, "bloodSugar");
    row.getCell(11).value = baselineMeasurementCell(program, "weight");
    row.getCell(12).value = baselineBmiCell(program);
    row.getCell(13).value = program.baseline.state === "PRESENT" ? factCell(program.baseline.value.heightCm) : "ไม่มี Baseline ที่เชื่อมกับ Program";
    row.getCell(14).value = baselineMeasurementCell(program, "waistCircumference");
    row.getCell(15).value = baselineMeasurementCell(program, "systolicBloodPressure");
    row.getCell(16).value = baselineMeasurementCell(program, "diastolicBloodPressure");

    if (continuation === 1) {
      for (const [roundColumn, roundVitals, roundNumber] of [
        [startColumn, program.roundVitals.round1, 1],
        [startColumn + 3, program.roundVitals.round2, 2],
      ] as const) {
        row.getCell(roundColumn).value = roundVitalsCell(roundVitals, "bloodSugar");
        row.getCell(roundColumn + 1).value = roundVitalsCell(roundVitals, "weight");
        // AS-D2: rounds 1-2 have no computed score; only the staff-entered one fills them.
        if (!setStaffAchieveScore(row, roundColumn + 2, roundReport(program, roundNumber))) {
          row.getCell(roundColumn + 2).value = "ยังไม่บันทึก";
        }
      }
    }
    followups.forEach((followup) => {
      if (followup.roundNumber > 4) return;
      const column = followupStartColumn + (followup.roundNumber - 1) * 3;
      row.getCell(column).value = factCell(followup.measurements.bloodSugar);
      row.getCell(column + 1).value = factCell(followup.measurements.weight);
      writeAchievementRateCell(row, column + 2, followup);
    });
    if (continuation === 1) {
      for (const round of program.rounds) {
        if (round.roundNumber < 3 || round.roundNumber > 6 || !round.vitals) continue;
        const column = followupStartColumn + (round.roundNumber - 3) * 3;
        row.getCell(column).value = round.vitals.bloodSugar ?? "ยังไม่บันทึก";
        row.getCell(column + 1).value = round.vitals.weight ?? "ยังไม่บันทึก";
      }
    }
    if (followups.length === 0 && !program.rounds.some((round) => round.roundNumber === 3 && round.vitals)) {
      const nextFollowupColumn = followupStartColumn;
      row.getCell(nextFollowupColumn).value = "ไม่มี Follow-up ในช่องที่เหลือ";
    }
    if (continuation === 1) {
      for (let roundNumber = 3; roundNumber <= 6; roundNumber += 1) {
        const round = roundReport(program, roundNumber);
        const column = followupStartColumn + (roundNumber - 3) * 3;
        // AS-D3: DTX/BW stay from the round vitals when present.
        if (roundEndedWithoutFollowup(round)) {
          if (!round?.vitals) {
            row.getCell(column).value = NO_FOLLOWUP_LABEL;
            row.getCell(column + 1).value = NO_FOLLOWUP_LABEL;
          }
          row.getCell(column + 2).value = NO_FOLLOWUP_LABEL;
        }
        // AS-D1: a staff-entered score overrides the computed Follow-up rate.
        setStaffAchieveScore(row, column + 2, round);
      }
    }

    row.getCell(35).value = program.lifecycle.completedAt.state === "RECORDED"
      ? toExcelDate(program.lifecycle.completedAt.value)
      : program.lifecycle.status === "ACTIVE"
        ? "ยังดำเนิน Program"
        : "ยังไม่บันทึกวันที่สิ้นสุด";
    if (program.lifecycle.completedAt.state === "RECORDED") setExcelDate(row, 35);
    row.getCell(36).value = afterCvdRiskCell(program);
    row.getCell(37).value = afterHba1cCell(program);
    row.getCell(38).value = finalMeasurementCell(program, "bloodSugar");
    row.getCell(39).value = finalMeasurementCell(program, "weight");
    row.getCell(40).value = afterBmiCell(program);
    row.getCell(41).value = finalMeasurementCell(program, "waistCircumference");
    row.getCell(42).value = finalMeasurementCell(program, "systolicBloodPressure");
    row.getCell(43).value = finalMeasurementCell(program, "diastolicBloodPressure");
  });
}

function serviceOnePresence(
  program: HospitalReportProgramRow,
  key: keyof HospitalReportProgramRow["serviceOne"],
): boolean {
  return program.serviceOne[key].state === "PRESENT";
}

function firstGoalPlan(program: HospitalReportProgramRow): HospitalReportGoalPlan | null {
  return program.goalPlans.items.reduce<HospitalReportGoalPlan | null>(
    (first, plan) => (first === null || plan.roundNumber < first.roundNumber ? plan : first),
    null,
  );
}

function setPresenceCells(row: ExcelJS.Row, column: number, present: boolean, labels: readonly [string, string]): void {
  row.getCell(column).value = present ? labels[0] : "";
  row.getCell(column + 1).value = present ? "" : labels[1];
}

function maxTargetDays(items: HospitalReportGoalPlan["items"]): number | string {
  return items.length === 0 ? "" : Math.max(...items.map((item) => item.targetDays));
}

function weeklyExerciseMinutes(items: HospitalReportGoalPlan["items"]): number | string {
  if (items.length === 0) return "";
  let total = 0;
  for (const item of items) {
    if (
      item.targetValue.state !== "RECORDED" ||
      item.targetUnit.state !== "RECORDED" ||
      item.targetUnit.value !== GOAL_TARGET_MINUTES_UNIT
    ) {
      return "ยังไม่บันทึกเวลาครบทุกกิจกรรม";
    }
    total += item.targetDays * item.targetValue.value;
  }
  return total;
}

// Round 2 (Goal Plan) cells Y–AG from the Program's first Goal Plan, per Owner decision BR-03.
function writeRoundTwoGoalCells(row: ExcelJS.Row, program: HospitalReportProgramRow): void {
  const plan = firstGoalPlan(program);
  if (plan === null) {
    row.getCell(25).value = "ไม่มี Goal Plan ที่ผูกกับ Program นี้";
    row.getCell(30).value = "ไม่มี Goal Plan ที่ผูกกับ Program นี้";
    return;
  }
  const foodItems = plan.items.filter((item) => item.category === "FOOD");
  const exerciseItems = plan.items.filter((item) => item.category === "EXERCISE");
  const hasReduceMeal = foodItems.some((item) => item.activityCode === REDUCE_MEAL_ACTIVITY_CODE);
  const hasFoodChange = foodItems.some((item) => item.activityCode !== REDUCE_MEAL_ACTIVITY_CODE);

  setPresenceCells(row, 25, hasReduceMeal, ["มี", "ไม่มี"]);
  setPresenceCells(row, 27, hasFoodChange, ["มี", "ไม่มี"]);
  row.getCell(29).value = maxTargetDays(foodItems);
  setPresenceCells(row, 30, exerciseItems.length > 0, ["มี", "ไม่มี"]);
  row.getCell(32).value = maxTargetDays(exerciseItems);
  row.getCell(33).value = weeklyExerciseMinutes(exerciseItems);
}

function writeServiceFollowupCells(
  row: ExcelJS.Row,
  program: HospitalReportProgramRow,
  followups: readonly HospitalReportFollowup[],
): void {
  followups.forEach((followup) => {
    if (followup.roundNumber > 4) return;
    const baseColumn = 34 + (followup.roundNumber - 1) * 8;
    row.getCell(baseColumn).value = followupDate(followup);
    setExcelDate(row, baseColumn);
    row.getCell(baseColumn + 1).value = followup.achievement?.achievedDays ?? NO_ACHIEVEMENT_LABEL;
    writeAchievementRateCell(row, baseColumn + 2, followup);
    row.getCell(baseColumn + 3).value = unavailable(program.unavailable.outcome);
    setAnswerCells(row, baseColumn + 4, followup.planAdjusted, ["ปรับ", "ไม่ปรับ"]);
    setAnswerCells(row, baseColumn + 6, followup.hasObstacle, ["มี", "ไม่มี"]);
  });
  if (followups.length === 0) {
    const nextFollowupColumn = 34;
    row.getCell(nextFollowupColumn).value = "ไม่มี Follow-up ในช่องที่เหลือ";
  }
}

function writeServiceRows(sheet: ExcelJS.Worksheet, programs: readonly HospitalReportProgramRow[]): void {
  const groups = programContinuationGroups(programs, SERVICE_FOLLOWUPS_PER_ROW);
  let programNumber = 0;

  groups.forEach(({ program, followups, continuation }, index) => {
    const rowNumber = DATA_START_ROW + index;
    copyDataStyle(sheet, rowNumber, 65);
    const row = sheet.getRow(rowNumber);
    const identity = programIdentity(program);
    const priorProgramId = groups[index - 1]?.program.patientProgramId;
    const startsProgram = priorProgramId !== program.patientProgramId;
    if (startsProgram) programNumber += 1;
    row.getCell(1).value = startsProgram ? programNumber : "";
    row.getCell(2).value = identity[1];
    row.getCell(3).value = identity[2];
    row.getCell(4).value = identity[3];
    row.getCell(5).value = identity[4];
    row.getCell(6).value = identity[5];
    row.getCell(7).value = identity[6];
    setExcelDate(row, 7);
    row.getCell(8).value = program.lifecycle.completedAt.state === "RECORDED"
      ? toExcelDate(program.lifecycle.completedAt.value)
      : program.lifecycle.status === "ACTIVE"
        ? "ยังดำเนิน Program"
        : "ยังไม่บันทึกวันที่สิ้นสุด";
    if (program.lifecycle.completedAt.state === "RECORDED") setExcelDate(row, 8);
    row.getCell(9).value = baselineMeasurementCell(program, "bloodSugar");
    row.getCell(10).value = baselineMeasurementCell(program, "weight");
    row.getCell(11).value = pamScoreCell(program);
    row.getCell(12).value = promsCell(program);
    row.getCell(13).value = roundOneConfidenceCell(program);
    row.getCell(14).value = weeklyExerciseCell(program, "before");
    row.getCell(15).value = finalMeasurementCell(program, "bloodSugar");
    row.getCell(16).value = finalMeasurementCell(program, "weight");
    row.getCell(17).value = weeklyExerciseCell(program, "after");
    row.getCell(18).value = achievementOver70Cell(program);
    if (continuation === 1) {
      // Owner decision BR-02: "ทำ" means the Service 1 activity has a record in DEMI.
      setPresenceCells(row, 19, serviceOnePresence(program, "floatingChart"), ["ทำ", "ไม่ทำ"]);
      setPresenceCells(row, 21, serviceOnePresence(program, "dreamCard"), ["ทำ", "ไม่ทำ"]);
      setPresenceCells(row, 23, serviceOnePresence(program, "routine"), ["ทำ", "ไม่ทำ"]);
      writeRoundTwoGoalCells(row, program);
    }
    writeServiceFollowupCells(row, program, followups);
    if (continuation === 1) writeServiceNoFollowupCells(row, program);
  });
}

// AS-D3: every Follow-up-derived cell of a completed round 3-6 that ended without its Follow-up.
function writeServiceNoFollowupCells(row: ExcelJS.Row, program: HospitalReportProgramRow): void {
  for (let roundNumber = 3; roundNumber <= 6; roundNumber += 1) {
    if (!roundEndedWithoutFollowup(roundReport(program, roundNumber))) continue;
    const baseColumn = 34 + (roundNumber - 3) * 8;
    for (const offset of [0, 1, 2, 4, 6]) row.getCell(baseColumn + offset).value = NO_FOLLOWUP_LABEL;
    row.getCell(baseColumn + 5).value = "";
    row.getCell(baseColumn + 7).value = "";
  }
}

function roundReportCell(round: RoundReport | undefined): string {
  return round ? `ทำแล้ว ${round.doneItems}/${round.plannedItems} รายการในแผน; ข้าม ${round.skippedItems}; ยังไม่ได้ทำเมื่อจบบริการ ${round.notDoneAtCloseItems}; ผู้ป่วยบันทึกเอง ${round.patientRecordedItems}` : "ยังไม่เปิดครั้งบริการ";
}

/** Append after the native columns; their positions and clinical meanings stay fixed. */
function writeRoundReportColumns(sheet: ExcelJS.Worksheet, programs: readonly HospitalReportProgramRow[]): void {
  const start = sheet.name === DASHBOARD_SHEET_NAME ? 44 : 66;
  const headers = ["ครั้งเพิ่มเติม (จำนวน)", ...Array.from({ length: 6 }, (_, index) => `ครั้งที่ ${index + 1} · รายการในแผน`), "รายละเอียดครั้งเพิ่มเติม", "การติดตามครั้งเพิ่มเติม"];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(8, start + index);
    cell.value = header;
    cell.style = { ...sheet.getCell(8, start - 1).style, alignment: { vertical: "top", wrapText: true } };
    sheet.getColumn(start + index).width = index === 0 ? 22 : 42;
  });
  sheet.getRow(8).height = Math.max(sheet.getRow(8).height ?? 0, 60);
  let rowNumber = DATA_START_ROW;
  for (const program of programs) {
    const row = sheet.getRow(rowNumber);
    row.getCell(start).value = program.extraRoundsCompleted;
    for (let round = 1; round <= 6; round += 1) row.getCell(start + round).value = roundReportCell(program.rounds.find((item) => item.roundNumber === round));
    row.getCell(start + 7).value = assertCellText(program.rounds.filter((round) => round.roundNumber >= 7).map((round) => `${round.title} (${round.completed ? "จบบริการแล้ว" : "ยังไม่จบบริการ"}): ${roundReportCell(round)}; Achieve score ${roundAchieveScoreText(roundAchieveScore(round))}`).join("\n") || "ไม่มีครั้งเพิ่มเติม");
    row.getCell(start + 8).value = assertCellText(program.followups.items.filter((followup) => followup.roundNumber >= 5).map((followup) => `ครั้งที่ ${followup.roundNumber + 2}: ${followup.serviceDate ?? followup.recordedAt}; น้ำตาล ${factCell(followup.measurements.bloodSugar)}; น้ำหนัก ${factCell(followup.measurements.weight)}; รอบเอว ${factCell(followup.measurements.waistCircumference)}; ความดัน ${factCell(followup.measurements.systolicBloodPressure)}/${factCell(followup.measurements.diastolicBloodPressure)}; จำนวนวันที่ทำได้ ${followup.achievement?.achievedDays ?? "ไม่มีข้อมูล"}; ผลสำเร็จ ${followup.achievement ? `${followup.achievement.ratePercent}%` : "ไม่มีข้อมูล"}; ปรับแผน ${followup.planAdjusted === null ? "ไม่มีข้อมูล" : followup.planAdjusted ? "ปรับ" : "ไม่ปรับ"}; อุปสรรค ${followup.hasObstacle === null ? "ไม่มีข้อมูล" : followup.hasObstacle ? "มี" : "ไม่มี"}`).join("\n") || "ไม่มีการติดตามครั้งเพิ่มเติม");
    for (let column = start; column <= start + 8; column += 1) row.getCell(column).alignment = { vertical: "top", wrapText: true };
    rowNumber += rowsPerProgram(program, DASHBOARD_FOLLOWUPS_PER_ROW);
  }
}

export async function generateHospitalReportWorkbook(
  dataset: HospitalReportingDataset,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  const template = await readFile(WORKBOOK_TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelArrayBuffer(template));

  if (
    workbook.worksheets.length !== 2 ||
    workbook.getWorksheet(DASHBOARD_SHEET_NAME) === undefined ||
    workbook.getWorksheet(SERVICE_SHEET_NAME) === undefined
  ) {
    throw new Error("The customer report workbook no longer has the expected two worksheets");
  }

  const dashboardSheet = workbook.getWorksheet(DASHBOARD_SHEET_NAME);
  const serviceSheet = workbook.getWorksheet(SERVICE_SHEET_NAME);
  if (!dashboardSheet || !serviceSheet) throw new Error("The customer report worksheets are unavailable");

  workbook.creator = "DEMI";
  workbook.lastModifiedBy = "DEMI";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  const dashboardTemplateEndRow = templateDataEndRow(dashboardSheet);
  const serviceTemplateEndRow = templateDataEndRow(serviceSheet);
  const serviceRowCount = programContinuationGroups(dataset.programs, SERVICE_FOLLOWUPS_PER_ROW).length;
  const serviceOverflowRowCount = insertOverflowRowsBeforeNativeContent(
    serviceSheet,
    serviceRowCount,
    serviceTemplateEndRow,
  );
  clearReportBody(dashboardSheet, dashboardTemplateEndRow);
  clearReportBody(serviceSheet, serviceTemplateEndRow + serviceOverflowRowCount);
  setHeaderFacts(dashboardSheet, dataset);
  setHeaderFacts(serviceSheet, dataset);
  writeDashboardRows(dashboardSheet, dataset.programs);
  writeServiceRows(serviceSheet, dataset.programs);
  writeRoundReportColumns(dashboardSheet, dataset.programs);
  writeRoundReportColumns(serviceSheet, dataset.programs);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportHospitalReportingWorkbook(
  actor: ActorContext | null | undefined,
  input: unknown,
): Promise<{ buffer: Buffer; generatedAt: Date }> {
  const dataset = await getHospitalReportingDatasetForExport(actor, input);
  const buffer = await generateHospitalReportWorkbook(dataset);
  const generatedAt = new Date();

  const access = await resolveHospitalReportingAccessContext(
    actor,
    dataset.hospital.id,
    "hospital:report:export",
    undefined,
    dataset.cohort,
  );
  await recordAuditEvent({
    actorUserId: access.actor.userId,
    action: "hospital_reporting.export.prepared",
    resourceType: "Hospital",
    resourceId: access.hospital.id,
    metadata: {
      capability: "hospital:report:export",
      accessBasis: access.accessBasis,
      generatedAt: generatedAt.toISOString(),
      outcome: "prepared",
      programCount: dataset.programs.length,
      cohort: dataset.cohort,
    },
  });

  return { buffer, generatedAt };
}

export async function exportGlobalAdminHospitalReportingWorkbook(
  actor: ActorContext | null | undefined,
  input: unknown,
): Promise<{ buffer: Buffer; generatedAt: Date; hospitalCode: string }> {
  const parsed = hospitalReportExportRequestSchema.safeParse(input);
  if (!parsed.success) {
    await recordGlobalReportingAudit({
      actorUserId: actor?.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.export,
      outcome: "denied",
      reason: "INVALID_REQUEST",
    });
    throw new ValidationError("ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง");
  }

  let dataset: HospitalReportingDataset;
  let buffer: Buffer;
  const generatedAt = new Date();
  try {
    dataset = await getGlobalAdminHospitalReportingDatasetForExport(actor, parsed.data);
    buffer = await generateHospitalReportWorkbook(dataset, generatedAt);
    await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.export,
      dataset.hospital.id,
    );
  } catch (error: unknown) {
    await recordGlobalReportingAudit({
      actorUserId: actor?.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.export,
      hospitalId: parsed.data.hospitalId,
      outcome: "denied",
      reason: globalReportingAuditReasonForError(error),
    });
    throw error;
  }

  await recordGlobalReportingAudit({
    actorUserId: actor?.userId,
    capability: GLOBAL_REPORTING_CAPABILITIES.export,
    hospitalId: dataset.hospital.id,
    outcome: "prepared",
  });

  return { buffer, generatedAt, hospitalCode: dataset.hospital.hospitalCode };
}

export const hospitalReportWorkbookInternals = {
  assignmentCell,
  factCell,
  programContinuationGroups,
  rowsPerProgram,
  setHeaderFacts,
  writeDashboardRows,
  writeServiceRows,
};
