import { hospitalNameSchema } from "../schemas/hospital-governance-schemas";

/** O1-A: one file registers at most 200 Parent Hospitals. */
export const HOSPITAL_BULK_REGISTRATION_LIMIT = 200;
/** 200 rows of a 200-character Thai name fit well inside this (UTF-8). */
export const HOSPITAL_BULK_REGISTRATION_MAX_BYTES = 256 * 1024;

// Hospital codes are always generated, so the file names Hospitals only.
const HEADER = ["name"] as const;

export type HospitalRegistrationCsvError =
  | "EMPTY"
  | "TOO_LARGE"
  | "MALFORMED"
  | "HEADER"
  | "NO_ROWS"
  | "TOO_MANY_ROWS";

export class HospitalRegistrationCsvParseError extends Error {
  readonly reason: HospitalRegistrationCsvError;

  constructor(reason: HospitalRegistrationCsvError) {
    super(`Hospital registration file is invalid: ${reason}`);
    this.name = "HospitalRegistrationCsvParseError";
    this.reason = reason;
  }
}

/**
 * Minimal RFC 4180 reader: comma separator, CRLF or LF records, double-quoted fields with "" escapes and embedded
 * commas or line breaks. A leading UTF-8 BOM is ignored. An unterminated quote or a quote inside an unquoted field is
 * malformed, never guessed.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith("﻿") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  let index = 0;

  const endField = (): void => {
    record.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (index < source.length) {
    const character = source[index];

    if (quoted) {
      if (character === "\"") {
        if (source[index + 1] === "\"") {
          field += "\"";
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        const next = source[index];
        if (next !== undefined && next !== "," && next !== "\n" && next !== "\r") {
          throw new HospitalRegistrationCsvParseError("MALFORMED");
        }
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    if (character === "\"") {
      if (fieldStarted) throw new HospitalRegistrationCsvParseError("MALFORMED");
      quoted = true;
      fieldStarted = true;
      index += 1;
    } else if (character === ",") {
      endField();
      index += 1;
    } else if (character === "\r" || character === "\n") {
      endRecord();
      index += character === "\r" && source[index + 1] === "\n" ? 2 : 1;
    } else {
      field += character;
      fieldStarted = true;
      index += 1;
    }
  }

  if (quoted) throw new HospitalRegistrationCsvParseError("MALFORMED");
  if (fieldStarted || record.length > 0) endRecord();
  return records;
}

export type HospitalRegistrationCsvRow = {
  /** Line of the record in the file (the header is line 1). */
  rowNumber: number;
  name: string;
  valid: boolean;
};

/**
 * Parses `name` rows. Blank lines are skipped; a row with extra fields or an invalid name is kept and marked invalid so
 * the preview can show it. File-level problems throw.
 */
export function parseHospitalRegistrationCsv(text: string): HospitalRegistrationCsvRow[] {
  // String#trim also strips a BOM.
  if (text.trim() === "") throw new HospitalRegistrationCsvParseError("EMPTY");
  if (Buffer.byteLength(text, "utf8") > HOSPITAL_BULK_REGISTRATION_MAX_BYTES) throw new HospitalRegistrationCsvParseError("TOO_LARGE");

  const records = parseCsv(text);
  const [header, ...body] = records;
  if (!header || header.length !== HEADER.length || header.some((value, column) => value.trim() !== HEADER[column])) {
    throw new HospitalRegistrationCsvParseError("HEADER");
  }

  const rows: HospitalRegistrationCsvRow[] = [];
  body.forEach((record, offset) => {
    if (record.every((value) => value.trim() === "")) return;
    const rowNumber = offset + 2;
    const [rawName = ""] = record;
    const name = hospitalNameSchema.safeParse(rawName);
    rows.push({
      rowNumber,
      name: name.success ? name.data : rawName.trim(),
      valid: record.length === HEADER.length && name.success,
    });
  });

  if (rows.length === 0) throw new HospitalRegistrationCsvParseError("NO_ROWS");
  if (rows.length > HOSPITAL_BULK_REGISTRATION_LIMIT) throw new HospitalRegistrationCsvParseError("TOO_MANY_ROWS");
  return rows;
}

/** Similarity key: Unicode NFC, all whitespace removed, case-folded. "รพ. ขอนแก่น" and "รพ.ขอนแก่น" collide. */
export function normalizeHospitalName(name: string): string {
  return name.normalize("NFC").replace(/\s+/gu, "").toLocaleLowerCase("th-TH");
}
