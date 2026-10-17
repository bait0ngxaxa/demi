import { LINE_RICH_MENU_CATALOG } from "../src/modules/line/rich-menu/catalog";
import { getLineMenuAreaBounds } from "../src/modules/line/rich-menu/layout";

export function createLineRichMenuAssetManifest() {
  return LINE_RICH_MENU_CATALOG.map((menu) => {
    const bounds = getLineMenuAreaBounds(menu);
    return {
      key: menu.key,
      title: menu.title,
      context: menu.context,
      assetFile: menu.assetFile,
      actions: menu.actions.map((action, index) => ({
        label: action.label,
        kind: action.type,
        bounds: bounds[index],
      })),
    };
  });
}

if (process.argv[1]?.endsWith("line-rich-menu-asset-manifest.ts")) {
  process.stdout.write(`${JSON.stringify(createLineRichMenuAssetManifest())}\n`);
}
