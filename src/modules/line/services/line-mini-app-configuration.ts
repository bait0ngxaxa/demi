import "server-only";

import { z } from "zod";

import { getApplicationPublicOrigin } from "@/lib/env/server";

import { LINE_WORKFLOW_GATEWAY_PATH } from "../domain/line-navigation-intents";
import { LineWorkflowFailure } from "../domain/line-workflow-errors";

const channelIdSchema = z.string().regex(/^\d{4,20}$/u);
const liffIdSchema = z.string().regex(/^\d{4,20}-[A-Za-z0-9]+$/u);
const referenceSchema = z.string().regex(/^[A-Za-z0-9._:/-]{1,128}$/u);

export const LINE_MINI_APP_ENVIRONMENTS = ["DEVELOPING", "REVIEW", "PUBLISHED"] as const;
export type LineMiniAppEnvironment = (typeof LINE_MINI_APP_ENVIRONMENTS)[number];

/** The single trusted tuple for this deployment. Public IDs are identifiers, not authority. */
export type LineMiniAppConfiguration = {
  environment: LineMiniAppEnvironment;
  /** Expected ID-token audience; never derived from the LIFF ID or a request. */
  channelId: string;
  liffId: string;
  origin: string;
  endpointUrl: string;
  deploymentReference: string;
};

/**
 * Operator-owned server configuration. Missing or invalid values disable only
 * the MINI workflow; Account LIFF and ordinary DEMI web do not read this.
 */
export function getLineMiniAppConfiguration(): LineMiniAppConfiguration {
  try {
    const environment = z.enum(LINE_MINI_APP_ENVIRONMENTS).parse(process.env.DEMI_LINE_MINI_APP_ENVIRONMENT);
    const channelId = channelIdSchema.parse(process.env.DEMI_LINE_MINI_APP_CHANNEL_ID);
    const liffId = liffIdSchema.parse(process.env.DEMI_LINE_MINI_APP_LIFF_ID);
    const deploymentReference = referenceSchema.parse(process.env.DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE);
    const origin = getApplicationPublicOrigin();
    const endpointUrl = `${origin}${LINE_WORKFLOW_GATEWAY_PATH}`;
    // LINE serves MINI Apps over HTTPS only; no local-development HTTP exception here.
    if (!origin.startsWith("https://") || process.env.DEMI_LINE_MINI_APP_ENDPOINT_URL !== endpointUrl) throw new Error();
    // Account and MINI audiences stay separate; equality signals a misconfigured tuple.
    if (channelId === process.env.DEMI_LINE_LOGIN_CHANNEL_ID?.trim() ||
        liffId === process.env.NEXT_PUBLIC_DEMI_LINE_LIFF_ID?.trim()) throw new Error();
    return { environment, channelId, liffId, origin, endpointUrl, deploymentReference };
  } catch {
    throw new LineWorkflowFailure("MINI_CONFIGURATION_UNAVAILABLE");
  }
}

/**
 * Activation fence owned by LINE integration. Only the literal "true" enables
 * the verification orchestration; unset or any other value stays disabled.
 * Phase B1 never issues a workflow context even when this returns true.
 */
export function isLineMiniAppWorkflowEnabled(): boolean {
  return process.env.DEMI_LINE_MINI_APP_WORKFLOW_ENABLED === "true";
}
