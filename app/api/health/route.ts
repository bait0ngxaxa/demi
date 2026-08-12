import { getPrisma } from "@/lib/db/prisma";

export async function GET(): Promise<Response> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
