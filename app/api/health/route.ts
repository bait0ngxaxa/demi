import { getApplicationReadiness } from "@/lib/health/application-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness: database reachable, shipped migrations applied, core configuration valid. Booleans only. `checks.jitOff`
 * is reported but advisory: it never turns the response into 503.
 */
export async function GET(): Promise<Response> {
  const { ready, checks } = await getApplicationReadiness();
  return Response.json(
    { status: ready ? "ok" : "unavailable", checks },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
