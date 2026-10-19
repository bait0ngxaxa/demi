import "server-only";

import { PrismaClient } from "@prisma/client";

import { getServerEnv } from "@/lib/env/server";

const globalForPrisma = globalThis as unknown as {
  demiPrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  if (globalForPrisma.demiPrisma) {
    return globalForPrisma.demiPrisma;
  }

  getServerEnv();
  // One client (and connection pool) per process in every environment; a
  // long-running `next start` must not open a new pool on each call.
  const client = new PrismaClient();
  globalForPrisma.demiPrisma = client;

  return client;
}
