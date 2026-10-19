import "server-only";

import { getLineLoginEnv } from "@/lib/env/server";
import { getPrisma } from "@/lib/db/prisma";
import { lineChannelInventorySchema, type LineChannelInventory } from "../domain/line-authorization-lifecycle";
import { LineFailure } from "../domain/line-errors";
import { resolveLineMiniAppChannel } from "./line-mini-app-configuration";

/**
 * The deployment's channel inventory, derived from the same connection
 * configuration that authenticates LINE: the Account Login channel plus the
 * selected MINI channel when provisioned. The MINI kill switch does not remove
 * the channel: disabling access never proves an existing grant absent.
 * Missing Account or partial MINI configuration fails closed.
 */
export function getLineChannelInventory(): LineChannelInventory {
  try {
    const mini = resolveLineMiniAppChannel();
    return lineChannelInventorySchema.parse({ channels: [
      { kind: "ACCOUNT", channelId: getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID, environment: "ACCOUNT" },
      ...(mini ? [{ kind: "MINI", channelId: mini.channelId, environment: mini.environment }] : []),
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
