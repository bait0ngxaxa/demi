"use client";

import Link from "next/link";
import { createContext, useContext, useSyncExternalStore } from "react";

import {
  LINE_ACCOUNT_PATH,
  LINE_WORKSPACE_WEB_PATH,
  resolveLineAccountHref,
  resolveLineWorkspaceHref,
  type LiffBrowserContext,
} from "@/modules/line/domain/line-liff-browser";

import { getLiffBrowserContextSnapshot, subscribeLiffBrowserContext } from "./liff-browser-context-store";

/**
 * The Account LIFF URL built on the server by the canonical
 * `buildAccountLiffUrl()` (null when not configured). It is never derived from
 * request headers or client input.
 */
const AccountLiffUrlContext = createContext<string | null>(null);

export function LineAccountNavigationProvider({
  accountLiffUrl,
  children,
}: {
  accountLiffUrl: string | null;
  children: React.ReactNode;
}): React.JSX.Element {
  return <AccountLiffUrlContext.Provider value={accountLiffUrl}>{children}</AccountLiffUrlContext.Provider>;
}

function serverSnapshot(): LiffBrowserContext | null {
  return null;
}

/** Server rendering and the first hydration pass see no context (ordinary web routes). */
export function useLiffBrowserContext(): LiffBrowserContext | null {
  return useSyncExternalStore(subscribeLiffBrowserContext, getLiffBrowserContextSnapshot, serverSnapshot);
}

/**
 * Account destination for the current browser. Only the Workspace LIFF
 * switches to the Account LIFF URL. Presentation state, never authority.
 */
export function useLineAccountHref(): string {
  const accountLiffUrl = useContext(AccountLiffUrlContext);
  return resolveLineAccountHref({ context: useLiffBrowserContext(), accountLiffUrl });
}

/** Resolves a caller-provided href only when it is the Account route; any other href is returned unchanged. */
export function useLineAccountHrefFor(href: string): string {
  const accountHref = useLineAccountHref();
  return href === LINE_ACCOUNT_PATH ? accountHref : href;
}

/**
 * The single link to the LINE account screen from DEMI pages. A full-document
 * navigation either way: the Account page (ordinary route) or the Account LIFF
 * (LIFF-to-LIFF transition) initializes its own LIFF ID on load.
 */
export function LineAccountLink({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  const href = useLineAccountHref();
  return <a className={className} href={href}>{children}</a>;
}

/**
 * Leaves the Account screen for the DEMI work dashboard. Inside the Account
 * LIFF it opens the Workspace LIFF URL (server-built by
 * `buildWorkspaceLiffUrl()`), so the Workspace LIFF initializes with its own
 * ID; elsewhere it is the existing `/app` link. DEMI login and authorization
 * still apply at `/app`.
 */
export function LineWorkspaceLink({
  workspaceLiffUrl,
  webHref = LINE_WORKSPACE_WEB_PATH,
  className,
  children,
}: {
  workspaceLiffUrl: string | null;
  /** The ordinary web entry this link keeps outside the Account LIFF. */
  webHref?: "/" | typeof LINE_WORKSPACE_WEB_PATH;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const href = resolveLineWorkspaceHref({ context: useLiffBrowserContext(), workspaceLiffUrl });
  return href === LINE_WORKSPACE_WEB_PATH
    ? <Link href={webHref} className={className}>{children}</Link>
    : <a href={href} className={className}>{children}</a>;
}
