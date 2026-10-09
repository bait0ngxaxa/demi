import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINE_PATIENT_NEXT_APPOINTMENT_MARKER } from "../domain/line-reactive-marker";
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

  it("projects the Patient appointment action as an exact Rich Menu postback", () => {
    const patientMenu = LINE_RICH_MENU_BY_KEY.get("PATIENT_PATIENT_OSM_HOSPITAL");
    if (!patientMenu) throw new Error("Expected the Patient presentation menu");

    const postbacks = createLineRichMenuPayload(patientMenu).areas
      .map(({ action }) => action)
      .filter((action) => action.type === "postback");

    expect(postbacks).toEqual([
      {
        type: "postback",
        label: "ตรวจสอบนัดหมาย",
        data: LINE_PATIENT_NEXT_APPOINTMENT_MARKER,
      },
    ]);
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

  it("sends exactly one authenticated text Reply request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new LineMessagingClient(fetcher);

    await client.replyText("transient-reply-token", "นัดหมายถัดไปของคุณ");

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.line.me/v2/bot/message/reply");
    const request = fetcher.mock.calls[0]?.[1];
    expect(request).toMatchObject({ method: "POST", cache: "no-store" });
    const headers = new Headers(request?.headers);
    expect(headers.get("authorization")).toBe("Bearer dedicated-demi-line-access-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-line-retry-key")).toBeNull();
    expect(JSON.parse(String(request?.body)) as unknown).toEqual({
      replyToken: "transient-reply-token",
      messages: [{ type: "text", text: "นัดหมายถัดไปของคุณ" }],
    });
  });

  it.each([
    [400, "LINE_PROVIDER_PERMANENT"],
    [404, "LINE_PROVIDER_PERMANENT"],
    [429, "LINE_PROVIDER_TRANSIENT"],
    [500, "LINE_PROVIDER_TRANSIENT"],
  ] as const)("normalizes Reply HTTP %i as %s without parsing the response body", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("private provider response", { status }),
    );
    const client = new LineMessagingClient(fetcher);

    await expect(client.replyText("transient-reply-token", "text")).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("normalizes network and timeout failures as transient without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private network failure"));
    const client = new LineMessagingClient(fetcher);

    await expect(client.replyText("transient-reply-token", "text")).rejects.toMatchObject({
      code: "LINE_PROVIDER_TRANSIENT",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [200, "ACCEPTED"],
    [409, "DUPLICATE_ACCEPTED"],
    [400, "PERMANENT_FAILURE"],
    [429, "PERMANENT_FAILURE"],
    [503, "RETRYABLE_HTTP_FAILURE"],
  ] as const)("classifies Push HTTP %i as %s", async (status, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider detail", { status }));
    const client = new LineMessagingClient(fetcher);
    const text = "มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ";
    const retryKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    await expect(client.pushText(`U${"a".repeat(32)}`, text, retryKey)).resolves.toEqual({ kind: expected });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.line.me/v2/bot/message/push");
    const request = fetcher.mock.calls[0]?.[1];
    const headers = new Headers(request?.headers);
    expect(headers.get("x-line-retry-key")).toBe(retryKey);
    expect(headers.get("authorization")).toBe("Bearer dedicated-demi-line-access-token");
    expect(JSON.parse(String(request?.body)) as unknown).toEqual({
      to: `U${"a".repeat(32)}`,
      messages: [{ type: "text", text }],
    });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("classifies a Push transport timeout as ambiguous and does not retry inside the adapter", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const client = new LineMessagingClient(fetcher);

    await expect(client.pushText(`U${"b".repeat(32)}`, "approved generic copy", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"))
      .resolves.toEqual({ kind: "AMBIGUOUS_TRANSPORT_FAILURE" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not make a Push request when the recipient or retry key is malformed", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new LineMessagingClient(fetcher);

    await expect(client.pushText("not-a-line-user", "text", "not-a-uuid"))
      .resolves.toEqual({ kind: "PERMANENT_FAILURE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
