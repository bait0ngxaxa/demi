import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { decidePatientOsmAssignmentPolicy } from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPatientDirectoryDetail } from "@/modules/patient-directory/services/patient-directory-query-service";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientProfileView } from "./patient-profile-view";

export const metadata: Metadata = {
  title: "รายละเอียดผู้ป่วย",
};

type PatientDetailPageProps = {
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

export default async function PatientDetailPage({
  params,
}: PatientDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let patient;

  try {
    patient = await getPatientDirectoryDetail(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  const canManageAssignment = decidePatientOsmAssignmentPolicy({
    actor,
    capability: "patient:assign-osm",
    targetHospitalId: patient.hospital.id,
  }).allowed;
  const backHref = hasDirectHospitalPatientReadScope(actor, patient.hospital.id)
    ? `/app/patients?hospitalId=${encodeURIComponent(patient.hospital.id)}`
    : "/app/patients/assigned";

  return (
    <div className="max-w-4xl">
      <PageHeader
        breadcrumbs={[
          { href: backHref, label: "ผู้ป่วย" },
          { label: "รายละเอียดผู้ป่วย" },
        ]}
        description="แสดงข้อมูลพื้นฐานที่จำเป็นต่อการตรวจสอบผู้ป่วยในบริบทของโรงพยาบาลนี้"
        title="รายละเอียดผู้ป่วย"
      />

      <div className="pt-8">
        <Panel>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
            {patient.displayName}
          </h2>
          <dl className="mt-7 divide-y divide-border border-y border-border">
            <div className="grid gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm font-semibold text-text-muted">HN ของโรงพยาบาลนี้</dt>
              <dd className="text-base font-semibold text-text">{patient.hospitalNumber ?? "ไม่ระบุ"}</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm font-semibold text-text-muted">โรงพยาบาล</dt>
              <dd className="text-base font-semibold text-text">{patient.hospital.name}</dd>
            </div>
          </dl>
        </Panel>

        <PatientProfileView profile={patient.profile} />

        <div className="mt-6 flex flex-wrap gap-3">
          {canManageAssignment ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/assignment`}
            >
              จัดการผู้รับผิดชอบ
            </Link>
          ) : null}
          <Link
            className="inline-flex min-h-11 items-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/screenings`}
          >
            ประวัติ Screening
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/goals`}
          >
            Goals / Activity Plan
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/appointments`}
          >
            Appointments
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/followups`}
          >
            Follow-ups
          </Link>
          <Link
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={backHref}
          >
            กลับไปยังรายชื่อผู้ป่วย
          </Link>
        </div>
      </div>
    </div>
  );
}
