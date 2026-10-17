import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LINE_RICH_MENU_FONT_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fonts",
  "NotoSansThai-2.002-variable.ttf",
);

export const LINE_RICH_MENU_FONT_SHA256 = "5a1c559bb539583c8a1fd99d1c5b9491e5e14478c9cd2bd0970d5c3096cc9ef8";

export function assertBundledLineRichMenuFont(fontPath = LINE_RICH_MENU_FONT_FILE): string {
  let fontBytes: Buffer;
  try {
    fontBytes = readFileSync(fontPath);
  } catch {
    throw new Error(`Required Noto Sans Thai font file is missing: ${fontPath}`);
  }

  const actualSha256 = createHash("sha256").update(fontBytes).digest("hex");
  if (actualSha256 !== LINE_RICH_MENU_FONT_SHA256) {
    throw new Error(
      `Noto Sans Thai font checksum mismatch: expected ${LINE_RICH_MENU_FONT_SHA256}, received ${actualSha256}`,
    );
  }

  return resolve(fontPath);
}
