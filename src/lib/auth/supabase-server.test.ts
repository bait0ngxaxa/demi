import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions, SetAllCookies } from "@supabase/ssr";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerEnv } from "@/lib/env/server";

const mockedCookies = vi.hoisted(() => vi.fn());
const mockedCreateServerClient = vi.hoisted(() => vi.fn());
const mockedGetServerEnv = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies: mockedCookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mockedCreateServerClient }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mockedGetServerEnv }));

import { createServerClient } from "@supabase/ssr";

import { getServerSupabaseClient } from "./supabase-server";

type CreateServerClientOptions = Parameters<typeof createServerClient>[2];
type CookieStore = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options: CookieOptions) => void;
};

const serverEnv: ServerEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  DIRECT_URL: "postgresql://test:test@localhost:5432/test",
  IDENTITY_HASH_SECRET: "test-secret-test-secret-test-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
};

let capturedSetAll: SetAllCookies | undefined;
let capturedFetch: typeof fetch | undefined;

function getCapturedSetAll(): SetAllCookies {
  if (!capturedSetAll) {
    throw new Error("Supabase cookie setter was not captured");
  }

  return capturedSetAll;
}

function createCookieStore(): CookieStore {
  return {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  };
}

function createClientOptions(options: CreateServerClientOptions): void {
  capturedSetAll = options.cookies.setAll;
  capturedFetch = options.global?.fetch;
}

describe("Supabase server cookie boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSetAll = undefined;
    capturedFetch = undefined;
    mockedGetServerEnv.mockReturnValue(serverEnv);
    mockedCreateServerClient.mockImplementation(
      (_url: string, _key: string, options: CreateServerClientOptions) => {
        createClientOptions(options);
        return {} as SupabaseClient;
      },
    );
  });

  it("keeps read-only server component cookie writes best effort", async () => {
    const cookieStore = createCookieStore();
    vi.mocked(cookieStore.set).mockImplementation(() => {
      throw new Error("cookies are read-only");
    });
    mockedCookies.mockResolvedValue(cookieStore);

    await getServerSupabaseClient();

    await expect(
      (async () => {
        await getCapturedSetAll()(
          [{ name: "sb-session", value: "session", options: { path: "/" } }],
          {},
        );
      })(),
    ).resolves.toBeUndefined();
    expect(cookieStore.set).toHaveBeenCalledOnce();
  });

  it("exact-session transport blocks refresh and applies one provider deadline without changing ordinary clients", async () => {
    mockedCookies.mockResolvedValue(createCookieStore());
    const deadline = AbortSignal.timeout(10000);
    await getServerSupabaseClient({ requireWritableCookies: true, exactSessionDeadline: deadline });
    const exactFetch = capturedFetch;
    if (!exactFetch) throw new Error("Expected exact-session fetch");
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ safe: true }));
    try {
      const denied = await exactFetch("https://example.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" });
      expect(denied.status).toBe(401); expect(network).not.toHaveBeenCalled();
      await exactFetch("https://example.supabase.co/auth/v1/user");
      expect(network).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user", expect.objectContaining({ signal: deadline, cache: "no-store" }));
      await getServerSupabaseClient(); expect(capturedFetch).toBeUndefined();
    } finally { network.mockRestore(); }
  });

  it("surfaces cookie write failures when mutations require writable cookies", async () => {
    const cookieStore = createCookieStore();
    vi.mocked(cookieStore.set).mockImplementation(() => {
      throw new Error("cookies are read-only");
    });
    mockedCookies.mockResolvedValue(cookieStore);

    await getServerSupabaseClient({ requireWritableCookies: true });

    await expect(
      (async () => {
        await getCapturedSetAll()(
          [{ name: "sb-session", value: "session", options: { path: "/" } }],
          {},
        );
      })(),
    ).rejects.toThrow("cookies are read-only");
    expect(cookieStore.set).toHaveBeenCalledOnce();
  });

  it("writes authentication cookies in a writable mutation context", async () => {
    const cookieStore = createCookieStore();
    mockedCookies.mockResolvedValue(cookieStore);

    await getServerSupabaseClient({ requireWritableCookies: true });
    await getCapturedSetAll()([
      { name: "sb-session", value: "session", options: { httpOnly: true, path: "/" } },
    ], {});

    expect(cookieStore.set).toHaveBeenCalledWith("sb-session", "session", {
      httpOnly: true,
      path: "/",
    });
  });
});
