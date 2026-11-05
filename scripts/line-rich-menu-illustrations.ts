import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import type { LineMenuAction, LineMenuDefinition } from "../src/modules/line/rich-menu/catalog";

export type LineRichMenuIllustration =
  | "patient-appointment-consultation"
  | "patient-appointment-history"
  | "patient-wellness-recording"
  | "patient-medication-review"
  | "patient-care-guidance"
  | "patient-workspace"
  | "osm-screening"
  | "osm-home-visit"
  | "osm-community-workspace"
  | "osm-workflow-coordination"
  | "hospital-operations"
  | "account-linking";

export type LineRichMenuIllustrationTone = "patient" | "osm" | "hospital" | "account";

export type LineRichMenuActionVisual = {
  illustration: LineRichMenuIllustration;
  tone: LineRichMenuIllustrationTone;
};

type AtlasKey = "community-and-appointments" | "patient-care" | "identity-and-workspaces";
type IllustrationSource =
  | { kind: "atlas"; atlas: AtlasKey; quadrant: 0 | 1 | 2 | 3 }
  | { kind: "single"; file: string };

const atlasFiles: Record<AtlasKey, string> = {
  "community-and-appointments": fileURLToPath(
    new URL("./illustrations/line-rich-menu/atlas-community-and-appointments.png", import.meta.url),
  ),
  "patient-care": fileURLToPath(
    new URL("./illustrations/line-rich-menu/atlas-patient-care.png", import.meta.url),
  ),
  "identity-and-workspaces": fileURLToPath(
    new URL("./illustrations/line-rich-menu/atlas-identity-and-workspaces.png", import.meta.url),
  ),
};

const illustrationSources: Record<LineRichMenuIllustration, IllustrationSource> = {
  "patient-appointment-consultation": { kind: "atlas", atlas: "community-and-appointments", quadrant: 0 },
  "osm-screening": { kind: "atlas", atlas: "community-and-appointments", quadrant: 1 },
  "osm-home-visit": { kind: "atlas", atlas: "community-and-appointments", quadrant: 2 },
  "hospital-operations": { kind: "atlas", atlas: "community-and-appointments", quadrant: 3 },
  "patient-appointment-history": { kind: "atlas", atlas: "patient-care", quadrant: 0 },
  "patient-wellness-recording": { kind: "atlas", atlas: "patient-care", quadrant: 1 },
  "patient-medication-review": { kind: "atlas", atlas: "patient-care", quadrant: 2 },
  "patient-care-guidance": { kind: "atlas", atlas: "patient-care", quadrant: 3 },
  "account-linking": { kind: "atlas", atlas: "identity-and-workspaces", quadrant: 0 },
  "patient-workspace": { kind: "atlas", atlas: "identity-and-workspaces", quadrant: 2 },
  "osm-community-workspace": { kind: "atlas", atlas: "identity-and-workspaces", quadrant: 3 },
  "osm-workflow-coordination": {
    kind: "single",
    file: fileURLToPath(new URL("./illustrations/line-rich-menu/scene-osm-workspace.png", import.meta.url)),
  },
};

const illustrationTones: Record<LineRichMenuIllustration, LineRichMenuIllustrationTone> = {
  "patient-appointment-consultation": "patient",
  "patient-appointment-history": "patient",
  "patient-wellness-recording": "patient",
  "patient-medication-review": "patient",
  "patient-care-guidance": "patient",
  "patient-workspace": "patient",
  "osm-screening": "osm",
  "osm-home-visit": "osm",
  "osm-community-workspace": "osm",
  "osm-workflow-coordination": "osm",
  "hospital-operations": "hospital",
  "account-linking": "account",
};

const roleIllustrations = {
  PATIENT: "patient-workspace",
  OSM: "osm-workflow-coordination",
  HOSPITAL: "hospital-operations",
} as const satisfies Record<"PATIENT" | "OSM" | "HOSPITAL", LineRichMenuIllustration>;

const atlasBuffers = new Map<AtlasKey, Buffer>();
const renderedIllustrations = new Map<LineRichMenuIllustration, Promise<Buffer>>();

function readAtlas(atlas: AtlasKey): Buffer {
  let source = atlasBuffers.get(atlas);
  if (source === undefined) {
    source = readFileSync(atlasFiles[atlas]);
    atlasBuffers.set(atlas, source);
  }
  return source;
}

function actionVisual(illustration: LineRichMenuIllustration): LineRichMenuActionVisual {
  return { illustration, tone: illustrationTones[illustration] };
}

export function getLineRichMenuActionVisual(
  menu: LineMenuDefinition,
  action: LineMenuAction,
): LineRichMenuActionVisual {
  if (action.type === "message") return actionVisual("patient-appointment-consultation");
  if (action.type === "richmenuswitch") return actionVisual(roleIllustrations[action.role]);

  switch (action.intent) {
    case "LINK_ACCOUNT":
      return actionVisual("account-linking");
    case "MANAGE_ACCOUNT":
      throw new Error("MANAGE_ACCOUNT is a utility footer action and has no illustration.");
    case "OPEN_PATIENT_APPOINTMENTS":
      return actionVisual("patient-appointment-history");
    case "OPEN_PATIENT_WELLNESS":
      return actionVisual("patient-wellness-recording");
    case "OPEN_PATIENT_MEDICATIONS":
      return actionVisual("patient-medication-review");
    case "OPEN_PATIENT_CARE":
      return actionVisual("patient-care-guidance");
    case "OPEN_OSM_ASSIGNED_PATIENTS":
      return actionVisual("osm-community-workspace");
    case "START_OSM_SCREENING":
      return actionVisual("osm-screening");
    case "START_OSM_FOLLOWUP":
      return actionVisual("osm-home-visit");
    case "OPEN_PATIENT_WORKSPACE":
      return actionVisual("patient-workspace");
    case "OPEN_WORK_WORKSPACE":
      return actionVisual(menu.key.startsWith("HOSPITAL_") ? "hospital-operations" : "osm-workflow-coordination");
    default:
      throw new Error(`No Rich Menu illustration is defined for ${action.intent}.`);
  }
}

async function createIllustrationBuffer(illustration: LineRichMenuIllustration): Promise<Buffer> {
  const source = illustrationSources[illustration];
  const image = source.kind === "atlas" ? readAtlas(source.atlas) : readFileSync(source.file);
  const metadata = await sharp(image).metadata();
  if (metadata.width === undefined || metadata.height === undefined ||
    metadata.width !== metadata.height || metadata.hasAlpha !== true || metadata.format !== "png") {
    throw new Error(`Rich Menu illustration ${illustration} must be a square PNG with transparency.`);
  }

  if (source.kind === "single") return image;
  if (metadata.width % 2 !== 0 || metadata.height % 2 !== 0) {
    throw new Error(`Rich Menu illustration atlas ${source.atlas} must have even dimensions for its 2×2 crop grid.`);
  }

  const cellWidth = metadata.width / 2;
  const cellHeight = metadata.height / 2;
  const left = (source.quadrant % 2) * cellWidth;
  const top = Math.floor(source.quadrant / 2) * cellHeight;
  return sharp(image)
    .extract({ left, top, width: cellWidth, height: cellHeight })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

export function getLineRichMenuIllustrationBuffer(illustration: LineRichMenuIllustration): Promise<Buffer> {
  let buffer = renderedIllustrations.get(illustration);
  if (buffer === undefined) {
    buffer = createIllustrationBuffer(illustration);
    renderedIllustrations.set(illustration, buffer);
  }
  return buffer;
}
