import {
  LIFF_PLATFORM_PARAMETERS,
  LINE_WEB_NAVIGATION_PATHS,
  MAX_PLATFORM_PARAMETER_LENGTH,
} from "./line-navigation-intents";

/**
 * Workspace LIFF (Endpoint URL = canonical public origin root). A LIFF URL
 * `https://liff.line.me/<id>/<path>?<query>` reaches `/` as the primary redirect
 * with `liff.state=/<path>?<query>`; `liff.init()` then performs the secondary
 * redirect to that same-origin path. Only the fixed destinations below are ever
 * emitted or followed. Navigation is transport, never authority: every
 * destination still applies DEMI authentication and server authorization.
 */
export const LINE_WORKSPACE_LIFF_DESTINATIONS = [
  ...new Set<string>(Object.values(LINE_WEB_NAVIGATION_PATHS)),
] as readonly string[];

export type LineWorkspaceLiffEntry =
  /** No LIFF platform parameter: an ordinary browser request for `/`. */
  | { status: "ORDINARY" }
  /** A LIFF primary redirect or LINE login return; `destination` null means a bare LIFF URL. */
  | { status: "LIFF"; destination: string | null }
  | { status: "NAVIGATION_INVALID" };

function normalizeLiffState(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

/**
 * Classifies a request for `/`. Once any LIFF platform parameter is present,
 * every parameter must be a bounded LIFF platform parameter and `liff.state`
 * must be absent, empty or exactly one allowlisted destination. Anything else
 * is rejected before the SDK could follow it.
 */
export function classifyLineWorkspaceLiffEntry(
  query: Readonly<Record<string, string | string[] | undefined>>,
): LineWorkspaceLiffEntry {
  const entries = Object.entries(query).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined);
  if (!entries.some(([name]) => LIFF_PLATFORM_PARAMETERS.has(name))) return { status: "ORDINARY" };

  let destination: string | null = null;
  for (const [name, value] of entries) {
    if (Array.isArray(value) || !LIFF_PLATFORM_PARAMETERS.has(name) || value.length > MAX_PLATFORM_PARAMETER_LENGTH) {
      return { status: "NAVIGATION_INVALID" };
    }
    if (name !== "liff.state" || value === "") continue;
    const state = normalizeLiffState(value);
    if (!LINE_WORKSPACE_LIFF_DESTINATIONS.includes(state)) return { status: "NAVIGATION_INVALID" };
    destination = state;
  }
  return { status: "LIFF", destination };
}

/** Fragment keys LIFF adds to a primary redirect; these are credentials that only `liff.init()` may consume. */
const LIFF_CREDENTIAL_FRAGMENT_KEYS = ["access_token", "context_token", "feature_token", "id_token"] as const;

/**
 * A bare LIFF URL has no query, so the server cannot see it; only the browser
 * can detect the credential fragment. Never log or forward the fragment.
 */
export function hasLiffCredentialFragment(hash: string): boolean {
  if (!hash || hash === "#") return false;
  const parameters = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return LIFF_CREDENTIAL_FRAGMENT_KEYS.some((key) => parameters.has(key));
}
