import "server-only";

import { createHmac } from "node:crypto";

import { getLineLoginEnv } from "@/lib/env/server";

export const LINE_FINGERPRINT_NAMESPACE = "DEMI_LINE_SUBJECT_V1";

export function createLineSubjectFingerprint(subject: string): {
  fingerprint: string;
  keyId: string;
} {
  const { IDENTITY_HASH_SECRET } = getLineLoginEnv();
  const fingerprint = createHmac("sha256", IDENTITY_HASH_SECRET)
    .update(`${LINE_FINGERPRINT_NAMESPACE}:${subject}`)
    .digest("hex");
  const keyId = createHmac("sha256", IDENTITY_HASH_SECRET)
    .update("DEMI_LINE_FINGERPRINT_KEY_ID_V1")
    .digest("hex")
    .slice(0, 24);
  return { fingerprint, keyId };
}
