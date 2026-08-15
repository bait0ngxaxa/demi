import { HospitalOnboardingApplicationStatus } from "@prisma/client";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  assertHospitalOnboardingCapability,
  HOSPITAL_ONBOARDING_CAPABILITIES,
} from "@/modules/hospital-onboarding/policies/hospital-onboarding-policy";
import { getHospitalOnboardingApplication } from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ReviewActions } from "./review-actions";

type HospitalOnboardingDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "รายละเอียดคำขอโรงพยาบาล",
};

async function requirePlatformAdmin(): Promise<void> {
  try {
    const actor = await getProtectedApplicationActor();
    assertHospitalOnboardingCapability(actor, HOSPITAL_ONBOARDING_CAPABILITIES.review);
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

export default async function HospitalOnboardingDetailPage({
  params,
}: HospitalOnboardingDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  await requirePlatformAdmin();
  const { id } = await params;
  let application;

  try {
    application = await getHospitalOnboardingApplication(id);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }

  const applicantName = [application.applicantGivenName, application.applicantFamilyName]
    .filter(Boolean)
    .join(" ");
  const statusLabel = {
    PENDING: "รอตรวจสอบ",
    APPROVED: "อนุมัติแล้ว",
    REJECTED: "ปฏิเสธแล้ว",
  }[application.status];
  const statusVariant = {
    [HospitalOnboardingApplicationStatus.PENDING]: "warning",
    [HospitalOnboardingApplicationStatus.APPROVED]: "success",
    [HospitalOnboardingApplicationStatus.REJECTED]: "danger",
  } satisfies Record<HospitalOnboardingApplicationStatus, StatusVariant>;

  return (
    <div className="max-w-4xl">
      <PageHeader
        actions={<StatusBadge variant={statusVariant[application.status]}>{statusLabel}</StatusBadge>}
        breadcrumbs={[
          { label: "ผู้ดูแลระบบ" },
          { href: "/app/admin/hospital-onboarding", label: "คำขอขึ้นทะเบียนโรงพยาบาล" },
          { label: "รายละเอียดคำขอ" },
        ]}
        description="ตรวจสอบข้อมูลที่จำเป็นต่อการตัดสินใจของผู้ดูแลระบบ DEMI"
        title="รายละเอียดคำขอ"
      />

      <Panel className="mt-8 sm:p-8">
          <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-muted">โรงพยาบาล</dt>
              <dd className="mt-2 text-lg font-semibold">{application.hospitalName}</dd>
              <dd className="mt-1 text-sm text-muted">รหัส {application.hospitalCode}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">ผู้สมัคร</dt>
              <dd className="mt-2 text-lg font-semibold">{applicantName || "ไม่ระบุชื่อ"}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted">วันที่ส่งคำขอ</dt>
              <dd className="mt-2 text-base">
                <time dateTime={application.createdAt.toISOString()}>
                  {application.createdAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </dd>
            </div>
            {application.reviewedAt ? (
              <div>
                <dt className="text-sm font-semibold text-muted">วันที่ตัดสินใจ</dt>
                <dd className="mt-2 text-base">
                  <time dateTime={application.reviewedAt.toISOString()}>
                    {application.reviewedAt.toLocaleString("th-TH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </dd>
                {application.reviewerName ? (
                  <dd className="mt-1 text-sm text-muted">โดย {application.reviewerName}</dd>
                ) : null}
              </div>
            ) : null}
          </dl>

          {application.rejectionReason ? (
            <div className="mt-8 border-t border-line pt-6">
              <h2 className="text-sm font-semibold text-muted">เหตุผลที่ปฏิเสธ</h2>
              <p className="mt-2 whitespace-pre-wrap text-base leading-7">{application.rejectionReason}</p>
            </div>
          ) : null}
      </Panel>

      {application.status === "PENDING" ? (
        <ReviewActions applicationId={application.id} />
      ) : (
        <p className="mt-6 text-sm leading-6 text-muted">
          คำขอนี้ถูกตัดสินแล้ว การกดซ้ำจะไม่เปลี่ยนแปลงประวัติการตรวจสอบ
        </p>
      )}
    </div>
  );
}
