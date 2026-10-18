import { z } from "zod";

import { LINE_WORKFLOW_INTENT } from "../domain/line-navigation-intents";

export const lineIntentActionSchema = z.enum(["LINK", "UNLINK"]);
export const lineIntentRequestSchema = z.object({ action: lineIntentActionSchema }).strict();

export const lineIntentUseSchema = z.object({
  intentId: z.string().uuid(),
  challenge: z.string().min(40).max(128),
});

export const lineLinkRequestSchema = lineIntentUseSchema.extend({
  idToken: z.string().min(20).max(16_384),
  accessToken: z.string().min(20).max(16_384).optional(),
}).strict();

export const lineUnlinkRequestSchema = lineIntentUseSchema.extend({
  accessToken: z.string().min(20).max(8192).optional(),
  miniAccessToken: z.string().min(20).max(8192).optional(),
}).strict();

export const lineRecoveryRequestSchema = lineIntentUseSchema.extend({
  idToken: z.string().min(20).max(16_384),
  riskAcknowledged: z.literal(true),
  manualReviews: z.record(z.string().uuid(), z.enum(["REMOVED", "NOT_LISTED", "UNDETERMINED"]))
    .refine((value) => Object.keys(value).length >= 1),
}).strict();

export const lineReachabilityRequestSchema = z.object({
  idToken: z.string().min(20).max(16_384),
  accessToken: z.string().min(20).max(16_384),
}).strict();

/** Only the finite intent and transient proof; identity, targets and resources are rejected. */
export const lineWorkflowVerifyRequestSchema = z.object({
  intent: z.literal(LINE_WORKFLOW_INTENT),
  idToken: z.string().min(20).max(16_384),
}).strict();

export const lineUserIdSchema = z.string().regex(/^U[0-9a-f]{32}$/iu);

const webhookSourceSchema = z.object({
  type: z.string().min(1).max(40),
  userId: lineUserIdSchema.optional(),
}).passthrough();

export const lineWebhookEventSchema = z.object({
  type: z.string().min(1).max(80),
  webhookEventId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u),
  timestamp: z.number().int().nonnegative().safe(),
  source: webhookSourceSchema.optional(),
  replyToken: z.string().optional(),
  postback: z.object({
    data: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(),
  }).passthrough().optional(),
}).passthrough();

export const lineWebhookEnvelopeSchema = z.object({
  destination: z.string().regex(/^U[0-9a-f]{32}$/iu),
  events: z.array(z.unknown()),
}).passthrough();

export type LineIntentActionInput = z.infer<typeof lineIntentActionSchema>;
export type LineIntentUseInput = z.infer<typeof lineIntentUseSchema>;
