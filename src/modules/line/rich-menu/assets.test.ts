import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createLineRichMenuAssetManifest } from "../../../../scripts/line-rich-menu-asset-manifest";
import { getLineRichMenuActionIcon, renderLineRichMenuIcon } from "../../../../scripts/line-rich-menu-icons";
import { getLineRichMenuActionLines, getLineRichMenuColors, renderLineRichMenuImage } from "../../../../scripts/line-rich-menu-renderer";
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

  it("maps every action to a bundled semantic icon independent of its label", () => {
    const expected: Record<string, string> = {
      LINK_ACCOUNT: "link", MANAGE_ACCOUNT: "user-round-cog",
      OPEN_PATIENT_APPOINTMENTS: "calendar-days", OPEN_PATIENT_WELLNESS: "heart-pulse",
      OPEN_PATIENT_MEDICATIONS: "pills", OPEN_PATIENT_CARE: "stethoscope",
      OPEN_OSM_ASSIGNED_PATIENTS: "users", START_OSM_SCREENING: "clipboard-check",
      START_OSM_FOLLOWUP: "notebook-pen", OPEN_PATIENT_WORKSPACE: "layout-grid",
      OPEN_WORK_WORKSPACE: "layout-grid",
    };
    const roles = { PATIENT: "user-round", OSM: "stethoscope", HOSPITAL: "hospital" } as const;
    for (const menu of LINE_RICH_MENU_CATALOG) {
      for (const action of menu.actions) {
        const icon = getLineRichMenuActionIcon(menu, { ...action, label: "เปลี่ยนข้อความทดสอบ" });
        const expectedIcon = action.type === "postback" ? "calendar-check"
          : action.type === "richmenuswitch" ? menu.key.startsWith("CHOOSER_") ? roles[action.role] : "arrow-left-right"
          : action.intent === "OPEN_WORK_WORKSPACE" && menu.key.startsWith("HOSPITAL_") ? "hospital"
          : expected[action.intent];
        expect(icon, `${menu.key}: ${action.label}`).toBe(expectedIcon);
        const svg = renderLineRichMenuIcon(icon, 10, 20, 144, "#0E3C35");
        expect(svg).toContain('viewBox="0 0 24 24"');
        expect(svg).toContain('width="144"');
        expect(svg).toContain('stroke="#0E3C35"');
        expect(svg).not.toMatch(/https?:\/\/(?!www.w3.org)|<image|<text|currentColor/u);
      }
    }
  });

  it("preserves every Thai label through intentional line breaks", () => {
    for (const menu of LINE_RICH_MENU_CATALOG) {
      for (const action of menu.actions) {
        const lines = getLineRichMenuActionLines(action.label);
        expect(lines.length).toBeLessThanOrEqual(2);
        expect(lines.join("").replaceAll(/\s/gu, "")).toBe(action.label.replaceAll(/\s/gu, ""));
        expect(lines.join("")).not.toContain("�");
      }
    }
  });

  it("renders every complete Thai label without overflow and reproduces committed PNG bytes", async () => {
    for (const menu of createLineRichMenuAssetManifest()) {
      const image = await renderLineRichMenuImage(menu);
      expect(image.equals(await readFile(join(assetDirectory, menu.assetFile))), menu.key).toBe(true);
    }
  }, 30_000);

  it("rejects overflowing text instead of silently clipping or shrinking it", async () => {
    const menu = createLineRichMenuAssetManifest()[0];
    if (!menu) throw new Error("Missing unlinked menu");
    await expect(renderLineRichMenuImage({
      ...menu,
      actions: menu.actions.map((action) => ({ ...action, label: action.label.repeat(20) })),
    })).rejects.toThrow("refusing to shrink or truncate");
  });

  it("places rounded bitmap edges exactly inside each rectangular hitbox", async () => {
    const colors = getLineRichMenuColors();
    const rgb = (hex: string): number[] => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    for (const menu of createLineRichMenuAssetManifest()) {
      const { data, info } = await sharp(await readFile(join(assetDirectory, menu.assetFile)))
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number): number[] => {
        const offset = (y * info.width + x) * info.channels;
        return [...data.subarray(offset, offset + 3)];
      };
      for (const { bounds: { x, y, width, height } } of menu.actions) {
        expect(pixel(x, y), menu.key).toEqual(rgb(colors.canvas));
        expect(pixel(x - 1, y + Math.floor(height / 2)), menu.key).toEqual(rgb(colors.canvas));
        expect(pixel(x + Math.floor(width / 2), y + 1), menu.key).toEqual(rgb(colors.line));
        expect(pixel(x + Math.floor(width / 2), y + height), menu.key).toEqual(rgb(colors.canvas));
      }
    }
  });
});
