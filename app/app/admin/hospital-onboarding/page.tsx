import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  assertHospitalOnboardingCapability,
  HOSPITAL_ONBOARDING_CAPABILITIES,
} from "@/modules/hospital-onboarding/policies/hospital-onboarding-policy";
import { listPendingHospitalOnboardingApplications } from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "ตรวจสอบคำขอโรงพยาบาล",
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

export default async function HospitalOnboardingReviewPage(): Promise<React.JSX.Element> {
  await connection();
  await requirePlatformAdmin();
  const applications = await listPendingHospitalOnboardingApplications();

  return (
    <div>
      <PageHeader
        actions={<StatusBadge variant="info">รอตรวจสอบ {applications.length} รายการ</StatusBadge>}
        breadcrumbs={[{ label: "ผู้ดูแลระบบ" }, { label: "คำขอขึ้นทะเบียนโรงพยาบาล" }]}
        description="ตรวจสอบข้อมูลที่ผู้สมัครส่งมา แล้วเลือกอนุมัติหรือปฏิเสธคำขอจากฝั่ง DEMI"
        title="คำขอขึ้นทะเบียนโรงพยาบาล"
      />

      <section className="mt-8" aria-labelledby="pending-heading">
        <h2 className="sr-only" id="pending-heading">
          รายการคำขอที่รอตรวจสอบ
        </h2>
        {applications.length === 0 ? (
          <div className="rounded-panel border border-dashed border-border bg-surface px-5 py-12 text-center sm:px-8">
            <p className="text-lg font-semibold">ไม่มีคำขอที่รอตรวจสอบ</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              เมื่อมีผู้สมัครส่งคำขอ รายการจะปรากฏที่หน้านี้
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-panel border border-border bg-surface">
            <div className="divide-y divide-line">
              {applications.map((application) => {
                const applicantName = [
                  application.applicantGivenName,
                  application.applicantFamilyName,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Link
                    className="block px-5 py-5 transition-[background-color] hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:px-7"
                    href={`/app/admin/hospital-onboarding/${application.id}`}
                    key={application.id}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-ink">
                          {applicantName || "ผู้สมัครไม่ระบุชื่อ"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-muted">
                          {application.hospitalName} · รหัส {application.hospitalCode}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted">
                        <time dateTime={application.createdAt.toISOString()}>
                          {application.createdAt.toLocaleDateString("th-TH", {
                            dateStyle: "medium",
                          })}
                        </time>
                        <span className="font-semibold text-brand-strong">เปิดดูรายละเอียด →</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
