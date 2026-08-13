import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseAdminEnv } from "@/lib/env/server";

const mockedCreateClient = vi.hoisted(() => vi.fn());
const mockedGetSupabaseAdminEnv = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({ createClient: mockedCreateClient }));
vi.mock("@/lib/env/server", () => ({
  getSupabaseAdminEnv: mockedGetSupabaseAdminEnv,
}));

import { getSupabaseAdminClient } from "./supabase-admin";

const adminEnv: SupabaseAdminEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};

describe("Supabase admin client boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses only the privileged server credential and disables session persistence", () => {
    const client = { auth: { admin: {} } } as unknown as SupabaseClient;
    mockedGetSupabaseAdminEnv.mockReturnValue(adminEnv);
    mockedCreateClient.mockReturnValue(client);

    expect(getSupabaseAdminClient()).toBe(client);
    expect(getSupabaseAdminClient()).toBe(client);
    expect(mockedCreateClient).toHaveBeenCalledOnce();
    expect(mockedCreateClient).toHaveBeenCalledWith(
      adminEnv.NEXT_PUBLIC_SUPABASE_URL,
      adminEnv.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  });
});
