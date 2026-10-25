import "server-only";

import { createClient, isAuthApiError, isAuthError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getServerEnv } from "@/lib/env/server";
import { getServerSupabaseClient } from "@/lib/auth/supabase-server";
import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { createProviderLoginAlias, createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";

function createIsolatedAuthClient(signal?: AbortSignal): SupabaseClient {
  const env = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    ...(signal
      ? {
          global: {
            fetch: (url: RequestInfo | URL, init?: RequestInit) =>
              fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal }),
          },
        }
      : {}),
  });
}

/**
 * `deadline` (epoch ms) and `signal` bound the provider request: no update is sent once the deadline has passed, and
 * an update still open at the deadline is aborted. Reconciliation relies on this bound being enforced here.
 */
export async function updateAuthenticatedPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  deadline: number;
  signal: AbortSignal;
}): Promise<{ otherSessionsRevoked: boolean }> {
  let passwordUpdateOutcome: "NOT_STARTED" | "AMBIGUOUS" | "REJECTED" | "CONFIRMED" = "NOT_STARTED";
  let passwordChangeConfirmed = false;
  let definiteRejection: CurrentPasswordRejectedError | PasswordChangeProviderRejectedError | null = null;
  try {
    const client = await getServerSupabaseClient({ requireWritableCookies: true });
    const currentUser = await client.auth.getUser();

    if (currentUser.error || !currentUser.data.user) {
      throw new Error("Authenticated provider user could not be confirmed");
    }

    const identity = await getPrisma().user.findUnique({
      where: { id: input.userId },
      select: { authSubject: true, providerLoginAlias: true },
    });

    if (!identity || identity.authSubject !== currentUser.data.user.id) {
      throw new Error("Authenticated provider identity is no longer current");
    }

    const verifier = createIsolatedAuthClient(input.signal);
    const verification = await verifier.auth.signInWithPassword({
      email: identity.providerLoginAlias ?? createProviderLoginAlias(input.userId),
      password: input.currentPassword,
    });

    try {
      if (
        verification.error ||
        verification.data.user?.id !== currentUser.data.user.id ||
        !verification.data.session
      ) {
        if (isExplicitInvalidPassword(verification.error)) {
          definiteRejection = new CurrentPasswordRejectedError();
          throw definiteRejection;
        }
        throw new Error("Current password was not confirmed for the authenticated user");
      }

      // A resumed or delayed process must not send the update after reconciliation may have released the fence.
      if (input.signal.aborted || Date.now() >= input.deadline) {
        throw new Error("Password change deadline passed before the provider update");
      }
      passwordUpdateOutcome = "AMBIGUOUS";
      const { data, error } = await verifier.auth.updateUser({
        password: input.newPassword,
        current_password: input.currentPassword,
      });

      if (isExplicitInvalidPassword(error)) {
        passwordUpdateOutcome = "REJECTED";
        definiteRejection = new CurrentPasswordRejectedError();
        throw definiteRejection;
      }
      if (error && isDefinitePasswordUpdateRejection(error)) {
        passwordUpdateOutcome = "REJECTED";
        definiteRejection = new PasswordChangeProviderRejectedError();
        throw definiteRejection;
      }
      if (error || data.user?.id !== currentUser.data.user.id) {
        throw new Error("Provider rejected password change");
      }

      passwordChangeConfirmed = true;
      passwordUpdateOutcome = "CONFIRMED";
    } finally {
      if (verification.data.session) {
        try {
          const { error: localSignOutError } = await verifier.auth.signOut({ scope: "local" });

          if (localSignOutError) {
            throw new Error("Temporary password-verification session could not be closed");
          }
        } catch {
          if (passwordChangeConfirmed || passwordUpdateOutcome === "REJECTED") {
            console.error("Temporary password-verification session cleanup could not be confirmed");
          } else {
            throw new Error("Temporary password-verification session could not be closed");
          }
        }
      }
    }

    try {
      const { error } = await client.auth.signOut({ scope: "others" });
      if (error) console.error("Password changed but other provider sessions could not be revoked");
      return { otherSessionsRevoked: !error };
    } catch {
      console.error("Password changed but other provider sessions could not be revoked");
      return { otherSessionsRevoked: false };
    }
  } catch (error: unknown) {
    if (definiteRejection) {
      throw definiteRejection;
    }
    if (error instanceof CurrentPasswordRejectedError || error instanceof PasswordChangeProviderRejectedError) throw error;
    if (passwordChangeConfirmed) {
      console.error("Password changed but provider session cleanup could not be confirmed");
      return { otherSessionsRevoked: false };
    }
    if (passwordUpdateOutcome === "NOT_STARTED") {
      throw new PasswordChangeProviderNotStartedError();
    }
    throw new InfrastructureError("Account password could not be changed");
  }
}

