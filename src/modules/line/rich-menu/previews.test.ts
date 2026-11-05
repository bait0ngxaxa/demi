import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const previewDirectory = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/line/rich-menu-previews");
const expectedContactSheets = [
  { displayWidth: 360, width: 1136, height: 1700 },
  { displayWidth: 390, width: 1226, height: 1820 },
  { displayWidth: 430, width: 1346, height: 1982 },
] as const;

describe("DEMI LINE Rich Menu mobile previews", () => {
  it.each(expectedContactSheets)("ships a complete contact sheet at $displayWidth px", async ({ displayWidth, width, height }) => {
    const image = await readFile(join(previewDirectory, `rich-menu-contact-${displayWidth}.png`));
    const metadata = await sharp(image).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(width);
    expect(metadata.height).toBe(height);
  });
});
