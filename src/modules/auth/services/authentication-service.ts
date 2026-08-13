import "server-only";

import { isAuthError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { loginInputSchema, type LoginInput } from "../schemas/login-schema";
import type { ActorContext } from "../types/actor-context";
import {
  isUnauthenticatedAuthError,
  resolveCurrentActorAccess,
  type ActorAuthenticationProvider,
  type ActorContextStore,
} from "./actor-context-service";

type SupabaseSignOutOptions = Parameters<SupabaseClient["auth"]["signOut"]>[0];

export type PasswordAuthenticationProvider = ActorAuthenticationProvider & {
  signInWithPassword(credentials: LoginInput): Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
  signOut(options?: SupabaseSignOutOptions): Promise<{ error: unknown }>;
};

export type AuthenticationResult =
  | { status: "AUTHORIZED"; actor: ActorContext }
  | { status: "INVALID_CREDENTIALS" }
  | {
      status: "APPLICATION_ACCESS_DENIED";
      reason: "UNMAPPED" | "ACCOUNT_NOT_ACTIVE";
    };

export type AuthenticationDependencies = {
  provider?: PasswordAuthenticationProvider;
  actorStore?: ActorContextStore;
};

const invalidCredentialErrorCodes = new Set([
  "email_not_confirmed",
  "invalid_credentials",
  "user_not_found",
]);

function isInvalidCredentialsError(error: unknown): boolean {
  return (
    isAuthError(error) &&
    typeof error.code === "string" &&
    invalidCredentialErrorCodes.has(error.code)
  );
}

async function getPasswordAuthenticationProvider(): Promise<PasswordAuthenticationProvider> {
  try {
    return (await getServerSupabaseClient({ requireWritableCookies: true })).auth;
  } catch {
    throw new InfrastructureError("Authentication service could not be reached");
  }
}

export async function signOutCurrentSession(
  provider?: PasswordAuthenticationProvider,
): Promise<void> {
  const authProvider = provider ?? (await getPasswordAuthenticationProvider());

  try {
    const { error } = await authProvider.signOut({ scope: "local" });

    if (error && !isUnauthenticatedAuthError(error)) {
      throw new InfrastructureError("Authentication session could not be invalidated");
    }
  } catch (error) {
    if (error instanceof InfrastructureError) {
      throw error;
    }

    if (isUnauthenticatedAuthError(error)) {
      return;
    }

    throw new InfrastructureError("Authentication session could not be invalidated");
  }
}

export async function authenticateWithPassword(
  input: LoginInput,
  dependencies: AuthenticationDependencies = {},
): Promise<AuthenticationResult> {
  const parsed = loginInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Login data is invalid");
  }

  const provider = dependencies.provider ?? (await getPasswordAuthenticationProvider());
  let response: Awaited<ReturnType<PasswordAuthenticationProvider["signInWithPassword"]>>;

  try {
    response = await provider.signInWithPassword(parsed.data);
  } catch (error) {
    if (isInvalidCredentialsError(error)) {
      return { status: "INVALID_CREDENTIALS" };
    }

    throw new InfrastructureError("Authentication service could not be reached");
  }

  if (response.error) {
    if (isInvalidCredentialsError(response.error)) {
      return { status: "INVALID_CREDENTIALS" };
    }

    throw new InfrastructureError("Authentication service could not be reached");
  }

  if (!response.data.user) {
    throw new InfrastructureError("Authentication service returned an invalid response");
  }

  const access = await resolveCurrentActorAccess(dependencies.actorStore, provider);

  if (access.status === "UNAUTHENTICATED") {
    throw new InfrastructureError("Authenticated identity could not be validated");
  }

  if (access.status === "APPLICATION_ACCESS_DENIED") {
    await signOutCurrentSession(provider);
    return access;
  }

  return access;
}
