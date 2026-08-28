import "server-only";

import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import { SaxesParser } from "saxes";
import * as yauzl from "yauzl";

import { ValidationError } from "@/shared/errors/application-error";

export const MAX_PATIENT_IMPORT_ZIP_ENTRIES = 256;
export const MAX_PATIENT_IMPORT_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_PATIENT_IMPORT_ZIP_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
export const MAX_PATIENT_IMPORT_RESOURCE_WORKSHEETS = 12;
export const MAX_PATIENT_IMPORT_RESOURCE_XML_CELLS = 65_536;
export const MAX_PATIENT_IMPORT_RESOURCE_XML_ROWS = 2_048;
export const MAX_PATIENT_IMPORT_RESOURCE_ROW_COORDINATE = 10_000;
export const MAX_PATIENT_IMPORT_RESOURCE_COLUMN_COORDINATE = 256;
export const MAX_PATIENT_IMPORT_RESOURCE_MERGE_COUNT = 64;
export const MAX_PATIENT_IMPORT_RESOURCE_MERGE_AREA = 4_096;
export const MAX_PATIENT_IMPORT_RESOURCE_TOTAL_MERGE_AREA = 16_384;
export const MAX_PATIENT_IMPORT_RESOURCE_DIMENSION_AREA = 65_536;
export const MAX_PATIENT_IMPORT_RESOURCE_XML_DEPTH = 64;

export const PATIENT_IMPORT_XLSX_RESOURCE_LIMIT_MESSAGE =
  "ไฟล์ Excel มีโครงสร้างภายในเกินขนาดที่ระบบรองรับ กรุณาใช้ Template ของระบบและตรวจสอบไฟล์อีกครั้ง";
export const PATIENT_IMPORT_XLSX_MALFORMED_MESSAGE =
  "ไฟล์ Excel ไม่ถูกต้องหรือไม่สามารถอ่านได้";

export type PatientImportXlsxResourcePolicy = Readonly<{
  maxZipEntries: number;
  maxTotalUncompressedBytes: number;
  maxEntryUncompressedBytes: number;
  maxWorksheetParts: number;
  maxWorksheetCells: number;
  maxWorksheetRows: number;
  maxRowCoordinate: number;
  maxColumnCoordinate: number;
  maxMergeDeclarations: number;
  maxSingleMergeArea: number;
  maxTotalMergeArea: number;
  maxDimensionArea: number;
  maxXmlDepth: number;
}>;

export const PATIENT_IMPORT_XLSX_RESOURCE_POLICY: PatientImportXlsxResourcePolicy = {
  maxZipEntries: MAX_PATIENT_IMPORT_ZIP_ENTRIES,
  maxTotalUncompressedBytes: MAX_PATIENT_IMPORT_UNCOMPRESSED_BYTES,
  maxEntryUncompressedBytes: MAX_PATIENT_IMPORT_ZIP_ENTRY_UNCOMPRESSED_BYTES,
  maxWorksheetParts: MAX_PATIENT_IMPORT_RESOURCE_WORKSHEETS,
  maxWorksheetCells: MAX_PATIENT_IMPORT_RESOURCE_XML_CELLS,
  maxWorksheetRows: MAX_PATIENT_IMPORT_RESOURCE_XML_ROWS,
  maxRowCoordinate: MAX_PATIENT_IMPORT_RESOURCE_ROW_COORDINATE,
  maxColumnCoordinate: MAX_PATIENT_IMPORT_RESOURCE_COLUMN_COORDINATE,
  maxMergeDeclarations: MAX_PATIENT_IMPORT_RESOURCE_MERGE_COUNT,
  maxSingleMergeArea: MAX_PATIENT_IMPORT_RESOURCE_MERGE_AREA,
  maxTotalMergeArea: MAX_PATIENT_IMPORT_RESOURCE_TOTAL_MERGE_AREA,
  maxDimensionArea: MAX_PATIENT_IMPORT_RESOURCE_DIMENSION_AREA,
  maxXmlDepth: MAX_PATIENT_IMPORT_RESOURCE_XML_DEPTH,
};

