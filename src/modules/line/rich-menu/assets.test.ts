import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { createLineRichMenuAssetManifest } from "../../../../scripts/line-rich-menu-asset-manifest";
import {
  getLineRichMenuActionVisual,
  getLineRichMenuIllustrationBuffer,
  type LineRichMenuIllustration,
} from "../../../../scripts/line-rich-menu-illustrations";
import { getLineRichMenuActionLines, getLineRichMenuColors, renderLineRichMenuImage } from "../../../../scripts/line-rich-menu-renderer";
import { LINE_RICH_MENU_CATALOG } from "./catalog";
import { getLineMenuLayout } from "./layout";

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
      expect(assetMenu.actions.map((action) => action.bounds)).toEqual(
        getLineMenuLayout(menu).actionAreas.map(({ bounds }) => bounds),
      );
    }
  });

  it("maps catalog actions to bundled, role-aware editorial illustrations independent of labels", async () => {
    const expected: Record<string, LineRichMenuIllustration> = {
      LINK_ACCOUNT: "account-linking",
      OPEN_PATIENT_APPOINTMENTS: "patient-appointment-history", OPEN_PATIENT_WELLNESS: "patient-wellness-recording",
      OPEN_PATIENT_MEDICATIONS: "patient-medication-review", OPEN_PATIENT_CARE: "patient-care-guidance",
      OPEN_OSM_ASSIGNED_PATIENTS: "osm-community-workspace", START_OSM_SCREENING: "osm-screening",
      START_OSM_FOLLOWUP: "osm-home-visit", OPEN_PATIENT_WORKSPACE: "patient-workspace",
      OPEN_WORK_WORKSPACE: "osm-workflow-coordination",
    };
    const roles = { PATIENT: "patient-workspace", OSM: "osm-workflow-coordination", HOSPITAL: "hospital-operations" } as const;
    const seenIllustrations = new Set<LineRichMenuIllustration>();
    for (const menu of LINE_RICH_MENU_CATALOG) {
      for (const action of menu.actions) {
        if (action.type === "uri" && action.intent === "MANAGE_ACCOUNT") {
          expect(() => getLineRichMenuActionVisual(menu, action)).toThrow("has no illustration");
          continue;
        }
        const visual = getLineRichMenuActionVisual(menu, { ...action, label: "เปลี่ยนข้อความทดสอบ" });
        const expectedIllustration = action.type === "message" ? "patient-appointment-consultation"
          : action.type === "richmenuswitch" ? roles[action.role]
          : action.intent === "OPEN_WORK_WORKSPACE" && menu.key.startsWith("HOSPITAL_") ? "hospital-operations"
          : expected[action.intent];
        expect(visual.illustration, `${menu.key}: ${action.label}`).toBe(expectedIllustration);
        seenIllustrations.add(visual.illustration);

        const image = await getLineRichMenuIllustrationBuffer(visual.illustration);
        const metadata = await sharp(image).metadata();
        expect(metadata.format).toBe("png");
        expect(metadata.hasAlpha).toBe(true);
        expect(metadata.width).toBeGreaterThan(0);
        expect(metadata.height).toBeGreaterThan(0);
      }
    }
    expect(seenIllustrations.size).toBe(12);
  });

  it("renders Manage Account only as a settings utility and keeps the ineligible status non-interactive", () => {
    const manifest = createLineRichMenuAssetManifest();
    expect(manifest).toHaveLength(18);
    expect(JSON.stringify(manifest)).not.toContain("account-management");

    for (const menu of manifest) {
      const utilityActions = menu.actions.filter((action) => action.region === "utility");
      const primaryActions = menu.actions.filter((action) => action.region === "primary");
      expect(utilityActions, menu.key).toHaveLength(menu.key === "UNLINKED" ? 0 : 1);
      expect(primaryActions.some((action) => action.intent === "MANAGE_ACCOUNT"), menu.key).toBe(false);
      for (const action of utilityActions) {
        expect(action).toMatchObject({ region: "utility", icon: "settings", label: "จัดการบัญชี" });
        expect("illustration" in action).toBe(false);
        expect("tone" in action).toBe(false);
      }
    }

    const unlinked = manifest.find((menu) => menu.key === "UNLINKED");
    const ineligible = manifest.find((menu) => menu.key === "LINKED_INELIGIBLE");
    expect(unlinked?.status).toBeNull();
    expect(ineligible?.status).toEqual({
      label: "บัญชีนี้ยังไม่มีเมนูให้ใช้งาน",
      bounds: { x: 220, y: 620, width: 2060, height: 420 },
    });
    expect(ineligible?.actions).toHaveLength(1);
    expect(ineligible?.actions[0]).toMatchObject({ region: "utility", icon: "settings" });
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

  it("keeps the flat illustrated fields inside LINE's rectangular hitboxes", async () => {
    const colors = getLineRichMenuColors();
    const rgb = (hex: string): number[] => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const tones = {
      patient: { primary: "#F5E8E1", secondary: "#FBF5F1" },
      osm: { primary: "#DCEEE9", secondary: "#EFF5F2" },
      hospital: { primary: "#E1EDF1", secondary: "#F2F6F7" },
      account: { primary: "#F2E8D0", secondary: "#F8F4E9" },
    } as const;

    for (const menu of createLineRichMenuAssetManifest()) {
      const { data, info } = await sharp(await readFile(join(assetDirectory, menu.assetFile)))
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixel = (x: number, y: number): number[] => {
        const offset = (y * info.width + x) * info.channels;
        return [...data.subarray(offset, offset + 3)];
      };
      for (const [index, action] of menu.actions.entries()) {
        const { x, y, width, height } = action.bounds;
        if (action.region === "utility") {
          expect(action.bounds).toEqual({ x: 80, y: 1366, width: 2340, height: 320 });
          expect(pixel(x + Math.floor(width / 2), y + 5), menu.key).toEqual(rgb(colors.utilitySurface));
          expect(pixel(x - 1, y + Math.floor(height / 2)), menu.key).toEqual(rgb(colors.canvas));
          expect(pixel(x + Math.floor(width / 2), y - 1), menu.key).toEqual(rgb(colors.canvas));
          continue;
        }
        const primary = menu.key.startsWith("CHOOSER_") ? action.kind === "richmenuswitch"
          : menu.key.startsWith("PATIENT_")
            ? action.kind === "message" || (action.intent !== null && [
              "OPEN_PATIENT_APPOINTMENTS", "OPEN_PATIENT_WELLNESS", "OPEN_PATIENT_MEDICATIONS", "OPEN_PATIENT_CARE",
            ].includes(action.intent))
            : menu.key.startsWith("OSM_")
              ? action.intent !== null && [
                "OPEN_OSM_ASSIGNED_PATIENTS", "START_OSM_SCREENING", "START_OSM_FOLLOWUP", "OPEN_WORK_WORKSPACE",
              ].includes(action.intent)
              : menu.actions.length === 1 || index === 0;

        expect(pixel(x, y), menu.key).toEqual(rgb(colors.canvas));
        expect(pixel(x - 1, y + Math.floor(height / 2)), menu.key).toEqual(rgb(colors.canvas));
        expect(pixel(x + Math.floor(width / 2), y + 5), menu.key).toEqual(
          rgb(tones[action.tone][primary ? "primary" : "secondary"]),
        );
        expect(pixel(x + Math.floor(width / 2), y + height), menu.key).toEqual(rgb(colors.canvas));
      }
    }
  });
});
