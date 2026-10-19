import type { Metadata } from "next";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import {
  classifyLineWorkflowEntry,
  LINE_WORKFLOW_LOGIN_RETURN_PATH,
} from "@/modules/line/domain/line-navigation-intents";
import {
  getLineMiniAppConfiguration,
  type LineMiniAppConfiguration,
} from "@/modules/line/services/line-mini-app-configuration";

import { LineWorkflowClient, type LineWorkflowShellStatus } from "./line-workflow-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "นัดหมายผ่าน LINE",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * MINI App initialization shell. It renders no Patient data, calls no Patient
 * service, and treats successful LIFF initialization as UI state, not authority.
 */
export default async function LineWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  await connection();
  const entry = classifyLineWorkflowEntry(await searchParams);
  let configuration: LineMiniAppConfiguration | null = null;
  try {
    configuration = getLineMiniAppConfiguration();
  } catch {
    configuration = null;
  }
  // Invalid platform state is rejected before LIFF could follow it.
  const status: LineWorkflowShellStatus = entry.status !== "VALID" ? entry.status : configuration ? "READY" : "UNAVAILABLE";

  return (
    <LineWorkflowClient
      key={randomUUID()}
      status={status}
      liffId={configuration?.liffId ?? null}
      loginHref={buildLoginReturnHref(LINE_WORKFLOW_LOGIN_RETURN_PATH)}
      lineLoginRedirectUri={configuration ? `${configuration.origin}${LINE_WORKFLOW_LOGIN_RETURN_PATH}` : ""}
    />
  );
}