/** Verifies a current password for a sensitive step-up without replacing the browser's session. */
export async function verifyAuthenticatedCurrentPassword(input: {
  userId: string;
  currentPassword: string;
}): Promise<void> {
  let verificationSession: { access_token: string } | null = null;
  let verifier: SupabaseClient | null = null;
  try {
    const client = await getServerSupabaseClient({ requireWritableCookies: true });
    const currentUser = await client.auth.getUser();
    if (currentUser.error || !currentUser.data.user) throw new InfrastructureError("Authenticated provider user could not be confirmed");

    const identity = await getPrisma().user.findUnique({
      where: { id: input.userId },
      select: { authSubject: true, providerLoginAlias: true },
    });
    if (!identity || identity.authSubject !== currentUser.data.user.id) {
      throw new InfrastructureError("Authenticated provider identity is no longer current");
    }

    verifier = createIsolatedAuthClient();
    const verification = await verifier.auth.signInWithPassword({
      email: identity.providerLoginAlias ?? createProviderLoginAlias(input.userId),
      password: input.currentPassword,
    });
    verificationSession = verification.data.session;
    if (isExplicitInvalidPassword(verification.error)) throw new CurrentPasswordRejectedError();
    if (verification.error || verification.data.user?.id !== currentUser.data.user.id || !verificationSession) {
      throw new InfrastructureError("Current password was not confirmed for the authenticated user");
    }
  } catch (error: unknown) {
    if (error instanceof CurrentPasswordRejectedError || error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("Current password could not be verified");
  } finally {
    if (verificationSession) {
      try {
        if (!verifier) throw new Error("Temporary password-verification client is unavailable");
        const { error } = await verifier.auth.signOut({ scope: "local" });
        if (error) throw new Error("Temporary password-verification session could not be closed");
      } catch {
        console.error("Temporary password-verification session cleanup could not be confirmed");
      }
    }
  }
}

export class CurrentPasswordRejectedError extends Error {
  constructor() {
    super("The current password was not accepted");
    this.name = "CurrentPasswordRejectedError";
  }
}

/** A documented Auth API validation response confirms that the password update did not happen. */
export class PasswordChangeProviderRejectedError extends ValidationError {
  constructor() {
    super("The provider rejected the new password");
    this.name = "PasswordChangeProviderRejectedError";
  }
}

/** Failures before the password update request cannot have changed the provider credential. */
export class PasswordChangeProviderNotStartedError extends InfrastructureError {
  constructor() {
    super("The provider password update did not start");
    this.name = "PasswordChangeProviderNotStartedError";
  }
}

function isDefinitePasswordUpdateRejection(error: unknown): boolean {
  return isAuthApiError(error) && typeof error.code === "string" && [
    "over_request_rate_limit",
    "reauthentication_needed",
    "same_password",
    "session_expired",
    "session_not_found",
    "validation_failed",
    "weak_password",
  ].includes(error.code);
}

function isExplicitInvalidPassword(error: unknown): boolean {
  return isAuthError(error) && error.code === "invalid_credentials";
}

export type ProviderIdentityRejection = "PASSWORD_POLICY" | "INVALID_REQUEST";

/** The provider explicitly refused to create the identity, so none exists and the claim can be rolled back. */
export class ProviderIdentityRejectedError extends ValidationError {
  readonly reason: ProviderIdentityRejection;

  constructor(reason: ProviderIdentityRejection) {
    super("The provider rejected the replacement identity");
    this.name = "ProviderIdentityRejectedError";
    this.reason = reason;
  }
}

/**
 * Only an Auth API error with an explicit request/policy code proves no identity was created
 * (https://supabase.com/docs/guides/auth/debugging/error-codes). Transport errors, 5xx, rate limits,
 * `email_exists` and anything unknown stay ambiguous.
 */
function definiteCreateRejection(error: unknown): ProviderIdentityRejection | null {
  if (!isAuthApiError(error)) return null;
  if (error.code === "weak_password") return "PASSWORD_POLICY";
  if (error.code === "validation_failed") return "INVALID_REQUEST";
  return null;
}

function isProviderUserNotFound(error: unknown): boolean {
  return isAuthApiError(error) && error.code === "user_not_found";
}

export async function replacePasswordAndRevokeRecoverySessions(input: {
  userId: string;
  resetId: string;
  authSubject: string;
  newPassword: string;
}): Promise<{ authSubject: string; providerLoginAlias: string }> {
  const providerLoginAlias = createProviderResetLoginAlias(input.userId, input.resetId);
  let rejection: ProviderIdentityRejection | null = null;

  try {
    const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
      email: providerLoginAlias,
      password: input.newPassword,
      email_confirm: true,
    });

    rejection = definiteCreateRejection(error);
    const replacementSubject = z.uuid().safeParse(data.user?.id);
    if (error || !replacementSubject.success || replacementSubject.data === input.authSubject) {
      throw new Error("Replacement provider identity was not confirmed");
    }

    return { authSubject: replacementSubject.data, providerLoginAlias };
  } catch {
    if (rejection) throw new ProviderIdentityRejectedError(rejection);
    throw new InfrastructureError("Replacement provider identity requires reconciliation");
  }
}

