import "server-only";

import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { LineFailure } from "../domain/line-errors";

export type LineNavigationIntent =
  | "LINK_ACCOUNT"
  | "MANAGE_ACCOUNT"
  | "OPEN_PATIENT_WORKSPACE"
  | "OPEN_WORK_WORKSPACE"
  | "SWITCH_WORKSPACE";

function isAccountIntent(
  intent: LineNavigationIntent,
): intent is "LINK_ACCOUNT" | "MANAGE_ACCOUNT" | "SWITCH_WORKSPACE" {
  return intent === "LINK_ACCOUNT" || intent === "MANAGE_ACCOUNT" || intent === "SWITCH_WORKSPACE";
}

const paths: Record<Exclude<LineNavigationIntent, "LINK_ACCOUNT" | "MANAGE_ACCOUNT" | "SWITCH_WORKSPACE">, string> = {
  OPEN_PATIENT_WORKSPACE: "/app/personal",
  OPEN_WORK_WORKSPACE: "/app",
};

export function buildLineIntentUrl(intent: LineNavigationIntent): string {
  const { DEMI_LINE_PUBLIC_ORIGIN } = getLineLoginEnv();
  const liffId = getLineLiffId();
  if (isAccountIntent(intent)) {
    if (!liffId) throw new LineFailure("LINE_CONFIGURATION_MISSING");
    // The LIFF Endpoint URL already points to /line/account. Do not append that path again.
    return `https://liff.line.me/${liffId}`;
  }
  return new URL(paths[intent], DEMI_LINE_PUBLIC_ORIGIN).toString();
}
