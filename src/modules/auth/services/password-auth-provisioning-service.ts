import "server-only";

import { Prisma } from "@prisma/client";
import { isAuthError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getPrisma } from "@/lib/db/prisma";
import {
  ApplicationError,
  ConflictError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import { createProviderLoginAlias } from "./provider-login-alias";

type SupabaseAdminCreateUserInput = Parameters<
  SupabaseClient["auth"]["admin"]["createUser"]
>[0];

export type PasswordAuthAdminProvider = {
  createUser(attributes: SupabaseAdminCreateUserInput): Promise<{
    data: { user: { id: string } | null };
    error: unknown;
  }>;
  deleteUser(userId: string): Promise<{ error: unknown }>;
};

export type PasswordAuthProvisioningUser = {
  id: string;
  authSubject: string | null;
};

export type PasswordAuthProvisioningStore = {
  findUserById(userId: string): Promise<PasswordAuthProvisioningUser | null>;
  setAuthSubject(input: { userId: string; authSubject: string }): Promise<boolean>;
};

export type ProvisionPasswordAuthIdentityInput = {
  userId: string;
  password: string;
};

export type ProvisionPasswordAuthIdentityResult = {
  userId: string;
  authSubject: string;
};

export type PasswordAuthProvisioningDependencies = {
  provider?: PasswordAuthAdminProvider;
  store?: PasswordAuthProvisioningStore;
};

export type PasswordAuthProvisioningReconciliationKind =
  | "AMBIGUOUS_PROVIDER_OUTCOME"
  | "PROVIDER_IDENTITY_CONFLICT";

export class PasswordAuthProvisioningProviderRejectedError extends InfrastructureError {
  readonly outcome = "DEFINITIVE_PROVIDER_REJECTION" as const;
  readonly requiresReconciliation = false;

  constructor() {
    super("Password authentication provider rejected the identity request");
    this.name = "PasswordAuthProvisioningProviderRejectedError";
  }
}

export class PasswordAuthProvisioningReconciliationError extends InfrastructureError {
  readonly requiresReconciliation = true;
  readonly outcome: PasswordAuthProvisioningReconciliationKind;

  constructor(outcome: PasswordAuthProvisioningReconciliationKind = "AMBIGUOUS_PROVIDER_OUTCOME") {
    super("Password authentication identity requires provider reconciliation");
    this.name = "PasswordAuthProvisioningReconciliationError";
    this.outcome = outcome;
  }
}

export class PasswordAuthProvisioningIdentityConflictError extends PasswordAuthProvisioningReconciliationError {
  constructor() {
    super("PROVIDER_IDENTITY_CONFLICT");
    this.name = "PasswordAuthProvisioningIdentityConflictError";
  }
}

const provisionPasswordAuthIdentitySchema = z
  .object({
    userId: z.uuid(),
    password: z.string().min(1).max(128),
  })
  .strict();

const providerSubjectSchema = z.uuid();
const providerIdentityConflictCodes = new Set(["email_exists", "user_already_exists"]);

const prismaPasswordAuthProvisioningStore: PasswordAuthProvisioningStore = {
  async findUserById(userId): Promise<PasswordAuthProvisioningUser | null> {
    try {
      return await getPrisma().user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          authSubject: true,
        },
      });
    } catch {
      throw new InfrastructureError("DEMI User could not be loaded for auth provisioning");
    }
  },

  async setAuthSubject(input): Promise<boolean> {
    try {
      const result = await getPrisma().user.updateMany({
        where: {
          id: input.userId,
          authSubject: null,
        },
        data: {
          authSubject: input.authSubject,
        },
      });

      return result.count === 1;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Provider subject is already mapped to another DEMI User");
      }

      throw new InfrastructureError("Provider subject could not be persisted");
    }
  },
};

function isProviderIdentityConflict(error: unknown): boolean {
  return (
    isAuthError(error) &&
    typeof error.code === "string" &&
    providerIdentityConflictCodes.has(error.code)
  );
}

function isDefinitiveProviderRejection(error: unknown): boolean {
  return (
    isAuthError(error) &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

function classifyProviderFailure(error: unknown): never {
  if (isProviderIdentityConflict(error)) {
    throw new PasswordAuthProvisioningIdentityConflictError();
  }

  if (isDefinitiveProviderRejection(error)) {
    throw new PasswordAuthProvisioningProviderRejectedError();
  }

  throw new PasswordAuthProvisioningReconciliationError();
}

function getPasswordAuthAdminProvider(): PasswordAuthAdminProvider {
  try {
    return getSupabaseAdminClient().auth.admin;
  } catch {
    throw new InfrastructureError("Password authentication administration is unavailable");
  }
}

function normalizePersistenceError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  return new InfrastructureError("Provider subject could not be persisted");
}

async function compensateProviderAccount(
  provider: PasswordAuthAdminProvider,
  providerSubject: string,
  persistenceError: ApplicationError,
): Promise<never> {
  try {
    const { error } = await provider.deleteUser(providerSubject);

    if (error) {
      throw error;
    }
  } catch {
    throw new PasswordAuthProvisioningReconciliationError();
  }

  throw persistenceError;
}

export async function provisionPasswordAuthIdentity(
  input: ProvisionPasswordAuthIdentityInput,
  dependencies: PasswordAuthProvisioningDependencies = {},
): Promise<ProvisionPasswordAuthIdentityResult> {
  const parsed = provisionPasswordAuthIdentitySchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Password authentication provisioning data is invalid");
  }

  const store = dependencies.store ?? prismaPasswordAuthProvisioningStore;
  let user: PasswordAuthProvisioningUser | null;

  try {
    user = await store.findUserById(parsed.data.userId);
  } catch (error: unknown) {
    throw normalizePersistenceError(error);
  }

  if (!user) {
    throw new NotFoundError("DEMI User was not found for auth provisioning");
  }

  if (user.authSubject) {
    throw new ConflictError("DEMI User already has a provider identity");
  }

  const providerLoginAlias = createProviderLoginAlias(user.id);
  const provider = dependencies.provider ?? getPasswordAuthAdminProvider();
  let providerResponse: Awaited<ReturnType<PasswordAuthAdminProvider["createUser"]>>;

  try {
    providerResponse = await provider.createUser({
      email: providerLoginAlias,
      password: parsed.data.password,
      email_confirm: true,
    });
  } catch (error: unknown) {
    classifyProviderFailure(error);
  }

  if (providerResponse.error) {
    classifyProviderFailure(providerResponse.error);
  }

  const providerSubject = providerSubjectSchema.safeParse(providerResponse.data.user?.id);

  if (!providerSubject.success) {
    throw new PasswordAuthProvisioningReconciliationError();
  }

  let persisted: boolean;

  try {
    persisted = await store.setAuthSubject({
      userId: user.id,
      authSubject: providerSubject.data,
    });
  } catch (error: unknown) {
    return await compensateProviderAccount(
      provider,
      providerSubject.data,
      normalizePersistenceError(error),
    );
  }

  if (!persisted) {
    return await compensateProviderAccount(
      provider,
      providerSubject.data,
      new ConflictError("DEMI User provider identity changed during provisioning"),
    );
  }

  return {
    userId: user.id,
    authSubject: providerSubject.data,
  };
}
