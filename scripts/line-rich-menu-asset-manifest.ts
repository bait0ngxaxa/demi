import { LINE_RICH_MENU_CATALOG } from "../src/modules/line/rich-menu/catalog";
import { getLineMenuLayout } from "../src/modules/line/rich-menu/layout";
import type { LineRichMenuAssetManifestEntry, LineRichMenuMenuAction } from "./line-rich-menu-renderer";
import { getLineRichMenuActionVisual } from "./line-rich-menu-illustrations";

export function createLineRichMenuAssetManifest(): LineRichMenuAssetManifestEntry[] {
  return LINE_RICH_MENU_CATALOG.map((menu) => {
    const layout = getLineMenuLayout(menu);
    const actions: LineRichMenuMenuAction[] = layout.actionAreas.map(({ action, region, bounds }) => {
      const shared = {
        label: action.label,
        kind: action.type,
        intent: action.type === "uri" ? action.intent : null,
        bounds,
      };

      if (region === "utility") {
        return { ...shared, region, icon: "settings" };
      }

      return { ...shared, region, ...getLineRichMenuActionVisual(menu, action) };
    });
    const status = layout.statusRegion ? { label: menu.context, bounds: layout.statusRegion } : null;

    return {
      key: menu.key,
      title: menu.title,
      context: menu.context,
      assetFile: menu.assetFile,
      actions,
      status,
    };
  });
}

if (process.argv[1]?.endsWith("line-rich-menu-asset-manifest.ts")) {
  process.stdout.write(`${JSON.stringify(createLineRichMenuAssetManifest())}\n`);
}
