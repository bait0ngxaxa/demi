import "server-only";

import { z } from "zod";

import { getLineMessagingEnv } from "@/lib/env/server";

import { LineFailure } from "../domain/line-errors";
import type { LineMenuDefinition } from "../rich-menu/catalog";
import { getLineMenuDefinition, LINE_WORKSPACE_SWITCH_MARKER } from "../rich-menu/catalog";
import { getLineMenuAreaBounds } from "../rich-menu/layout";
import { buildLineIntentUrl } from "../services/line-deep-link-builder";

const richMenuSchema = z.object({ richMenuId: z.string() }).passthrough();
const richMenuListSchema = z.object({ richmenus: z.array(z.object({ richMenuId: z.string(), name: z.string().optional() }).passthrough()) }).passthrough();
const aliasListSchema = z.object({ aliases: z.array(z.object({ richMenuAliasId: z.string(), richMenuId: z.string() }).passthrough()) }).passthrough();
const aliasSchema = z.object({ richMenuAliasId: z.string(), richMenuId: z.string() }).passthrough();
const currentMenuSchema = z.object({ richMenuId: z.string() }).passthrough();
const richMenuInfoSchema = z.object({ richMenuId: z.string(), name: z.string(), size: z.object({ width: z.number(), height: z.number() }), areas: z.array(z.unknown()) }).passthrough();

export type LineRichMenuAction =
  | { type: "uri"; label: string; uri: string }
  | { type: "richmenuswitch"; label: string; richMenuAliasId: string; data: string }
  | { type: "postback"; label: string; data: string };

export type LinePushResult =
  | { kind: "ACCEPTED" }
  | { kind: "DUPLICATE_ACCEPTED" }
  | { kind: "RETRYABLE_HTTP_FAILURE" }
  | { kind: "AMBIGUOUS_TRANSPORT_FAILURE" }
  | { kind: "PERMANENT_FAILURE" };

export type LineRichMenuArea = {
  bounds: { x: number; y: number; width: number; height: number };
  action: LineRichMenuAction;
};

export type LineRichMenuPayload = {
  size: { width: 2500; height: 1686 };
  selected: boolean;
  name: string;
  chatBarText: string;
  areas: LineRichMenuArea[];
};

export function createLineRichMenuPayload(
  menu: LineMenuDefinition,
  menuName = `DEMI ${menu.key}`,
): LineRichMenuPayload {
  const boxes = getLineMenuAreaBounds(menu);
  const roleSet = menu.key.startsWith("CHOOSER_")
    ? menu.key.slice("CHOOSER_".length).split("_")
    : menu.key.split("_").slice(1);
  const areas = menu.actions.map((action, index): LineRichMenuArea => {
    let providerAction: LineRichMenuAction;
    if (action.type === "uri") {
      providerAction = { type: "uri", label: action.label, uri: buildLineIntentUrl(action.intent) };
    } else if (action.type === "postback") {
      providerAction = { type: "postback", label: action.label, data: action.data };
    } else {
      const targetKey = roleSet.length === 1 ? `${action.role}_DIRECT` : `${action.role}_${roleSet.join("_")}`;
      const targetMenu = getLineMenuDefinition(targetKey);
      providerAction = { type: "richmenuswitch", label: action.label, richMenuAliasId: targetMenu.alias, data: LINE_WORKSPACE_SWITCH_MARKER };
    }
    return { bounds: boxes[index], action: providerAction };
  });
  return { size: { width: 2500, height: 1686 }, selected: false, name: menuName, chatBarText: "เมนู DEMI", areas };
}

