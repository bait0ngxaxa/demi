import ExcelJS from "exceljs";
import type { Cell } from "exceljs";

import type {
  PatientImportDateFormat,
  PatientImportDiagnosticCode,
} from "./patient-import-contract";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";

export type CellNormalizationResult<T> = {
  value: T | null;
  diagnostics: readonly PatientImportDiagnosticCode[];
};

type CellState =
  | { kind: "missing"; text: string }
  | { kind: "text"; text: string }
  | { kind: "number"; text: string; value: number }
  | { kind: "date"; text: string; value: Date }
  | { kind: "unsupported"; text: string };

const MISSING_MARKER = "-";
const THAI_MONTHS: Readonly<Record<string, number>> = {
  มกราคม: 1,
  "ม.ค.": 1,
  กุมภาพันธ์: 2,
  "ก.พ.": 2,
  มีนาคม: 3,
  "มี.ค.": 3,
  เมษายน: 4,
  "เม.ย.": 4,
  พฤษภาคม: 5,
  "พ.ค.": 5,
  มิถุนายน: 6,
  "มิ.ย.": 6,
  กรกฎาคม: 7,
  "ก.ค.": 7,
  สิงหาคม: 8,
  "ส.ค.": 8,
  กันยายน: 9,
  "ก.ย.": 9,
  ตุลาคม: 10,
  "ต.ค.": 10,
  พฤศจิกายน: 11,
  "พ.ย.": 11,
  ธันวาคม: 12,
  "ธ.ค.": 12,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingText(value: string): boolean {
  const normalized = value.replace(/[\s\u00A0\u2000-\u200B\u202F\u3000]+/gu, " ").trim();
  return normalized === "" || normalized === MISSING_MARKER;
}

function cellDisplayText(cell: Cell): string {
  return cell.text.replace(/^\uFEFF/u, "").trim();
}

function readCellState(cell: Cell): CellState {
  const text = cellDisplayText(cell);

  if (cell.type === ExcelJS.ValueType.Formula) {
    return { kind: "unsupported", text };
  }

  if (cell.type === ExcelJS.ValueType.Error) {
    return { kind: "unsupported", text };
  }

  const value = cell.value;

  if (value === null || value === undefined || (typeof value === "string" && isMissingText(value))) {
    return { kind: "missing", text };
  }

  if (typeof value === "string") {
    return isMissingText(value)
      ? { kind: "missing", text }
      : { kind: "text", text: value.trim() };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "number", text, value };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { kind: "date", text, value };
  }

  if (isRecord(value) && typeof value.text === "string" && !isMissingText(value.text)) {
    return { kind: "text", text: value.text.trim() };
  }

  return { kind: "unsupported", text };
}

function diagnosticsForUnsupportedCell(cell: Cell): readonly PatientImportDiagnosticCode[] {
  if (cell.type === ExcelJS.ValueType.Formula) {
    return ["FORMULA_VALUE"];
  }

  if (cell.type === ExcelJS.ValueType.Error) {
    return ["EXCEL_ERROR"];
  }

  return ["INVALID_VALUE"];
}

