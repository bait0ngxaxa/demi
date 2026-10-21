import type { LineMenuAction, LineMenuDefinition } from "./catalog";

export type LineMenuBounds = { x: number; y: number; width: number; height: number };

const CANVAS_WIDTH = 2500;
const CANVAS_HEIGHT = 1686;
const GRID_MARGIN = 48;
const GRID_GUTTER = 24;
const GRID_COLUMN_WIDTH = Math.floor((CANVAS_WIDTH - GRID_MARGIN * 2 - GRID_GUTTER) / 2);
const PATIENT_TASK_INTENTS = new Set([
  "OPEN_PATIENT_APPOINTMENTS",
  "OPEN_PATIENT_WELLNESS",
  "OPEN_PATIENT_MEDICATIONS",
  "OPEN_PATIENT_CARE",
]);
const OSM_TASK_INTENTS = new Set([
  "OPEN_OSM_ASSIGNED_PATIENTS",
  "START_OSM_SCREENING",
  "START_OSM_FOLLOWUP",
  "OPEN_WORK_WORKSPACE",
]);

function isUriIntent(action: LineMenuAction, intent: string): boolean {
  return action.type === "uri" && action.intent === intent;
}

function gridBounds(
  index: number,
  columns: number,
  top: number,
  rowHeight: number,
  rowGap: number,
): LineMenuBounds {
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = GRID_MARGIN + column * (GRID_COLUMN_WIDTH + GRID_GUTTER);
  const width = column === columns - 1
    ? CANVAS_WIDTH - GRID_MARGIN - x
    : GRID_COLUMN_WIDTH;
  return { x, y: top + row * (rowHeight + rowGap), width, height: rowHeight };
}

function footerBounds(
  index: number,
  count: number,
  top: number,
  height: number,
): LineMenuBounds {
  const columns = count > 3 ? 2 : count;
  const rowCount = Math.ceil(count / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const gutter = 16;
  const rowHeight = Math.floor((height - gutter * (rowCount - 1)) / rowCount);
  const columnWidth = Math.floor(
    (CANVAS_WIDTH - GRID_MARGIN * 2 - gutter * (columns - 1)) / columns,
  );
  const x = GRID_MARGIN + column * (columnWidth + gutter);
  const width = column === columns - 1
    ? CANVAS_WIDTH - GRID_MARGIN - x
    : columnWidth;
  return { x, y: top + row * (rowHeight + gutter), width, height: rowHeight };
}

function menuActionIndexes(
  menu: LineMenuDefinition,
  matches: (action: LineMenuAction) => boolean,
): number[] {
  return menu.actions.flatMap((action, index) => matches(action) ? [index] : []);
}

function createEmptyBounds(menu: LineMenuDefinition): LineMenuBounds[] {
  return menu.actions.map(() => ({ x: 0, y: 0, width: 0, height: 0 }));
}

function getPatientMenuBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  const taskIndexes = menuActionIndexes(menu, (action) =>
    action.type === "postback" || (action.type === "uri" && PATIENT_TASK_INTENTS.has(action.intent)),
  );
  const careIndex = menu.actions.findIndex((action) => isUriIntent(action, "OPEN_PATIENT_CARE"));
  const gridIndexes = taskIndexes.filter((index) => index !== careIndex);
  const footerIndexes = menu.actions.flatMap((_, index) =>
    gridIndexes.includes(index) || index === careIndex ? [] : [index],
  );
  const bounds = createEmptyBounds(menu);

  gridIndexes.forEach((actionIndex, index) => {
    bounds[actionIndex] = gridBounds(index, 2, 314, 280, 16);
  });
  if (careIndex >= 0) {
    bounds[careIndex] = {
      x: GRID_MARGIN,
      y: 906,
      width: CANVAS_WIDTH - GRID_MARGIN * 2,
      height: 252,
    };
  }
  footerIndexes.forEach((actionIndex, index) => {
    bounds[actionIndex] = footerBounds(index, footerIndexes.length, 1174, 512);
  });

  return bounds;
}

function getOsmMenuBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  const taskIndexes = menuActionIndexes(menu, (action) =>
    action.type === "uri" && OSM_TASK_INTENTS.has(action.intent),
  );
  const footerIndexes = menu.actions.flatMap((_, index) => taskIndexes.includes(index) ? [] : [index]);
  const bounds = createEmptyBounds(menu);

  taskIndexes.forEach((actionIndex, index) => {
    bounds[actionIndex] = gridBounds(index, 2, 314, 352, 16);
  });
  footerIndexes.forEach((actionIndex, index) => {
    bounds[actionIndex] = footerBounds(index, footerIndexes.length, 1050, 636);
  });

  return bounds;
}

export function getLineMenuAreaBounds(menu: LineMenuDefinition): readonly LineMenuBounds[] {
  const chooser = menu.key.startsWith("CHOOSER_");
  if (chooser) {
    const roleIndexes = menu.actions.flatMap((action, index) =>
      action.type === "richmenuswitch" ? [index] : [],
    );
    const accountIndex = menu.actions.findIndex(
      (action) => isUriIntent(action, "MANAGE_ACCOUNT"),
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
        x: 100,
        y: 1360,
        width: 2300,
        height: CANVAS_HEIGHT - 1360,
      };
    }
    return bounds;
  }

  if (menu.key === "UNLINKED" || menu.key === "LINKED_INELIGIBLE") {
    return menu.actions.map(() => ({ x: 100, y: 340, width: 2300, height: 1250 }));
  }

  if (menu.key.startsWith("PATIENT_")) return getPatientMenuBounds(menu);
  if (menu.key.startsWith("OSM_")) return getOsmMenuBounds(menu);

  const footerIndexes = menu.actions.flatMap((_, index) => index === 0 ? [] : [index]);
  const bounds = createEmptyBounds(menu);
  bounds[0] = { x: 100, y: 340, width: 2300, height: 840 };
  footerIndexes.forEach((actionIndex, index) => {
    const width = Math.floor(2300 / footerIndexes.length);
    bounds[actionIndex] = {
      x: 100 + index * width,
      y: 1220,
      width: index === footerIndexes.length - 1
        ? 2400 - (100 + index * width)
        : width,
      height: 466,
    };
  });
  return bounds;
}
