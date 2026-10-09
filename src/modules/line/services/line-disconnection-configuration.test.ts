import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineChannelTupleKey } from "../domain/line-authorization-lifecycle";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ $queryRaw: mocks.query }) }));
import { getLineDisconnectionConfiguration, requireLineDisconnectionReadiness } from "./line-disconnection-configuration";

const account = { kind: "ACCOUNT" as const, providerReference: "synthetic-provider", channelId: "1234567890", environment: "ACCOUNT" as const, deploymentReference: "synthetic-deploy" };
function manifest() { return { inventory: { revision: "synthetic-v1", channels: [account], miniExclusionReference: "synthetic-reviewed-exclusion" }, accountLiffId: "4567891230-test", appNames: { [lineChannelTupleKey(account)]: "DEMI ทดสอบ" }, migrationEvidence: "synthetic-migration", recoveryUatEvidence: "synthetic-uat", providerCredentialEvidence: "synthetic-provider", exactSessionEvidence: "synthetic-auth", deploymentReference: "synthetic-deploy" }; }
describe("coordinated server-owned activation inventory", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", account.channelId); vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org"); vi.stubEnv("IDENTITY_HASH_SECRET", "synthetic-secret-at-least-32-characters"); vi.stubEnv("NEXT_PUBLIC_DEMI_LINE_LIFF_ID", "4567891230-test"); vi.stubEnv("DEMI_LINE_DISCONNECTION_ENABLED", "true"); vi.stubEnv("DEMI_LINE_DISCONNECTION_MANIFEST", JSON.stringify(manifest())); mocks.query.mockResolvedValue([{ ready: true }]); });
  afterEach(() => vi.unstubAllEnvs());
  it("keeps disabled inventory staged without DB/provider calls", async () => { vi.stubEnv("DEMI_LINE_DISCONNECTION_ENABLED", "false"); expect(await requireLineDisconnectionReadiness()).toBeNull(); expect(mocks.query).not.toHaveBeenCalled(); });
  it("requires reviewed inventory, labels, environment/LIFF mapping and applied migration", async () => { expect(await requireLineDisconnectionReadiness()).toEqual(manifest()); expect(mocks.query).toHaveBeenCalledOnce(); });
  it.each(["missing inventory", "unknown MINI", "wrong Account", "missing UAT", "wrong deployment", "wrong LIFF", "missing app name"])("fails enabled runtime closed: %s", (reason) => {
    const value = manifest();
    if (reason === "missing inventory") vi.stubEnv("DEMI_LINE_DISCONNECTION_MANIFEST", "");
    else {
      if (reason === "unknown MINI") Object.assign(value.inventory, { miniExclusionReference: undefined });
      if (reason === "wrong Account") value.inventory.channels = [{ ...account, channelId: "9999999999" }];
      if (reason === "missing UAT") value.recoveryUatEvidence = "";
      if (reason === "wrong deployment") value.deploymentReference = "other";
      if (reason === "wrong LIFF") value.accountLiffId = "9999999999-test";
      if (reason === "missing app name") value.appNames = {};
      vi.stubEnv("DEMI_LINE_DISCONNECTION_MANIFEST", JSON.stringify(value));
    }
    expect(() => getLineDisconnectionConfiguration()).toThrow();
  });
  it("does not silently fallback if the migration is unavailable", async () => { mocks.query.mockResolvedValue([{ ready: false }]); await expect(requireLineDisconnectionReadiness()).rejects.toMatchObject({ code: "LINE_CONFIGURATION_MISSING" }); });
  it("credential rotation/outage does not disable local unlink or Recovery", () => { vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_SECRET", ""); expect(getLineDisconnectionConfiguration()).toEqual(manifest()); });
});
