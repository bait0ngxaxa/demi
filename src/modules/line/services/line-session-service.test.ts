import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { getServerSupabaseClient } from "@/lib/auth/supabase-server";

import { getCurrentLineSession, hashLineSessionId, lineRecoveryHandoffScope } from "./line-session-service";

vi.mock("@/lib/db/prisma", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/auth/supabase-server", () => ({ getServerSupabaseClient: vi.fn() }));

const authSubject = "supabase-auth-subject-1";
const demiUserId = "83da3ab8-2895-4cab-bb63-19f807246288";
const sessionId = "70f59f2e-c97a-46d2-8c9f-bf35de411057";

describe("exact Supabase session binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example.org");
    vi.stubEnv("IDENTITY_HASH_SECRET", "line-test-identity-hash-secret-at-least-32");
    vi.mocked(getPrisma).mockReturnValue({
      user: { findUnique: vi.fn().mockResolvedValue({ id: demiUserId }) },
    } as unknown as ReturnType<typeof getPrisma>);
  });

  function setAuth(claims: unknown, returnedSubject = authSubject) {
    vi.mocked(getServerSupabaseClient).mockResolvedValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({ data: { claims }, error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: returnedSubject } }, error: null }),
      },
    } as unknown as Awaited<ReturnType<typeof getServerSupabaseClient>>);
  }

  it("derives a Recovery handoff scope unique to one DEMI User and session without exposing either", () => {
    const own = { userId: demiUserId, sessionHash: hashLineSessionId(sessionId) };
    const scope = lineRecoveryHandoffScope(own);
    expect(scope).toMatch(/^[a-f0-9]{64}$/u);
    expect(lineRecoveryHandoffScope({ ...own })).toBe(scope);
    expect(lineRecoveryHandoffScope({ ...own, userId: "93da3ab8-2895-4cab-bb63-19f807246288" })).not.toBe(scope);
    expect(lineRecoveryHandoffScope({ ...own, sessionHash: hashLineSessionId("80f59f2e-c97a-46d2-8c9f-bf35de411057") })).not.toBe(scope);
    expect(scope).not.toContain(demiUserId.replaceAll("-", "")); expect(scope).not.toBe(own.sessionHash);
  });

  it("maps the verified auth subject to exact DEMI User and returns only a session hash", async () => {
    setAuth({ sub: authSubject, session_id: sessionId });
    const current = await getCurrentLineSession();
    expect(current.userId).toBe(demiUserId);
    expect(current.sessionHash).toBe(hashLineSessionId(sessionId));
    expect(current.sessionHash).not.toContain(sessionId);
    expect(vi.mocked(getPrisma).mock.results[0]?.value.user.findUnique).toHaveBeenCalledWith({
      where: { authSubject },
      select: { id: true },
    });
  });

  it("rejects missing session_id and mismatched current Supabase user", async () => {
    setAuth({ sub: authSubject });
    await expect(getCurrentLineSession()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    setAuth({ sub: authSubject, session_id: sessionId }, "different-subject");
    await expect(getCurrentLineSession()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects an authenticated provider identity that has no DEMI User mapping", async () => {
    setAuth({ sub: authSubject, session_id: sessionId });
    vi.mocked(getPrisma).mockReturnValue({
      user: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as ReturnType<typeof getPrisma>);
    await expect(getCurrentLineSession()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("produces different hashes for different sessions", () => {
    expect(hashLineSessionId(sessionId)).not.toBe(hashLineSessionId("1c712ccc-5a39-4628-98e3-d0a33b133baf"));
  });
});
