import "server-only";

import { getLineLoginEnv } from "@/lib/env/server";
import { getPrisma } from "@/lib/db/prisma";
import { lineChannelInventorySchema, type LineChannelInventory } from "../domain/line-authorization-lifecycle";
import { LineFailure } from "../domain/line-errors";

/**
 * The deployment's channel inventory, derived from the same connection
 * configuration that authenticates LINE: exactly the Account Login channel.
 * Removing runtime access never proves an existing grant absent.
 * Missing Account configuration fails closed.
 */
export function getLineChannelInventory(): LineChannelInventory {
  try {
    return lineChannelInventorySchema.parse({ channels: [
      { kind: "ACCOUNT", channelId: getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID, environment: "ACCOUNT" },
    ] });
  } catch {
    throw new LineFailure("LINE_CONFIGURATION_MISSING");
  }
}

/** Full Disconnection is permanent policy; readiness is configuration plus actual migration state. */
export async function requireLineDisconnectionReadiness(): Promise<LineChannelInventory> {
  const inventory = getLineChannelInventory();
  const rows = await getPrisma().$queryRaw<Array<{ ready: boolean }>>`SELECT EXISTS (
    SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261008120000_line_authorization_lifecycle'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ) AS ready`;
  if (!rows[0]?.ready) throw new LineFailure("LINE_CONFIGURATION_MISSING");
  return inventory;
}
