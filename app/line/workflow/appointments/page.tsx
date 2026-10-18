import type { Metadata } from "next";
import { connection } from "next/server";

import { lineWorkflowAppointmentLinks } from "@/modules/line/domain/line-workflow-routes";
import { loadLineWorkflowAppointmentRelationships } from "@/modules/line/transport/workflow-scoped-appointments";

import { PatientSelfRelationshipNavigation } from "../../../app/personal/patient-self-relationship-navigation";
import { LineWorkflowScopedFailure } from "./line-workflow-scoped-states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "นัดหมายใน LINE",
};

export default async function LineWorkflowAppointmentRelationshipsPage(): Promise<React.JSX.Element> {
  await connection();
  const result = await loadLineWorkflowAppointmentRelationships();
  if (result.status === "DENIED") {
    return <LineWorkflowScopedFailure retryHref={lineWorkflowAppointmentLinks.root} state={result.state} />;
  }

  return (
    <>
      <header className="mt-5">
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">นัดหมาย</h1>
        <p className="type-readable mt-3 text-base text-muted">เลือกโรงพยาบาลเพื่อดูรายการนัดหมายในบริบทนั้น</p>
      </header>
      <PatientSelfRelationshipNavigation
        area="appointments"
        emptyMessage="เมื่อมีข้อมูลความสัมพันธ์กับโรงพยาบาล รายการนัดหมายจะปรากฏที่นี่"
        hrefFor={lineWorkflowAppointmentLinks.history}
        relationships={result.data}
      />
    </>
  );
}
