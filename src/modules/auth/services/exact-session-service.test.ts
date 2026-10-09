import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), owner: vi.fn(), env: vi.fn() }));
vi.mock("@/lib/auth/supabase-server", () => ({ getServerSupabaseClient: mocks.client }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: () => ({ user: { findUnique: mocks.owner } }) }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.env }));
import { getLiveExactSession } from "./exact-session-service";

const subject = randomUUID(); const sessionId = randomUUID();
const claims = (): Record<string, unknown> => ({ sub: subject, session_id: sessionId, iss: "https://test.supabase.co/auth/v1", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 });
function provider(values = claims()) {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: "captured-jwt" } }, error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: values }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: subject } }, error: null })),
  };
  mocks.client.mockResolvedValue({ auth }); return auth;
}
describe("Auth-owned current live exact-session verification", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.env.mockReturnValue({ NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co" }); mocks.owner.mockResolvedValue({ id: "canonical-owner", status: "ACTIVE" }); });
  it("uses one captured JWT for both verified claims and uncached provider liveness", async () => {
    const auth = provider();
    expect(await getLiveExactSession()).toMatchObject({ userId: "canonical-owner", sessionId });
    expect(auth.getClaims).toHaveBeenCalledWith("captured-jwt"); expect(auth.getUser).toHaveBeenCalledWith("captured-jwt");
    expect(auth.getSession).toHaveBeenCalledOnce();
    await getLiveExactSession(); expect(auth.getUser).toHaveBeenCalledTimes(2);
  });
  it.each([
    { exp: 1 }, { sub: "not-uuid" }, { session_id: "invalid" }, { iss: "https://evil.example/auth/v1" }, { aud: "anon" },
  ])("rejects invalid verified claims %j", async (changes) => {
    const auth = provider({ ...claims(), ...changes });
    await expect(getLiveExactSession()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(auth.getUser).not.toHaveBeenCalled(); expect(mocks.owner).not.toHaveBeenCalled();
  });
  it("rejects provider subject mismatch", async () => {
    const auth = provider(); auth.getUser.mockResolvedValue({ data: { user: { id: randomUUID() } }, error: null });
    await expect(getLiveExactSession()).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(mocks.owner).not.toHaveBeenCalled();
  });
  it.each(["claims", "live"])("does not refresh/fallback after %s denial or outage", async (stage) => {
    const auth = provider();
    if (stage === "claims") auth.getClaims.mockRejectedValue(new Error("provider response JWT=private")); else auth.getUser.mockRejectedValue(new Error("unavailable"));
    await expect(getLiveExactSession()).rejects.toMatchObject({ code: "INFRASTRUCTURE" }); expect(auth.getSession).toHaveBeenCalledOnce();
  });
  it("requires ACTIVE canonical owner", async () => {
    provider(); mocks.owner.mockResolvedValue({ id: "canonical-owner", status: "SUSPENDED" });
    await expect(getLiveExactSession()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
