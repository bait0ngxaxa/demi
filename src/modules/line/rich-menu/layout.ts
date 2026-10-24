import type { LineMenuDefinition } from "./catalog";

export type LineMenuBounds = { x: number; y: number; width: number; height: number };

const CANVAS_WIDTH = 2500;
const CANVAS_HEIGHT = 1686;
const GRID_TOP = 204;
const GRID_MARGIN = 32;
const GRID_GUTTER = 24;

/** Visual cards and LINE's rectangular hit areas share these exact bounds. */
export function getLineMenuAreaBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  const count = menu.actions.length;
  if (count < 1 || count > 9) throw new Error("Rich Menu square grids require 1–9 actions.");
  const columns = count <= 3 ? count : count === 4 ? 2 : count <= 6 || count === 9 ? 3 : 4;
  const rows = Math.ceil(count / columns);
  const availableHeight = CANVAS_HEIGHT - GRID_TOP - GRID_MARGIN;
  const size = Math.min(
    1080,
    Math.floor((CANVAS_WIDTH - GRID_MARGIN * 2 - GRID_GUTTER * (columns - 1)) / columns),
    Math.floor((availableHeight - GRID_GUTTER * (rows - 1)) / rows),
  );
  const gridHeight = rows * size + (rows - 1) * GRID_GUTTER;
  const top = GRID_TOP + Math.floor((availableHeight - gridHeight) / 2);

  return menu.actions.map((_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const rowWidth = rowCount * size + (rowCount - 1) * GRID_GUTTER;
    return {
      x: Math.floor((CANVAS_WIDTH - rowWidth) / 2) + column * (size + GRID_GUTTER),
      y: top + row * (size + GRID_GUTTER),
      width: size,
      height: size,
    };
  });
}
