import { randomUUID } from "node:crypto";

import { HospitalStatus } from "@prisma/client";
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
  ValidationError,
} from "@/shared/errors/application-error";
import { Button } from "@/components/ui/button";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  findPatientsForNameCorrection,
  type PatientNameCorrectionTarget,
} from "@/modules/patient-hospital-profile/services/patient-name-correction-service";

import { PatientNameCorrectionForm } from "../../../patients/patient-name-correction-form";

import {
  getHospitalNetworkForAdmin,
  type HospitalNetworkAdminView,
} from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import {
  getParentOwnerInvitationState,
  type ParentOwnerInvitationState,
} from "@/modules/hospital-onboarding/services/parent-owner-invitation-service";

import { HospitalGovernanceControls } from "./hospital-governance-controls";
import { HospitalNetworkSection } from "./hospital-network-section";
import { ParentOwnerInvitationSection } from "./parent-owner-invitation-section";
import { HospitalRetirementSection } from "./hospital-retirement-section";

export const metadata: Metadata = {
  title: "รายละเอียดการกำกับดูแลโรงพยาบาล",
};

type HospitalGovernanceDetailPageProps = {
  params: Promise<{ hospitalId: string }>;
  searchParams: Promise<{ hn?: string | string[] }>;
};

/** Customer decision E3 (ก-19): ADMIN corrects a Patient name reported by the OWNER (Hospital + HN). */
async function PatientNameCorrectionSection({
  actor,
  hospitalId,
  hospitalNumber,
}: {
  actor: ActorContext;
  hospitalId: string;
  hospitalNumber: string | undefined;
}): Promise<React.JSX.Element> {
  let matches: PatientNameCorrectionTarget[] | null = null;
  let lookupError: string | null = null;
  if (hospitalNumber !== undefined) {
    try {
      matches = await findPatientsForNameCorrection(actor, { hospitalId, hospitalNumber });
    } catch (error: unknown) {
      if (!(error instanceof ValidationError)) throw error;
      lookupError = "กรุณากรอก HN ให้ถูกต้อง";
    }
  }

  return (
    <section aria-labelledby="patient-name-correction-heading">
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em]" id="patient-name-correction-heading">
          แก้ไขชื่อ-สกุลผู้ป่วย
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          ใช้เมื่อเจ้าของโรงพยาบาลแจ้งว่าผู้ป่วยเชื่อมกับหลายโรงพยาบาล ชื่อ-สกุลที่แก้จะแสดงในทุกโรงพยาบาลที่ผู้ป่วยเชื่อมอยู่
        </p>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
          <div className="min-w-0 flex-1">
            <label className="text-sm font-semibold text-text" htmlFor="patient-name-correction-hn">HN ของผู้ป่วยในโรงพยาบาลนี้</label>
            <input
              className="mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              defaultValue={hospitalNumber ?? ""}
              id="patient-name-correction-hn"
              maxLength={64}
              name="hn"
              required
            />
          </div>
          <Button size="compact" type="submit" variant="secondary">ค้นหา</Button>
        </form>
        {lookupError ? <Alert className="mt-4" role="alert" variant="warning">{lookupError}</Alert> : null}
        {matches?.length === 0 ? <p className="mt-4 text-sm text-text-muted">ไม่พบผู้ป่วยที่มี HN นี้ในโรงพยาบาลนี้</p> : null}
        {matches?.map((match) => (
          <div className="mt-6 border-t border-border pt-5" key={match.relationshipId}>
            <p className="mb-4 text-sm text-text-muted">HN {match.hospitalNumber} · ชื่อปัจจุบัน {match.givenName} {match.familyName}</p>
            <PatientNameCorrectionForm
              familyName={match.familyName}
              givenName={match.givenName}
              relationshipId={match.relationshipId}
              version={match.version}
            />
          </div>
        ))}
      </Panel>
    </section>
  );
}

