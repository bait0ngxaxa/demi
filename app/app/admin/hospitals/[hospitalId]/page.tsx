import { HospitalStatus } from "@prisma/client";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "@/modules/hospital-governance/policies/hospital-governance-policy";
import {
  getHospitalGovernanceDetail,
  type HospitalGovernanceProjection,
} from "@/modules/hospital-governance/services/hospital-governance-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import { HospitalGovernanceControls } from "./hospital-governance-controls";

export const metadata: Metadata = {
  title: "รายละเอียดการกำกับดูแลโรงพยาบาล",
};

type HospitalGovernanceDetailPageProps = {
  params: Promise<{ hospitalId: string }>;
};

function statusLabel(status: HospitalStatus): string {
  switch (status) {
    case HospitalStatus.ACTIVE:
      return "ใช้งานอยู่";
    case HospitalStatus.SUSPENDED:
      return "ถูกระงับ";
    case HospitalStatus.PENDING_VERIFICATION:
      return "รอยืนยันการขึ้นทะเบียน";
  }
}

function statusVariant(status: HospitalStatus): StatusVariant {
  switch (status) {
    case HospitalStatus.ACTIVE:
      return "success";
    case HospitalStatus.SUSPENDED:
      return "danger";
    case HospitalStatus.PENDING_VERIFICATION:
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

function GovernanceMetadata({
  hospital,
}: {
  hospital: HospitalGovernanceProjection;
}): React.JSX.Element {
  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">ข้อมูลกำกับดูแล</h2>
      <dl className="mt-6 grid gap-x-8 gap-y-6 border-y border-border py-5 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-text-muted">ชื่อโรงพยาบาล</dt>
          <dd className="mt-1 font-semibold text-text">{hospital.name}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">รหัสโรงพยาบาล</dt>
          <dd className="mt-1 font-semibold text-text">{hospital.hospitalCode}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">สถานะวงจรชีวิต</dt>
          <dd className="mt-1 font-semibold text-text">{statusLabel(hospital.status)}</dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">สร้างเมื่อ</dt>
          <dd className="mt-1 text-text">
            <time dateTime={hospital.createdAt.toISOString()}>{formatDate(hospital.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-text-muted">แก้ไขล่าสุด</dt>
          <dd className="mt-1 text-text">
            <time dateTime={hospital.updatedAt.toISOString()}>{formatDate(hospital.updatedAt)}</time>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

export default async function HospitalGovernanceDetailPage({
  params,
}: HospitalGovernanceDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await requirePlatformAdmin();
  const { hospitalId } = await params;
  let hospital: HospitalGovernanceProjection;

  try {
    hospital = await getHospitalGovernanceDetail(actor, hospitalId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant={statusVariant(hospital.status)}>{statusLabel(hospital.status)}</StatusBadge>}
        breadcrumbs={[
          { label: "ผู้ดูแลระบบ" },
          { href: "/app/admin/hospitals", label: "การกำกับดูแลโรงพยาบาล" },
          { label: "รายละเอียดโรงพยาบาล" },
        ]}
        description="ใช้สำหรับตรวจสอบและเปลี่ยนสถานะของโรงพยาบาล ไม่รวมการจัดการบัญชีหรือข้อมูลผู้ป่วย"
        title={hospital.name}
      />

      <div className="space-y-6 pt-8">
        <GovernanceMetadata hospital={hospital} />

        <Alert variant={hospital.status === HospitalStatus.SUSPENDED ? "warning" : "info"}>
          <p className="font-semibold">ขอบเขตการเปลี่ยนสถานะ</p>
          <p className="mt-1">
            การระงับหรือคืนสถานะมีผลเฉพาะโรงพยาบาลนี้ ไม่ลบบัญชี ไม่เปลี่ยนความสัมพันธ์หรือการมอบหมายผู้ป่วย และไม่แก้ไขนัดหมายหรือข้อมูลประวัติ
          </p>
        </Alert>

        {hospital.status === HospitalStatus.ACTIVE || hospital.status === HospitalStatus.SUSPENDED ? (
          <HospitalGovernanceControls
            expectedUpdatedAt={hospital.updatedAt.toISOString()}
            hospitalId={hospital.id}
            status={hospital.status}
          />
        ) : (
          <Alert variant="neutral">
            <p className="font-semibold">ยังไม่อยู่ในวงจรการระงับ/คืนสถานะ</p>
            <p className="mt-1">
              โรงพยาบาลนี้ยังอยู่ในขั้นตอนลงทะเบียน จึงยังไม่มีปุ่มระงับหรือคืนสถานะในหน้านี้
            </p>
          </Alert>
        )}
      </div>
    </div>
  );
}
