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
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { WorkAppointmentView } from "./work-appointment-view";

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
    cursor: firstSearchParam(params.cursor),
  };
  const parsed = workAppointmentQuerySchema.safeParse(rawQuery);
  const input: WorkAppointmentQueryInput = parsed.success
    ? parsed.data
    : {
        hospitalId: rawQuery.hospitalId,
        tab: rawQuery.tab === "HISTORY" || rawQuery.tab === "PENDING_REQUESTS" ? rawQuery.tab : "UPCOMING",
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

  return <WorkAppointmentView page={page} queryError={queryError} />;
}