export class PatientImportXlsxResourceLimitError extends ValidationError {
  constructor() {
    super(PATIENT_IMPORT_XLSX_RESOURCE_LIMIT_MESSAGE);
    this.name = "PatientImportXlsxResourceLimitError";
  }
}

export class PatientImportXlsxMalformedError extends ValidationError {
  constructor() {
    super(PATIENT_IMPORT_XLSX_MALFORMED_MESSAGE);
    this.name = "PatientImportXlsxMalformedError";
  }
}

export type PatientImportXlsxResourceSummary = Readonly<{
  compressedBytes: number;
  zipEntries: number;
  declaredTotalUncompressedBytes: number;
  declaredLargestEntryUncompressedBytes: number;
  worksheetPartCount: number;
  worksheetXmlBytes: number;
  worksheetCellElements: number;
  worksheetRowElements: number;
  maxRowCoordinate: number;
  maxColumnCoordinate: number;
  mergeDeclarations: number;
  maxMergeArea: number;
  totalMergeArea: number;
}>;

type MutableResourceSummary = {
  compressedBytes: number;
  zipEntries: number;
  declaredTotalUncompressedBytes: number;
  declaredLargestEntryUncompressedBytes: number;
  worksheetPartCount: number;
  worksheetXmlBytes: number;
  worksheetCellElements: number;
  worksheetRowElements: number;
  maxRowCoordinate: number;
  maxColumnCoordinate: number;
  mergeDeclarations: number;
  maxMergeArea: number;
  totalMergeArea: number;
};

type CellCoordinate = {
  row: number;
  column: number;
};

type CellRange = {
  start: CellCoordinate;
  end: CellCoordinate;
};

function throwResourceLimit(): never {
  throw new PatientImportXlsxResourceLimitError();
}

function throwMalformed(): never {
  throw new PatientImportXlsxMalformedError();
}

function assertResourcePolicy(policy: PatientImportXlsxResourcePolicy): void {
  for (const value of Object.values(policy)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Invalid XLSX resource policy");
    }
  }

  if (policy.maxEntryUncompressedBytes > policy.maxTotalUncompressedBytes) {
    throw new Error("Invalid XLSX resource policy");
  }
}

function isWorksheetPartName(fileName: string): boolean {
  return /^xl\/worksheets\/sheet\d+\.xml/u.test(fileName);
}

function normalizePackageEntryName(fileName: string): string {
  if (
    fileName.length === 0 ||
    fileName.includes("\u0000") ||
    fileName.includes("\\") ||
    fileName.startsWith("/") ||
    /^[a-zA-Z]:/u.test(fileName)
  ) {
    return throwMalformed();
  }

  const segments = fileName.split("/");

  if (segments.some((segment) => segment === "..")) {
    return throwMalformed();
  }

  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");

  return normalized || throwMalformed();
}

function assertSafeZipSize(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throwMalformed();
  }
}

function assertEntryMetadata(
  entry: yauzl.Entry,
  bufferByteLength: number,
  policy: PatientImportXlsxResourcePolicy,
  declaredTotalUncompressedBytes: number,
): number {
  assertSafeZipSize(entry.compressedSize);
  assertSafeZipSize(entry.uncompressedSize);
  assertSafeZipSize(entry.relativeOffsetOfLocalHeader);

  if (entry.compressedSize > bufferByteLength || entry.relativeOffsetOfLocalHeader > bufferByteLength) {
    throwMalformed();
  }

  if (entry.uncompressedSize > policy.maxEntryUncompressedBytes) {
    throwResourceLimit();
  }

  if (
    declaredTotalUncompressedBytes >
    policy.maxTotalUncompressedBytes - entry.uncompressedSize
  ) {
    throwResourceLimit();
  }

  if (
    entry.isEncrypted() ||
    (entry.generalPurposeBitFlag & 0x40) !== 0 ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
  ) {
    throwMalformed();
  }

  return declaredTotalUncompressedBytes + entry.uncompressedSize;
}

function parsePositiveInteger(
  value: string,
  maximum: number,
): number {
  if (!/^[1-9]\d*$/u.test(value)) {
    throwMalformed();
  }

  if (value.length > String(maximum).length) {
    throwResourceLimit();
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throwMalformed();
  }

  if (parsed > maximum) {
    throwResourceLimit();
  }

  return parsed;
}

