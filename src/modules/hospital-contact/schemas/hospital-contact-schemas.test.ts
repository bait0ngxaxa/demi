import { describe, expect, it } from "vitest";

import {
  hospitalContactMutationSchema,
  normalizeHospitalAddressText,
  normalizeHospitalPhoneNumber,
} from "./hospital-contact-schemas";

const hospitalId = "11111111-1111-4111-8111-111111111111";

function input(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hospitalId,
    expectedUpdatedAt: null,
    addressText: null,
    phoneNumber: null,
    ...overrides,
  };
}

describe("Hospital Contact address normalization", () => {
  it("keeps null and converts ECMAScript-blank text to null", () => {
    expect(normalizeHospitalAddressText(null)).toBeNull();
    expect(normalizeHospitalAddressText(" \t\r\n  ")).toBeNull();
  });

  it("normalizes CRLF, CR and TAB while retaining interior spacing and lines", () => {
    expect(normalizeHospitalAddressText("  บ้าน\tเลขที่  1  \r\n  ซอย  2  \r\n\n ตำบล  ")).toBe(
      "บ้าน เลขที่  1\n  ซอย  2\n\n ตำบล",
    );
  });

  it("preserves Thai combining marks without Unicode normalization", () => {
    const thaiAddress = "ก\u0e49 บ้าน\u0e48";
    const normalized = normalizeHospitalAddressText(thaiAddress);

    expect(normalized).toBe(thaiAddress);
    expect(normalized?.normalize("NFC")).toBe(thaiAddress.normalize("NFC"));
  });

  it.each([
    "\u0001",
    "\u007f",
    "\u0085",
    "\u200b",
    "\u200e",
    "\u200f",
    "\u202a",
    "\u202b",
    "\u202c",
    "\u202d",
    "\u202e",
    "\u2060",
    "\u2066",
    "\u2067",
    "\u2068",
    "\u2069",
    "\ufeff",
  ])(
    "rejects prohibited retained address character %j",
    (character) => {
      expect(() => normalizeHospitalAddressText(`บ้าน${character}เลขที่ 1`)).toThrow();
    },
  );

  it("rejects unpaired surrogates and enforces the normalized UTF-16 boundary", () => {
    expect(() => normalizeHospitalAddressText("บ้าน\ud800")).toThrow();
    expect(normalizeHospitalAddressText("ก".repeat(500))).toHaveLength(500);
    expect(() => normalizeHospitalAddressText("ก".repeat(501))).toThrow();
  });
});

describe("Hospital Contact phone normalization", () => {
  it("keeps null and turns edge-trimmed blank text into null", () => {
    expect(normalizeHospitalPhoneNumber(null)).toBeNull();
    expect(normalizeHospitalPhoneNumber("   ")).toBeNull();
  });

  it.each([
    "02-123-4567",
    "(02) 123 4567",
    "02-123-4567 ต่อ 123",
    "+66 2 123 4567 ext 9",
    "02  123  4567 x12",
    "เลขหมาย ๐๒-๑๒๓-๔๕๖๗",
  ])("accepts supported organizational phone text %s", (phoneNumber) => {
    expect(normalizeHospitalPhoneNumber(phoneNumber)).toBe(phoneNumber.replace(/ {2,}/gu, " "));
  });

  it.each(["1".repeat(32), "02-123-4567 ต่อ 12345678901234"])(
    "accepts a phone value within the normalized UTF-16 bound",
    (phoneNumber) => {
      expect(normalizeHospitalPhoneNumber(phoneNumber)).toBe(phoneNumber);
    },
  );

  it("rejects 33 code units, a value without a decimal digit, and multiline input", () => {
    expect(() => normalizeHospitalPhoneNumber("1".repeat(33))).toThrow();
    expect(() => normalizeHospitalPhoneNumber("ต่อ ext x")).toThrow();
    expect(() => normalizeHospitalPhoneNumber("02-123\n4567")).toThrow();
    expect(() => normalizeHospitalPhoneNumber("02\t123")).toThrow();
  });

  it.each(["\u0001", "\u007f", "\u0085", "\u200b", "\u200e", "\u202e", "\u2069", "\ufeff"])(
    "rejects prohibited phone control or invisible character %j before trimming",
    (character) => {
      expect(() => normalizeHospitalPhoneNumber(`02${character}123`)).toThrow();
    },
  );

  it.each(["02/123/4567", "02,123,4567", "02;123;4567", "02 123"])(
    "rejects list separators and unsupported spacing %j",
    (phoneNumber) => {
      expect(() => normalizeHospitalPhoneNumber(phoneNumber)).toThrow();
    },
  );
});

