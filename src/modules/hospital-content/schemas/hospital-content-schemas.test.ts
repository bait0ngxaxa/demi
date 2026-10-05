import { describe, expect, it } from "vitest";

import {
  hospitalContentCreateSchema,
  hospitalContentEditSchema,
  hospitalContentFormEntriesToObject,
  hospitalContentPublishSchema,
  hospitalContentSchemaInternals,
  normalizeHospitalContentBody,
  normalizeHospitalContentSourceText,
  normalizeHospitalContentTitle,
} from "./hospital-content-schemas";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const contentId = "22222222-2222-4222-8222-222222222222";
const nonce = "33333333-3333-4333-8333-333333333333";
const expectedUpdatedAt = "2026-10-05T12:34:56.789Z";

function createInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hospitalId,
    submissionNonce: nonce,
    title: "หัวข้อ",
    body: "เนื้อหา",
    category: "OTHER",
    sourceText: null,
    ...overrides,
  };
}

describe("Hospital Content text normalization", () => {
  it("requires a nonblank one-line title, trims only whole-string edges and preserves interior spaces", () => {
    expect(normalizeHospitalContentTitle("  หัวข้อ  ")).toBe("หัวข้อ");
    expect(normalizeHospitalContentTitle("หัวข้อ  ที่มีช่องว่าง")).toBe("หัวข้อ  ที่มีช่องว่าง");
    expect(() => normalizeHospitalContentTitle("  \t  ")).toThrow();
    expect(() => normalizeHospitalContentTitle("บรรทัดหนึ่ง\nบรรทัดสอง")).toThrow();
    expect(() => normalizeHospitalContentTitle("หัวข้อ\tต่อ")).toThrow();
    expect(() => normalizeHospitalContentTitle("หัวข้อ\rต่อ")).toThrow();
  });

  it("accepts 200 UTF-16 units and rejects 201 or an oversized raw title", () => {
    expect(normalizeHospitalContentTitle("ก".repeat(200))).toHaveLength(200);
    expect(() => normalizeHospitalContentTitle("ก".repeat(201))).toThrow();
    expect(() => normalizeHospitalContentTitle("ก".repeat(1_001))).toThrow();
  });

  it.each([
    "\u0000",
    "\u007f",
    "\u0085",
    "\u200e",
    "\u034f",
    "\u115f",
    "\u1160",
    "\u17b4",
    "\u17b5",
    "\u180b",
    "\u180c",
    "\u180d",
    "\u180f",
    "\u3164",
    "\ufe00",
    "\ufe0f",
    "\uffa0",
    "\u{e0100}",
    "\u2028",
    "\u2029",
  ])("rejects prohibited title code point %s", (character) => {
    expect(() => normalizeHospitalContentTitle(`ก${character}ข`)).toThrow();
  });

  it("normalizes body line endings and tabs while preserving indentation, blank lines, repeated spaces and Thai marks", () => {
    expect(normalizeHospitalContentBody("  บรรทัดแรก\r\n\t  บรรทัดสอง\r\r\n  บรรทัดสาม  "))
      .toBe("บรรทัดแรก\n   บรรทัดสอง\n\n  บรรทัดสาม");
    expect(normalizeHospitalContentBody("  ก\u0e49  ข  ")).toBe("ก\u0e49  ข");
    expect(normalizeHospitalContentBody("  หนึ่ง\n\n    สอง  ")).toBe("หนึ่ง\n\n    สอง");
    expect(normalizeHospitalContentBody("<script>alert(1)</script>\n**ข้อความ**"))
      .toBe("<script>alert(1)</script>\n**ข้อความ**");
  });

  it("allows body CR/LF/TAB only for normalization and enforces normalized and raw limits", () => {
    expect(normalizeHospitalContentBody("\r\nเนื้อหา\rตอนใหม่\tแท็บ")).toBe("เนื้อหา\nตอนใหม่ แท็บ");
    expect(normalizeHospitalContentBody("ก".repeat(20_000))).toHaveLength(20_000);
    expect(() => normalizeHospitalContentBody("ก".repeat(20_001))).toThrow();
    expect(() => normalizeHospitalContentBody("ก".repeat(24_001))).toThrow();
    expect(() => normalizeHospitalContentBody("เนื้อหา\u0000")).toThrow();
    expect(() => normalizeHospitalContentBody("เนื้อหา\u009f")).toThrow();
    expect(() => normalizeHospitalContentBody("เนื้อหา\u200b")).toThrow();
  });

  it("normalizes optional source text without splitting, linking or authority checks", () => {
    expect(normalizeHospitalContentSourceText(null)).toBeNull();
    expect(normalizeHospitalContentSourceText("    ")).toBeNull();
    expect(normalizeHospitalContentSourceText("  https://example.test/ยาว  ")).toBe("https://example.test/ยาว");
    expect(normalizeHospitalContentSourceText("อ้างอิงหนึ่งรายการ")).toBe("อ้างอิงหนึ่งรายการ");
    expect(normalizeHospitalContentSourceText("ก".repeat(1_000))).toHaveLength(1_000);
    expect(() => normalizeHospitalContentSourceText("ก".repeat(1_001))).toThrow();
    expect(() => normalizeHospitalContentSourceText("ก".repeat(2_001))).toThrow();
    expect(() => normalizeHospitalContentSourceText("แหล่ง\nข้อมูล")).toThrow();
    expect(() => normalizeHospitalContentSourceText("แหล่ง\tข้อมูล")).toThrow();
  });

  it("rejects unpaired UTF-16 surrogates and counts a valid astral character as two units", () => {
    expect(() => normalizeHospitalContentTitle("หัว\ud800ข้อ")).toThrow();
    expect(() => normalizeHospitalContentBody("\udc00" )).toThrow();
    expect(normalizeHospitalContentTitle("😀".repeat(100))).toHaveLength(200);
    expect(() => normalizeHospitalContentTitle("😀".repeat(101))).toThrow();
  });
});

