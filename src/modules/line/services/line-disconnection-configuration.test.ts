import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $queryRaw: mocks.query }) }));
import { getLineChannelInventory, requireLineDisconnectionReadiness } from "./line-disconnection-configuration";

const account = { kind: "ACCOUNT", channelId: "1234567890", environment: "ACCOUNT" };

describe("server-derived channel inventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", account.channelId);
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-secret-at-least-32-characters");
    vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "4567891230-test");
    mocks.query.mockResolvedValue([{ ready: true }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is exactly the Account channel, without any manifest or activation flag", async () => {
    vi.stubEnv("DEMI_LINE_DISCONNECTION_ENABLED", undefined);
    vi.stubEnv("DEMI_LINE_DISCONNECTION_MANIFEST", undefined);
    expect(await requireLineDisconnectionReadiness()).toEqual({ channels: [account] });
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing Account channel", () => vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", undefined)],
    ["invalid Account channel", () => vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "not-a-channel")],
  ])("fails closed: %s", (_label, arrange) => {
    arrange();
    expect(() => getLineChannelInventory()).toThrow(expect.objectContaining({ code: "LINE_CONFIGURATION_MISSING" }));
  });

  it("does not silently fallback if the migration is unavailable", async () => {
    mocks.query.mockResolvedValue([{ ready: false }]);
    await expect(requireLineDisconnectionReadiness()).rejects.toMatchObject({ code: "LINE_CONFIGURATION_MISSING" });
  });

  it("credential rotation/outage does not disable local unlink or Recovery", () => {
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", "");
    expect(getLineChannelInventory()).toEqual({ channels: [account] });
  });
});
