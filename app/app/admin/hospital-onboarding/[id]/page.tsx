import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

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

async function requirePlatformAdmin() {
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
}: HospitalOnboardingDetailPageProps) {
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

  return (
    <main className="min-h-svh bg-canvas text-ink">
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          className="text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
          href="/app/admin/hospital-onboarding"
        >
          ← กลับไปรายการคำขอ
        </Link>

        <header className="mt-7 flex flex-col gap-4 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">รายละเอียดคำขอ</h1>
            <p className="mt-3 text-base leading-7 text-muted">
              ตรวจสอบข้อมูลที่จำเป็นต่อการตัดสินใจของ Platform Admin
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-strong">
            {statusLabel}
          </span>
        </header>

        <section className="mt-8 rounded-[16px] border border-line bg-white p-5 sm:p-8">
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
        </section>

        {application.status === "PENDING" ? (
          <ReviewActions applicationId={application.id} />
        ) : (
          <p className="mt-6 text-sm leading-6 text-muted">
            คำขอนี้ถูกตัดสินแล้ว การกดซ้ำจะไม่เปลี่ยนแปลงประวัติการตรวจสอบ
          </p>
        )}
      </div>
    </main>
  );
}
