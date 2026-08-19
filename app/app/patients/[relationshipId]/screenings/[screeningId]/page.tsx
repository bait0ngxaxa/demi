import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getQuestionSet } from "@/modules/screening/domain/question-sets";
import {
  getScreeningDetail,
  type ScreeningDetail,
} from "@/modules/screening/services/screening-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "รายละเอียด Screening",
};

type ScreeningDetailPageProps = {
  params: Promise<{ relationshipId: string; screeningId: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(value);
}

function zoneVariant(zone: ScreeningDetail["result"]["zone"]): StatusVariant {
  if (zone === "RED") {
    return "danger";
  }

  if (zone === "YELLOW") {
    return "warning";
  }

  return "success";
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

function AnswerList({
  detail,
  section,
}: {
  detail: ScreeningDetail;
  section: "PAM" | "PROMs";
}): React.JSX.Element {
  const questionSet = getQuestionSet(detail.questionSetKey, detail.questionSetVersion);
  const questions = questionSet?.questions.filter((question) => question.section === section) ?? [];

  return (
    <dl className="mt-5 divide-y divide-border border-y border-border">
      {questions.map((question) => {
        const value = detail.responses[section === "PAM" ? "pam" : "proms"][question.key];
        const label = question.options.find((option) => option.value === value)?.label ?? "ไม่พบคำตอบ";

        return (
          <div className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-6" key={question.key}>
            <dt className="text-sm leading-6 text-text-muted">{question.prompt}</dt>
            <dd className="text-sm font-semibold text-text sm:text-right">
              {value}. {label}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ScreeningDetailView({ detail }: { detail: ScreeningDetail }): React.JSX.Element {
  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge variant="info">{detail.result.level}</StatusBadge>
            <StatusBadge variant={zoneVariant(detail.result.zone)}>{detail.result.zone}</StatusBadge>
          </div>
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}/screenings`,
            label: "ประวัติ Screening",
          },
          { label: "รายละเอียดการประเมิน" },
        ]}
        description="ผลลัพธ์และคำตอบของ Screening ที่บันทึกไว้ในบริบทของโรงพยาบาลนี้"
        title="รายละเอียด Screening"
      />

      <div className="space-y-6 pt-8">
        <Alert variant="warning">
          <p className="font-semibold">ผลลัพธ์นี้เป็นข้อมูลจากต้นแบบ</p>
          <p className="mt-1">
            ข้อคำถามและเกณฑ์การประเมินอ้างอิงรูปแบบจากระบบ DEMI เดิม
            และยังรอการยืนยันจากลูกค้า ไม่ใช่คำแนะนำหรือการตัดสินใจทางการแพทย์อัตโนมัติ
          </p>
        </Alert>

        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {detail.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{detail.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {detail.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">วันที่ส่ง</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.submittedAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้ทำแบบประเมิน</dt>
              <dd className="mt-1 font-semibold text-text">{detail.conductedByDisplayName}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ผลลัพธ์ต้นแบบ</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">คำนวณจากคำตอบที่ตรวจสอบฝั่งเซิร์ฟเวอร์</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge variant="info">{detail.result.level}</StatusBadge>
              <StatusBadge variant={zoneVariant(detail.result.zone)}>{detail.result.zone}</StatusBadge>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-sm text-text-muted">PAM total</dt>
              <dd className="mt-1 text-xl font-semibold text-text">{detail.result.pamTotal}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">PROMs total</dt>
              <dd className="mt-1 text-xl font-semibold text-text">{detail.result.promsTotal}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">PROMs minimum</dt>
              <dd className="mt-1 text-xl font-semibold text-text">{detail.result.promsMin}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Combined total</dt>
              <dd className="mt-1 text-xl font-semibold text-text">{detail.result.combinedTotal}</dd>
            </div>
          </dl>
          {detail.result.percentage !== null ? (
            <p className="mt-5 text-sm leading-6 text-text-muted">
              Combined percentage: <span className="font-semibold text-text">{detail.result.percentage.toFixed(2)}%</span>
            </p>
          ) : (
            <p className="mt-5 text-sm leading-6 text-text-muted">
              ไม่แสดง Combined percentage เนื่องจากผลลัพธ์เข้าเงื่อนไข L1 โดยตรง
            </p>
          )}
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">คำตอบ PAM</h2>
          <AnswerList detail={detail} section="PAM" />
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">คำตอบ PROMs</h2>
          <AnswerList detail={detail} section="PROMs" />
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Confidence</h2>
          <dl className="mt-5 divide-y divide-border border-y border-border">
            <div className="grid gap-1 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm text-text-muted">คะแนนความมั่นใจ</dt>
              <dd className="font-semibold text-text">{detail.responses.confidenceScore} / 10</dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-6">
              <dt className="text-sm text-text-muted">แผนพัฒนาความมั่นใจ</dt>
              <dd className="whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.responses.confidenceImprovementPlan ?? "ไม่ได้ระบุ"}
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">แหล่งนิยามของต้นแบบ</h2>
          <dl className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">Question set</dt>
              <dd className="mt-1 break-words font-mono text-sm text-text">{detail.questionSetKey} · {detail.questionSetVersion}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Scoring</dt>
              <dd className="mt-1 break-words font-mono text-sm text-text">{detail.scoringVersion}</dd>
            </div>
          </dl>
        </Panel>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}/goals/new?screeningId=${encodeURIComponent(detail.screeningAssessmentId)}`}
          >
            ไปยังแผนเป้าหมาย
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(detail.patient.patientHospitalRelationshipId)}/screenings`}
          >
            กลับไปประวัติ Screening
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function ScreeningDetailPage({
  params,
}: ScreeningDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, screeningId } = await params;
  let detail;

  try {
    detail = await getScreeningDetail(actor, relationshipId, screeningId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <ScreeningDetailView detail={detail} />;
}
