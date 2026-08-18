import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getWorkforceDetail,
  type WorkforceDetail,
} from "@/modules/workforce/services/workforce-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { StaffMembershipControls } from "./staff-membership-controls";

export const metadata: Metadata = {
  title: "รายละเอียดความสัมพันธ์บุคลากร",
};

type WorkforceDetailPageProps = {
  params: Promise<{ kind: string; relationshipId: string }>;
};

function relationshipStatusLabel(status: WorkforceDetail["relationshipStatus"]): string {
  switch (status) {
    case "ACTIVE":
      return "ความสัมพันธ์ใช้งานอยู่";
    case "SUSPENDED":
      return "ความสัมพันธ์ถูกระงับ";
    case "INVITED":
      return "อยู่ระหว่างเชิญ";
    case "PROVISIONED":
      return "รอเปิดใช้งาน";
  }
}

function relationshipStatusVariant(status: WorkforceDetail["relationshipStatus"]): StatusVariant {
  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "SUSPENDED") {
    return "danger";
  }

  if (status === "INVITED") {
    return "neutral";
  }

  return "warning";
}

function accountStatusLabel(status: WorkforceDetail["accountStatus"]): string {
  switch (status) {
    case "ACTIVE":
      return "บัญชีใช้งานอยู่";
    case "SUSPENDED":
      return "บัญชีถูกระงับ";
    case "INVITED":
      return "บัญชีได้รับคำเชิญแล้ว";
    case "PROVISIONED":
      return "บัญชียังไม่เปิดใช้งาน";
  }
}

function accountStatusVariant(status: WorkforceDetail["accountStatus"]): StatusVariant {
  if (status === "ACTIVE") {
    return "success";
  }

  if (status === "SUSPENDED") {
    return "danger";
  }

  if (status === "INVITED") {
    return "neutral";
  }

  return "warning";
}

function hospitalStatusLabel(status: WorkforceDetail["hospital"]["status"]): string {
  return status === "ACTIVE" ? "โรงพยาบาลใช้งานอยู่" : "โรงพยาบาลถูกระงับ";
}

function WorkforceDetailView({ detail }: { detail: WorkforceDetail }): React.JSX.Element {
  const isStaff = detail.kind === "staff";
  const professionLabel = detail.profession
    ? {
        DOCTOR: "แพทย์",
        NURSE: "พยาบาล",
        COORDINATOR: "ผู้ประสานงาน",
        OTHER: "อื่น ๆ",
      }[detail.profession]
    : "ยังไม่ระบุวิชาชีพ";

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <StatusBadge variant={relationshipStatusVariant(detail.relationshipStatus)}>
            {relationshipStatusLabel(detail.relationshipStatus)}
          </StatusBadge>
        }
        breadcrumbs={[
          { href: `/app/workforce?hospitalId=${encodeURIComponent(detail.hospital.id)}`, label: "จัดการบุคลากร" },
          { label: "รายละเอียดความสัมพันธ์" },
        ]}
        description="สถานะบัญชีและสถานะความสัมพันธ์กับโรงพยาบาลแสดงแยกกัน"
        title={detail.displayName}
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-text-muted">{isStaff ? "บุคลากรโรงพยาบาล" : "อสม."}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-text">
                {detail.displayName}
              </h2>
            </div>
            <StatusBadge variant={accountStatusVariant(detail.accountStatus)}>
              {accountStatusLabel(detail.accountStatus)}
            </StatusBadge>
          </div>

          <dl className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">โรงพยาบาล</dt>
              <dd className="mt-1 font-semibold text-text">{detail.hospital.name}</dd>
              <dd className="text-sm text-text-muted">รหัส {detail.hospital.hospitalCode}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">สถานะโรงพยาบาล</dt>
              <dd className="mt-1 font-semibold text-text">{hospitalStatusLabel(detail.hospital.status)}</dd>
            </div>
            {isStaff ? (
              <div>
                <dt className="text-sm text-text-muted">วิชาชีพ</dt>
                <dd className="mt-1 font-semibold text-text">{professionLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-sm text-text-muted">สถานะความสัมพันธ์</dt>
              <dd className="mt-1 font-semibold text-text">
                {relationshipStatusLabel(detail.relationshipStatus)}
              </dd>
            </div>
          </dl>
        </Panel>

        {detail.activationRequired ? (
          <Alert variant="warning">
            <p className="font-semibold">บัญชียังไม่เปิดใช้งาน</p>
            <p className="mt-1">
              การเปิดใช้งานบัญชีอยู่นอกขอบเขตการจัดการสถานะความสัมพันธ์ในต้นแบบนี้
            </p>
            {detail.activationExpiresAt ? (
              <p className="mt-1 text-sm">ลิงก์ล่าสุดหมดอายุ: {formatDate(detail.activationExpiresAt)}</p>
            ) : null}
          </Alert>
        ) : null}

        {isStaff ? (
          <StaffMembershipControls
            accountStatus={detail.accountStatus}
            actions={detail.actions}
            expectedUpdatedAt={detail.relationshipUpdatedAt.toISOString()}
            membershipType={detail.membershipType}
            profession={detail.profession}
            relationshipId={detail.relationshipId}
            relationshipStatus={detail.relationshipStatus}
            targetHospitalId={detail.hospital.id}
          />
        ) : (
          <Alert variant="info">
            <p className="font-semibold">รายละเอียด อสม. แบบอ่านอย่างเดียว</p>
            <p className="mt-1">ต้นแบบ Phase 11B.0 ยังไม่รองรับการเปลี่ยนสถานะความสัมพันธ์ อสม.</p>
          </Alert>
        )}

        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          href={`/app/workforce?hospitalId=${encodeURIComponent(detail.hospital.id)}`}
        >
          กลับไปจัดการบุคลากร
        </Link>
      </div>
    </div>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

async function resolveActor() {
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

export default async function WorkforceDetailPage({
  params,
}: WorkforceDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const route = await params;
  let detail: WorkforceDetail;

  try {
    detail = await getWorkforceDetail(actor, route);
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app/workforce");
    }

    throw error;
  }

  return <WorkforceDetailView detail={detail} />;
}
