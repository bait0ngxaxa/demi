import type { LineMenuAction, LineMenuDefinition } from "./catalog";

export type LineMenuBounds = { x: number; y: number; width: number; height: number };
export type LineMenuActionArea = {
  action: LineMenuAction;
  region: "primary" | "utility";
  bounds: LineMenuBounds;
};
export type LineMenuLayout = {
  /** Keeps catalog action order for the LINE payload while tagging the utility footer. */
  actionAreas: readonly LineMenuActionArea[];
  /** Static information only; this rectangle is deliberately not a LINE tappable area. */
  statusRegion: LineMenuBounds | null;
};

const CANVAS_WIDTH = 2500;
const CANVAS_HEIGHT = 1686;
const HEADER_HEIGHT = 204;
const PRIMARY_TOP = HEADER_HEIGHT + 24;
const PRIMARY_BOTTOM_MARGIN = 32;
const GRID_MARGIN = 32;
const GRID_GUTTER = 24;
const GRID_MAX_TILE_SIZE = 1080;
const UTILITY_FOOTER_HEIGHT = 320;
const UTILITY_FOOTER_TOP = CANVAS_HEIGHT - UTILITY_FOOTER_HEIGHT;
const UTILITY_FOOTER_GAP = 40;
const UTILITY_FOOTER_X = 80;
const UTILITY_FOOTER_WIDTH = CANVAS_WIDTH - UTILITY_FOOTER_X * 2;
const STATUS_REGION: LineMenuBounds = { x: 220, y: 620, width: 2060, height: 420 };

function getGridColumns(count: number): number {
  if (count <= 3) return count;
  if (count === 4) return 2;
  if (count <= 6) return 3;
  if (count <= 8) return 4;
  return 3;
}

function getGridBounds(count: number, bottom: number): readonly LineMenuBounds[] {
  const columns = getGridColumns(count);
  const rows = Math.ceil(count / columns);
  const availableHeight = bottom - PRIMARY_TOP;
  const availableWidth = CANVAS_WIDTH - GRID_MARGIN * 2;
  const size = Math.min(
    GRID_MAX_TILE_SIZE,
    Math.floor((availableWidth - GRID_GUTTER * (columns - 1)) / columns),
    Math.floor((availableHeight - GRID_GUTTER * (rows - 1)) / rows),
  );
  if (size < 1) throw new Error("Rich Menu primary action grid has no usable space.");
  const gridHeight = rows * size + (rows - 1) * GRID_GUTTER;
  const top = PRIMARY_TOP + Math.floor((availableHeight - gridHeight) / 2);

  return Array.from({ length: count }, (_, index) => {
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

/**
 * One authoritative layout for illustration placement and LINE tappable-area bounds.
 * MANAGE_ACCOUNT is placed in a separate bottom footer by intent; all other actions use
 * the adaptive primary grid. An empty primary grid receives a non-interactive status region.
 */
export function getLineMenuLayout(menu: LineMenuDefinition): LineMenuLayout {
  if (menu.actions.length < 1 || menu.actions.length > 9) {
    throw new Error("Rich Menu layouts require 1–9 catalog actions.");
  }

  const utilityIndexes = menu.actions.flatMap((action, index) =>
    action.type === "uri" && action.intent === "MANAGE_ACCOUNT" ? [index] : [],
  );
  if (utilityIndexes.length > 1) throw new Error("A Rich Menu can contain only one MANAGE_ACCOUNT footer action.");

  const utilityIndex = utilityIndexes[0];
  const primaryCount = menu.actions.length - utilityIndexes.length;
  const primaryBottom = utilityIndex === undefined
    ? CANVAS_HEIGHT - PRIMARY_BOTTOM_MARGIN
    : UTILITY_FOOTER_TOP - UTILITY_FOOTER_GAP;
  const primaryBounds = primaryCount === 0 ? [] : getGridBounds(primaryCount, primaryBottom);
  let primaryIndex = 0;

  const actionAreas = menu.actions.map((action, actionIndex): LineMenuActionArea => {
    if (actionIndex === utilityIndex) {
      return {
        action,
        region: "utility",
        bounds: {
          x: UTILITY_FOOTER_X,
          y: UTILITY_FOOTER_TOP,
          width: UTILITY_FOOTER_WIDTH,
          height: UTILITY_FOOTER_HEIGHT,
        },
      };
    }

    const bounds = primaryBounds[primaryIndex];
    if (!bounds) throw new Error(`Missing primary Rich Menu bounds for action ${actionIndex}.`);
    primaryIndex += 1;
    return { action, region: "primary", bounds };
  });

  return {
    actionAreas,
    statusRegion: primaryCount === 0 ? STATUS_REGION : null,
  };
}

/** Returns tappable bounds in catalog order for callers that only need the LINE areas. */
export function getLineMenuAreaBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  return getLineMenuLayout(menu).actionAreas.map(({ bounds }) => bounds);
}
