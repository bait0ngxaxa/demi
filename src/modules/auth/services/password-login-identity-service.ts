import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import {
  THAI_NATIONAL_IDENTITY_NAMESPACE,
  thaiNationalIdSchema,
  type IdentityReference,
} from "@/modules/identity/schemas/identity-schemas";
import { findPersonByIdentity } from "@/modules/identity/services/identity-service";
import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { createProviderLoginAlias } from "./provider-login-alias";

export type ResolvedPasswordLoginIdentity = {
  authSubject: string;
  providerLoginAlias: string;
};

export type PasswordLoginUserRecord = {
  id: string;
  authSubject: string | null;
};

export type PasswordLoginIdentityStore = {
  findUserByPersonId(personId: string): Promise<PasswordLoginUserRecord | null>;
};

export type PasswordLoginPersonResolver = (
  identity: IdentityReference,
) => Promise<{ id: string } | null>;

export type PasswordLoginIdentityDependencies = {
  store?: PasswordLoginIdentityStore;
  findPerson?: PasswordLoginPersonResolver;
};

const prismaPasswordLoginIdentityStore: PasswordLoginIdentityStore = {
  async findUserByPersonId(personId): Promise<PasswordLoginUserRecord | null> {
    try {
      return await getPrisma().user.findUnique({
        where: { personId },
        select: {
          id: true,
          authSubject: true,
        },
      });
    } catch {
      throw new InfrastructureError("Password login identity could not be loaded");
    }
  },
};

export async function resolvePasswordLoginIdentity(
  nationalId: string,
  dependencies: PasswordLoginIdentityDependencies = {},
): Promise<ResolvedPasswordLoginIdentity | null> {
  const parsed = thaiNationalIdSchema.safeParse(nationalId);

  if (!parsed.success) {
    throw new ValidationError("Thai National ID is invalid");
  }

  const findPerson = dependencies.findPerson ?? findPersonByIdentity;
  const person = await findPerson({
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: parsed.data,
  });

  if (!person) {
    return null;
  }

  const store = dependencies.store ?? prismaPasswordLoginIdentityStore;
  const user = await store.findUserByPersonId(person.id);

  if (!user?.authSubject) {
    return null;
  }

  return {
    authSubject: user.authSubject,
    providerLoginAlias: createProviderLoginAlias(user.id),
  };
}
