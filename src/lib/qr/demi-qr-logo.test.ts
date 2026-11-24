import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DEMI_QR_LOGO_PNG_BASE64, DEMI_QR_LOGO_PNG_SHA256 } from "@/lib/qr/demi-qr-logo";

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

describe("DEMI QR logo", () => {
  it("matches the committed PNG byte for byte (run `npm run qr:logo` after changing the PNG)", () => {
    const committed = readFileSync(fileURLToPath(new URL("./assets/demi-qr-logo-160.png", import.meta.url)));
    const embedded = Buffer.from(DEMI_QR_LOGO_PNG_BASE64, "base64");

    expect(sha256(embedded)).toBe(sha256(committed));
    expect(DEMI_QR_LOGO_PNG_SHA256).toBe(sha256(committed));
  });

  it("is a 160 px PNG small enough to inline in every QR", () => {
    const embedded = Buffer.from(DEMI_QR_LOGO_PNG_BASE64, "base64");

    expect(embedded.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(embedded.readUInt32BE(16)).toBe(160);
    expect(embedded.readUInt32BE(20)).toBe(160);
    expect(embedded.length).toBeLessThan(8 * 1024);
  });
});
