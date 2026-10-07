import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getLineMessagingEnv } from "@/lib/env/server";

export function verifyLineWebhookSignature(rawBody: Uint8Array, signature: string | null): boolean {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/u.test(signature)) return false;
  const { DEMI_LINE_MESSAGING_CHANNEL_SECRET } = getLineMessagingEnv();
  const expected = createHmac("sha256", DEMI_LINE_MESSAGING_CHANNEL_SECRET).update(rawBody).digest();
  const supplied = Buffer.from(signature, "base64");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