export function normalizeTextCell(cell: Cell): CellNormalizationResult<string> {
  const state = readCellState(cell);

  if (state.kind === "missing") {
    return { value: null, diagnostics: [] };
  }

  if (state.kind === "unsupported") {
    return { value: null, diagnostics: diagnosticsForUnsupportedCell(cell) };
  }

  if (state.kind === "date") {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  const value = state.kind === "number" ? String(state.value) : state.text.trim();
  return isMissingText(value)
    ? { value: null, diagnostics: [] }
    : { value, diagnostics: [] };
}

function normalizePatientClassificationText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/gu, " ")
    .trim()
    .replace(/^[\s"“”‘’.,;:!?]+/gu, "")
    .replace(/[\s"“”‘’.,;:!?]+$/gu, "")
    .trim()
    .toLocaleLowerCase("th-TH");
}

export function normalizePatientClassificationCell(
  cell: Cell,
): CellNormalizationResult<PatientClassificationType> {
  const state = readCellState(cell);

  if (state.kind === "missing") {
    return { value: null, diagnostics: [] };
  }

  if (state.kind === "unsupported") {
    const diagnostics: PatientImportDiagnosticCode[] = [
      ...diagnosticsForUnsupportedCell(cell),
      "CLASSIFICATION_DATA_INVALID",
    ];

    return {
      value: null,
      diagnostics: [...new Set(diagnostics)],
    };
  }

  if (state.kind === "date" || state.kind === "number") {
    return { value: null, diagnostics: ["CLASSIFICATION_DATA_INVALID"] };
  }

  const normalized = normalizePatientClassificationText(state.text);

  if (normalized === "กลุ่มเสี่ยง") {
    return { value: "RISK", diagnostics: [] };
  }

  if (normalized === "เบาหวาน") {
    return { value: "DIABETES", diagnostics: [] };
  }

  return { value: null, diagnostics: ["CLASSIFICATION_DATA_INVALID"] };
}

export function normalizeNationalIdCell(cell: Cell): CellNormalizationResult<string> {
  const state = readCellState(cell);

  if (state.kind === "missing") {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  if (state.kind === "unsupported") {
    return { value: null, diagnostics: diagnosticsForUnsupportedCell(cell) };
  }

  if (state.kind === "date") {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  if (state.kind === "number") {
    if (!Number.isSafeInteger(state.value) || state.value < 0) {
      return { value: null, diagnostics: ["LOSSY_EXCEL_VALUE"] };
    }

    return { value: String(state.value), diagnostics: [] };
  }

  if (/[eE][+-]?\d+/u.test(state.text)) {
    return { value: null, diagnostics: ["LOSSY_EXCEL_VALUE"] };
  }

  const normalized = state.text.replace(/[\s-]/gu, "");

  return /^\d{13}$/u.test(normalized)
    ? { value: normalized, diagnostics: [] }
    : { value: null, diagnostics: ["INVALID_VALUE"] };
}

export function normalizePhoneCell(cell: Cell): CellNormalizationResult<string> {
  const state = readCellState(cell);

  if (state.kind === "missing") {
    return { value: null, diagnostics: [] };
  }

  if (state.kind === "unsupported") {
    return { value: null, diagnostics: diagnosticsForUnsupportedCell(cell) };
  }

  if (state.kind === "date") {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  if (state.kind === "number") {
    if (!Number.isSafeInteger(state.value) || state.value < 0) {
      return { value: null, diagnostics: ["LOSSY_EXCEL_VALUE"] };
    }

    return {
      value: String(state.value),
      diagnostics: ["LOSSY_EXCEL_VALUE", "AMBIGUOUS_VALUE"],
    };
  }

  const normalized = state.text.replace(/[\s()-]/gu, "");

  if (!/^\+?\d+$/u.test(normalized)) {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  return { value: normalized, diagnostics: [] };
}

export function normalizeNumericCell(cell: Cell): CellNormalizationResult<number> {
  const state = readCellState(cell);

  if (state.kind === "missing") {
    return { value: null, diagnostics: [] };
  }

  if (state.kind === "unsupported") {
    return { value: null, diagnostics: diagnosticsForUnsupportedCell(cell) };
  }

  if (state.kind === "date") {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  if (state.kind === "number") {
    return { value: state.value, diagnostics: [] };
  }

  const normalized = state.text.replace(/,/gu, "");

  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(normalized)) {
    return { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  const value = Number(normalized);
  return Number.isFinite(value)
    ? { value, diagnostics: [] }
    : { value: null, diagnostics: ["INVALID_VALUE"] };
}

function isDateNumberFormat(format: string | undefined): boolean {
  if (!format) {
    return false;
  }

  return /(?:d{1,4}|y{2,4})/iu.test(format) || /(?:mmm|mmmm)/iu.test(format);
}

function formatDateOnly(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  return validateDateParts(year, month, day);
}

function excelSerialDateToDateOnly(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 200000) {
    return null;
  }

  const milliseconds = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return formatDateOnly(new Date(milliseconds));
}

function normalizeCalendarYear(year: number): number | null {
  if (year >= 2400 && year <= 2700) {
    return year - 543;
  }

  if (year >= 1900 && year <= 2200) {
    return year;
  }

  return null;
}

function validateDateParts(year: number, month: number, day: number): string | null {
  const normalizedYear = normalizeCalendarYear(year);

  if (!normalizedYear || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(normalizedYear, month - 1, day));

  if (
    date.getUTCFullYear() !== normalizedYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(normalizedYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseThaiMonthDate(value: string): string | null {
  const match = /^(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*(\d{4})$/u.exec(
    value.replace(/[\s\u00A0]+/gu, " ").trim(),
  );

  if (!match) {
    return null;
  }

  const month = THAI_MONTHS[match[2]];
  return month ? validateDateParts(Number(match[3]), month, Number(match[1])) : null;
}

function parseIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(value);
  return match
    ? validateDateParts(Number(match[1]), Number(match[2]), Number(match[3]))
    : null;
}

function parseDmyDate(value: string): string | null {
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/u.exec(value);
  return match
    ? validateDateParts(Number(match[3]), Number(match[2]), Number(match[1]))
    : null;
}

export function normalizeDateCell(
  cell: Cell,
  dateFormat: PatientImportDateFormat,
): CellNormalizationResult<string> {
  const state = readCellState(cell);

  if (state.kind === "missing") {
    return { value: null, diagnostics: [] };
  }

  if (state.kind === "unsupported") {
    return { value: null, diagnostics: diagnosticsForUnsupportedCell(cell) };
  }

  if (state.kind === "date") {
    const value = formatDateOnly(state.value);
    return value
      ? { value, diagnostics: [] }
      : { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  if (state.kind === "number") {
    if (!isDateNumberFormat(cell.numFmt)) {
      return { value: null, diagnostics: ["AMBIGUOUS_VALUE"] };
    }

    const value = excelSerialDateToDateOnly(state.value);
    return value
      ? { value, diagnostics: [] }
      : { value: null, diagnostics: ["INVALID_VALUE"] };
  }

  const text = state.text.replace(/[\s\u00A0]+/gu, " ").trim();
  const thaiMonthDate = parseThaiMonthDate(text);

  if (thaiMonthDate) {
    return { value: thaiMonthDate, diagnostics: [] };
  }

  const isoDate = parseIsoDate(text);

  if (isoDate) {
    return { value: isoDate, diagnostics: [] };
  }

  if (dateFormat !== "DMY") {
    return { value: null, diagnostics: ["AMBIGUOUS_VALUE"] };
  }

  const dmyDate = parseDmyDate(text);
  return dmyDate
    ? { value: dmyDate, diagnostics: [] }
    : { value: null, diagnostics: ["INVALID_VALUE"] };
}

export function isMissingCell(cell: Cell): boolean {
  return readCellState(cell).kind === "missing";
}
