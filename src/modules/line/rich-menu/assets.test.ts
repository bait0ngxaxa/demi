import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createLineRichMenuAssetManifest } from "../../../../scripts/line-rich-menu-asset-manifest";
import { LINE_RICH_MENU_CATALOG } from "./catalog";
import { getLineMenuAreaBounds } from "./layout";

const assetDirectory = join(dirname(fileURLToPath(import.meta.url)), "../../../../public/line/rich-menus");

describe("DEMI LINE Rich Menu PNG assets", () => {
  it("contains exactly one valid, correctly sized asset per catalog variant below 1 MiB", async () => {
    expect(LINE_RICH_MENU_CATALOG).toHaveLength(18);

    const actualFiles = (await readdir(assetDirectory)).filter((file) => file.endsWith(".png")).sort();
    const expectedFiles = LINE_RICH_MENU_CATALOG.map((menu) => menu.assetFile).sort();
    expect(actualFiles).toEqual(expectedFiles);

    for (const assetFile of expectedFiles) {
      const assetPath = join(assetDirectory, assetFile);
      const [image, fileStats] = await Promise.all([readFile(assetPath), stat(assetPath)]);
      const metadata = await sharp(image).metadata();
      expect(metadata.format, assetFile).toBe("png");
      expect(metadata.width, assetFile).toBe(2500);
      expect(metadata.height, assetFile).toBe(1686);
      expect(fileStats.size, assetFile).toBeLessThanOrEqual(1024 * 1024);
    }
  });

  it("uses the same shared bounds for rendered asset actions and LINE tappable areas", () => {
    const manifest = createLineRichMenuAssetManifest();
    expect(manifest).toHaveLength(LINE_RICH_MENU_CATALOG.length);

    for (const menu of LINE_RICH_MENU_CATALOG) {
      const assetMenu = manifest.find((entry) => entry.key === menu.key);
      if (!assetMenu) throw new Error(`Missing asset manifest entry for ${menu.key}.`);
      expect(assetMenu.actions.map((action) => action.bounds)).toEqual(getLineMenuAreaBounds(menu));
    }
  });
});
