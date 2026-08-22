import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getPatientEvidencePageContext,
  type PatientEvidenceArtifactProjection,
} from "@/modules/patient-evidence/services/patient-evidence-query-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientEvidenceForm } from "./evidence-form";

export const metadata: Metadata = {
  title: "หลักฐาน / รูปภาพสถานะ",
};

type PatientEvidencePageProps = {
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

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function formatByteSize(byteSize: number): string {
  if (byteSize < 1024 * 1024) {
    return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
  }

  return `${(byteSize / (1024 * 1024)).toFixed(2)} MB`;
}

function mediaTypeLabel(mediaType: string): string {
  switch (mediaType) {
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WEBP";
    default:
      return "รูปภาพ";
  }
}

function artifactContentPath(relationshipId: string, artifactId: string): string {
  return `/app/patients/${encodeURIComponent(relationshipId)}/evidence/${encodeURIComponent(artifactId)}/content`;
}

function EvidenceCard({
  artifact,
  patientName,
  relationshipId,
}: {
  artifact: PatientEvidenceArtifactProjection;
  patientName: string;
  relationshipId: string;
}): React.JSX.Element {
  const contentPath = artifactContentPath(relationshipId, artifact.id);

  return (
    <article className="overflow-hidden rounded-panel border border-border bg-surface shadow-panel">
      <div className="aspect-[4/3] bg-surface-muted">
        {/* The application route authorizes the relationship before redirecting to a short-lived URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`รูปหลักฐานของ ${patientName}`}
          className="h-full w-full object-contain"
          loading="lazy"
          src={contentPath}
        />
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
          <span>{formatDate(artifact.createdAt)}</span>
          <span>{mediaTypeLabel(artifact.mediaType)} · {formatByteSize(artifact.byteSize)}</span>
        </div>
        <div>
          <p className="text-sm text-text-muted">ผู้บันทึก</p>
          <p className="font-semibold text-text">{artifact.creator.displayName}</p>
        </div>
        <div>
          <p className="text-sm text-text-muted">คำอธิบาย</p>
          <p className="break-words whitespace-pre-wrap text-text">
            {artifact.caption ?? "ไม่มีคำอธิบาย"}
          </p>
        </div>
        <Link
          className={buttonClassName({ className: "w-full", size: "compact", variant: "secondary" })}
          href={contentPath}
        >
          ดูรูป
        </Link>
      </div>
    </article>
  );
}

export default async function PatientEvidencePage({
  params,
}: PatientEvidencePageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let context;

  try {
    context = await getPatientEvidencePageContext(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return (
    <div>
      <PageHeader
        actions={
          context.canCreate ? (
            <Link
              className={buttonClassName({ size: "compact" })}
              href="#new-evidence"
            >
              + เพิ่มรูปหลักฐาน
            </Link>
          ) : undefined
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "หลักฐาน / รูปภาพสถานะ" },
        ]}
        description="ดูหลักฐานและรูปภาพที่เกี่ยวข้องกับการดูแลผู้ป่วยรายนี้"
        title="หลักฐาน / รูปภาพสถานะ"
      />

      <div className="space-y-6 pt-8">
        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ผู้ป่วยและบริบทโรงพยาบาล</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-text-muted">ผู้ป่วย</p>
              <p className="mt-1 break-words text-lg font-semibold text-text">{context.patient.displayName}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">HN</p>
              <p className="mt-1 break-words text-lg font-semibold text-text">
                {context.patient.hospitalNumber ?? "ไม่ระบุ"}
              </p>
            </div>
            <div>
              <p className="text-sm text-text-muted">โรงพยาบาล</p>
              <p className="mt-1 break-words text-lg font-semibold text-text">{context.patient.hospital.name}</p>
            </div>
          </div>
        </Panel>

        {context.canCreate ? <PatientEvidenceForm relationshipId={relationshipId} /> : null}

        <section aria-labelledby="evidence-list-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text" id="evidence-list-heading">
                หลักฐานที่บันทึกไว้
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">แสดงรายการล่าสุดไม่เกิน 50 รายการ</p>
            </div>
            {!context.canCreate ? (
              <p className="text-sm text-text-muted">บัญชีนี้มีสิทธิ์ดูข้อมูล แต่ไม่มีสิทธิ์เพิ่มรูปหลักฐาน</p>
            ) : null}
          </div>

          {context.artifacts.length === 0 ? (
            <Alert className="mt-5" variant="neutral">
              ยังไม่มีรูปหลักฐาน
            </Alert>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {context.artifacts.map((artifact) => (
                <EvidenceCard
                  artifact={artifact}
                  key={artifact.id}
                  patientName={context.patient.displayName}
                  relationshipId={relationshipId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
