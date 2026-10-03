import type { Metadata } from "next";
import { createHash, randomUUID } from "node:crypto";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPersonalMeals } from "@/modules/meals/services/personal-meal-query-service";
import { mealBangkokToday } from "@/modules/meals/domain/personal-meal";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { PersonalMealWorkspace } from "./personal-meal-workspace";

export const metadata: Metadata = { title: "สุขภาพ · อาหาร" };
export default async function PersonalWellnessPage(): Promise<React.JSX.Element> {
  await connection();
  let workspace: Parameters<typeof PersonalMealWorkspace>[0];
  let actorKey: string;
  try {
    const actor = await getProtectedApplicationActor();
    const page = await listOwnPersonalMeals(actor, {});
    actorKey = createHash("sha256").update(`personal-meal:${actor.userId}:${actor.personId}`).digest("hex");
    workspace = { initialPage: page, today: mealBangkokToday(new Date()), initialNonce: randomUUID() };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  return <PersonalMealWorkspace key={actorKey} {...workspace} />;
}