/** Idempotent: an identity the provider reports as already gone counts as deleted. */
export async function deleteReplacedProviderIdentity(authSubject: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);
    if (error && !isProviderUserNotFound(error)) throw error;
  } catch {
    throw new InfrastructureError("Previous provider identity requires reconciliation");
  }
}

/** Definite presence check by subject; anything but an exact match or `user_not_found` is ambiguous. */
export async function providerIdentityExists(authSubject: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(authSubject);
    if (isProviderUserNotFound(error)) return false;
    if (!error && data.user?.id === authSubject) return true;
  } catch {
    // Fall through to the ambiguous outcome.
  }
  throw new InfrastructureError("Provider identity presence could not be confirmed");
}

const PROVIDER_USER_PAGE_SIZE = 1000;
const PROVIDER_USER_MAX_PAGES = 100;

/**
 * Finds the identity created for one reset by its deterministic alias. The admin API has no lookup by email, so pages
 * are scanned until a short page proves the end; a partial scan is ambiguous, never "absent".
 */
export async function findProviderIdentityByLoginAlias(providerLoginAlias: string): Promise<{ authSubject: string } | null> {
  try {
    const admin = getSupabaseAdminClient().auth.admin;
    for (let page = 1; page <= PROVIDER_USER_MAX_PAGES; page += 1) {
      const { data, error } = await admin.listUsers({ page, perPage: PROVIDER_USER_PAGE_SIZE });
      if (error) break;
      const match = data.users.find((user) => user.email?.toLowerCase() === providerLoginAlias.toLowerCase());
      if (match) {
        const subject = z.uuid().safeParse(match.id);
        if (!subject.success) break;
        return { authSubject: subject.data };
      }
      if (data.users.length < PROVIDER_USER_PAGE_SIZE) return null;
    }
  } catch {
    // Fall through to the ambiguous outcome.
  }
  throw new InfrastructureError("Replacement provider identity could not be confirmed");
}

export type ProviderSessionRevocationOutcome = "CONFIRMED" | "AMBIGUOUS";

/** About 100 years: the provider has no "forever"; the local lock is the authority and is terminal. */
const SUSPECTED_TAKEOVER_BAN_DURATION = "876000h";

/**
 * UM-1 suspected takeover: the provider admin API cannot sign another user out by id, so a ban revokes refresh and new
 * sign-in. Access JWTs already issued stay valid until expiry, but every application request also requires the local
 * User to be ACTIVE. Anything but an exact confirmation is AMBIGUOUS and the caller keeps the lock in quarantine.
 */
export async function revokeProviderSessionsBySuspension(authSubject: string): Promise<ProviderSessionRevocationOutcome> {
  try {
    const { data, error } = await getSupabaseAdminClient().auth.admin.updateUserById(authSubject, {
      ban_duration: SUSPECTED_TAKEOVER_BAN_DURATION,
    });
    return !error && data.user?.id === authSubject ? "CONFIRMED" : "AMBIGUOUS";
  } catch {
    return "AMBIGUOUS";
  }
}
