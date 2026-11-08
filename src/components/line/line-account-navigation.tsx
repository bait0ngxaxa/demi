"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import {
  isWorkspaceLiffContext,
  LINE_ACCOUNT_PATH,
  resolveLineAccountHref,
} from "@/modules/line/domain/line-liff-browser";

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

function subscribe(): () => void {
  // The browser context cannot change within a document.
  return () => undefined;
}

export function readWorkspaceLiffBrowserContext(): boolean {
  try {
    return isWorkspaceLiffContext({ userAgent: window.navigator.userAgent, store: window.sessionStorage });
  } catch {
    return false;
  }
}

function serverSnapshot(): boolean {
  return false;
}

/**
 * Account destination for the current browser. Server rendering and the first
 * hydration pass use the ordinary route; only the Workspace LIFF browser
 * switches to the Account LIFF URL. Presentation state, never authority.
 */
export function useLineAccountHref(): string {
  const accountLiffUrl = useContext(AccountLiffUrlContext);
  const workspaceLiffContext = useSyncExternalStore(subscribe, readWorkspaceLiffBrowserContext, serverSnapshot);
  return resolveLineAccountHref({ workspaceLiffContext, accountLiffUrl });
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
