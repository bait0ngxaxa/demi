import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HospitalRegistrationCsvParseError, parseHospitalRegistrationCsv } from "./hospital-registration-csv";

describe("downloadable Parent import template", () => {
  it("is UTF-8 with a BOM and carries exactly the header the import accepts", () => {
    const bytes = readFileSync(join(process.cwd(), "public/templates/hospital-parent-import-template.csv"));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString("utf8");
    expect(text).toBe("﻿name\r\n");
    // Header only: no sample row can be imported by mistake.
    expect(() => parseHospitalRegistrationCsv(text)).toThrow(HospitalRegistrationCsvParseError);
    expect(parseHospitalRegistrationCsv(`${text}โรงพยาบาลขอนแก่น\r\n`)).toEqual([
      { rowNumber: 2, name: "โรงพยาบาลขอนแก่น", valid: true },
    ]);
  });
});
