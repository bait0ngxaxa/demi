import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getLineMessagingEnv } from "@/lib/env/server";

import { LineMessagingClient, createLineRichMenuPayload } from "../adapters/line-messaging-client";
import { LineFailure } from "../domain/line-errors";
import { LINE_RICH_MENU_CATALOG } from "./catalog";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_IMAGE_BYTES = 1024 * 1024;

export type LineProvisioningDependencies = {
  client?: Pick<LineMessagingClient,
    | "listRichMenus"
    | "getRichMenu"
    | "getRichMenuImage"
    | "validateRichMenu"
    | "createRichMenu"
    | "uploadRichMenuImage"
    | "getAlias"
    | "createAlias"
    | "updateAlias"
    | "setDefaultMenu"
    | "getDefaultMenu"
  >;
  assetDirectory?: string;
  apply?: boolean;
};

export type LineProvisioningResult = {
  expectedMenus: number;
  createdMenus: number;
  reusedMenus: number;
  uploadedImages: number;
  createdAliases: number;
  updatedAliases: number;
  defaultMenuUpdated: boolean;
};

function digest(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function validatePng(bytes: Uint8Array): void {
  const buffer = Buffer.from(bytes);
  if (buffer.byteLength > MAX_IMAGE_BYTES || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new LineFailure("RICH_MENU_MISMATCH");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 800 || width > 2500 || height < 250 || width / height < 1.45) {
    throw new LineFailure("RICH_MENU_MISMATCH");
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function providerManifestName(menuKey: string, payload: ReturnType<typeof createLineRichMenuPayload>, image: Uint8Array): string {
  const unnamedPayload = { ...payload, name: "" };
  const version = digest(Buffer.from(`${stableJson(unnamedPayload)}:${digest(image)}`)).slice(0, 16);
  return `DEMIJ1_${menuKey}_${version}`;
}

function equalMenuDefinition(
  actual: { name: string; size: { width: number; height: number }; chatBarText?: string; areas: readonly unknown[] },
  expected: ReturnType<typeof createLineRichMenuPayload>,
): boolean {
  return stableJson({
    name: actual.name,
    size: actual.size,
    chatBarText: actual.chatBarText,
    areas: actual.areas,
  }) === stableJson({
    name: expected.name,
    size: expected.size,
    chatBarText: expected.chatBarText,
    areas: expected.areas,
  });
}

async function ensureAlias(
  client: LineProvisioningDependencies["client"] & object,
  aliasId: string,
  richMenuId: string,
  apply: boolean,
): Promise<"UNCHANGED" | "CREATED" | "UPDATED"> {
  const current = await client.getAlias(aliasId);
  if (current === richMenuId) return "UNCHANGED";
  if (!apply) return current ? "UPDATED" : "CREATED";
  if (current === null) {
    try {
      await client.createAlias(aliasId, richMenuId);
    } catch {
      const raced = await client.getAlias(aliasId);
      if (raced !== richMenuId) throw new LineFailure("LINE_PROVIDER_TRANSIENT");
    }
  } else {
    await client.updateAlias(aliasId, richMenuId);
  }
  for (const pauseMs of [0, 200, 500, 1000]) {
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    if (await client.getAlias(aliasId) === richMenuId) return current === null ? "CREATED" : "UPDATED";
  }
  throw new LineFailure("RICH_MENU_MISMATCH");
}

export async function reconcileLineRichMenuCatalog(
  dependencies: LineProvisioningDependencies = {},
): Promise<LineProvisioningResult> {
  getLineMessagingEnv();
  if (LINE_RICH_MENU_CATALOG.length !== 18) throw new LineFailure("RICH_MENU_MISMATCH");
  const client = dependencies.client ?? new LineMessagingClient();
  const assetDirectory = dependencies.assetDirectory ?? join(process.cwd(), "public", "line", "rich-menus");
  const apply = dependencies.apply === true;
  const remoteMenus = await client.listRichMenus();
  const remoteNames = new Map<string, string[]>();
  for (const menu of remoteMenus) {
    if (!menu.name) continue;
    remoteNames.set(menu.name, [...(remoteNames.get(menu.name) ?? []), menu.richMenuId]);
  }

  const prepared = [] as Array<{
    key: string;
    alias: string;
    payload: ReturnType<typeof createLineRichMenuPayload>;
    image: Uint8Array;
    imageDigest: string;
    existingId: string | null;
  }>;
  for (const menu of LINE_RICH_MENU_CATALOG) {
    const image = new Uint8Array(await readFile(join(assetDirectory, menu.assetFile)));
    validatePng(image);
    const basePayload = createLineRichMenuPayload(menu);
    const name = providerManifestName(menu.key, basePayload, image);
    const payload = { ...basePayload, name };
    const matchingIds = [...(remoteNames.get(name) ?? [])].sort();
    const existingId = matchingIds[0] ?? null;
    if (existingId) {
      const existingDefinition = await client.getRichMenu(existingId);
      if (!equalMenuDefinition(existingDefinition, payload)) throw new LineFailure("RICH_MENU_MISMATCH");
      const existingImage = await client.getRichMenuImage(existingId);
      if (existingImage && digest(existingImage) !== digest(image)) throw new LineFailure("RICH_MENU_MISMATCH");
    }
    await client.validateRichMenu(payload);
    prepared.push({ key: menu.key, alias: menu.alias, payload, image, imageDigest: digest(image), existingId });
  }

  let createdMenus = 0;
  let reusedMenus = 0;
  let uploadedImages = 0;
  const menuIds = new Map<string, string>();
  for (const menu of prepared) {
    let richMenuId = menu.existingId;
    if (!richMenuId) {
      if (apply) {
        richMenuId = await client.createRichMenu(menu.payload);
        await client.uploadRichMenuImage(richMenuId, menu.image);
        const image = await client.getRichMenuImage(richMenuId);
        if (!image || digest(image) !== menu.imageDigest) throw new LineFailure("RICH_MENU_MISMATCH");
        createdMenus += 1;
        uploadedImages += 1;
      } else {
        createdMenus += 1;
      }
    } else {
      reusedMenus += 1;
      if (!apply) {
        // A null remote image is a recoverable interrupted upload in apply mode.
        const remoteImage = await client.getRichMenuImage(richMenuId);
        if (!remoteImage) uploadedImages += 1;
      } else {
        const remoteImage = await client.getRichMenuImage(richMenuId);
        if (!remoteImage) {
          await client.uploadRichMenuImage(richMenuId, menu.image);
          const verifiedImage = await client.getRichMenuImage(richMenuId);
          if (!verifiedImage || digest(verifiedImage) !== menu.imageDigest) throw new LineFailure("RICH_MENU_MISMATCH");
          uploadedImages += 1;
        }
      }
    }
    if (richMenuId) menuIds.set(menu.key, richMenuId);
  }

  let createdAliases = 0;
  let updatedAliases = 0;
  for (const menu of prepared) {
    const richMenuId = menuIds.get(menu.key);
    if (!richMenuId && !apply) {
      const existingAlias = await client.getAlias(menu.alias);
      if (existingAlias === null) createdAliases += 1;
      else updatedAliases += 1;
      continue;
    }
    if (!richMenuId) continue;
    const alias = await ensureAlias(client, menu.alias, richMenuId, apply);
    if (alias === "CREATED") createdAliases += 1;
    if (alias === "UPDATED") updatedAliases += 1;
  }

  const defaultMenuId = menuIds.get("UNLINKED");
  const defaultBefore = await client.getDefaultMenu();
  let defaultMenuUpdated = false;
  if (!defaultMenuId && apply) throw new LineFailure("RICH_MENU_MISMATCH");
  if (!defaultMenuId && !apply) defaultMenuUpdated = true;
  if (defaultMenuId && defaultBefore !== defaultMenuId) {
    if (apply) {
      await client.setDefaultMenu(defaultMenuId);
      if (await client.getDefaultMenu() !== defaultMenuId) throw new LineFailure("RICH_MENU_MISMATCH");
    }
    defaultMenuUpdated = true;
  }

  return { expectedMenus: prepared.length, createdMenus, reusedMenus, uploadedImages, createdAliases, updatedAliases, defaultMenuUpdated };
}

export const lineMenuProvisioningInternals = { validatePng, stableJson, providerManifestName, equalMenuDefinition };
