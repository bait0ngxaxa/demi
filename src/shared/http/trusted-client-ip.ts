import { isIP } from "node:net";

/** Nginx overwrites this header after resolving Cloudflare's trusted real IP. */
export const TRUSTED_PROXY_CLIENT_IP_HEADER = "x-real-ip";

export function trustedClientIpAddress(headers: Pick<Headers, "get">): string | null {
  const value = headers.get(TRUSTED_PROXY_CLIENT_IP_HEADER)?.trim();
  return value && isIP(value) ? value : null;
}
