import "server-only";

import { z } from "zod";

import { getApplicationPublicOrigin, getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import type { LineMiniAppDeauthorizationCredentials } from "../adapters/line-deauthorization-client";

import { LINE_WORKFLOW_GATEWAY_PATH } from "../domain/line-navigation-intents";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";

const channelIdSchema = z.string().regex(/^\d{4,20}$/u);
const liffIdSchema = z.string().regex(/^\d{4,20}-[A-Za-z0-9]+$/u);
const channelSecretSchema = z.string().regex(/^[A-Za-z0-9+/=_-]{16,1024}$/u);

export const LINE_MINI_APP_ENVIRONMENTS = ["DEVELOPING", "REVIEW", "PUBLISHED"] as const;
export type LineMiniAppEnvironment = (typeof LINE_MINI_APP_ENVIRONMENTS)[number];

/** The single trusted channel for this deployment. Public IDs are identifiers, not authority. */
export type LineMiniAppConfiguration = {
  environment: LineMiniAppEnvironment;
  /** Expected ID-token audience; never derived from the LIFF ID or a request. */
  channelId: string;
  liffId: string;
  origin: string;
  /** Derived as DEMI_LINE_PUBLIC_ORIGIN + /line/workflow; never configured separately. */
  endpointUrl: string;
};

/** Any MINI configuration present means MINI is being provisioned. */
const MINI_VARIABLES = [
  "DEMI_LINE_MINI_APP_CHANNEL_ID",
  "DEMI_LINE_MINI_APP_LIFF_ID",
  "DEMI_LINE_MINI_APP_ENVIRONMENT",
  "DEMI_LINE_MINI_APP_CHANNEL_SECRET",
  "DEMI_LINE_MINI_APP_CONTEXT_KEYRING",
] as const;

function readMiniVariable(name: (typeof MINI_VARIABLES)[number]): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Channel identity only (no availability policy). `null` means MINI is not
 * provisioned at all: Account-only operation. Any partial or invalid MINI
 * configuration fails closed; it never degrades to Account-only.
 */
export function resolveLineMiniAppChannel(): LineMiniAppConfiguration | null {
  if (MINI_VARIABLES.every((name) => readMiniVariable(name) === undefined)) return null;
  try {
    const environment = z.enum(LINE_MINI_APP_ENVIRONMENTS).parse(readMiniVariable("DEMI_LINE_MINI_APP_ENVIRONMENT"));
    const channelId = channelIdSchema.parse(readMiniVariable("DEMI_LINE_MINI_APP_CHANNEL_ID"));
    const liffId = liffIdSchema.parse(readMiniVariable("DEMI_LINE_MINI_APP_LIFF_ID"));
    const origin = getApplicationPublicOrigin();
    // LINE serves MINI Apps over HTTPS only; no local-development HTTP exception here.
    if (!origin.startsWith("https://")) throw new Error();
    // Account and MINI audiences stay separate; equality signals a misconfigured channel.
    if (channelId === getLineLoginEnv().DEMI_LINE_LOGIN_CHANNEL_ID || liffId === getLineLiffId()) throw new Error();
    return { environment, channelId, liffId, origin, endpointUrl: `${origin}${LINE_WORKFLOW_GATEWAY_PATH}` };
  } catch {
    throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  }
}

/**
 * The trusted provider configuration used for the gateway, ID-token verification,
 * scope issuance and every scoped read/mutation. Account LIFF and ordinary DEMI
 * web never call this.
 */
export function getLineMiniAppConfiguration(): LineMiniAppConfiguration {
  const configuration = resolveLineMiniAppChannel();
  if (!configuration) throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  return configuration;
}

/**
 * Server-only credentials for LINE's user deauthorization API. Credentials are
 * bound to the configured workflow channel because terminating a grant reduces access.
 */
export function getLineMiniAppDeauthorizationCredentials(): LineMiniAppDeauthorizationCredentials {
  const configuration = resolveLineMiniAppChannel();
  const channelSecret = channelSecretSchema.safeParse(readMiniVariable("DEMI_LINE_MINI_APP_CHANNEL_SECRET"));
  if (!configuration || !channelSecret.success) throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  return { channelId: configuration.channelId, channelSecret: channelSecret.data, environment: configuration.environment };
}
