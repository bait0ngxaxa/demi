import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { workAppointmentQuerySchema } from "@/modules/appointments/schemas/work-appointment-schemas";
import {
  listWorkAppointments,
  type WorkAppointmentPage,
} from "@/modules/appointments/services/work-appointment-query-service";
import type { WorkAppointmentQueryInput } from "@/modules/appointments/schemas/work-appointment-schemas";
import { getPendingActions, type PendingActionIndicator } from "@/modules/pending-actions/services/pending-action-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { WorkAppointmentView, type WorkAppointmentPendingScope } from "./work-appointment-view";

export const metadata: Metadata = {
  title: "รายการนัดหมาย",
};

type WorkAppointmentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

async function loadPage(
  actor: Awaited<ReturnType<typeof getProtectedApplicationActor>>,
  input: WorkAppointmentQueryInput,
): Promise<WorkAppointmentPage> {
  try {
    return await listWorkAppointments(actor, input);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

/**
 * The navigation indicator aggregates every authorized Hospital; this reuses the same request-cached evaluation so the
 * page can show which Hospitals contribute. Only Hospitals also in this page's authorized scopes are named. UNAVAILABLE
 * shows nothing here (the shell states it); a denial keeps this page's protected handling, never an empty scope.
 */
async function loadPendingScope(
  actor: Awaited<ReturnType<typeof getProtectedApplicationActor>>,
  page: WorkAppointmentPage,
): Promise<WorkAppointmentPendingScope | null> {
  let indicator: PendingActionIndicator | undefined;
  try {
    const result = await getPendingActions(actor.userId);
    if (result.status !== "READY") return null;
    indicator = result.indicators.find(({ navigationHref }) => navigationHref === "/app/appointments");
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  const queue = indicator?.hospitalQueue;
  if (!indicator || !queue || queue.tab !== page.tab) return null;
  const counts = new Map(queue.hospitals.map(({ hospitalId, count }) => [hospitalId, count]));
  const hospitals = page.hospitals
    .map(({ hospitalId, hospitalName }) => ({ hospitalId, hospitalName, count: counts.get(hospitalId) ?? 0 }))
    .filter(({ hospitalId, count }) => counts.has(hospitalId) && count > 0);
  return { tab: queue.tab, totalCount: hospitals.reduce((total, { count }) => total + count, 0), hospitals };
}

export default async function WorkAppointmentPage({
  searchParams,
}: WorkAppointmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const params = await searchParams;
  const rawQuery: Record<string, string | undefined> = {
    hospitalId: firstSearchParam(params.hospitalId),
    tab: firstSearchParam(params.tab),
    dateFrom: firstSearchParam(params.dateFrom),
    dateTo: firstSearchParam(params.dateTo),
    status: firstSearchParam(params.status),
    type: firstSearchParam(params.type),
    locationType: firstSearchParam(params.locationType),
    responsibleUserId: firstSearchParam(params.responsibleUserId),
    awaitingOsmAcceptance: firstSearchParam(params.awaitingOsmAcceptance),
    unassignedOsm: firstSearchParam(params.unassignedOsm),
    unassigned: firstSearchParam(params.unassigned),
    cursor: firstSearchParam(params.cursor),
  };
  const parsed = workAppointmentQuerySchema.safeParse(rawQuery);
  const input: WorkAppointmentQueryInput = parsed.success
    ? parsed.data
    : {
        hospitalId: rawQuery.hospitalId,
        tab: rawQuery.tab === "HISTORY" || rawQuery.tab === "PENDING_REQUESTS" || rawQuery.tab === "AWAITING_MY_ACCEPTANCE" ? rawQuery.tab : "UPCOMING",
      };
  let queryError: string | null = parsed.success
    ? null
    : "ตัวกรองบางรายการไม่ถูกต้อง ระบบแสดงรายการนัดหมายเริ่มต้นแล้ว";

  let page: WorkAppointmentPage;
  try {
    page = await loadPage(actor, input);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      queryError = "กรุณาตรวจสอบช่วงวันที่ แล้วลองค้นหาอีกครั้ง";
      page = await loadPage(actor, {
        hospitalId: input.hospitalId,
        tab: input.tab,
      });
    } else {
      throw error;
    }
  }

  return <WorkAppointmentView page={page} pendingScope={await loadPendingScope(actor, page)} queryError={queryError} />;
}
