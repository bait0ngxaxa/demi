import { appendFileSync } from "node:fs";

const originalFetch = globalThis.fetch.bind(globalThis);
const LINE_API_ORIGIN = "https://api.line.me";
const VERIFY_PATH = "/oauth2/v2.1/verify";

globalThis.fetch = async (input, init) => {
  let url;
  try {
    url = new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return new Response(null, { status: 502 });
  }

  if (url.origin === LINE_API_ORIGIN) {
    if (url.pathname !== VERIFY_PATH || process.env.DEMI_LINE_WORKFLOW_TEST_PROVIDER_MOCK !== "enabled") {
      return Response.json({ error: "provider_not_stubbed" }, { status: 503 });
    }

    const body = init?.body;
    const form = new URLSearchParams(typeof body === "string" ? body : body?.toString() ?? "");
    const expectedSubject = process.env.DEMI_LINE_WORKFLOW_TEST_PROVIDER_SUBJECT;
    const expectedAudience = process.env.DEMI_LINE_MINI_APP_CHANNEL_ID;
    if (init?.method !== "POST" || form.get("id_token") !== "synthetic-mini-id-token" ||
        !expectedSubject || form.get("client_id") !== expectedAudience) {
      return Response.json({ error: "synthetic_proof_rejected" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const logPath = process.env.DEMI_LINE_WORKFLOW_TEST_PROVIDER_CALL_LOG;
    if (!logPath) return Response.json({ error: "test_log_missing" }, { status: 503 });
    appendFileSync(logPath, "verify\n", "utf8");

    return Response.json({
      iss: "https://access.line.me",
      sub: expectedSubject,
      aud: expectedAudience,
      exp: now + 3_600,
      iat: now - 1,
    });
  }

  const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const allowedAuthOrigin = authUrl ? new URL(authUrl).origin : "";
  if (url.origin !== allowedAuthOrigin) {
    return Response.json({ error: "external_fetch_blocked_in_runtime_smoke" }, { status: 502 });
  }

  return originalFetch(input, init);
};
