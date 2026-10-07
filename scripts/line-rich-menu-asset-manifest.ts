import { LINE_RICH_MENU_CATALOG } from "../src/modules/line/rich-menu/catalog";
import { getLineMenuAreaBounds } from "../src/modules/line/rich-menu/layout";

const manifest = LINE_RICH_MENU_CATALOG.map((menu) => ({
  key: menu.key,
  title: menu.title,
  context: menu.context,
  assetFile: menu.assetFile,
  actions: menu.actions.map((action, index) => ({
    label: action.label,
    kind: action.type,
    bounds: getLineMenuAreaBounds(menu)[index],
  })),
}));

process.stdout.write(`${JSON.stringify(manifest)}\n`);
