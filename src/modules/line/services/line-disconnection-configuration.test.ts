import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $queryRaw: mocks.query }) }));
import { getLineChannelInventory, requireLineDisconnectionReadiness } from "./line-disconnection-configuration";

const account = { kind: "ACCOUNT", channelId: "1234567890", environment: "ACCOUNT" };
const mini = { kind: "MINI", channelId: "2234567890", environment: "REVIEW" };
function setMini(): void {
  vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_ID", mini.channelId);
  vi.stubEnv("DEMI_LINE_MINI_APP_LIFF_ID", "2234567890-mini");
  vi.stubEnv("DEMI_LINE_MINI_APP_ENVIRONMENT", mini.environment);
}

describe("server-derived channel inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", account.channelId);
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-secret-at-least-32-characters");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "4567891230-test");
    for (const name of ["DEMI_LINE_MINI_APP_CHANNEL_ID", "DEMI_LINE_MINI_APP_LIFF_ID", "DEMI_LINE_MINI_APP_ENVIRONMENT",
      "DEMI_LINE_MINI_APP_CHANNEL_SECRET", "DEMI_LINE_MINI_APP_CONTEXT_KEYRING", "DEMI_LINE_MINI_APP_DISABLED"]) vi.stubEnv(name, undefined);
    mocks.query.mockResolvedValue([{ ready: true }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is Account-only when MINI is not provisioned, without any manifest or activation flag", async () => {
    vi.stubEnv("DEMI_LINE_DISCONNECTION_ENABLED", undefined);
    vi.stubEnv("DEMI_LINE_DISCONNECTION_MANIFEST", undefined);
    expect(await requireLineDisconnectionReadiness()).toEqual({ channels: [account] });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("adds exactly the selected MINI channel and environment", () => {
    setMini();
    expect(getLineChannelInventory()).toEqual({ channels: [account, mini] });
  });

  it("keeps the MINI channel while the kill switch is active: disabling never proves a grant absent", () => {
    setMini();
    vi.stubEnv("DEMI_LINE_MINI_APP_DISABLED", "true");
    expect(getLineChannelInventory()).toEqual({ channels: [account, mini] });
  });

  it.each([
    ["missing Account channel", () => vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", undefined)],
    ["partial MINI configuration", () => vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_ID", mini.channelId)],
    ["MINI reusing the Account audience", () => { setMini(); vi.stubEnv("DEMI_LINE_MINI_APP_CHANNEL_ID", account.channelId); }],
    ["invalid MINI environment", () => { setMini(); vi.stubEnv("DEMI_LINE_MINI_APP_ENVIRONMENT", "PRODUCTION"); }],
  ])("fails closed rather than degrading to Account-only: %s", (_label, arrange) => {
    arrange();
    expect(() => getLineChannelInventory()).toThrow(expect.objectContaining({ code: "LINE_CONFIGURATION_MISSING" }));
  });

  it("does not silently fallback if the migration is unavailable", async () => {
    mocks.query.mockResolvedValue([{ ready: false }]);
    await expect(requireLineDisconnectionReadiness()).rejects.toMatchObject({ code: "LINE_CONFIGURATION_MISSING" });
  });

  it("credential rotation/outage does not disable local unlink or Recovery", () => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", "");
    setMini();
    expect(getLineChannelInventory()).toEqual({ channels: [account, mini] });
  });
});
