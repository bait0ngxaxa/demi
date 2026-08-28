import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateRawSync } from "node:zlib";

import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import {
  patientImportAdapterInternals,
  readPatientImportCandidates,
  type PatientImportUpload,
} from "../adapters/excel-patient-import-adapter";
import { PATIENT_IMPORT_TEMPLATE_COLUMNS } from "./patient-import-template-contract";
import { createPatientImportTemplateWorkbook } from "./patient-import-template";
import {
  MAX_PATIENT_IMPORT_RESOURCE_WORKSHEETS,
  PATIENT_IMPORT_XLSX_RESOURCE_POLICY,
  PatientImportXlsxMalformedError,
  PatientImportXlsxResourceLimitError,
  patientImportXlsxResourcePreflightInternals,
  preflightPatientImportXlsx,
  type PatientImportXlsxResourcePolicy,
} from "./patient-import-xlsx-resource-preflight";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const publicTemplatePath = resolve(
  process.cwd(),
  "public/templates/demi-patient-import-template-v1.xlsx",
);

type TestZipEntry = {
  name: string;
  contents: string | Buffer;
  compressionMethod?: number;
  flags?: number;
  declaredCompressedSize?: number;
  declaredUncompressedSize?: number;
};

function crc32(buffer: Buffer): number {
  let result = 0xffffffff;

  for (const byte of buffer) {
    result ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0);
    }
  }

  return (result ^ 0xffffffff) >>> 0;
}

