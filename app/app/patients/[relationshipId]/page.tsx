import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { decidePatientOsmAssignmentPolicy } from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import { decideAccountRecoveryIssuePolicy } from "@/modules/account-security/policies/account-recovery-policy";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPatientClassificationLabel } from "@/modules/patient-classification/presentation/patient-classification-labels";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPatientBaselineNavigationState } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import type { PatientBaselineNavigationState } from "@/modules/patient-baseline/services/patient-baseline-query-service";
import { getPatientDirectoryDetail } from "@/modules/patient-directory/services/patient-directory-query-service";
import { hasDirectHospitalPatientReadScope } from "@/modules/patient-directory/policies/patient-directory-policy";
import { getPatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";
import type { PatientClassificationPageContext } from "@/modules/patient-classification/services/patient-classification-query-service";
import { getPatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import type { PatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientProfileView } from "./patient-profile-view";
import { PatientAccountRecoveryPanel } from "./account-recovery-panel";
import { PatientClassificationView } from "./patient-classification-view";
import { PatientProgramView } from "./programs/patient-program-view";

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

  let classificationContext: PatientClassificationPageContext;

  try {
    classificationContext = await getPatientClassificationPageContext(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  let baselineNavigation: PatientBaselineNavigationState;

  try {
    baselineNavigation = await getPatientBaselineNavigationState(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  let programContext: PatientProgramPageContext;

  try {
    programContext = await getPatientProgramPageContext(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  const formatDateOnly = (value: Date): string =>
    new Intl.DateTimeFormat("th-TH", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(value);

  const canManageAssignment = decidePatientOsmAssignmentPolicy({
    actor,
    capability: "patient:assign-osm",
    targetHospitalId: patient.hospital.id,
  }).allowed;
  const canIssueAccountRecovery = decideAccountRecoveryIssuePolicy(
    actor,
    patient.hospital.id,
  ).allowed;
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
        description="ข้อมูลผู้ป่วย งานดูแลปัจจุบัน และประวัติในขอบเขตโรงพยาบาลนี้"
        title="รายละเอียดผู้ป่วย"
      />

      <nav aria-label="ส่วนของข้อมูลผู้ป่วย" className="mt-6 flex flex-wrap gap-2">
        {[
          ["patient-context", "บริบทผู้ป่วย"],
          ["patient-care", "งานดูแลปัจจุบัน"],
          ["patient-history", "ข้อมูลประกอบและประวัติ"],
        ].map(([id, label]) => (
          <a className={buttonClassName({ variant: "secondary", size: "compact" })} href={`#${id}`} key={id}>
            {label}
          </a>
        ))}
      </nav>

      <div className="space-y-6 pt-8">
        <section aria-label="บริบทผู้ป่วย" className="scroll-mt-24 space-y-6 break-words" id="patient-context" tabIndex={-1}>
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
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="text-sm text-text-muted">สถานะผู้ป่วย</span>
              <StatusBadge variant={classificationContext.current ? "info" : "neutral"}>
                {getPatientClassificationLabel(classificationContext.current?.classification)}
              </StatusBadge>
            </div>
          </Panel>

          <details className="border-b border-border pb-4">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
              สถานะผู้ป่วยและประวัติการเปลี่ยนแปลง
            </summary>
            <PatientClassificationView context={classificationContext} />
          </details>
          {canManageAssignment ? (
            <Link
              className={buttonClassName({ variant: "secondary", size: "compact" })}
              href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/assignment`}
            >
              จัดการผู้รับผิดชอบ
            </Link>
          ) : null}
        </section>

        <section aria-labelledby="patient-care-heading" className="scroll-mt-24 space-y-6" id="patient-care" tabIndex={-1}>
          <div>
            <h2 className="text-2xl font-semibold text-text" id="patient-care-heading">งานดูแลปัจจุบัน</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              {!baselineNavigation.baseline && baselineNavigation.canCreate
                ? "แนะนำให้บันทึกข้อมูลตั้งต้น สามารถเลือกทำงานอื่นตามบริบทการดูแลได้"
                : programContext.active
                  ? "ทำงานต่อในโปรแกรมปัจจุบัน หรือเลือกดูบันทึกและประวัติที่เกี่ยวข้อง"
                  : "เลือกดูข้อมูลตั้งต้นและโปรแกรมการดูแลตามสิทธิ์ปัจจุบัน"}
            </p>
          </div>

          <Panel>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ข้อมูลตั้งต้น</h2>
                {baselineNavigation.baseline ? (
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    บันทึกเมื่อ {formatDateOnly(baselineNavigation.baseline.recordedOn)} · ข้อมูลอ่านอย่างเดียว
                  </p>
                ) : (
                  <div>
                    <p className="mt-1 text-sm leading-6 text-text-muted">ยังไม่มีข้อมูลตั้งต้น</p>
                    {!baselineNavigation.canCreate ? (
                      <p className="mt-1 text-sm leading-6 text-text-muted">บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลตั้งต้นในขอบเขตนี้</p>
                    ) : null}
                  </div>
                )}
              </div>
              {baselineNavigation.baseline ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/baseline`}
                >
                  ดูข้อมูลตั้งต้น
                </Link>
              ) : baselineNavigation.canCreate ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/baseline`}
                >
                  บันทึกข้อมูลตั้งต้น
                </Link>
              ) : null}
            </div>
          </Panel>

          <PatientProgramView
            context={programContext}
            prioritizeActive={Boolean(baselineNavigation.baseline) || !baselineNavigation.canCreate}
          />
        </section>

        <section aria-labelledby="patient-history-heading" className="scroll-mt-24 space-y-6" id="patient-history" tabIndex={-1}>
          <h2 className="text-2xl font-semibold text-text" id="patient-history-heading">ข้อมูลประกอบและประวัติ</h2>
          <PatientProfileView profile={patient.profile} profileSource={patient.profileSource} />

          <section className="mt-6">
            <Panel>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
                    หลักฐาน / รูปภาพสถานะ
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    ดูหลักฐานและรูปภาพที่เกี่ยวข้องกับการดูแลผู้ป่วยรายนี้
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/evidence`}
                >
                  ดูหลักฐาน
                </Link>
              </div>
            </Panel>
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className={buttonClassName({ variant: "secondary", size: "compact" })}
              href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/screenings`}
            >
              ประวัติการประเมิน
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/goals`}
            >
              ประวัติแผนเป้าหมายทั้งหมด
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/appointments`}
            >
              นัดหมาย
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}/followups`}
            >
              ประวัติการติดตามผลทั้งหมด
            </Link>
          </div>
          {canIssueAccountRecovery ? (
            <details className="rounded-panel border border-border bg-surface p-5">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">
                ช่วยเหลือบัญชีผู้ป่วย
              </summary>
              <PatientAccountRecoveryPanel relationshipId={patient.patientHospitalRelationshipId} />
            </details>
          ) : null}
        </section>
        <Link
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href={backHref}
        >
          กลับไปยังรายชื่อผู้ป่วย
        </Link>
      </div>
    </div>
  );
}