function parseCellReference(
  reference: string,
  policy: PatientImportXlsxResourcePolicy,
): CellCoordinate {
  const match = /^([a-zA-Z]{1,3})([1-9]\d*)$/u.exec(reference);
  const columnText = match?.[1];
  const rowText = match?.[2];

  if (!columnText || !rowText) {
    throwMalformed();
  }

  if (rowText.length > String(policy.maxRowCoordinate).length) {
    throwResourceLimit();
  }

  let column = 0;

  for (const character of columnText.toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;

    if (!Number.isSafeInteger(column)) {
      throwMalformed();
    }

    if (column > policy.maxColumnCoordinate) {
      throwResourceLimit();
    }
  }

  const row = parsePositiveInteger(rowText, policy.maxRowCoordinate);

  return { row, column };
}

function parseCellRange(
  reference: string,
  policy: PatientImportXlsxResourcePolicy,
): CellRange {
  const separator = reference.indexOf(":");
  const hasRange = separator !== -1;

  if (
    reference.length === 0 ||
    (hasRange &&
      (separator === 0 ||
        separator === reference.length - 1 ||
        reference.indexOf(":", separator + 1) !== -1))
  ) {
    throwMalformed();
  }

  const startReference = hasRange ? reference.slice(0, separator) : reference;
  const endReference = !hasRange
    ? startReference
    : reference.slice(separator + 1);

  if (!startReference || !endReference) {
    throwMalformed();
  }

  const start = parseCellReference(startReference, policy);
  const end = parseCellReference(endReference, policy);

  if (start.row > end.row || start.column > end.column) {
    throwMalformed();
  }

  return { start, end };
}

function multiplySafely(left: number, right: number): number {
  if (right !== 0 && left > Number.MAX_SAFE_INTEGER / right) {
    throwMalformed();
  }

  const result = left * right;

  if (!Number.isSafeInteger(result)) {
    throwMalformed();
  }

  return result;
}

function rangeArea(range: CellRange): number {
  return multiplySafely(
    range.end.row - range.start.row + 1,
    range.end.column - range.start.column + 1,
  );
}

function getAttribute(
  attributes: Record<string, string>,
  name: string,
): string | undefined {
  const value = attributes[name];
  return typeof value === "string" ? value : undefined;
}

function getLocalTagName(name: string): string {
  const separator = name.lastIndexOf(":");
  return separator === -1 ? name : name.slice(separator + 1);
}

function updateCoordinateMaximum(
  summary: MutableResourceSummary,
  coordinate: CellCoordinate,
): void {
  summary.maxRowCoordinate = Math.max(summary.maxRowCoordinate, coordinate.row);
  summary.maxColumnCoordinate = Math.max(summary.maxColumnCoordinate, coordinate.column);
}

function updateRangeMaximum(
  summary: MutableResourceSummary,
  range: CellRange,
): void {
  updateCoordinateMaximum(summary, range.start);
  updateCoordinateMaximum(summary, range.end);
}

function parseColumnSpan(
  value: string,
  policy: PatientImportXlsxResourcePolicy,
): { minimum: number; maximum: number } {
  const separator = value.indexOf(":");

  if (
    separator <= 0 ||
    separator === value.length - 1 ||
    value.indexOf(":", separator + 1) !== -1
  ) {
    throwMalformed();
  }

  const minimum = parsePositiveInteger(value.slice(0, separator), policy.maxColumnCoordinate);
  const maximum = parsePositiveInteger(value.slice(separator + 1), policy.maxColumnCoordinate);

  if (minimum > maximum) {
    throwMalformed();
  }

  return { minimum, maximum };
}

function toBufferChunk(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  throwMalformed();
}

