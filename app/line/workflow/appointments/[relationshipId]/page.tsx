import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { lineWorkflowAppointmentLinks } from "@/modules/line/domain/line-workflow-routes";
import { loadLineWorkflowAppointmentHistory } from "@/modules/line/transport/workflow-scoped-appointments";

import { PatientSelfAppointmentHistoryContent } from "../../../../app/personal/patient-self-appointment-content";
import { LineWorkflowScopedFailure, lineWorkflowScopedSecondaryButtonClass } from "../line-workflow-scoped-states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "นัดหมายใน LINE",
};

type LineWorkflowAppointmentHistoryPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function LineWorkflowAppointmentHistoryPage({
  params,
  searchParams,
}: LineWorkflowAppointmentHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  const query = await searchParams;
  const requestedPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const result = await loadLineWorkflowAppointmentHistory(relationshipId, requestedPage);
  if (result.status === "DENIED") {
    return <LineWorkflowScopedFailure retryHref={lineWorkflowAppointmentLinks.history(relationshipId)} state={result.state} />;
  }

  return (
    <>
      <header className="mt-5 border-b border-line pb-6">
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">นัดหมาย</h1>
        <p className="type-readable mt-3 text-base text-muted">รายการนัดหมายของโรงพยาบาลนี้ เรียงจากวันนัดล่าสุด</p>
      </header>
      <PatientSelfAppointmentHistoryContent history={result.data} links={lineWorkflowAppointmentLinks} prefetchMore={false} />
      <nav aria-label="กลับจากรายการนัดหมาย" className="mt-6">
        <Link className={lineWorkflowScopedSecondaryButtonClass} href={lineWorkflowAppointmentLinks.root} prefetch={false}>
          กลับไปเลือกโรงพยาบาล
        </Link>
      </nav>
    </>
  );
}
