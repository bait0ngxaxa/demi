import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { PatientActivationHandoff } from "../../activation/patient-activation-handoff";
import { getHospitalPatientAccessRequestDetail } from "@/modules/patient-access-requests/services/patient-access-request-service";
import {
  HospitalPatientAccessRequestWithdrawalControl,
  PatientAccessRequestReviewControls,
} from "../patient-access-request-review-controls";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "ตรวจสอบคำขอเปิดใช้งานผู้ป่วย",
};

type PatientAccessRequestDetailPageProps = {
  params: Promise<{ requestId: string }>;
};

const statusLabels = {
  PENDING: "รอตรวจสอบตัวตน",
  APPROVED: "อนุมัติแล้ว รอดำเนินการต่อ",
  REJECTED: "ไม่อนุมัติคำขอ",
  WITHDRAWN: "ถอนคำขอแล้ว",
  ACTIVATION_ISSUED: "ออกลิงก์เปิดใช้งานแล้ว",
  COMPLETED: "ดำเนินการแล้ว",
} as const;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PatientAccessRequestDetailPage({
  params,
}: PatientAccessRequestDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const { requestId } = await params;

  let request: Awaited<ReturnType<typeof getHospitalPatientAccessRequestDetail>>;
  try {
    const actor = await getProtectedApplicationActor();
    request = await getHospitalPatientAccessRequestDetail(actor, { requestId });
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }

  const statusVariant = request.status === "PENDING"
    ? "warning"
    : request.status === "REJECTED"
      ? "danger"
      : request.status === "COMPLETED"
        ? "success"
        : "info";

  return (
      <div className="max-w-4xl">
        <PageHeader
          breadcrumbs={[
            { href: "/app", label: "งาน" },
            { href: "/app/patients/access-requests", label: "คำขอเปิดใช้งานผู้ป่วย" },
            { label: "รายละเอียดคำขอ" },
          ]}
          description="National ID ในคำขอเป็นข้อมูลอ้างอิงเท่านั้น โรงพยาบาลต้องตรวจยืนยันตัวตนโดยตรงก่อนอนุมัติ"
          title="ตรวจสอบคำขอเปิดใช้งานผู้ป่วย"
        />

        <Panel className="mt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold tracking-[-0.02em] text-text">
                {request.patientName ?? "คำขอจากผู้ป่วย"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {request.hospitalName} · {request.hospitalCode}
              </p>
            </div>
            <StatusBadge variant={statusVariant}>{statusLabels[request.status]}</StatusBadge>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">รับคำขอเมื่อ</dt>
              <dd className="mt-1 font-medium text-text">{formatDate(request.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ตรวจสอบล่าสุด</dt>
              <dd className="mt-1 font-medium text-text">
                {request.reviewedAt ? formatDate(request.reviewedAt) : "ยังไม่ได้ตรวจสอบ"}
              </dd>
            </div>
          </dl>

          {request.status === "PENDING" ? (
            <>
              <Alert className="mt-5" variant="warning">
                ก่อนอนุมัติ ให้ตรวจสอบตัวตนกับผู้ยื่นคำขอโดยตรง การทราบเลขบัตรประชาชนเพียงอย่างเดียวไม่ใช่หลักฐานยืนยันตัวตน
              </Alert>
              <PatientAccessRequestReviewControls requestId={request.requestId} />
            </>
          ) : null}

          {request.status === "APPROVED" ? (
            <ApprovedRequestNextStep
              hospitalId={request.hospitalId}
              patientAccessRequestId={request.requestId}
              reconciliation={request.reconciliation}
            />
          ) : null}

          {request.status === "ACTIVATION_ISSUED" ? (
            <Alert className="mt-5" variant="info">
              <p className="font-semibold">ส่งลิงก์เปิดใช้งานให้ผู้ป่วยแล้ว</p>
              <p className="mt-1 leading-6">
                ผู้ป่วยเป็นผู้ตั้งรหัสผ่านเอง หากต้องออกลิงก์ใหม่ ให้ใช้ workflow เปิดใช้งานเดิมของโรงพยาบาล
              </p>
              <Link
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
                href={`/app/patients/activation?hospitalId=${encodeURIComponent(request.hospitalId)}`}
              >
                ไปยัง workflow เปิดใช้งานบัญชีผู้ป่วย
              </Link>
            </Alert>
          ) : null}

          {request.status === "COMPLETED" && request.resolution === "ALREADY_ACTIVE" ? (
            <Alert className="mt-5" variant="success">
              <p className="font-semibold">ผู้ป่วยมีบัญชีที่เปิดใช้งานอยู่แล้ว</p>
              <p className="mt-1 leading-6">
                ระบบไม่ได้สร้างบัญชี ออก activation หรือเปลี่ยนรหัสผ่าน ให้ผู้ป่วยเข้าสู่ระบบตามปกติ หากลืมรหัสผ่านให้ใช้ช่องทางช่วยเหลือจากโรงพยาบาล
              </p>
              <Link
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
                href="/login"
              >
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </Alert>
          ) : null}

          {request.status === "COMPLETED" && request.resolution === "ACTIVATION_COMPLETED" ? (
            <Alert className="mt-5" variant="success">
              ผู้ป่วยเปิดใช้งานบัญชีสำเร็จแล้ว และคำขอนี้เสร็จสมบูรณ์
            </Alert>
          ) : null}

          {request.status === "REJECTED" ? (
            <Alert className="mt-5" variant="danger">คำขอนี้ไม่ได้รับอนุมัติ</Alert>
          ) : null}

          {request.status === "WITHDRAWN" ? (
            <Alert className="mt-5" variant="info">บันทึกการถอนคำขอตามที่ผู้ยื่นแจ้งแล้ว</Alert>
          ) : null}

          <HospitalPatientAccessRequestWithdrawalControl
            allowed={request.status === "PENDING" || request.status === "APPROVED"}
            requestId={request.requestId}
          />
        </Panel>
      </div>
  );
}

function ApprovedRequestNextStep({
  hospitalId,
  patientAccessRequestId,
  reconciliation,
}: {
  hospitalId: string;
  patientAccessRequestId: string;
  reconciliation:
    | Awaited<ReturnType<typeof getHospitalPatientAccessRequestDetail>>["reconciliation"]
    | null;
}): React.JSX.Element {
  if (reconciliation?.kind === "READY_FOR_ACTIVATION") {
    return (
      <div className="mt-5 border-t border-border pt-5">
        <Alert variant="success">
          พบ Patient ที่ผ่านการ provision แล้วในโรงพยาบาลนี้ สามารถใช้ activation เดิมเพื่อให้ผู้ป่วยตั้งรหัสผ่านเอง
        </Alert>
        <PatientActivationHandoff
          linkedOutcome="READY_FOR_ACTIVATION"
          patientAccessRequestId={patientAccessRequestId}
        />
      </div>
    );
  }

  if (reconciliation?.kind === "ALREADY_ACTIVE") {
    return (
      <div className="mt-5 border-t border-border pt-5">
        <PatientActivationHandoff
          linkedOutcome="ALREADY_ACTIVE"
          patientAccessRequestId={patientAccessRequestId}
        />
      </div>
    );
  }

  const noPerson = reconciliation?.kind === "NOT_PROVISIONED";
  const patientName = reconciliation?.kind === "PROVISIONING_REQUIRED"
    ? reconciliation.displayName
    : null;

  return (
    <div className="mt-5 border-t border-border pt-5">
      <Alert variant="warning">
        <p className="font-semibold">
          {noPerson ? "ยังไม่พบข้อมูล Patient ที่ provision แล้ว" : "ต้องตรวจสอบหรือ provision ข้อมูล Patient ก่อน"}
        </p>
        <p className="mt-1 leading-6">
          {patientName ? `พบข้อมูลของ ${patientName} แต่ยังขาดสถานะที่จำเป็น` : "คำขอนี้ไม่สร้าง Person หรือบัญชีผู้ใช้โดยอัตโนมัติ"}
          {" "}ใช้ workflow provision เดิม แล้วกลับมาดำเนินการ activation ต่อจากคำขอนี้
        </p>
      </Alert>
      <Link
        className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
        href={`/app/patients/provision?hospitalId=${encodeURIComponent(hospitalId)}`}
      >
        ไปยัง workflow เพิ่ม / นำเข้าผู้ป่วย
      </Link>
    </div>
  );
}
