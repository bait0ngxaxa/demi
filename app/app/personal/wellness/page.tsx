import type { Metadata } from "next";
import { createHash, randomUUID } from "node:crypto";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPersonalMeals } from "@/modules/meals/services/personal-meal-query-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { PersonalWellnessWorkspace } from "./personal-wellness-workspace";
import { listOwnPersonalExercises } from "@/modules/exercises/services/personal-exercise-query-service";
import { getOwnPersonalWeightGoal } from "@/modules/weight-goals/services/personal-weight-goal-query-service";
import { weightGoalBangkokToday } from "@/modules/weight-goals/domain/personal-weight-goal";

export const metadata: Metadata = { title: "สุขภาพ" };
export default async function PersonalWellnessPage(): Promise<React.JSX.Element> {
  await connection();
  let workspace: Parameters<typeof PersonalWellnessWorkspace>[0];
  let actorKey: string;
  try {
    const actor = await getProtectedApplicationActor();
    // Each domain resolves current persisted SELF independently; render no private sibling data on denial.
    const [mealPage, exercisePage, weightGoal] = await Promise.all([
      listOwnPersonalMeals(actor, {}),
      listOwnPersonalExercises(actor, {}),
      getOwnPersonalWeightGoal(actor),
    ]);
    actorKey = createHash("sha256").update(`personal-wellness:${actor.userId}:${actor.personId}`).digest("hex");
    workspace = {
      mealPage,
      exercisePage,
      weightGoal,
      today: weightGoalBangkokToday(new Date()),
      mealNonce: randomUUID(),
      exerciseNonce: randomUUID(),
      weightGoalNonce: randomUUID(),
    };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  return <PersonalWellnessWorkspace key={actorKey} {...workspace} />;
}
