import { z } from "zod";

export const lineIntentActionSchema = z.enum(["LINK", "UNLINK"]);
export const lineIntentRequestSchema = z.object({ action: lineIntentActionSchema });

export const lineIntentUseSchema = z.object({
  intentId: z.string().uuid(),
  challenge: z.string().min(40).max(128),
});

export const lineLinkRequestSchema = lineIntentUseSchema.extend({
  idToken: z.string().min(20).max(16_384),
  accessToken: z.string().min(20).max(16_384).optional(),
});

export const lineUnlinkRequestSchema = lineIntentUseSchema;

export const lineReachabilityRequestSchema = z.object({
  idToken: z.string().min(20).max(16_384),
  accessToken: z.string().min(20).max(16_384),
}).strict();

const webhookSourceSchema = z.object({
  type: z.string().min(1).max(40),
  userId: z.string().regex(/^U[0-9a-f]{32}$/iu).optional(),
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
