import { redirect } from "next/navigation";
import { connection } from "next/server";

import { resolveCurrentActorAccess } from "@/modules/auth/services/actor-context-service";

export default async function Home() {
  await connection();
  const access = await resolveCurrentActorAccess();
  redirect(access.status === "AUTHORIZED" ? "/app" : "/login");
}