export class LineMessagingClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request(path: string, init: RequestInit = {}, host = "https://api.line.me"): Promise<Response> {
    const { DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN } = getLineMessagingEnv();
    try {
      const response = await this.fetcher(`${host}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!response.ok && response.status !== 404) {
        throw new LineFailure(response.status >= 500 || response.status === 429 ? "LINE_PROVIDER_TRANSIENT" : "LINE_PROVIDER_PERMANENT");
      }
      return response;
    } catch (error: unknown) {
      if (error instanceof LineFailure) throw error;
      throw new LineFailure("LINE_PROVIDER_TRANSIENT");
    }
  }

  async replyText(replyToken: string, text: string): Promise<void> {
    const response = await this.request("/v2/bot/message/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    });
    if (!response.ok) {
      throw new LineFailure(
        response.status === 429 || response.status >= 500
          ? "LINE_PROVIDER_TRANSIENT"
          : "LINE_PROVIDER_PERMANENT",
      );
    }
  }

  async pushText(lineUserId: string, text: string, retryKey: string): Promise<LinePushResult> {
    if (!/^U[0-9a-f]{32}$/iu.test(lineUserId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(retryKey)) {
      return { kind: "PERMANENT_FAILURE" };
    }

    let accessToken: string;
    try {
      accessToken = getLineMessagingEnv().DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
    } catch {
      return { kind: "PERMANENT_FAILURE" };
    }

    try {
      const response = await this.fetcher("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-line-retry-key": retryKey,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: "text", text }],
        }),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });

      if (response.status === 409) return { kind: "DUPLICATE_ACCEPTED" };
      if (response.ok) return { kind: "ACCEPTED" };
      if (response.status >= 500) return { kind: "RETRYABLE_HTTP_FAILURE" };
      return { kind: "PERMANENT_FAILURE" };
    } catch {
      return { kind: "AMBIGUOUS_TRANSPORT_FAILURE" };
    }
  }

  async listRichMenus(): Promise<readonly { richMenuId: string; name: string | null }[]> {
    const response = await this.request("/v2/bot/richmenu/list");
    const parsed = richMenuListSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data.richmenus.map(({ richMenuId, name }) => ({ richMenuId, name: name ?? null }));
  }

  async getRichMenu(richMenuId: string): Promise<z.infer<typeof richMenuInfoSchema>> {
    const response = await this.request(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`);
    const parsed = richMenuInfoSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data;
  }

  async validateRichMenu(payload: LineRichMenuPayload): Promise<void> {
    const response = await this.request("/v2/bot/richmenu/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }

  async createRichMenu(payload: LineRichMenuPayload): Promise<string> {
    const response = await this.request("/v2/bot/richmenu", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const parsed = richMenuSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data.richMenuId;
  }

  async uploadRichMenuImage(richMenuId: string, image: Uint8Array, contentType = "image/png"): Promise<void> {
    const response = await this.request(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, { method: "POST", headers: { "content-type": contentType }, body: Buffer.from(image) }, "https://api-data.line.me");
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }

  async getRichMenuImage(richMenuId: string): Promise<Uint8Array | null> {
    const response = await this.request(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`, {}, "https://api-data.line.me");
    if (response.status === 404) return null;
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return new Uint8Array(await response.arrayBuffer());
  }

  async listAliases(): Promise<readonly { richMenuAliasId: string; richMenuId: string }[]> {
    const response = await this.request("/v2/bot/richmenu/alias/list");
    const parsed = aliasListSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data.aliases;
  }

  async createAlias(aliasId: string, richMenuId: string): Promise<void> {
    const response = await this.request("/v2/bot/richmenu/alias", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuAliasId: aliasId, richMenuId }) });
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }

  async updateAlias(aliasId: string, richMenuId: string): Promise<void> {
    const response = await this.request(`/v2/bot/richmenu/alias/${encodeURIComponent(aliasId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuId }) });
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }

  async getAlias(aliasId: string): Promise<string | null> {
    const response = await this.request(`/v2/bot/richmenu/alias/${encodeURIComponent(aliasId)}`);
    if (response.status === 404) return null;
    const parsed = aliasSchema.safeParse(await response.json());
    if (!parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data.richMenuId;
  }

  async setDefaultMenu(richMenuId: string): Promise<void> {
    const response = await this.request(`/v2/bot/user/all/richmenu/${encodeURIComponent(richMenuId)}`, { method: "POST" });
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }

  async getDefaultMenu(): Promise<string | null> {
    const response = await this.request("/v2/bot/user/all/richmenu");
    if (response.status === 404) return null;
    const parsed = currentMenuSchema.safeParse(await response.json());
    if (!parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data.richMenuId;
  }

  async linkUserMenu(lineUserId: string, richMenuId: string): Promise<void> {
    const response = await this.request(`/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`, { method: "POST" });
    if (!response.ok) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }

  async getUserMenu(lineUserId: string): Promise<string | null> {
    const response = await this.request(`/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`);
    if (response.status === 404) return null;
    const parsed = currentMenuSchema.safeParse(await response.json());
    if (!parsed.success) throw new LineFailure("LINE_PROVIDER_PERMANENT");
    return parsed.data.richMenuId;
  }

  async unlinkUserMenu(lineUserId: string): Promise<void> {
    const response = await this.request(`/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new LineFailure("LINE_PROVIDER_PERMANENT");
  }
}

export type { LineMenuDefinition };
