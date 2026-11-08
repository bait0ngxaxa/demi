import {
  isLinePlatformParameterName,
  LIFF_LOGIN_RETURN_PARAMETERS,
  LINE_WEB_NAVIGATION_PATHS,
  MAX_PLATFORM_PARAMETER_COUNT,
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
  /** No LINE platform parameter: an ordinary browser request for `/`. */
  | { status: "ORDINARY" }
  /** A LIFF primary redirect or LINE login return; `destination` null means a bare LIFF URL. */
  | { status: "LIFF"; destination: string | null }
  | { status: "NAVIGATION_INVALID" };

/** Far above the longest destination; a larger `liff.state` is never DEMI navigation. */
const MAX_APPLICATION_NAVIGATION_LENGTH = 256;

/**
 * Application navigation validation. `liff.state` is the only value that can
 * name a destination, and it must be absent/empty or exactly one allowlisted
 * destination (the SDK may omit the leading slash). No decoding,
 * normalization or prefix matching happens, so encoded traversal, external,
 * protocol-relative and resource-specific values never match.
 */
export function resolveWorkspaceLiffDestination(liffState: string): { valid: true; destination: string | null } | { valid: false } {
  if (liffState === "") return { valid: true, destination: null };
  if (liffState.length > MAX_APPLICATION_NAVIGATION_LENGTH) return { valid: false };
  const state = liffState.startsWith("/") ? liffState : `/${liffState}`;
  return LINE_WORKSPACE_LIFF_DESTINATIONS.includes(state) ? { valid: true, destination: state } : { valid: false };
}

/** LINE-owned parameters at the Workspace Endpoint: `liff.*`, `lineAppVersion` and LINE Login return markers. */
function isWorkspaceEntryPlatformParameter(name: string): boolean {
  return isLinePlatformParameterName(name) || LIFF_LOGIN_RETURN_PARAMETERS.has(name);
}

/**
 * Classifies a request for `/` in two separate steps.
 *
 * Platform parameters (any bounded `liff.*` name, Android `lineAppVersion`,
 * LINE Login return markers) are recognized and left for `liff.init()`; they
 * are never interpreted except `liff.state`, and never rewritten or removed
 * here. Repeated bookkeeping parameters are tolerated because they cannot
 * name a destination.
 *
 * Application navigation is then validated strictly: `liff.state` must be a
 * single allowlisted destination, and a non-platform parameter on a LIFF entry
 * (DEMI's builder never emits one) rejects the entry, so untrusted parameters
 * can never add or change a destination.
 */
export function classifyLineWorkspaceLiffEntry(
  query: Readonly<Record<string, string | string[] | undefined>>,
): LineWorkspaceLiffEntry {
  const entries = Object.entries(query).filter((entry): entry is [string, string | string[]] => entry[1] !== undefined);
  if (!entries.some(([name]) => isWorkspaceEntryPlatformParameter(name))) return { status: "ORDINARY" };
  if (entries.length > MAX_PLATFORM_PARAMETER_COUNT) return { status: "NAVIGATION_INVALID" };

  let destination: string | null = null;
  for (const [name, value] of entries) {
    if (!isWorkspaceEntryPlatformParameter(name)) return { status: "NAVIGATION_INVALID" };
    const values = Array.isArray(value) ? value : [value];
    if (values.length > MAX_PLATFORM_PARAMETER_COUNT || values.some((item) => item.length > MAX_PLATFORM_PARAMETER_LENGTH)) {
      return { status: "NAVIGATION_INVALID" };
    }
    if (name !== "liff.state") continue;
    // The only navigation-bearing parameter: one value, exactly allowlisted.
    if (Array.isArray(value)) return { status: "NAVIGATION_INVALID" };
    const resolved = resolveWorkspaceLiffDestination(value);
    if (!resolved.valid) return { status: "NAVIGATION_INVALID" };
    destination = resolved.destination;
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
