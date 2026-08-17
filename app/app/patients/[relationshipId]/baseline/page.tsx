import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPatientBaselinePageContext } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientBaselineForm } from "./baseline-form";
import { PatientBaselineView } from "./baseline-view";

export const metadata: Metadata = {
  title: "ข้อมูลตั้งต้น",
};

type PatientBaselinePageProps = {
  params: Promise<{ relationshipId: string }>;
};

async function resolveActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

export default async function PatientBaselinePage({
  params,
}: PatientBaselinePageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let context;

  try {
    context = await getPatientBaselinePageContext(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  if (context.baseline) {
    return <PatientBaselineView baseline={context.baseline} patient={context.patient} />;
  }

  if (context.canCreate) {
    return <PatientBaselineForm patient={context.patient} relationshipId={relationshipId} />;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "ข้อมูลตั้งต้น" },
        ]}
        description="ข้อมูลตั้งต้นของผู้ป่วยภายใต้ Patient–Hospital relationship นี้"
        title="ข้อมูลตั้งต้น"
      />
      <div className="pt-8">
        <Panel>
          <Alert variant="info">
            <p className="font-semibold">ยังไม่มีข้อมูลตั้งต้น</p>
            <p className="mt-1">บัญชีนี้มีสิทธิ์อ่านข้อมูลในขอบเขตนี้ แต่ยังไม่มีสิทธิ์บันทึกข้อมูลตั้งต้น</p>
          </Alert>
        </Panel>
      </div>
    </div>
  );
}
