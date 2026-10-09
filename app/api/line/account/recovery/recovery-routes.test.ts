import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ ready: vi.fn(), prepare: vi.fn(), recover: vi.fn(), summary: vi.fn() }));
vi.mock("@/modules/line/services/line-disconnection-configuration", () => ({ requireLineDisconnectionReadiness: h.ready }));
vi.mock("@/modules/line/services/line-disconnection-service", () => ({ prepareLineAccountRecovery: h.prepare, recoverLineAccount: h.recover, getLineDisconnectionStatus: h.summary }));
import { POST as prepare } from "./prepare/route";
import { POST as recover } from "./route";
import { POST as status } from "../disconnection/route";

function request(body: unknown, origin = "https://demi.example.org"): Request { return new Request("https://demi.example.org/api/line/account/recovery", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }); }
const input = () => ({ intentId: randomUUID(), challenge: "c".repeat(43), idToken: "transient-id-token-value-for-test", riskAcknowledged: true, manualReviews: { [randomUUID()]: "NOT_LISTED" } });
describe("Recovery sensitive HTTP boundary", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890"); vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org"); vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-test-secret-at-least-32-characters");
    h.ready.mockResolvedValue({ inventory: {} }); h.prepare.mockResolvedValue({ intentId: randomUUID(), challenge: "c".repeat(43), reviews: [] });
    h.recover.mockResolvedValue({ status: "RECOVERY_RELEASED_UNVERIFIED" }); h.summary.mockResolvedValue({ state: "RECOVERY_REQUIRED", canRelink: false, obligations: [] });
  });
  it.each([prepare, recover, status])("requires exact Origin before reading/authorizing sensitive proof", async (handler) => {
    expect((await handler(request(input(), "https://evil.example.org"))).status).toBe(403);
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.recover).not.toHaveBeenCalled(); expect(h.summary).not.toHaveBeenCalled();
  });
  it("never accepts caller-selected binding/channel/provider outcome/authorization flags", async () => {
    for (const extra of [{ targetBindingId: randomUUID() }, { channelId: "2222222222" }, { providerResult: "PROVIDER_204" }, { verified: true }]) {
      expect((await recover(request({ ...input(), ...extra }))).status).toBe(400);
    }
    expect(h.recover).not.toHaveBeenCalled();
    expect((await prepare(request({ bindingId: randomUUID() }))).status).toBe(400);
  });
  it("requires manual review and explicit risk acknowledgement", async () => {
    expect((await recover(request({ ...input(), riskAcknowledged: false }))).status).toBe(400);
    expect((await recover(request({ ...input(), manualReviews: {} }))).status).toBe(400);
    expect(h.recover).not.toHaveBeenCalled();
  });
  it("enforces streamed request/body/token limits and safe error caching", async () => {
    const response = await recover(request({ ...input(), idToken: "x".repeat(40000) }));
    expect(response.status).toBe(400); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(h.recover).not.toHaveBeenCalled();
  });
  it("returns only unverified release, with no credentials or internal identity in response", async () => {
    const response = await recover(request(input())); expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(await response.json()).toEqual({ status: "RECOVERY_RELEASED_UNVERIFIED" });
  });
  it("staged readiness has no Recovery side effects", async () => {
    h.ready.mockResolvedValue(null); const response = await recover(request(input())); expect(response.status).toBe(503); expect(h.recover).not.toHaveBeenCalled();
  });
  it("sanitizes unexpected provider/SQL details without returning submitted proof", async () => {
    h.recover.mockRejectedValue(new Error("JWT, subject, SQL detail must stay private")); const response = await recover(request(input()));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toMatch(/JWT|subject|SQL|transient-id/u);
  });
});
