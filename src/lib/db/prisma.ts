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
  const client = new PrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.demiPrisma = client;
  }

  return client;
}
