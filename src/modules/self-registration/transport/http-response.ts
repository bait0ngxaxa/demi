import { trustedClientIpAddress } from "@/shared/http/trusted-client-ip";

export const PUBLIC_SELF_REGISTRATION_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json; charset=utf-8",
} as const;

const MAX_PUBLIC_SELF_REGISTRATION_BODY_BYTES = 4 * 1024;

export function publicSelfRegistrationJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: PUBLIC_SELF_REGISTRATION_HEADERS });
}

export function getTrustedClientIpAddress(request: Request): string | null {
  return trustedClientIpAddress(request.headers);
}

export async function readBoundedJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("invalid_body");

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_PUBLIC_SELF_REGISTRATION_BODY_BYTES) {
      throw new Error("invalid_body");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_PUBLIC_SELF_REGISTRATION_BODY_BYTES) {
      await reader.cancel();
      throw new Error("invalid_body");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new Error("invalid_body");
  }
}
