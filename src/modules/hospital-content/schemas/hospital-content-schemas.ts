import { z } from "zod";

import {
  HOSPITAL_CONTENT_BODY_MAX_CODE_UNITS,
  HOSPITAL_CONTENT_RAW_BODY_MAX_CODE_UNITS,
  HOSPITAL_CONTENT_RAW_SOURCE_MAX_CODE_UNITS,
  HOSPITAL_CONTENT_RAW_TITLE_MAX_CODE_UNITS,
  HOSPITAL_CONTENT_REQUEST_MAX_BYTES,
  HOSPITAL_CONTENT_SOURCE_MAX_CODE_UNITS,
  HOSPITAL_CONTENT_TITLE_MAX_CODE_UNITS,
} from "../domain/hospital-content";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EXPECTED_UPDATED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const HOSPITAL_CONTENT_CATEGORIES = ["NCD", "FOOD", "EXERCISE", "OTHER"] as const;
const PROHIBITED_CODE_POINT_RANGES: readonly (readonly [number, number])[] = [
  [0x034f, 0x034f],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180d],
  [0x180f, 0x180f],
  [0x3164, 0x3164],
  [0xfe00, 0xfe0f],
  [0xffa0, 0xffa0],
  [0xe0100, 0xe01ef],
  [0x2028, 0x2029],
];

export type HospitalContentCommand = "CREATE" | "EDIT" | "PUBLISH" | "WITHDRAW" | "ARCHIVE" | "RECONCILE";

const COMMAND_KEYS: Readonly<Record<HospitalContentCommand, readonly string[]>> = {
  CREATE: ["hospitalId", "submissionNonce", "title", "body", "category", "sourceText"],
  EDIT: ["contentId", "expectedUpdatedAt", "title", "body", "category", "sourceText"],
  PUBLISH: ["contentId", "expectedUpdatedAt"],
  WITHDRAW: ["contentId", "expectedUpdatedAt"],
  ARCHIVE: ["contentId", "expectedUpdatedAt"],
  RECONCILE: ["hospitalId", "submissionNonce"],
};

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isInProhibitedRange(codePoint: number): boolean {
  return PROHIBITED_CODE_POINT_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function hasProhibitedCharacter(value: string, allowedBodyWhitespace: boolean): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return true;
    if (codePoint <= 0x1f) {
      if (allowedBodyWhitespace && (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d)) continue;
      return true;
    }
    if ((codePoint >= 0x7f && codePoint <= 0x9f) || isInProhibitedRange(codePoint) || /\p{Cf}/u.test(character)) {
      return true;
    }
  }
  return false;
}

function assertRawText(value: string, maxCodeUnits: number, allowBodyWhitespace: boolean): void {
  if (value.length > maxCodeUnits || hasUnpairedSurrogate(value) || hasProhibitedCharacter(value, allowBodyWhitespace)) {
    throw new Error("Hospital Content text is invalid");
  }
}

export function normalizeHospitalContentTitle(value: string): string {
  assertRawText(value, HOSPITAL_CONTENT_RAW_TITLE_MAX_CODE_UNITS, false);
  const normalized = value.trim();
  if (!normalized || normalized.length > HOSPITAL_CONTENT_TITLE_MAX_CODE_UNITS) {
    throw new Error("Hospital Content title is invalid");
  }
  return normalized;
}

export function normalizeHospitalContentBody(value: string): string {
  assertRawText(value, HOSPITAL_CONTENT_RAW_BODY_MAX_CODE_UNITS, true);
  const normalized = value.replace(/\r\n?/gu, "\n").replace(/\t/gu, " ").trim();
  if (!normalized || normalized.length > HOSPITAL_CONTENT_BODY_MAX_CODE_UNITS) {
    throw new Error("Hospital Content body is invalid");
  }
  return normalized;
}

export function normalizeHospitalContentSourceText(value: string | null): string | null {
  if (value === null) return null;
  assertRawText(value, HOSPITAL_CONTENT_RAW_SOURCE_MAX_CODE_UNITS, false);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > HOSPITAL_CONTENT_SOURCE_MAX_CODE_UNITS) {
    throw new Error("Hospital Content source is invalid");
  }
  return normalized;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonStringByteLengthWithinBudget(value: string, currentBytes: number): number | null {
  let byteLength = 2;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return null;
    if (codePoint === 0x22 || codePoint === 0x5c || (codePoint >= 0x08 && codePoint <= 0x0d)) {
      byteLength += 2;
    } else if (codePoint <= 0x1f) {
      byteLength += 6;
    } else if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      // JSON.stringify emits an isolated UTF-16 surrogate as a six-byte \\u escape.
      byteLength += 6;
    } else if (codePoint <= 0x7f) {
      byteLength += 1;
    } else if (codePoint <= 0x7ff) {
      byteLength += 2;
    } else if (codePoint <= 0xffff) {
      byteLength += 3;
    } else {
      byteLength += 4;
    }
    if (currentBytes + byteLength > HOSPITAL_CONTENT_REQUEST_MAX_BYTES) return null;
  }
  return byteLength;
}

