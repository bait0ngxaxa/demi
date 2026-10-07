import type { LineMenuDefinition } from "./catalog";

export type LineMenuBounds = { x: number; y: number; width: number; height: number };

export function getLineMenuAreaBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  const chooser = menu.key.startsWith("CHOOSER_");
  if (chooser) {
    const switches = menu.actions.filter((action) => action.type === "richmenuswitch").length;
    const count = switches + 1;
    const cellWidth = Math.floor(2500 / count);
    return menu.actions.map((_, index) => ({
      x: index * cellWidth,
      y: 560,
      width: index === count - 1 ? 2500 - index * cellWidth : cellWidth,
      height: 1126,
    }));
  }
  if (menu.key === "UNLINKED" || menu.key === "LINKED_INELIGIBLE") {
    return menu.actions.map(() => ({ x: 100, y: 560, width: 2300, height: 1000 }));
  }
  const switchCount = menu.actions.filter((action) => action.type === "richmenuswitch").length;
  const bounds = menu.actions.map(() => ({ x: 100, y: 560, width: 2300, height: 660 }));
  let switchIndex = 0;
  menu.actions.forEach((action, index) => {
    if (action.type === "richmenuswitch") {
      const cellWidth = 2300 / (switchCount + 1);
      bounds[index] = { x: 100 + (switchIndex + 1) * cellWidth, y: 1300, width: cellWidth, height: 286 };
      switchIndex += 1;
    } else if (action.intent === "MANAGE_ACCOUNT") {
      bounds[index] = { x: 100, y: 1300, width: 2300 / (switchCount + 1), height: 286 };
    }
  });
  return bounds;
}