function createZip(entries: readonly TestZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const contents = Buffer.isBuffer(entry.contents)
      ? entry.contents
      : Buffer.from(entry.contents, "utf8");
    const compressionMethod = entry.compressionMethod ?? 0;
    const compressed = compressionMethod === 8 ? deflateRawSync(contents) : contents;
    const flags = entry.flags ?? 0;
    const compressedSize = entry.declaredCompressedSize ?? compressed.byteLength;
    const uncompressedSize = entry.declaredUncompressedSize ?? contents.byteLength;
    const checksum = crc32(contents);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(name.byteLength, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(Buffer.concat([localHeader, name, compressed]));

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(name.byteLength, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(Buffer.concat([centralHeader, name]));
    localOffset += localParts[localParts.length - 1]?.byteLength ?? 0;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localDirectory = Buffer.concat(localParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.byteLength, 12);
  endOfCentralDirectory.writeUInt32LE(localDirectory.byteLength, 16);

  return Buffer.concat([localDirectory, centralDirectory, endOfCentralDirectory]);
}

function minimalWorksheetXml(body = ""): string {
  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body}</worksheet>`;
}

function worksheetZip(xml: string): Buffer {
  return createZip([
    { name: "[Content_Types].xml", contents: "<Types/>" },
    { name: "xl/workbook.xml", contents: "<workbook/>" },
    { name: "xl/_rels/workbook.xml.rels", contents: "<Relationships/>" },
    { name: "xl/worksheets/sheet1.xml", contents: xml, compressionMethod: 8 },
  ]);
}

function policyWith(
  overrides: Partial<PatientImportXlsxResourcePolicy>,
): PatientImportXlsxResourcePolicy {
  return { ...PATIENT_IMPORT_XLSX_RESOURCE_POLICY, ...overrides };
}

async function expectResourceLimit(
  buffer: Buffer,
  overrides: Partial<PatientImportXlsxResourcePolicy> = {},
): Promise<void> {
  await expect(
    patientImportXlsxResourcePreflightInternals.preflightWithPolicy(
      buffer,
      policyWith(overrides),
    ),
  ).rejects.toBeInstanceOf(PatientImportXlsxResourceLimitError);
}

async function expectMalformed(buffer: Buffer): Promise<void> {
  await expect(preflightPatientImportXlsx(buffer)).rejects.toBeInstanceOf(
    PatientImportXlsxMalformedError,
  );
}

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(new Uint8Array(written));
}

function createUpload(buffer: Buffer, name = "unsafe.xlsx"): PatientImportUpload {
  return {
    name,
    size: buffer.byteLength,
    arrayBuffer: async () =>
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer,
  };
}

describe("Patient XLSX resource preflight", () => {
  it("accepts the official blank Canonical Template v1", async () => {
    const buffer = await readFile(publicTemplatePath);
    const summary = await preflightPatientImportXlsx(buffer);

    expect(summary).toMatchObject({
      compressedBytes: buffer.byteLength,
      zipEntries: 16,
      worksheetPartCount: 1,
      worksheetCellElements: 14056,
      worksheetRowElements: 502,
      maxRowCoordinate: 502,
      maxColumnCoordinate: 28,
      mergeDeclarations: 27,
      maxMergeArea: 2,
      totalMergeArea: 54,
    });
  });

  it("accepts a synthetic Canonical Template with exactly 500 patients", async () => {
    const workbook = await createPatientImportTemplateWorkbook();
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("The synthetic canonical workbook has no worksheet");
    }

    for (let rowNumber = 3; rowNumber <= 502; rowNumber += 1) {
      for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
        worksheet.getCell(`${column.column}${rowNumber}`).value =
          `synthetic-${rowNumber}-${column.column}`;
      }
    }

    const buffer = await workbookBuffer(workbook);
    const summary = await preflightPatientImportXlsx(buffer);

    expect(summary).toMatchObject({
      compressedBytes: buffer.byteLength,
      zipEntries: 16,
      worksheetPartCount: 1,
      worksheetCellElements: 14056,
      worksheetRowElements: 502,
      maxRowCoordinate: 502,
      maxColumnCoordinate: 28,
      mergeDeclarations: 27,
      maxMergeArea: 2,
      totalMergeArea: 54,
    });
  });

  it("accepts a normal wide compatibility workbook", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Roster");
    worksheet.addRow(Array.from({ length: 34 }, (_, index) => `header-${index}`));
    worksheet.addRow(Array.from({ length: 34 }, (_, index) => `value-${index}`));

    const summary = await preflightPatientImportXlsx(await workbookBuffer(workbook));

    expect(summary).toMatchObject({
      worksheetPartCount: 1,
      worksheetCellElements: 68,
      worksheetRowElements: 2,
      maxRowCoordinate: 2,
      maxColumnCoordinate: 34,
    });
  });

  it("fails closed for a malformed ZIP", async () => {
    await expectMalformed(Buffer.from("not an XLSX package", "utf8"));
  });

  it("rejects a package with too many ZIP entries before entry iteration", async () => {
    const buffer = createZip([
      { name: "entry-1.xml", contents: "x" },
      { name: "entry-2.xml", contents: "x" },
      { name: "entry-3.xml", contents: "x" },
    ]);

    await expectResourceLimit(buffer, { maxZipEntries: 2 });
  });

  it("rejects cumulative declared uncompressed bytes over the policy", async () => {
    const buffer = createZip([
      {
        name: "entry-1.xml",
        contents: "x",
        compressionMethod: 8,
        declaredUncompressedSize: 3,
      },
      {
        name: "entry-2.xml",
        contents: "x",
        compressionMethod: 8,
        declaredUncompressedSize: 2,
      },
    ]);

    await expectResourceLimit(buffer, {
      maxTotalUncompressedBytes: 4,
      maxEntryUncompressedBytes: 4,
    });
  });

  it("rejects a small compressed package whose declared XML expands beyond the policy", async () => {
    const worksheet = minimalWorksheetXml(
      `<sheetData><row r="1"><c r="A1"><v>${"x".repeat(2_048)}</v></c></row></sheetData>`,
    );
    const buffer = worksheetZip(worksheet);

    expect(buffer.byteLength).toBeLessThan(1_024);
    expect(Buffer.byteLength(worksheet, "utf8")).toBeGreaterThan(1_024);
    await expectResourceLimit(buffer, {
      maxTotalUncompressedBytes: 1_024,
      maxEntryUncompressedBytes: 1_024,
    });
  });

  it("rejects an individual entry over the policy", async () => {
    const buffer = createZip([
      {
        name: "entry.xml",
        contents: "x",
        compressionMethod: 8,
        declaredUncompressedSize: 5,
      },
    ]);

    await expectResourceLimit(buffer, {
      maxTotalUncompressedBytes: 8,
      maxEntryUncompressedBytes: 4,
    });
  });

  it("rejects duplicate exact and normalized package entry names", async () => {
    await expectMalformed(
      createZip([
        { name: "xl/workbook.xml", contents: "x" },
        { name: "xl/workbook.xml", contents: "x" },
      ]),
    );
    await expectMalformed(
      createZip([
        { name: "xl/workbook.xml", contents: "x" },
        { name: "xl/./workbook.xml", contents: "x" },
      ]),
    );
  });

  it("rejects suspicious names and unsupported compression methods", async () => {
    for (const name of ["\u0000entry.xml", "/xl/workbook.xml", "../entry.xml"]) {
      await expectMalformed(createZip([{ name, contents: "x" }]));
    }

    await expectMalformed(
      createZip([{ name: "entry.xml", contents: "x", compressionMethod: 99 }]),
    );
  });

  it("rejects encrypted entries", async () => {
    await expectMalformed(
      createZip([
        {
          name: "entry.xml",
          contents: "x",
          compressionMethod: 8,
          flags: 0x1,
        },
      ]),
    );
  });

  it("rejects a malformed local file header", async () => {
    const buffer = createZip([{ name: "entry.xml", contents: "x" }]);
    buffer.writeUInt32LE(0, 0);

    await expectMalformed(buffer);
  });

  it("checks actual decompressed worksheet bytes in addition to declared metadata", async () => {
    const worksheet = minimalWorksheetXml("<sheetData><row r=\"1\"/></sheetData>");
    const contents = Buffer.from(worksheet, "utf8");
    const buffer = createZip([
      {
        name: "xl/worksheets/sheet1.xml",
        contents,
        compressionMethod: 8,
        declaredUncompressedSize: contents.byteLength - 1,
      },
    ]);

    await expectMalformed(buffer);
  });

  it("rejects an extreme worksheet dimension before ExcelJS", async () => {
    await expectResourceLimit(
      worksheetZip(minimalWorksheetXml("<dimension ref=\"A1:XFD1048576\"/>")),
    );
  });

  it("rejects extreme cell and row coordinates before ExcelJS", async () => {
    await expectResourceLimit(
      worksheetZip(
        minimalWorksheetXml(
          "<sheetData><row r=\"1\"><c r=\"XFD1048576\"/></row></sheetData>",
        ),
      ),
    );
    await expectResourceLimit(
      worksheetZip(minimalWorksheetXml("<sheetData><row r=\"1048576\"/></sheetData>")),
    );
  });

  it("rejects an extreme merge range before ExcelJS", async () => {
    await expectResourceLimit(
      worksheetZip(
        minimalWorksheetXml(
          "<mergeCells><mergeCell ref=\"A1:XFD1048576\"/></mergeCells>",
        ),
      ),
    );
  });

  it("rejects excessive merge declarations and cell elements with compact XML", async () => {
    await expectResourceLimit(
      worksheetZip(
        minimalWorksheetXml(
          "<mergeCells><mergeCell ref=\"A1:A1\"/><mergeCell ref=\"B1:B1\"/></mergeCells>",
        ),
      ),
      { maxMergeDeclarations: 1 },
    );
    await expectResourceLimit(
      worksheetZip(
        minimalWorksheetXml(
          "<sheetData><row r=\"1\"><c r=\"A1\"/><c r=\"B1\"/></row></sheetData>",
        ),
      ),
      { maxWorksheetCells: 1 },
    );
  });

  it("rejects a package with more worksheet parts than the resource budget", async () => {
    const entries = Array.from(
      { length: MAX_PATIENT_IMPORT_RESOURCE_WORKSHEETS + 1 },
      (_, index) => ({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        contents: minimalWorksheetXml(),
        compressionMethod: 8,
      }),
    );

    await expectResourceLimit(createZip(entries));
  });

  it("rejects DTD/entity constructs without expanding them", async () => {
    await expectMalformed(
      worksheetZip(
        "<!DOCTYPE worksheet [<!ENTITY injected \"not-expanded\">]>" +
          minimalWorksheetXml("<sheetData>&injected;</sheetData>"),
      ),
    );
  });

  it("rejects the resource envelope before the adapter invokes ExcelJS", async () => {
    const unsafeBuffer = worksheetZip(
      minimalWorksheetXml("<dimension ref=\"A1:XFD1048576\"/>"),
    );
    const upload = createUpload(unsafeBuffer);
    const loadSpy = vi.spyOn(patientImportAdapterInternals, "loadPatientImportWorkbook");

    try {
      await expect(
        readPatientImportCandidates(upload, targetHospitalId, { mode: "COMPATIBILITY" }),
      ).rejects.toBeInstanceOf(PatientImportXlsxResourceLimitError);
      expect(loadSpy).not.toHaveBeenCalled();
    } finally {
      loadSpy.mockRestore();
    }
  });

  it("keeps the production resource policy finite and above the measured template shape", () => {
    expect(PATIENT_IMPORT_XLSX_RESOURCE_POLICY.maxZipEntries).toBe(256);
    expect(PATIENT_IMPORT_XLSX_RESOURCE_POLICY.maxTotalUncompressedBytes).toBe(
      32 * 1024 * 1024,
    );
    expect(PATIENT_IMPORT_XLSX_RESOURCE_POLICY.maxEntryUncompressedBytes).toBe(
      16 * 1024 * 1024,
    );
  });
});