async function inspectWorksheetXml(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
  policy: PatientImportXlsxResourcePolicy,
  summary: MutableResourceSummary,
): Promise<void> {
  let readStream: Readable | undefined;

  try {
    // Omitting options uses yauzl's documented decoded/decompressed stream default.
    readStream = await zipFile.openReadStreamPromise(entry);
    const decoder = new StringDecoder("utf8");
    const parser = new SaxesParser({ xmlns: false });
    let parserError: Error | null = null;
    let depth = 0;
    let sawRoot = false;
    let actualEntryBytes = 0;

    parser.on("error", (error) => {
      parserError = error;
    });
    parser.on("doctype", () => {
      throwMalformed();
    });
    parser.on("opentag", (tag) => {
      depth += 1;

      if (depth > policy.maxXmlDepth) {
        throwResourceLimit();
      }

      if (depth === 1) {
        sawRoot = true;
      }

      const tagName = getLocalTagName(tag.name);
      const attributes = tag.attributes;

      if (tagName === "dimension") {
        const reference = getAttribute(attributes, "ref");

        if (reference) {
          const range = parseCellRange(reference, policy);
          const area = rangeArea(range);

          if (area > policy.maxDimensionArea) {
            throwResourceLimit();
          }

          updateRangeMaximum(summary, range);
        }
      }

      if (tagName === "row") {
        summary.worksheetRowElements += 1;

        if (summary.worksheetRowElements > policy.maxWorksheetRows) {
          throwResourceLimit();
        }

        const rowReference = getAttribute(attributes, "r");

        if (rowReference) {
          const row = parsePositiveInteger(rowReference, policy.maxRowCoordinate);
          summary.maxRowCoordinate = Math.max(summary.maxRowCoordinate, row);
        }

        const spans = getAttribute(attributes, "spans");

        if (spans) {
          const span = parseColumnSpan(spans, policy);
          summary.maxColumnCoordinate = Math.max(summary.maxColumnCoordinate, span.maximum);
        }
      }

      if (tagName === "c") {
        summary.worksheetCellElements += 1;

        if (summary.worksheetCellElements > policy.maxWorksheetCells) {
          throwResourceLimit();
        }

        const cellReference = getAttribute(attributes, "r");

        if (cellReference) {
          updateCoordinateMaximum(summary, parseCellReference(cellReference, policy));
        }
      }

      if (tagName === "col") {
        const minimum = getAttribute(attributes, "min");
        const maximum = getAttribute(attributes, "max");

        if ((minimum === undefined) !== (maximum === undefined)) {
          throwMalformed();
        }

        if (minimum && maximum) {
          const parsedMinimum = parsePositiveInteger(minimum, policy.maxColumnCoordinate);
          const parsedMaximum = parsePositiveInteger(maximum, policy.maxColumnCoordinate);

          if (parsedMinimum > parsedMaximum) {
            throwMalformed();
          }

          summary.maxColumnCoordinate = Math.max(summary.maxColumnCoordinate, parsedMaximum);
        }
      }

      if (tagName === "mergeCell") {
        const reference = getAttribute(attributes, "ref");

        if (!reference) {
          throwMalformed();
        }

        summary.mergeDeclarations += 1;

        if (summary.mergeDeclarations > policy.maxMergeDeclarations) {
          throwResourceLimit();
        }

        const range = parseCellRange(reference, policy);
        const area = rangeArea(range);

        if (area > policy.maxSingleMergeArea) {
          throwResourceLimit();
        }

        if (summary.totalMergeArea > policy.maxTotalMergeArea - area) {
          throwResourceLimit();
        }

        summary.totalMergeArea += area;
        summary.maxMergeArea = Math.max(summary.maxMergeArea, area);
        updateRangeMaximum(summary, range);
      }
    });
    parser.on("closetag", () => {
      depth -= 1;

      if (depth < 0) {
        throwMalformed();
      }
    });

    const writeXml = (chunk: string): void => {
      if (chunk.length === 0) {
        return;
      }

      parser.write(chunk);

      if (parserError) {
        throw parserError;
      }
    };

    for await (const value of readStream) {
      const chunk = toBufferChunk(value);

      if (chunk.length > policy.maxEntryUncompressedBytes - actualEntryBytes) {
        throwResourceLimit();
      }

      actualEntryBytes += chunk.length;

      if (actualEntryBytes > entry.uncompressedSize) {
        throwMalformed();
      }

      if (chunk.length > policy.maxTotalUncompressedBytes - summary.worksheetXmlBytes) {
        throwResourceLimit();
      }

      summary.worksheetXmlBytes += chunk.length;
      writeXml(decoder.write(chunk));
    }

    writeXml(decoder.end());

    if (actualEntryBytes !== entry.uncompressedSize) {
      throwMalformed();
    }

    parser.close();

    if (parserError) {
      throw parserError;
    }

    if (!sawRoot || depth !== 0) {
      throwMalformed();
    }
  } finally {
    if (readStream && !readStream.destroyed) {
      readStream.destroy();
    }
  }
}

