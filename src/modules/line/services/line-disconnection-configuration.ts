import "server-only";

import { z } from "zod";
import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { getPrisma } from "@/lib/db/prisma";
import { lineChannelInventorySchema, lineChannelTupleKey } from "../domain/line-authorization-lifecycle";
import { LineFailure } from "../domain/line-errors";

const evidence = z.string().regex(/^[A-Za-z0-9._:/-]{1,128}$/u);
export const lineDisconnectionConfigurationSchema = z.object({
  inventory: lineChannelInventorySchema,
  accountLiffId: z.string().regex(/^\d{4,20}-[A-Za-z0-9]+$/u),
  appNames: z.record(z.string().regex(/^[a-f0-9]{64}$/u), z.string().trim().min(1).max(100)),
  migrationEvidence: evidence,
  recoveryUatEvidence: evidence,
  providerCredentialEvidence: evidence,
  exactSessionEvidence: evidence,
  deploymentReference: evidence,
}).strict();
export type LineDisconnectionConfiguration = z.infer<typeof lineDisconnectionConfigurationSchema>;

/** Operator-owned manifest, never a request body. False is the untouched staged rollout.
 * Enabled + incomplete fails closed, never silently falls back to unrestricted Relink.
 */
export function getLineDisconnectionConfiguration(): LineDisconnectionConfiguration | null {
  if (process.env.DEMI_LINE_DISCONNECTION_ENABLED === undefined || process.env.DEMI_LINE_DISCONNECTION_ENABLED === "false") return null;
  try {
    if (process.env.DEMI_LINE_DISCONNECTION_ENABLED !== "true") throw new Error();
    const config = lineDisconnectionConfigurationSchema.parse(JSON.parse(process.env.DEMI_LINE_DISCONNECTION_MANIFEST ?? ""));
    const account = config.inventory.channels.find((channel) => channel.kind === "ACCOUNT");
    const login = getLineLoginEnv();
    if (!account || account.channelId !== login.DEMI_LINE_LOGIN_CHANNEL_ID ||
        account.deploymentReference !== config.deploymentReference ||
        getLineLiffId() !== config.accountLiffId ||
        config.inventory.channels.some((channel) => !config.appNames[lineChannelTupleKey(channel)])) throw new Error();
    // Credential availability is not local revocation/recovery authority.
    // Loss/rotation after rollout yields unconfirmed remote outcome in adapter.
    return config;
  } catch {
    throw new LineFailure("LINE_CONFIGURATION_MISSING");
  }
}

export async function requireLineDisconnectionReadiness(): Promise<LineDisconnectionConfiguration | null> {
  const config = getLineDisconnectionConfiguration();
  if (!config) return null;
  const rows = await getPrisma().$queryRaw<Array<{ ready: boolean }>>`SELECT EXISTS (
    SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261008120000_line_authorization_lifecycle'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ) AS ready`;
  if (!rows[0]?.ready) throw new LineFailure("LINE_CONFIGURATION_MISSING");
  return config;
}