function hasValidRequestBudgetShape(input: unknown, command: HospitalContentCommand): boolean {
  try {
    if (!isPlainRecord(input)) return false;
    const accepted = new Set(COMMAND_KEYS[command]);
    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.some((key) => typeof key !== "string" || !accepted.has(key))) return false;
    let byteLength = 2;
    let first = true;
    for (const key of ownKeys) {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) return false;
      const value: unknown = descriptor.value;
      if (key === "sourceText" ? value !== null && typeof value !== "string" : typeof value !== "string") return false;
      if (!first) byteLength += 1;
      first = false;
      byteLength += key.length + 3;
      if (byteLength > HOSPITAL_CONTENT_REQUEST_MAX_BYTES) return false;
      if (typeof value === "string") {
        if (value.length > HOSPITAL_CONTENT_REQUEST_MAX_BYTES) return false;
        const serializedValueBytes = jsonStringByteLengthWithinBudget(value, byteLength);
        if (serializedValueBytes === null) return false;
        byteLength += serializedValueBytes;
      } else {
        byteLength += 4;
        if (byteLength > HOSPITAL_CONTENT_REQUEST_MAX_BYTES) return false;
      }
    }
    return byteLength <= HOSPITAL_CONTENT_REQUEST_MAX_BYTES;
  } catch {
    return false;
  }
}

function withRequestBudget<T extends z.ZodType>(schema: T, command: HospitalContentCommand) {
  return z.preprocess((input, context) => {
    if (!hasValidRequestBudgetShape(input, command)) {
      context.addIssue({ code: "custom", message: "Hospital Content request is invalid or too large" });
      return z.NEVER;
    }
    return input;
  }, schema);
}

const uuidSchema = z.string().length(36).regex(UUID_PATTERN).transform((value) => value.toLowerCase());
const updatedAtSchema = z.string().length(24).regex(EXPECTED_UPDATED_AT_PATTERN).refine((value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
});
const rawTitleSchema = z.string().max(HOSPITAL_CONTENT_RAW_TITLE_MAX_CODE_UNITS);
const rawBodySchema = z.string().max(HOSPITAL_CONTENT_RAW_BODY_MAX_CODE_UNITS);
const rawSourceSchema = z.string().max(HOSPITAL_CONTENT_RAW_SOURCE_MAX_CODE_UNITS).nullable();

function normalized<T>(schema: z.ZodType<T>, normalizer: (value: T) => T, path: string): z.ZodType<T> {
  return schema.transform((value, context) => {
    try {
      return normalizer(value);
    } catch {
      context.addIssue({ code: "custom", path: [path], message: "ข้อความไม่ถูกต้อง" });
      return z.NEVER;
    }
  });
}

const normalizedTitleSchema = normalized(rawTitleSchema, normalizeHospitalContentTitle, "title");
const normalizedBodySchema = normalized(rawBodySchema, normalizeHospitalContentBody, "body");
const normalizedSourceSchema = normalized(rawSourceSchema, normalizeHospitalContentSourceText, "sourceText");

export const hospitalContentCreateSchema = withRequestBudget(z.object({
  hospitalId: uuidSchema,
  submissionNonce: uuidSchema,
  title: normalizedTitleSchema,
  body: normalizedBodySchema,
  category: z.enum(HOSPITAL_CONTENT_CATEGORIES),
  sourceText: normalizedSourceSchema,
}).strict(), "CREATE");

export const hospitalContentEditSchema = withRequestBudget(z.object({
  contentId: uuidSchema,
  expectedUpdatedAt: updatedAtSchema,
  title: normalizedTitleSchema,
  body: normalizedBodySchema,
  category: z.enum(HOSPITAL_CONTENT_CATEGORIES),
  sourceText: normalizedSourceSchema,
}).strict(), "EDIT");

const lifecycleSchema = z.object({ contentId: uuidSchema, expectedUpdatedAt: updatedAtSchema }).strict();

export const hospitalContentPublishSchema = withRequestBudget(lifecycleSchema, "PUBLISH");
export const hospitalContentWithdrawSchema = withRequestBudget(lifecycleSchema, "WITHDRAW");
export const hospitalContentArchiveSchema = withRequestBudget(lifecycleSchema, "ARCHIVE");
export const hospitalContentReconcileSchema = withRequestBudget(z.object({
  hospitalId: uuidSchema,
  submissionNonce: uuidSchema,
}).strict(), "RECONCILE");
export const hospitalContentLocatorSchema = uuidSchema;

export type HospitalContentCreateInput = z.output<typeof hospitalContentCreateSchema>;
export type HospitalContentEditInput = z.output<typeof hospitalContentEditSchema>;
export type HospitalContentLifecycleInput = z.output<typeof hospitalContentPublishSchema>;

export function hospitalContentFormEntriesToObject(
  entries: Iterable<readonly [string, FormDataEntryValue]>,
  command: HospitalContentCommand,
): Record<string, string> {
  const accepted = new Set(COMMAND_KEYS[command]);
  const result: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!accepted.has(key) || Object.hasOwn(result, key) || typeof value !== "string") {
      throw new Error("Hospital Content form is invalid");
    }
    result[key] = value;
  }
  if (!hasValidRequestBudgetShape(result, command)) throw new Error("Hospital Content form is invalid");
  return result;
}

export const hospitalContentSchemaInternals = {
  COMMAND_KEYS,
  PROHIBITED_CODE_POINT_RANGES,
  hasUnpairedSurrogate,
  hasProhibitedCharacter,
  jsonStringByteLengthWithinBudget,
  hasValidRequestBudgetShape,
  updatedAtSchema,
};
