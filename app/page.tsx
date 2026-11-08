import type { Metadata } from "next";
import { connection } from "next/server";

import { getLineWorkspaceLiffId } from "@/lib/env/server";
import { resolveCurrentActorAccess } from "@/modules/auth/services/actor-context-service";
import { classifyLineWorkspaceLiffEntry } from "@/modules/line/domain/line-workspace-liff-entry";

import { WorkspaceLiffEntry } from "./workspace-liff-entry";

export const metadata: Metadata = {
  // A Workspace LIFF primary redirect carries LIFF credentials in the URL.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * `/` is both the ordinary web entry and the Workspace LIFF Endpoint URL. It
 * cannot answer with a server redirect: LIFF credentials arrive in the URL
 * fragment (invisible to the server) and must be consumed by `liff.init()`
 * before any navigation. Ordinary browsers continue to `/app` or `/login`
 * immediately; authorization stays with those routes.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  await connection();
  const entry = classifyLineWorkspaceLiffEntry(await searchParams);
  const access = await resolveCurrentActorAccess();
  const fallbackHref = access.status === "AUTHORIZED" ? "/app" : "/login";

  return (
    <WorkspaceLiffEntry
      mode={entry.status}
      liffId={getLineWorkspaceLiffId()}
      destination={entry.status === "LIFF" ? entry.destination : null}
      fallbackHref={fallbackHref}
    />
  );
}
