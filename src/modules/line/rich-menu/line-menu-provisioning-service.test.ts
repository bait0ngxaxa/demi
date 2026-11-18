import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_RICH_MENU_CATALOG } from "./catalog";
import { lineMenuProvisioningInternals, reconcileLineRichMenuCatalog } from "./line-menu-provisioning-service";
import { createLineRichMenuPayload, type LineRichMenuPayload } from "../adapters/line-messaging-client";

const assetDirectory = join(process.cwd(), "public", "line", "rich-menus");

function createFakeProvider() {
  const menus = new Map<string, { id: string; payload: LineRichMenuPayload }>();
  const images = new Map<string, Uint8Array>();
  const aliases = new Map<string, string>();
  let defaultMenu: string | null = null;
  let nextId = 0;
  return {
    menus,
    images,
    aliases,
    get defaultMenu() { return defaultMenu; },
    async listRichMenus() {
      return [...menus.values()].map(({ id, payload }) => ({ richMenuId: id, name: payload.name }));
    },
    async getRichMenu(id: string) {
      const menu = [...menus.values()].find((candidate) => candidate.id === id);
      if (!menu) throw new Error("not found");
      return { ...menu.payload, richMenuId: id };
    },
    async getRichMenuImage(id: string) { return images.get(id) ?? null; },
    async validateRichMenu() {},
    async createRichMenu(payload: LineRichMenuPayload) {
      const id = `rich-menu-${++nextId}`;
      menus.set(payload.name, { id, payload });
      return id;
    },
    async uploadRichMenuImage(id: string, image: Uint8Array) { images.set(id, new Uint8Array(image)); },
    async getAlias(alias: string) { return aliases.get(alias) ?? null; },
    async createAlias(alias: string, id: string) { aliases.set(alias, id); },
    async updateAlias(alias: string, id: string) { aliases.set(alias, id); },
    async setDefaultMenu(id: string) { defaultMenu = id; },
    async getDefaultMenu() { return defaultMenu; },
  };
}

describe("LINE Rich Menu provisioning", () => {
  beforeEach(() => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", "dedicated-demi-line-messaging-secret");
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "dedicated-demi-line-access-token");
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", `U${"a".repeat(32)}`);
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "1234567890-AbCdEfGh");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("validates all 18 actual PNG assets against current LINE dimensions and size requirements", async () => {
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const asset = new Uint8Array(await readFile(join(assetDirectory, menu.assetFile)));
      expect(Buffer.from(asset.slice(0, 8))).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(Buffer.from(asset).readUInt32BE(16)).toBe(2500);
      expect(Buffer.from(asset).readUInt32BE(20)).toBe(1686);
      expect(asset.byteLength).toBeLessThan(1024 * 1024);
    }
  });

  it("supports a read-only remote plan without creating provider state", async () => {
    const provider = createFakeProvider();
    const result = await reconcileLineRichMenuCatalog({ client: provider, assetDirectory, apply: false });
    expect(result).toMatchObject({ expectedMenus: 18, createdMenus: 18, createdAliases: 18, defaultMenuUpdated: true });
    expect(provider.menus.size).toBe(0);
    expect(provider.aliases.size).toBe(0);
    expect(provider.defaultMenu).toBeNull();
  });

  it("replaces only the four Patient menu definitions that sent the legacy appointment text", async () => {
    const provider = createFakeProvider();
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const image = await readFile(join(assetDirectory, menu.assetFile));
      const payload = createLineRichMenuPayload(menu);
      payload.areas = payload.areas.map((area) => area.action.type === "message"
        ? { ...area, action: { ...area.action, text: "นัด" } }
        : area);
      payload.name = lineMenuProvisioningInternals.providerManifestName(menu.key, payload, image);
      const id = await provider.createRichMenu(payload);
      await provider.uploadRichMenuImage(id, image);
      await provider.createAlias(menu.alias, id);
      if (menu.key === "UNLINKED") await provider.setDefaultMenu(id);
    }
    const previousAliases = new Map(provider.aliases);
    const dependencies = { client: provider, assetDirectory };

    expect(await reconcileLineRichMenuCatalog(dependencies)).toEqual({
      expectedMenus: 18,
      createdMenus: 4,
      reusedMenus: 14,
      uploadedImages: 0,
      createdAliases: 0,
      updatedAliases: 4,
      defaultMenuUpdated: false,
    });
    expect(provider.aliases).toEqual(previousAliases);

    expect(await reconcileLineRichMenuCatalog({ ...dependencies, apply: true })).toMatchObject({
      createdMenus: 4,
      uploadedImages: 4,
      updatedAliases: 4,
    });
    expect(LINE_RICH_MENU_CATALOG
      .filter(({ alias }) => provider.aliases.get(alias) !== previousAliases.get(alias))
      .map(({ key }) => key)).toEqual([
      "PATIENT_DIRECT",
      "PATIENT_PATIENT_OSM",
      "PATIENT_PATIENT_HOSPITAL",
      "PATIENT_PATIENT_OSM_HOSPITAL",
    ]);
    expect(await reconcileLineRichMenuCatalog(dependencies)).toEqual({
      expectedMenus: 18,
      createdMenus: 0,
      reusedMenus: 18,
      uploadedImages: 0,
      createdAliases: 0,
      updatedAliases: 0,
      defaultMenuUpdated: false,
    });
  });

  it("creates the shared catalog once, uploads/read-backs images, and is idempotent", async () => {
    const provider = createFakeProvider();
    const first = await reconcileLineRichMenuCatalog({ client: provider, assetDirectory, apply: true });
    expect(first).toMatchObject({
      expectedMenus: 18,
      createdMenus: 18,
      reusedMenus: 0,
      uploadedImages: 18,
      createdAliases: 18,
      updatedAliases: 0,
      defaultMenuUpdated: true,
    });
    expect(provider.defaultMenu).toBe(provider.aliases.get("d17j1_u"));

    const second = await reconcileLineRichMenuCatalog({ client: provider, assetDirectory, apply: true });
    expect(second).toMatchObject({
      expectedMenus: 18,
      createdMenus: 0,
      reusedMenus: 18,
      uploadedImages: 0,
      createdAliases: 0,
      updatedAliases: 0,
      defaultMenuUpdated: false,
    });
    expect(provider.menus.size).toBe(18);
    expect(provider.aliases.size).toBe(18);
    for (const menu of LINE_RICH_MENU_CATALOG) {
      const id = provider.aliases.get(menu.alias);
      if (!id) throw new Error("expected catalog alias to be provisioned");
      const image = provider.images.get(id);
      if (!image) throw new Error("expected shared Rich Menu image to be uploaded");
      expect(createHash("sha256").update(image).digest("hex")).toHaveLength(64);
    }
  });
});
