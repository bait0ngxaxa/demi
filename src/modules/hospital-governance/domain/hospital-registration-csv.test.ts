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
  it("validates rows with the registration schema and numbers them by file line", () => {
    expect(parseHospitalRegistrationCsv("name,hospitalCode\n  โรงพยาบาลเอ  , a-1 \n\nโรงพยาบาลบี,\n,X\nสาม,รหัสไทย\nสี่,A,extra\n")).toEqual([
      { rowNumber: 2, name: "โรงพยาบาลเอ", hospitalCode: "A-1", valid: true },
      { rowNumber: 4, name: "โรงพยาบาลบี", hospitalCode: null, valid: true },
      { rowNumber: 5, name: "", hospitalCode: "X", valid: false },
      { rowNumber: 6, name: "สาม", hospitalCode: "รหัสไทย", valid: false },
      { rowNumber: 7, name: "สี่", hospitalCode: "A", valid: false },
    ]);
  });

  it("rejects file-level problems", () => {
    expect(reasonOf(() => parseHospitalRegistrationCsv("﻿  \n"))).toBe("EMPTY");
    expect(reasonOf(() => parseHospitalRegistrationCsv("hospitalCode,name\nA,B\n"))).toBe("HEADER");
    expect(reasonOf(() => parseHospitalRegistrationCsv("name\nA\n"))).toBe("HEADER");
    expect(reasonOf(() => parseHospitalRegistrationCsv("name,hospitalCode\n\n,\n"))).toBe("NO_ROWS");
    const tooMany = `name,hospitalCode\n${Array.from({ length: HOSPITAL_BULK_REGISTRATION_LIMIT + 1 }, (_, index) => `รพ ${index},`).join("\n")}`;
    expect(reasonOf(() => parseHospitalRegistrationCsv(tooMany))).toBe("TOO_MANY_ROWS");
    const exactly = `name,hospitalCode\n${Array.from({ length: HOSPITAL_BULK_REGISTRATION_LIMIT }, (_, index) => `รพ ${index},`).join("\n")}`;
    expect(parseHospitalRegistrationCsv(exactly)).toHaveLength(HOSPITAL_BULK_REGISTRATION_LIMIT);
    expect(reasonOf(() => parseHospitalRegistrationCsv(`name,hospitalCode\n${"ก".repeat(90_000)},\n`))).toBe("TOO_LARGE");
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
