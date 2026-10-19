export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness: the process answers. No database, configuration or provider access. */
export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
