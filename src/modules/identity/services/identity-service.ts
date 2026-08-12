import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  ConflictError,
  InfrastructureError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  createPersonInputSchema,
  identityReferenceSchema,
  type CreatePersonInput,
  type IdentityReference,
} from "../schemas/identity-schemas";

export type PersonRecord = {
  id: string;
  identityKeyHash: string;
  givenName: string | null;
  familyName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IdentityStore = {
  findPersonByIdentityHash(identityKeyHash: string): Promise<PersonRecord | null>;
  createPerson(input: {
    identityKeyHash: string;
    givenName?: string;
    familyName?: string;
  }): Promise<PersonRecord>;
};

function parseIdentityReference(input: IdentityReference): IdentityReference {
  const result = identityReferenceSchema.safeParse(input);

  if (!result.success) {
    throw new ValidationError("A valid identity reference is required");
  }

  return result.data;
}

function hashIdentityReference(input: IdentityReference): string {
  const normalized = parseIdentityReference(input);
  return createHash("sha256")
    .update(`${normalized.namespace}\u0000${normalized.value}`, "utf8")
    .digest("hex");
}

const prismaIdentityStore: IdentityStore = {
  async findPersonByIdentityHash(identityKeyHash): Promise<PersonRecord | null> {
    try {
      return await getPrisma().person.findUnique({
        where: { identityKeyHash },
      });
    } catch {
      throw new InfrastructureError();
    }
  },

  async createPerson(input): Promise<PersonRecord> {
    try {
      return await getPrisma().person.create({
        data: input,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("A person with this identity already exists");
      }

      throw new InfrastructureError();
    }
  },
};

export async function findPersonByIdentity(
  identity: IdentityReference,
  store: IdentityStore = prismaIdentityStore,
): Promise<PersonRecord | null> {
  return store.findPersonByIdentityHash(hashIdentityReference(identity));
}

export async function createPerson(
  input: CreatePersonInput,
  store: IdentityStore = prismaIdentityStore,
): Promise<PersonRecord> {
  const parsed = createPersonInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Person identity data is invalid");
  }

  const identityKeyHash = hashIdentityReference(parsed.data.identity);
  const existing = await store.findPersonByIdentityHash(identityKeyHash);

  if (existing) {
    throw new ConflictError("A person with this identity already exists");
  }

  return store.createPerson({
    identityKeyHash,
    givenName: parsed.data.givenName,
    familyName: parsed.data.familyName,
  });
}

export async function resolvePerson(
  input: CreatePersonInput,
  store: IdentityStore = prismaIdentityStore,
): Promise<PersonRecord> {
  const parsed = createPersonInputSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Person identity data is invalid");
  }

  const identityKeyHash = hashIdentityReference(parsed.data.identity);
  const existing = await store.findPersonByIdentityHash(identityKeyHash);

  if (existing) {
    return existing;
  }

  try {
    return await store.createPerson({
      identityKeyHash,
      givenName: parsed.data.givenName,
      familyName: parsed.data.familyName,
    });
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      const concurrentMatch = await store.findPersonByIdentityHash(identityKeyHash);

      if (concurrentMatch) {
        return concurrentMatch;
      }
    }

    throw error;
  }
}
