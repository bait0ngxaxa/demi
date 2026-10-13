import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env/server";
import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { InfrastructureError } from "@/shared/errors/application-error";

import { assertIndependentCredentialRecoverySupported } from "@/modules/auth/services/credential-recovery-state";

import { createProviderLoginAlias } from "@/modules/auth/services/provider-login-alias";

function createIsolatedAuthClient(): SupabaseClient {
  const env = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function updateAuthenticatedPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  try {
    const client = await getServerSupabaseClient({ requireWritableCookies: true });
    const currentUser = await client.auth.getUser();

    if (currentUser.error || !currentUser.data.user) {
      throw new Error("Authenticated provider user could not be confirmed");
    }

    const verifier = createIsolatedAuthClient();
    const verification = await verifier.auth.signInWithPassword({
      email: createProviderLoginAlias(input.userId),
      password: input.currentPassword,
    });

    let passwordChangeConfirmed = false;

    try {
      if (
        verification.error ||
        verification.data.user?.id !== currentUser.data.user.id ||
        !verification.data.session
      ) {
        throw new Error("Current password was not confirmed for the authenticated user");
      }

      const { data, error } = await verifier.auth.updateUser({
        password: input.newPassword,
        current_password: input.currentPassword,
      });

      if (error || data.user?.id !== currentUser.data.user.id) {
        throw new Error("Provider rejected password change");
      }

      passwordChangeConfirmed = true;
    } finally {
      if (verification.data.session) {
        try {
          const { error: localSignOutError } = await verifier.auth.signOut({ scope: "local" });

          if (localSignOutError) {
            throw new Error("Temporary password-verification session could not be closed");
          }
        } catch {
          if (passwordChangeConfirmed) {
            console.error("Temporary password-verification session cleanup could not be confirmed");
          } else {
            throw new Error("Temporary password-verification session could not be closed");
          }
        }
      }
    }
  } catch {
    throw new InfrastructureError("Account password could not be changed");
  }
}

/** Defense in depth: no provider administrative replacement until owner-proof policy is supported. */
export async function replacePasswordAndRevokeRecoverySessions(input: {
  userId: string;
  authSubject: string;
  newPassword: string;
}): Promise<void> {
  void input;
  return assertIndependentCredentialRecoverySupported();
}
