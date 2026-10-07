import "server-only";

import { getLineLiffId, getLineLoginEnv } from "@/lib/env/server";
import { LineFailure } from "../domain/line-errors";

export type LineNavigationIntent =
  | "LINK_ACCOUNT"
  | "MANAGE_ACCOUNT"
  | "OPEN_PATIENT_WORKSPACE"
  | "OPEN_WORK_WORKSPACE"
  | "SWITCH_WORKSPACE";

const paths: Record<LineNavigationIntent, string> = {
  LINK_ACCOUNT: "/line/account?intent=LINK_ACCOUNT",
  MANAGE_ACCOUNT: "/line/account?intent=MANAGE_ACCOUNT",
  OPEN_PATIENT_WORKSPACE: "/app/personal",
  OPEN_WORK_WORKSPACE: "/app",
  SWITCH_WORKSPACE: "/line/account?intent=SWITCH_WORKSPACE",
};

export function buildLineIntentUrl(intent: LineNavigationIntent): string {
  const { DEMI_LINE_PUBLIC_ORIGIN } = getLineLoginEnv();
  const path = paths[intent];
  const liffId = getLineLiffId();
  if ((intent === "LINK_ACCOUNT" || intent === "MANAGE_ACCOUNT" || intent === "SWITCH_WORKSPACE") && !liffId) {
    throw new LineFailure("LINE_CONFIGURATION_MISSING");
  }
  if (liffId && (intent === "LINK_ACCOUNT" || intent === "MANAGE_ACCOUNT" || intent === "SWITCH_WORKSPACE")) {
    return `https://liff.line.me/${liffId}${path}`;
  }
  return new URL(path, DEMI_LINE_PUBLIC_ORIGIN).toString();
}