function createMutableSummary(compressedBytes: number): MutableResourceSummary {
  return {
    compressedBytes,
    zipEntries: 0,
    declaredTotalUncompressedBytes: 0,
    declaredLargestEntryUncompressedBytes: 0,
    worksheetPartCount: 0,
    worksheetXmlBytes: 0,
    worksheetCellElements: 0,
    worksheetRowElements: 0,
    maxRowCoordinate: 0,
    maxColumnCoordinate: 0,
    mergeDeclarations: 0,
    maxMergeArea: 0,
    totalMergeArea: 0,
  };
}

function toReadonlySummary(summary: MutableResourceSummary): PatientImportXlsxResourceSummary {
  return summary;
}

export async function preflightPatientImportXlsx(
  buffer: Buffer,
  policy: PatientImportXlsxResourcePolicy = PATIENT_IMPORT_XLSX_RESOURCE_POLICY,
): Promise<PatientImportXlsxResourceSummary> {
  assertResourcePolicy(policy);

  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
    throw new PatientImportXlsxMalformedError();
  }

  let zipFile: yauzl.ZipFile | undefined;

  try {
    zipFile = await yauzl.fromBufferPromise(buffer, {
      lazyEntries: true,
      decodeStrings: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });

    if (!Number.isSafeInteger(zipFile.entryCount) || zipFile.entryCount < 0) {
      throwMalformed();
    }

    if (zipFile.entryCount > policy.maxZipEntries) {
      throwResourceLimit();
    }

    const summary = createMutableSummary(buffer.byteLength);
    const names = new Set<string>();
    const worksheetEntries: yauzl.Entry[] = [];

    for await (const entry of zipFile.eachEntry()) {
      summary.zipEntries += 1;

      if (summary.zipEntries > policy.maxZipEntries) {
        throwResourceLimit();
      }

      const normalizedName = normalizePackageEntryName(entry.fileName);

      if (names.has(normalizedName)) {
        throwMalformed();
      }

      names.add(normalizedName);
      summary.declaredTotalUncompressedBytes = assertEntryMetadata(
        entry,
        buffer.byteLength,
        policy,
        summary.declaredTotalUncompressedBytes,
      );
      summary.declaredLargestEntryUncompressedBytes = Math.max(
        summary.declaredLargestEntryUncompressedBytes,
        entry.uncompressedSize,
      );

      await zipFile.readLocalFileHeaderPromise(entry, { minimal: true });

      if (isWorksheetPartName(normalizedName)) {
        summary.worksheetPartCount += 1;

        if (summary.worksheetPartCount > policy.maxWorksheetParts) {
          throwResourceLimit();
        }

        worksheetEntries.push(entry);
      }
    }

    if (summary.zipEntries !== zipFile.entryCount) {
      throwMalformed();
    }

    for (const entry of worksheetEntries) {
      await inspectWorksheetXml(zipFile, entry, policy, summary);
    }

    return toReadonlySummary(summary);
  } catch (error: unknown) {
    if (
      error instanceof PatientImportXlsxResourceLimitError ||
      error instanceof PatientImportXlsxMalformedError
    ) {
      throw error;
    }

    throw new PatientImportXlsxMalformedError();
  } finally {
    if (zipFile) {
      zipFile.close();
    }
  }
}

export async function assertSafePatientImportXlsxResourceEnvelope(
  buffer: Buffer,
): Promise<void> {
  await preflightPatientImportXlsx(buffer);
}

/** Test seam for exercising the same preflight with compact synthetic policies. */
export const patientImportXlsxResourcePreflightInternals = {
  preflightWithPolicy: preflightPatientImportXlsx,
};
