import { describe, expect, it } from "vitest";

import {
  HOSPITAL_BULK_REGISTRATION_LIMIT,
  HospitalRegistrationCsvParseError,
  normalizeHospitalName,
  parseCsv,
  parseHospitalRegistrationCsv,
} from "./hospital-registration-csv";

function reasonOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error: unknown) {
    return error instanceof HospitalRegistrationCsvParseError ? error.reason : "OTHER";
  }
}

describe("parseCsv", () => {
  it("reads quoted fields, commas and line breaks inside quotes, escaped quotes, Thai text, BOM and CRLF", () => {
    expect(parseCsv('﻿name,hospitalCode\r\n"โรงพยาบาล, สาขา ""ใหม่""",A-1\r\n"สองบรรทัด\r\nต่อ",\r\nไทย,B\n')).toEqual([
      ["name", "hospitalCode"],
      ['โรงพยาบาล, สาขา "ใหม่"', "A-1"],
      ["สองบรรทัด\r\nต่อ", ""],
      ["ไทย", "B"],
    ]);
  });

  it("keeps a last record without a trailing newline and empty fields", () => {
    expect(parseCsv("a,b\n,\nc,")).toEqual([["a", "b"], ["", ""], ["c", ""]]);
  });

  it("refuses an unterminated quote or a quote inside an unquoted field", () => {
    expect(reasonOf(() => parseCsv('a,b\n"open,x\n'))).toBe("MALFORMED");
    expect(reasonOf(() => parseCsv('a,b\nab"c,d\n'))).toBe("MALFORMED");
    expect(reasonOf(() => parseCsv('a,b\n"x"y,d\n'))).toBe("MALFORMED");
  });
});

describe("parseHospitalRegistrationCsv", () => {
  it("validates name rows with the registration schema and numbers them by file line", () => {
    const longName = "ก".repeat(201);
    expect(parseHospitalRegistrationCsv(`name\n  โรงพยาบาลเอ  \n\n"โรงพยาบาลบี, สาขา 2"\n" "\nสาม,A-1\n${longName}\n`)).toEqual([
      { rowNumber: 2, name: "โรงพยาบาลเอ", valid: true },
      { rowNumber: 4, name: "โรงพยาบาลบี, สาขา 2", valid: true },
      // Line 5 holds only whitespace: in a one-column file it is a blank line and is skipped.
      // Hospital codes are always generated; a second column makes the row invalid.
      { rowNumber: 6, name: "สาม", valid: false },
      { rowNumber: 7, name: longName, valid: false },
    ]);
  });

  it("rejects file-level problems", () => {
    expect(reasonOf(() => parseHospitalRegistrationCsv("﻿  \n"))).toBe("EMPTY");
    expect(reasonOf(() => parseHospitalRegistrationCsv("ชื่อ\nA\n"))).toBe("HEADER");
    // The earlier two-column template is refused rather than half-read.
    expect(reasonOf(() => parseHospitalRegistrationCsv("name,hospitalCode\nA,B\n"))).toBe("HEADER");
    expect(reasonOf(() => parseHospitalRegistrationCsv("name\n\n \n"))).toBe("NO_ROWS");
    const tooMany = `name\n${Array.from({ length: HOSPITAL_BULK_REGISTRATION_LIMIT + 1 }, (_, index) => `รพ ${index}`).join("\n")}`;
    expect(reasonOf(() => parseHospitalRegistrationCsv(tooMany))).toBe("TOO_MANY_ROWS");
    const exactly = `name\n${Array.from({ length: HOSPITAL_BULK_REGISTRATION_LIMIT }, (_, index) => `รพ ${index}`).join("\n")}`;
    expect(parseHospitalRegistrationCsv(exactly)).toHaveLength(HOSPITAL_BULK_REGISTRATION_LIMIT);
    expect(reasonOf(() => parseHospitalRegistrationCsv(`name\n${"ก".repeat(90_000)}\n`))).toBe("TOO_LARGE");
  });
});

describe("normalizeHospitalName", () => {
  it("ignores whitespace and case, and composes Unicode", () => {
    expect(normalizeHospitalName(" รพ.  ขอนแก่น\t")).toBe(normalizeHospitalName("รพ.ขอนแก่น"));
    expect(normalizeHospitalName("Bangkok Hospital")).toBe(normalizeHospitalName("BANGKOKHOSPITAL"));
    expect(normalizeHospitalName("é")).toBe(normalizeHospitalName("é"));
    expect(normalizeHospitalName("รพ.เอ")).not.toBe(normalizeHospitalName("รพ.บี"));
  });
});
