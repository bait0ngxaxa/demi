import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_RICH_MENU_BY_KEY, LINE_WORKSPACE_SWITCH_MARKER } from "../rich-menu/catalog";
import { createLineRichMenuPayload, LineMessagingClient } from "./line-messaging-client";

describe("DEMI LINE Messaging API boundary", () => {
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

  it("builds stable switch aliases and the static Option C marker", () => {
    const chooser = LINE_RICH_MENU_BY_KEY.get("CHOOSER_PATIENT_OSM");
    if (!chooser) throw new Error("Expected the two-role chooser");
    const payload = createLineRichMenuPayload(chooser);
    const switches = payload.areas.map(({ action }) => action).filter((action) => action.type === "richmenuswitch");
    expect(switches).toEqual([
      { type: "richmenuswitch", label: "ข้อมูลของฉัน", richMenuAliasId: "d17j1_p_po", data: LINE_WORKSPACE_SWITCH_MARKER },
      { type: "richmenuswitch", label: "งาน อสม.", richMenuAliasId: "d17j1_o_po", data: LINE_WORKSPACE_SWITCH_MARKER },
    ]);
    expect(payload.size).toEqual({ width: 2500, height: 1686 });
  });

  it("uses the authenticated Messaging API and requires GET read-back after unlink", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = new LineMessagingClient(fetcher);
    const userId = `U${"c".repeat(32)}`;
    await client.unlinkUserMenu(userId);
    await expect(client.getUserMenu(userId)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`https://api.line.me/v2/bot/user/${userId}/richmenu`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE", cache: "no-store" });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer dedicated-demi-line-access-token");
    expect(fetcher.mock.calls[1]?.[0]).toBe(`https://api.line.me/v2/bot/user/${userId}/richmenu`);
  });
});
