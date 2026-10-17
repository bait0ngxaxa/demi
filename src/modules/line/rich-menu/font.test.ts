import { unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertBundledLineRichMenuFont,
  LINE_RICH_MENU_FONT_FILE,
} from "../../../../scripts/line-rich-menu-font";

describe("pinned LINE Rich Menu Thai font", () => {
  it("accepts the checked-in Noto Sans Thai font", () => {
    expect(assertBundledLineRichMenuFont()).toBe(LINE_RICH_MENU_FONT_FILE);
  });

  it("fails clearly when the bundled font is missing", () => {
    const missingFont = join(tmpdir(), `demi-missing-${randomUUID()}.ttf`);
    expect(() => assertBundledLineRichMenuFont(missingFont)).toThrow("Required Noto Sans Thai font file is missing");
  });

  it("rejects a font file whose pinned checksum has changed", () => {
    const wrongFont = join(tmpdir(), `demi-wrong-${randomUUID()}.ttf`);
    writeFileSync(wrongFont, Buffer.from("not a font"));
    try {
      expect(() => assertBundledLineRichMenuFont(wrongFont)).toThrow("Noto Sans Thai font checksum mismatch");
    } finally {
      unlinkSync(wrongFont);
    }
  });
});
