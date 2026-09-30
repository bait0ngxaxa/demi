import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env/server";
import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { InfrastructureError } from "@/shared/errors/application-error";

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

export async function replacePasswordAndRevokeRecoverySessions(input: {
  userId: string;
  authSubject: string;
  newPassword: string;
}): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.updateUserById(input.authSubject, {
      password: input.newPassword,
    });

    if (error || data.user?.id !== input.authSubject) {
      throw new Error("Provider password replacement was not confirmed");
    }

    const isolatedClient = createIsolatedAuthClient();
    const signIn = await isolatedClient.auth.signInWithPassword({
      email: createProviderLoginAlias(input.userId),
      password: input.newPassword,
    });

    if (
      signIn.error ||
      signIn.data.user?.id !== input.authSubject ||
      !signIn.data.session?.access_token
    ) {
      throw new Error("Isolated provider authentication was not confirmed");
    }

    const { error: signOutError } = await admin.auth.admin.signOut(
      signIn.data.session.access_token,
      "global",
    );

    if (signOutError) {
      throw new Error("Provider global session invalidation was not confirmed");
    }
  } catch {
    throw new InfrastructureError("Account recovery could not be completed");
  }
}
