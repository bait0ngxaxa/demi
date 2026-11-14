import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";

type ServiceCall<T> = (actor: ActorContext | null | undefined, input: unknown, dependencies?: object) => Promise<T>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** D1: one DONE row per activity of the stored Goal Plan, achieved on every target day. */
export async function fullPlanProgress(goalPlanId: string): Promise<Record<string, unknown>[]> {
  const items = await getPrisma().patientGoalItem.findMany({
    where: { goalPlanId },
    orderBy: { sortOrder: "asc" },
    select: { activityCode: true, targetDays: true },
  });

  return items.map((item) => ({ goalActivityCode: item.activityCode, status: "DONE", achievedDays: item.targetDays }));
}

async function latestProgramGoalPlanId(patientProgramId: string): Promise<string | null> {
  const plan = await getPrisma().patientGoalPlan.findFirst({
    where: { patientProgramId },
    orderBy: { roundNumber: "desc" },
    select: { id: true },
  });

  return plan?.id ?? null;
}

/**
 * D1/D2: a Program Follow-up names a Goal Plan of its Program and reports every activity of it. Tests of
 * other concerns leave both unset: an input without `sourceGoalPlanId` reports on the Program's latest
 * Goal Plan, and an empty progress list reports every activity of the plan at its target. A Program without
 * a Goal Plan stays without one, so the service refuses it as in production. Explicit fields win.
 */
export function withProgramGoalPlan<T>(service: ServiceCall<T>): ServiceCall<T> {
  return async (actor, input, dependencies) => {
    const fields = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : null;
    const programId = typeof fields?.patientProgramId === "string" && UUID.test(fields.patientProgramId)
      ? fields.patientProgramId.toLowerCase()
      : null;

    if (!fields || !programId) {
      return service(actor, input, dependencies);
    }

    const sourceGoalPlanId = typeof fields.sourceGoalPlanId === "string" && fields.sourceGoalPlanId
      ? fields.sourceGoalPlanId
      : await latestProgramGoalPlanId(programId);
    const progress = fields.activityProgress;
    const activityProgress = Array.isArray(progress) && progress.length === 0 && sourceGoalPlanId
      ? await fullPlanProgress(sourceGoalPlanId)
      : progress;

    return service(actor, { ...fields, sourceGoalPlanId, activityProgress }, dependencies);
  };
}
