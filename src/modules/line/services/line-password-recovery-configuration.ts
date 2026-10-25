import "server-only";

import { getLineLiffId, getLineLoginEnv, getLineMessagingPushEnv } from "@/lib/env/server";

/** Checks local server configuration only; it does not contact LINE or prove provider connectivity. */
export function isLinePasswordRecoveryRequestConfigured(): boolean {
  if (!getLineLiffId()) return false;

  try {
    getLineLoginEnv();
    getLineMessagingPushEnv();
    return true;
  } catch {
    return false;
  }
}

/** Checks the configuration needed to verify and complete an already-issued recovery link. */
export function isLinePasswordRecoveryCompletionConfigured(): boolean {
  if (!getLineLiffId()) return false;

  try {
    getLineLoginEnv();
    return true;
  } catch {
    return false;
  }
}