describe("Hospital Contact mutation schema", () => {
  it("requires the exact locator, expectation and both desired-state fields", () => {
    expect(hospitalContactMutationSchema.safeParse(input()).success).toBe(true);
    expect(hospitalContactMutationSchema.safeParse({ ...input(), extra: "field" }).success).toBe(false);
    expect(hospitalContactMutationSchema.safeParse({ ...input(), phoneNumber: undefined }).success).toBe(false);
    expect(hospitalContactMutationSchema.safeParse({ ...input(), addressText: undefined }).success).toBe(false);
  });

  it.each([23, [], {}, true])("rejects non-string contact values (%j)", (value) => {
    expect(hospitalContactMutationSchema.safeParse(input({ addressText: value })).success).toBe(false);
    expect(hospitalContactMutationSchema.safeParse(input({ phoneNumber: value })).success).toBe(false);
  });

  it("normalizes valid desired state without changing Thai text", () => {
    expect(
      hospitalContactMutationSchema.parse(
        input({
          addressText: "  ถนน\tสุขภาพ  \r\n บ้านเลขที่ 1  ",
          phoneNumber: "  +66  2 123 4567 ext 9  ",
        }),
      ),
    ).toEqual({
      hospitalId,
      expectedUpdatedAt: null,
      addressText: "ถนน สุขภาพ\n บ้านเลขที่ 1",
      phoneNumber: "+66 2 123 4567 ext 9",
    });
  });

  it("accepts a canonical UTC millisecond token and rejects other timestamp forms", () => {
    expect(hospitalContactMutationSchema.safeParse(input({ expectedUpdatedAt: "2026-10-05T02:03:04.005Z" })).success).toBe(true);
    expect(hospitalContactMutationSchema.safeParse(input({ expectedUpdatedAt: "2026-10-05T09:03:04+07:00" })).success).toBe(false);
    expect(hospitalContactMutationSchema.safeParse(input({ expectedUpdatedAt: "2026-02-30T02:03:04.000Z" })).success).toBe(false);
  });

  it("enforces 500/501 address and 32/33 phone bounds through the schema", () => {
    expect(hospitalContactMutationSchema.safeParse(input({ addressText: "ก".repeat(500) })).success).toBe(true);
    expect(hospitalContactMutationSchema.safeParse(input({ addressText: "ก".repeat(501) })).success).toBe(false);
    expect(hospitalContactMutationSchema.safeParse(input({ phoneNumber: "1".repeat(32) })).success).toBe(true);
    expect(hospitalContactMutationSchema.safeParse(input({ phoneNumber: "1".repeat(33) })).success).toBe(false);
  });

  it("bounds the combined unnormalized contact-field payload to 16 KiB UTF-8", () => {
    expect(hospitalContactMutationSchema.safeParse(input({ addressText: " ".repeat(16 * 1024) })).success).toBe(true);
    expect(hospitalContactMutationSchema.safeParse(input({ addressText: " ".repeat(16 * 1024 + 1) })).success).toBe(false);
    expect(
      hospitalContactMutationSchema.safeParse(
        input({ addressText: "ก".repeat(5_461), phoneNumber: "1".repeat(3) }),
      ).success,
    ).toBe(false);
  });
});
