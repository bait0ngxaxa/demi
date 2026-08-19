import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "@/modules/hospital-governance/policies/hospital-governance-policy";
import {
  listHospitalGovernanceDirectory,
  type HospitalGovernanceProjection,
} from "@/modules/hospital-governance/services/hospital-governance-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "การกำกับดูแลโรงพยาบาล",
};

function statusLabel(status: HospitalGovernanceProjection["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "ใช้งานอยู่";
    case "SUSPENDED":
      return "ถูกระงับ";
    case "PENDING_VERIFICATION":
      return "รอยืนยันการขึ้นทะเบียน";
  }
}

function statusVariant(status: HospitalGovernanceProjection["status"]): StatusVariant {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "danger";
    case "PENDING_VERIFICATION":
      return "warning";
  }
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

async function requirePlatformAdmin() {
  try {
    const actor = await getProtectedApplicationActor();
    assertHospitalGovernanceCapability(
      actor,
      HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
    );
    return actor;
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

export default async function HospitalGovernanceDirectoryPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await requirePlatformAdmin();
  const hospitals = await listHospitalGovernanceDirectory(actor);

  return (
    <div className="max-w-6xl">
      <PageHeader
        breadcrumbs={[{ label: "ผู้ดูแลระบบ" }, { label: "การกำกับดูแลโรงพยาบาล" }]}
        description="ตรวจสอบสถานะโรงพยาบาลในวงจรการกำกับดูแลของ DEMI และดำเนินการที่เกี่ยวข้อง"
        title="การกำกับดูแลโรงพยาบาล"
      />

      <section aria-labelledby="hospital-directory-heading" className="pt-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="hospital-directory-heading">
              รายชื่อโรงพยาบาล
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
          เลือกโรงพยาบาลเพื่อดูรายละเอียดและจัดการสถานะที่พร้อมดำเนินการหรือถูกระงับ
            </p>
          </div>
          <StatusBadge variant="info">ข้อมูลกำกับดูแลแบบจำกัดขอบเขต</StatusBadge>
        </div>

        {hospitals.length === 0 ? (
          <Panel className="mt-6 border-dashed text-center">
            <p className="font-semibold">ยังไม่มีโรงพยาบาลในวงจรนี้</p>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              โรงพยาบาลที่รอการยืนยันยังอยู่ในขั้นตอนลงทะเบียน และยังไม่แสดงในรายการสถานะการดำเนินงาน
            </p>
          </Panel>
        ) : (
          <div className="mt-6 overflow-hidden rounded-panel border border-border bg-surface">
            <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(8rem,0.8fr)_minmax(10rem,1fr)_auto] gap-4 border-b border-border bg-surface-muted px-5 py-3 text-xs font-semibold text-text-muted sm:grid sm:px-7">
              <span>โรงพยาบาล</span>
              <span>สถานะ</span>
              <span>แก้ไขล่าสุด</span>
              <span className="sr-only">เปิดรายละเอียด</span>
            </div>
            <ul className="divide-y divide-border">
              {hospitals.map((hospital) => (
                <li key={hospital.id}>
                  <Link
                    className="grid gap-4 px-5 py-5 transition-colors hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:grid-cols-[minmax(0,1.8fr)_minmax(8rem,0.8fr)_minmax(10rem,1fr)_auto] sm:items-center sm:px-7"
                    href={`/app/admin/hospitals/${hospital.id}`}
                  >
                    <span>
                      <span className="block font-semibold text-text">{hospital.name}</span>
                      <span className="mt-1 block text-sm leading-6 text-text-muted">
                        รหัส {hospital.hospitalCode}
                      </span>
                    </span>
                    <StatusBadge variant={statusVariant(hospital.status)}>
                      {statusLabel(hospital.status)}
                    </StatusBadge>
                    <time
                      className="text-sm leading-6 text-text-muted"
                      dateTime={hospital.updatedAt.toISOString()}
                    >
                      {formatDate(hospital.updatedAt)}
                    </time>
                    <span className="text-sm font-semibold text-brand-strong">เปิดรายละเอียด</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