function statusLabel(status: HospitalStatus): string {
  switch (status) {
    case HospitalStatus.ACTIVE:
      return "ใช้งานอยู่";
    case HospitalStatus.SUSPENDED:
      return "ถูกระงับ";
    case HospitalStatus.PENDING_VERIFICATION:
      return "รอยืนยันการขึ้นทะเบียน";
    case HospitalStatus.RETIRED:
      return "ถอนออกจากรายชื่อ";
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
    case HospitalStatus.RETIRED:
      return "neutral";
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
  searchParams,
}: HospitalGovernanceDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await requirePlatformAdmin();
  const { hospitalId } = await params;
  const { hn } = await searchParams;
  if (Array.isArray(hn)) notFound();
  let hospital: HospitalGovernanceProjection;
  let network: HospitalNetworkAdminView;
  let ownerInvitation: ParentOwnerInvitationState;

  try {
    hospital = await getHospitalGovernanceDetail(actor, hospitalId);
    network = await getHospitalNetworkForAdmin(actor, hospitalId);
    ownerInvitation = await getParentOwnerInvitationState(actor, { hospitalId: hospital.id });
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
        description="ตรวจสอบและเปลี่ยนสถานะของโรงพยาบาล แก้ชื่อและประเภทในเครือข่าย โอนย้ายลูกข่าย และแก้ชื่อ-สกุลผู้ป่วยตามที่เจ้าของโรงพยาบาลแจ้ง ไม่รวมการดูข้อมูลผู้ป่วย"
        title={hospital.name}
      />

      <div className="space-y-6 pt-8">
        <GovernanceMetadata hospital={hospital} />

        {ownerInvitation.availability !== "UNAVAILABLE" || ownerInvitation.invitation ? (
          <ParentOwnerInvitationSection
            availability={ownerInvitation.availability}
            hospital={{ id: hospital.id, name: hospital.name }}
            invitation={ownerInvitation.invitation ? {
              inviteeName: ownerInvitation.invitation.inviteeName,
              invitedAt: ownerInvitation.invitation.invitedAt.toISOString(),
              delivery: ownerInvitation.invitation.delivery,
              link: {
                status: ownerInvitation.invitation.link.status,
                expiresAt: ownerInvitation.invitation.link.expiresAt?.toISOString() ?? null,
                mode: ownerInvitation.invitation.link.mode,
              },
            } : null}
            lastDeclinedAt={ownerInvitation.lastDeclinedAt?.toISOString() ?? null}
            pendingApplication={ownerInvitation.pendingApplication ? {
              id: ownerInvitation.pendingApplication.id,
              createdAt: ownerInvitation.pendingApplication.createdAt.toISOString(),
            } : null}
            submissionNonce={randomUUID()}
          />
        ) : null}

        <HospitalNetworkSection hospital={hospital} network={network} />

        <HospitalRetirementSection hospital={hospital} />

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
              {hospital.status === HospitalStatus.RETIRED
                ? "โรงพยาบาลนี้ถูกถอนออกจากรายชื่อรอสมัคร จึงไม่มีปุ่มระงับหรือคืนสถานะในหน้านี้"
                : "โรงพยาบาลนี้ยังอยู่ในขั้นตอนลงทะเบียน จึงยังไม่มีปุ่มระงับหรือคืนสถานะในหน้านี้"}
            </p>
          </Alert>
        )}

        {hospital.status === HospitalStatus.ACTIVE ? (
          <section aria-labelledby="owner-reset-heading" className="space-y-4">
            <h2 className="text-xl font-semibold tracking-[-0.02em]" id="owner-reset-heading">
              คืนบัญชีผู้ใช้
            </h2>
            <p className="text-sm leading-6 text-text-muted">
              ผู้ดูแลระบบค้นหาบัญชีด้วยเลขบัตรประชาชนแบบตรงกันได้ และต้องบันทึกวิธียืนยันตัวตนก่อนออกลิงก์รีเซ็ต
            </p>
            <Link className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/app/admin/recovery">เปิดเครื่องมือคืนบัญชี</Link>
          </section>
        ) : null}

        <PatientNameCorrectionSection actor={actor} hospitalId={hospital.id} hospitalNumber={hn} />
      </div>
    </div>
  );
}
