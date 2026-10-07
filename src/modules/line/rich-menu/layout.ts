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
  if (menu.actions.some((action) => action.type === "postback")) {
    const bounds = menu.actions.map(() => ({ x: 100, y: 560, width: 2300, height: 660 }));
    const workspaceIndex = menu.actions.findIndex(
      (action) => action.type === "uri" && action.intent === "OPEN_PATIENT_WORKSPACE",
    );
    const appointmentIndex = menu.actions.findIndex((action) => action.type === "postback");
    const manageIndex = menu.actions.findIndex(
      (action) => action.type === "uri" && action.intent === "MANAGE_ACCOUNT",
    );
    const switchIndices = menu.actions.flatMap((action, index) =>
      action.type === "richmenuswitch" ? [index] : [],
    );

    if (workspaceIndex >= 0 && appointmentIndex >= 0) {
      const gap = 40;
      const width = (2300 - gap) / 2;
      bounds[workspaceIndex] = { x: 100, y: 560, width, height: 660 };
      bounds[appointmentIndex] = { x: 100 + width + gap, y: 560, width, height: 660 };
    }

    const bottomIndices = [...(manageIndex >= 0 ? [manageIndex] : []), ...switchIndices];
    const bottomWidth = 2300 / Math.max(bottomIndices.length, 1);
    bottomIndices.forEach((index, position) => {
      bounds[index] = {
        x: 100 + position * bottomWidth,
        y: 1300,
        width: position === bottomIndices.length - 1
          ? 2400 - (100 + position * bottomWidth)
          : bottomWidth,
        height: 286,
      };
    });
    return bounds;
  }
  const switchCount = menu.actions.filter((action) => action.type === "richmenuswitch").length;
  const bounds = menu.actions.map(() => ({ x: 100, y: 560, width: 2300, height: 660 }));
  let switchIndex = 0;
  menu.actions.forEach((action, index) => {
    if (action.type === "richmenuswitch") {
      const cellWidth = 2300 / (switchCount + 1);
      bounds[index] = { x: 100 + (switchIndex + 1) * cellWidth, y: 1300, width: cellWidth, height: 286 };
      switchIndex += 1;
    } else if (action.type === "uri" && action.intent === "MANAGE_ACCOUNT") {
      bounds[index] = { x: 100, y: 1300, width: 2300 / (switchCount + 1), height: 286 };
    }
  });
  return bounds;
}
