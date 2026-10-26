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
    expect(payload.selected).toBe(true);
  });

  it.each(["PATIENT_DIRECT", "PATIENT_PATIENT_OSM", "PATIENT_PATIENT_HOSPITAL", "PATIENT_PATIENT_OSM_HOSPITAL"])(
    "projects the Patient appointment action in %s as a native message action that sends exactly นัด",
    (key) => {
      const patientMenu = LINE_RICH_MENU_BY_KEY.get(key);
      if (!patientMenu) throw new Error("Expected the Patient presentation menu");

      const payload = createLineRichMenuPayload(patientMenu);
      const actions = payload.areas.map(({ action }) => action);

      expect(actions[0]).toStrictEqual({ type: "message", label: "ตรวจสอบนัดหมาย", text: "นัด" });
      expect(actions.filter((action) => action.type === "message")).toHaveLength(1);
      expect(JSON.stringify(payload)).not.toMatch(/"postback"|DEMI_LINE_PATIENT_NEXT_APPOINTMENT_V1|displayText/u);
    },
  );

  it("projects Patient quick links as fixed ordinary-web URIs and keeps account management on LIFF", () => {
    const patientMenu = LINE_RICH_MENU_BY_KEY.get("PATIENT_PATIENT_OSM_HOSPITAL");
    if (!patientMenu) throw new Error("Expected the Patient multi-role menu");

    const actions = createLineRichMenuPayload(patientMenu).areas.map(({ action }) => action);

    expect(actions).toEqual([
      { type: "message", label: "ตรวจสอบนัดหมาย", text: "นัด" },
      { type: "uri", label: "นัดหมายทั้งหมด", uri: "https://demi.example.org/app/personal/appointments" },
      { type: "uri", label: "บันทึกสุขภาพ", uri: "https://demi.example.org/app/personal/wellness" },
      { type: "uri", label: "ยาของฉัน", uri: "https://demi.example.org/app/personal/medications" },
      { type: "uri", label: "ข้อมูลการดูแล", uri: "https://demi.example.org/app/personal/care" },
      { type: "uri", label: "เพิ่มเติม", uri: "https://demi.example.org/app/personal" },
      { type: "richmenuswitch", label: "งาน อสม.", richMenuAliasId: "d17j1_o_poh", data: LINE_WORKSPACE_SWITCH_MARKER },
      { type: "richmenuswitch", label: "งานโรงพยาบาล", richMenuAliasId: "d17j1_h_poh", data: LINE_WORKSPACE_SWITCH_MARKER },
      { type: "uri", label: "จัดการบัญชี", uri: "https://liff.line.me/1234567890-AbCdEfGh" },
    ]);
  });

  // ADR-0019: every OSM menu has four primary care actions and no patient import entry.
  it("projects OSM work entry as safe directories without an OWNER-only import action", () => {
    const osmMenu = LINE_RICH_MENU_BY_KEY.get("OSM_PATIENT_OSM_HOSPITAL");
    if (!osmMenu) throw new Error("Expected the OSM multi-role menu");

    const actions = createLineRichMenuPayload(osmMenu).areas.map(({ action }) => action);

    expect(actions).toEqual([
      { type: "uri", label: "ผู้ป่วยที่ดูแล", uri: "https://demi.example.org/app/patients/assigned" },
      { type: "uri", label: "คัดกรองผู้ป่วย", uri: "https://demi.example.org/app/patients/assigned?task=screening" },
      { type: "uri", label: "บันทึกติดตาม", uri: "https://demi.example.org/app/patients/assigned?task=followup" },
      { type: "uri", label: "งานทั้งหมด", uri: "https://demi.example.org/app" },
      { type: "richmenuswitch", label: "ข้อมูลของฉัน", richMenuAliasId: "d17j1_p_poh", data: LINE_WORKSPACE_SWITCH_MARKER },
      { type: "richmenuswitch", label: "งานโรงพยาบาล", richMenuAliasId: "d17j1_h_poh", data: LINE_WORKSPACE_SWITCH_MARKER },
      { type: "uri", label: "จัดการบัญชี", uri: "https://liff.line.me/1234567890-AbCdEfGh" },
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

  it("sends a text Reply with quick-reply actions exactly as given, on the bounded Reply request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new LineMessagingClient(fetcher);
    const messages = [{
      type: "text" as const,
      text: "เลือกเมนูที่ต้องการด้านล่าง",
      quickReply: {
        items: [
          { type: "action" as const, action: { type: "uri" as const, label: "ยาของฉัน", uri: "https://demi.example.org/app/personal/medications" } },
          { type: "action" as const, action: { type: "message" as const, label: "ตรวจสอบนัดหมาย", text: "นัด" } },
        ],
      },
    }];

    await client.replyMessages("transient-reply-token", messages);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.line.me/v2/bot/message/reply");
    const request = fetcher.mock.calls[0]?.[1];
    expect(request).toMatchObject({ method: "POST", cache: "no-store" });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(request?.headers);
    expect(headers.get("authorization")).toBe("Bearer dedicated-demi-line-access-token");
    expect(headers.get("x-line-retry-key")).toBeNull();
    expect(JSON.parse(String(request?.body)) as unknown).toEqual({ replyToken: "transient-reply-token", messages });
  });

  it.each([
    [400, "LINE_PROVIDER_PERMANENT"],
    [404, "LINE_PROVIDER_PERMANENT"],
    [429, "LINE_PROVIDER_TRANSIENT"],
    [500, "LINE_PROVIDER_TRANSIENT"],
  ] as const)("normalizes quick-reply HTTP %i as %s like a text Reply", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider response", { status }));
    const client = new LineMessagingClient(fetcher);

    await expect(client.replyMessages("transient-reply-token", [{ type: "text", text: "text" }]))
      .rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("normalizes quick-reply network failures as transient without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private network failure"));
    const client = new LineMessagingClient(fetcher);

    await expect(client.replyMessages("transient-reply-token", [{ type: "text", text: "text" }]))
      .rejects.toMatchObject({ code: "LINE_PROVIDER_TRANSIENT" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    [200, "ACCEPTED"],
    [409, "DUPLICATE_ACCEPTED"],
    [400, "PERMANENT_FAILURE"],
    [429, "RETRYABLE_HTTP_FAILURE"],
    [500, "RETRYABLE_HTTP_FAILURE"],
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

  it("uses only the access token required for Push", async () => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_SECRET", undefined);
    vi.stubEnv("DEMI_LINE_MESSAGING_BOT_USER_ID", undefined);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    const client = new LineMessagingClient(fetcher);

    await expect(client.pushText(`U${"a".repeat(32)}`, "recovery message", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
      .resolves.toEqual({ kind: "ACCEPTED" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails Push safely when the access token is missing or malformed", async () => {
    vi.stubEnv("DEMI_LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", " ");
    const fetcher = vi.fn<typeof fetch>();
    const client = new LineMessagingClient(fetcher);

    await expect(client.pushText(`U${"a".repeat(32)}`, "recovery message", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
      .resolves.toEqual({ kind: "PERMANENT_FAILURE" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the monthly-limit 429 retryable because its documented response can be temporary", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "You have reached your monthly limit." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new LineMessagingClient(fetcher);

    await expect(client.pushText(`U${"c".repeat(32)}`, "approved generic copy", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"))
      .resolves.toEqual({ kind: "RETRYABLE_HTTP_FAILURE" });
    expect(fetcher).toHaveBeenCalledOnce();
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