describe("Hospital Content strict DTO schemas", () => {
  it("requires exact CREATE and EDIT shapes including nullable sourceText", () => {
    expect(hospitalContentCreateSchema.safeParse(createInput()).success).toBe(true);
    const missingSource = createInput();
    delete missingSource.sourceText;
    expect(hospitalContentCreateSchema.safeParse(missingSource).success).toBe(false);
    expect(hospitalContentCreateSchema.safeParse(createInput({ unexpected: true })).success).toBe(false);
    expect(hospitalContentCreateSchema.safeParse(createInput({ title: 1 })).success).toBe(false);
    expect(hospitalContentCreateSchema.safeParse(createInput({ body: undefined })).success).toBe(false);
    expect(hospitalContentCreateSchema.safeParse([]).success).toBe(false);
    expect(hospitalContentEditSchema.safeParse({
      contentId,
      expectedUpdatedAt,
      title: "หัวข้อ",
      body: "เนื้อหา",
      category: "NCD",
      sourceText: null,
    }).success).toBe(true);
    expect(hospitalContentEditSchema.safeParse({
      contentId,
      expectedUpdatedAt,
      title: "หัวข้อ",
      body: "เนื้อหา",
      category: "NCD",
      sourceText: null,
      status: "PUBLISHED",
    }).success).toBe(false);
  });

  it("accepts only canonical UUID and UTC millisecond version tokens", () => {
    expect(hospitalContentPublishSchema.safeParse({ contentId, expectedUpdatedAt }).success).toBe(true);
    expect(hospitalContentPublishSchema.safeParse({ contentId: "not-a-uuid", expectedUpdatedAt }).success).toBe(false);
    expect(hospitalContentPublishSchema.safeParse({ contentId, expectedUpdatedAt: "2026-10-05T12:34:56Z" }).success).toBe(false);
    expect(hospitalContentPublishSchema.safeParse({ contentId, expectedUpdatedAt: "2026-02-30T12:34:56.789Z" }).success).toBe(false);
  });

  it("rejects duplicate and unknown form entries before constructing a DTO", () => {
    const duplicate = new FormData();
    duplicate.append("title", "one");
    duplicate.append("title", "two");
    expect(() => hospitalContentFormEntriesToObject(duplicate.entries(), "CREATE")).toThrow();

    const unknown = new FormData();
    unknown.append("body", "text");
    unknown.append("actorUserId", "client-value");
    expect(() => hospitalContentFormEntriesToObject(unknown.entries(), "CREATE")).toThrow();
  });

  it("enforces the 128 KiB raw JSON budget and measures Thai/escaped text as UTF-8", () => {
    const overhead = new TextEncoder().encode(JSON.stringify({ title: "" })).byteLength;
    expect(hospitalContentSchemaInternals.hasValidRequestBudgetShape(
      { title: "a".repeat(131_072 - overhead) },
      "CREATE",
    )).toBe(true);
    expect(hospitalContentSchemaInternals.hasValidRequestBudgetShape(
      { title: "a".repeat(131_073 - overhead) },
      "CREATE",
    )).toBe(false);

    const thai = createInput({ body: "ก".repeat(24_000) });
    const escaped = createInput({ body: "\\\"".repeat(12_000) });
    expect(new TextEncoder().encode(JSON.stringify(thai)).byteLength).toBeGreaterThan(24_000);
    expect(new TextEncoder().encode(JSON.stringify(escaped)).byteLength).toBeGreaterThan(24_000);
    expect(hospitalContentSchemaInternals.hasValidRequestBudgetShape(thai, "CREATE")).toBe(true);
    expect(hospitalContentSchemaInternals.hasValidRequestBudgetShape(escaped, "CREATE")).toBe(true);
    expect(hospitalContentCreateSchema.safeParse(thai).success).toBe(false);
    expect(hospitalContentCreateSchema.safeParse(escaped).success).toBe(false);

    let called = false;
    const unserializableField = { toJSON: () => { called = true; return "value"; } };
    expect(hospitalContentSchemaInternals.hasValidRequestBudgetShape(createInput({ title: unserializableField }), "CREATE")).toBe(false);
    expect(called).toBe(false);
  });
});
