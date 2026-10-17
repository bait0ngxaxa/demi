import type { LineMenuDefinition } from "./catalog";

export type LineMenuBounds = { x: number; y: number; width: number; height: number };

const CANVAS_WIDTH = 2500;
const ACTION_LEFT = 100;
const ACTION_WIDTH = 2300;

export function getLineMenuAreaBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  const chooser = menu.key.startsWith("CHOOSER_");
  if (chooser) {
    const roleIndexes = menu.actions.flatMap((action, index) =>
      action.type === "richmenuswitch" ? [index] : [],
    );
    const accountIndex = menu.actions.findIndex(
      (action) => action.type === "uri" && action.intent === "MANAGE_ACCOUNT",
    );
    const roleWidth = Math.floor(CANVAS_WIDTH / roleIndexes.length);
    const bounds = menu.actions.map(() => ({
      x: 0,
      y: 340,
      width: 0,
      height: 980,
    }));

    roleIndexes.forEach((index, position) => {
      bounds[index] = {
        x: position * roleWidth,
        y: 340,
        width: position === roleIndexes.length - 1
          ? CANVAS_WIDTH - position * roleWidth
          : roleWidth,
        height: 980,
      };
    });
    if (accountIndex >= 0) {
      bounds[accountIndex] = {
        x: ACTION_LEFT,
        y: 1360,
        width: ACTION_WIDTH,
        height: 326,
      };
    }
    return bounds;
  }
  if (menu.key === "UNLINKED" || menu.key === "LINKED_INELIGIBLE") {
    return menu.actions.map(() => ({ x: ACTION_LEFT, y: 340, width: ACTION_WIDTH, height: 1250 }));
  }
  const appointmentIndex = menu.actions.findIndex((action) => action.type === "postback");
  const mainActionIndexes = appointmentIndex >= 0 ? [0, appointmentIndex] : [0];
  const bottomIndexes = menu.actions.flatMap((_, index) =>
    mainActionIndexes.includes(index) ? [] : [index],
  );
  const bounds = menu.actions.map(() => ({
    x: ACTION_LEFT,
    y: 340,
    width: ACTION_WIDTH,
    height: 840,
  }));

  if (appointmentIndex >= 0) {
    const gap = 40;
    const cellWidth = (ACTION_WIDTH - gap) / 2;
    bounds[0] = { x: ACTION_LEFT, y: 340, width: cellWidth, height: 840 };
    bounds[appointmentIndex] = {
      x: ACTION_LEFT + cellWidth + gap,
      y: 340,
      width: cellWidth,
      height: 840,
    };
  }

  const bottomWidth = Math.floor(ACTION_WIDTH / bottomIndexes.length);
  bottomIndexes.forEach((index, position) => {
    bounds[index] = {
      x: ACTION_LEFT + position * bottomWidth,
      y: 1220,
      width: position === bottomIndexes.length - 1
        ? ACTION_LEFT + ACTION_WIDTH - (ACTION_LEFT + position * bottomWidth)
        : bottomWidth,
      height: 466,
    };
  });
  return bounds;
}
