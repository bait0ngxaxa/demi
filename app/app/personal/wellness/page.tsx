import type { Metadata } from "next";
import { createHash, randomUUID } from "node:crypto";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPersonalMeals } from "@/modules/meals/services/personal-meal-query-service";
import { mealBangkokToday } from "@/modules/meals/domain/personal-meal";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { PersonalWellnessWorkspace } from "./personal-wellness-workspace";
import { listOwnPersonalExercises } from "@/modules/exercises/services/personal-exercise-query-service";

export const metadata: Metadata = { title: "สุขภาพ" };
export default async function PersonalWellnessPage(): Promise<React.JSX.Element> {
  await connection();
  let workspace: Parameters<typeof PersonalWellnessWorkspace>[0];
  let actorKey: string;
  try {
    const actor = await getProtectedApplicationActor();
    // Both domains resolve current persisted SELF independently; render neither on denial.
    const [mealPage, exercisePage] = await Promise.all([listOwnPersonalMeals(actor, {}), listOwnPersonalExercises(actor, {})]);
    actorKey = createHash("sha256").update(`personal-wellness:${actor.userId}:${actor.personId}`).digest("hex");
    workspace = { mealPage, exercisePage, today: mealBangkokToday(new Date()), mealNonce: randomUUID(), exerciseNonce: randomUUID() };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  return <PersonalWellnessWorkspace key={actorKey} {...workspace} />;
}
