import { beforeEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { POST } from "./route";

const { mockedActor, mockedIssueSlips } = vi.hoisted(() => ({
  mockedActor: vi.fn(),
  mockedIssueSlips: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("@/modules/workforce/services/workforce-service", () => ({
  issueWorkforceActivationSlips: mockedIssueSlips,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const userA = "33333333-3333-4333-8333-333333333333";
const userB = "44444444-4444-4444-8444-444444444444";
const secretToken = "slip-secret-token-value";

function slipRequest(
  entries: [string, string][] = [
    ["targetHospitalId", hospitalId],
    ["kind", "OSM"],
    ["userId", userA],
    ["userId", userB],
  ],
  headers: Record<string, string> = { origin: "https://demi.example" },
): Request {
  const body = new URLSearchParams(entries);

  return new Request("https://demi.example/app/workforce/slips", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
}

describe("activation slips route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example");
    mockedActor.mockResolvedValue({ userId: "owner-1" });
    mockedIssueSlips.mockResolvedValue({
      kind: "OSM",
      slips: [
        {
          userId: userA,
          maskedName: "สม*** <ใจ***>",
          hospitalName: "โรงพยาบาล <ทดสอบ>",
          activationToken: secretToken,
          activationExpiresAt: new Date("2026-10-17T00:00:00.000Z"),
        },
      ],
      failures: [{ userId: userB, reason: "NOT_PENDING" }],
    });
  });

  it("returns a no-store, non-indexable printable page with escaped content and a QR", async () => {
    const response = await POST(slipRequest());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(mockedIssueSlips).toHaveBeenCalledWith(
      { userId: "owner-1" },
      { targetHospitalId: hospitalId, kind: "OSM", userIds: [userA, userB] },
    );
    expect(html).toContain("สม*** &lt;ใจ***&gt;");
    expect(html).toContain("โรงพยาบาล &lt;ทดสอบ&gt;");
    expect(html).toContain("สแกน QR → กรอกเลขบัตรประชาชน → ตั้งรหัสผ่าน");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("ไม่สามารถออกใบเปิดใช้งานได้ 1 รายการ");
    // The plaintext token only lives inside the QR image; it is never printed as text.
    expect(html).not.toContain(secretToken);
  });

  it("rejects cross-site and origin-less requests before any service call", async () => {
    const crossSite = await POST(slipRequest(undefined, { "sec-fetch-site": "cross-site" }));
    const wrongOrigin = await POST(slipRequest(undefined, { origin: "https://evil.example" }));
    const noOrigin = await POST(slipRequest(undefined, {}));

    for (const response of [crossSite, wrongOrigin, noOrigin]) {
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mockedIssueSlips).not.toHaveBeenCalled();
  });

  it("requires canonical Origin even with Sec-Fetch-Site", async () => {
    const response = await POST(slipRequest(undefined, { "sec-fetch-site": "same-origin" }));

    expect(response.status).toBe(403);
  });

  it("uses the configured QR destination behind proxies and ignores request/forwarded hosts", async () => {
    const qr = vi.spyOn(QRCode, "toDataURL");
    const original = slipRequest();
    const response = await POST(new Request("https://hostile.example/app/workforce/slips", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded",
        origin: "https://demi.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
      body: await original.text(),
    }));
    expect(response.status).toBe(200);
    expect(qr).toHaveBeenCalledWith(`https://demi.example/activate/workforce#${secretToken}`, expect.any(Object));
    qr.mockRestore();
    const rejected = await POST(slipRequest(undefined, { origin: "https://evil.example", "sec-fetch-site": "same-origin" }));
    expect(rejected.status).toBe(403);
  });

  it.each(["", "https://demi.example/path", "http://public.example", "https://user:secret@demi.example"])(
    "does not issue credentials with invalid public origin %s", async (origin) => {
      vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", origin);
      expect((await POST(slipRequest())).status).toBe(503);
      expect(mockedIssueSlips).not.toHaveBeenCalled();
    },
  );

  it("bounds the real request body even when Content-Length is absent or false", async () => {
    const request = slipRequest([["padding", "x".repeat(33 * 1024)]], { origin: "https://demi.example", "content-length": "1" });
    expect((await POST(request)).status).toBe(400);
    expect(mockedIssueSlips).not.toHaveBeenCalled();
  });

  it.each([
    ["no selection", [["targetHospitalId", hospitalId], ["kind", "OSM"]] as [string, string][]],
    ["a non-UUID selection", [["targetHospitalId", hospitalId], ["kind", "OSM"], ["userId", "x"]] as [string, string][]],
    ["an unknown kind", [["targetHospitalId", hospitalId], ["kind", "ADMIN"], ["userId", userA]] as [string, string][]],
    [
      "more than 50 people",
      [
        ["targetHospitalId", hospitalId],
        ["kind", "OSM"],
        ...Array.from({ length: 51 }, (_, index): [string, string] => [
          "userId",
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ]),
      ] as [string, string][],
    ],
    [
      "duplicate people",
      [["targetHospitalId", hospitalId], ["kind", "OSM"], ["userId", userA], ["userId", userA]] as [string, string][],
    ],
  ])("rejects %s with no-store and no issuance", async (_label, entries) => {
    const response = await POST(slipRequest(entries));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockedIssueSlips).not.toHaveBeenCalled();
  });

  it("maps authentication, authorization and infrastructure failures without leaking details", async () => {
    mockedIssueSlips.mockRejectedValueOnce(new ForbiddenError());
    const forbidden = await POST(slipRequest());
    mockedActor.mockRejectedValueOnce(new UnauthenticatedError());
    const unauthenticated = await POST(slipRequest());
    mockedIssueSlips.mockRejectedValueOnce(new Error(`database said ${secretToken}`));
    const broken = await POST(slipRequest());

    expect(forbidden.status).toBe(403);
    expect(unauthenticated.status).toBe(401);
    expect(broken.status).toBe(503);
    for (const response of [forbidden, unauthenticated, broken]) {
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain(secretToken);
    }
  });
});
