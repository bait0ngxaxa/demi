import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getHospitalUserDetail, type UserDetail } from "@/modules/user-management/services/user-directory-service";
import { getMediatedPasswordResetEligibility } from "@/modules/account-security/services/mediated-password-reset-service";
import { DELETION_BLOCKER_LABELS } from "@/modules/user-management/transport/action-state";
import { getWorkforceDetail, type WorkforceDetail } from "@/modules/workforce/services/workforce-service";
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { PatientCareEndForm } from "../../../patients/patient-care-end-form";
import { PatientNameCorrectionForm } from "../../../patients/patient-name-correction-form";
import { WorkforceManagementControls } from "../../../workforce/[kind]/[relationshipId]/workforce-management-controls";
import {
  ACTIVATION_METHOD_LABELS,
  hospitalRelationshipStatusPresentation,
  USER_ACCOUNT_STATUS_PRESENTATION,
  USER_KIND_LABELS,
} from "../../user-presentation";
import { UserRecordDeleteControl } from "./user-record-delete-control";
import { UserTakeoverControl } from "./user-takeover-control";
import { MediatedPasswordResetControl } from "../../mediated-password-reset-control";

export const metadata: Metadata = {
  title: "จัดการผู้ใช้งาน",
};

type UserDetailPageProps = {
  params: Promise<{ kind: string; relationshipId: string }>;
};

const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

const TAKEOVER_BLOCK_TEXT: Record<NonNullable<UserDetail["takeoverBlock"]>, string> = {
  SELF: "ใช้กับบัญชีของตัวเองไม่ได้",
  LOCKED: "บัญชีนี้ถูกล็อกแล้ว",
  REMOVED: "สิทธิ์การทำงานหรือการดูแลรายการนี้สิ้นสุดแล้ว",
  OWNER_MEMBERSHIP: "ใช้กับแอดมินโรงพยาบาลไม่ได้ กรุณาให้ผู้ดูแลระบบ DEMI ตรวจสอบ",
  NOT_ACTIVATED: "บัญชียังไม่เปิดใช้งาน หากเพิ่มข้อมูลผิดให้ใช้ “ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน” แทน",
  REQUIRES_ADMIN: "กรุณาให้ผู้ดูแลระบบ DEMI ตรวจสอบกรณีนี้",
};

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-sm font-semibold text-text-muted">{label}</dt>
      <dd className="text-base text-text">{children}</dd>
    </div>
  );
}

function ActionSection({ title, children, id }: { title: string; children: React.ReactNode; id?: string }): React.JSX.Element {
  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id={id} tabIndex={id ? -1 : undefined}>{title}</h3>
      {children}
    </section>
  );
}

function UserDetailView({ detail, workforce, recoveryEligibility }: { detail: UserDetail; workforce: WorkforceDetail | null; recoveryEligibility: "OWNER_ELIGIBLE" | "ADMIN_ALLOWED" | "ADMIN_REQUIRED" }): React.JSX.Element {
  const accountStatus = USER_ACCOUNT_STATUS_PRESENTATION[detail.accountStatus];
  const relationshipStatus = hospitalRelationshipStatusPresentation(detail.kind, detail.relationshipStatus);
  const directoryHref = `/app/users?hospitalId=${encodeURIComponent(detail.hospital.id)}&tab=${detail.kind}`;
  const removed = detail.status === "REMOVED";
  const lockRetry = detail.takeoverLock !== null && detail.takeoverLock.providerState !== "CONFIRMED";

  return (
    <div className="content-detail break-words">
      <PageHeader
        actions={<div className="flex flex-wrap justify-end gap-2">
          {detail.identityAssurance === "CAREGIVER_INVITATION" ? <StatusBadge variant="danger">ต้องยืนยันตัวตนก่อนใช้งาน</StatusBadge> : null}
          <StatusBadge variant={accountStatus.variant}>{accountStatus.label}</StatusBadge>
          <StatusBadge variant={relationshipStatus.variant}>{relationshipStatus.label}</StatusBadge>
        </div>}
        breadcrumbs={[{ href: directoryHref, label: "จัดการผู้ใช้งาน" }, { label: "รายละเอียด" }]}
        description={`${USER_KIND_LABELS[detail.kind]} · ${detail.hospital.name}`}
        title={detail.displayName}
      />

      <div className="space-y-6 pt-8">
        {detail.identityAssurance === "CAREGIVER_INVITATION" ? (
          <Alert variant={lockRetry ? "warning" : "danger"}>
            <p className="font-semibold">บัญชีนี้สร้างผ่านคำเชิญจากญาติหรือผู้ดูแล</p>
            <p className="mt-1">ต้องยืนยันตัวตนผ่านการรีเซ็ตรหัสผ่านแบบมีผู้ดูแลก่อนใช้งาน บัญชีถูกระงับและข้อมูลครอบครัวเดิมยังคงอยู่</p>
            {detail.takeoverLock && lockRetry ? <p className="mt-1">บัญชีถูกล็อกใน DEMI แล้ว แต่ยังยืนยันไม่ได้ว่าผู้ให้บริการระงับการเข้าสู่ระบบใหม่และการต่ออายุเซสชันเดิมแล้ว กรุณาให้ผู้ดูแลระบบ DEMI ตรวจสอบก่อนกู้คืนบัญชี</p> : null}
          </Alert>
        ) : detail.takeoverLock ? (
          <Alert variant={lockRetry ? "warning" : "danger"}>
            <p className="font-semibold">บัญชีถูกล็อก: สงสัยว่ามีผู้อื่นใช้บัญชีนี้</p>
            <p className="mt-1">ล็อกเมื่อ {dateTime.format(detail.takeoverLock.lockedAt)} ใช้ขั้นตอนกู้คืนบัญชีด้านล่างเพื่อยืนยันตัวตนและตั้งรหัสผ่านใหม่</p>
            {lockRetry ? <p className="mt-1">บัญชีถูกล็อกใน DEMI แล้ว แต่ยังยืนยันไม่ได้ว่าผู้ให้บริการระงับการเข้าสู่ระบบใหม่และการต่ออายุเซสชันเดิมแล้ว กรุณากดยืนยันอีกครั้งด้านล่าง</p> : null}
          </Alert>
        ) : null}

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">การเปิดใช้งาน</h2>
          <dl className="mt-4 divide-y divide-border border-y border-border">
            {detail.kind !== "patient" ? <Field label="เบอร์ติดต่อ">{detail.contactPhone ?? "ยังไม่ได้ระบุ"}</Field> : null}
            {detail.hospitalNumber ? <Field label="HN ของโรงพยาบาลนี้">{detail.hospitalNumber}</Field> : null}
            <Field label="วิธีเปิดใช้งาน">
              <span className="font-semibold">{ACTIVATION_METHOD_LABELS[detail.activation.method]}</span>
              {detail.activation.selfRegisteredAt ? (
                <span className="ml-2"><StatusBadge variant="info">ลงทะเบียนเอง {dateTime.format(detail.activation.selfRegisteredAt)}</StatusBadge></span>
              ) : null}
            </Field>
            <Field label="เปิดใช้งานเมื่อ">{detail.activation.activatedAt ? dateTime.format(detail.activation.activatedAt) : "ยังไม่เปิดใช้งาน"}</Field>
            <Field label="เพิ่มเข้าระบบเมื่อ">{dateTime.format(detail.activation.addedAt)}</Field>
            <Field label="ผู้เพิ่ม">{detail.activation.addedByName ?? "ไม่มีบันทึก"}</Field>
          </dl>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ประวัติบัญชี</h2>
          {detail.timeline.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">ยังไม่มีประวัติ</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {detail.timeline.map((entry, index) => (
                <li className="flex flex-col gap-1 border-l-2 border-border pl-4 sm:flex-row sm:gap-4" key={`${entry.at.toISOString()}-${index}`}>
                  <time className="shrink-0 text-sm text-text-muted" dateTime={entry.at.toISOString()}>{dateTime.format(entry.at)}</time>
                  <span className="text-sm font-semibold text-text">{entry.label}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <section aria-labelledby="user-actions-heading" className="space-y-6">
          <h2 className="text-2xl font-semibold text-text" id="user-actions-heading">การดำเนินการ</h2>

          <ActionSection title="แก้ไขข้อมูล">
            <Panel>
              <p className="mb-4 text-sm leading-6 text-text-muted">
                เลขบัตรประชาชนแก้ไขไม่ได้ หากเลขผิด ให้ “ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน” (เมื่อระบบอนุญาต) แล้วเพิ่มข้อมูลใหม่ด้วยเลขที่ถูกต้อง
              </p>
              {removed ? (
                <p className="text-sm text-text-muted">ข้อมูลที่สิ้นสุดการดูแลหรือสิทธิ์แล้วแก้ไขไม่ได้</p>
              ) : detail.singleHospital ? (
                <PatientNameCorrectionForm
                  familyName={detail.familyName}
                  givenName={detail.givenName}
                  relationshipId={detail.relationshipId}
                  version={detail.personVersion}
                  {...(detail.kind === "patient" ? {} : { workforceKind: detail.kind })}
                />
              ) : (
                <Alert variant="info">แก้ไขชื่อ-สกุลจากหน้านี้ไม่ได้ กรุณาติดต่อผู้ดูแลระบบ DEMI</Alert>
              )}
              {detail.kind === "patient" && !removed ? (
                <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline" href={`/app/patients/${detail.relationshipId}/profile`}>
                  แก้ไขข้อมูลติดต่อและประวัติสุขภาพ
                </Link>
              ) : null}
            </Panel>
          </ActionSection>

          {workforce ? (
            <ActionSection title="บัญชีและสิทธิ์ในโรงพยาบาล">
              <WorkforceManagementControls detail={workforce} />
            </ActionSection>
          ) : (
            <ActionSection title="บัญชีและการดูแล">
              {detail.status === "PENDING" ? (
                <Panel>
                  <p className="text-sm leading-6 text-text">บัญชียังไม่เปิดใช้งาน ออกลิงก์ใหม่หรือช่วยเปิดใช้งานได้ที่หน้าเปิดใช้งานบัญชีผู้ป่วย</p>
                  <Link className={`mt-3 ${buttonClassName({ variant: "secondary", size: "compact" })}`} href={`/app/patients/activation?hospitalId=${encodeURIComponent(detail.hospital.id)}&relationshipId=${encodeURIComponent(detail.relationshipId)}`}>
                    ออกลิงก์ใหม่ / ช่วยเปิดใช้งาน
                  </Link>
                </Panel>
              ) : null}
              {!removed ? (
                <Panel>
                  <h4 className="text-base font-semibold text-text">สิ้นสุดการดูแลผู้ป่วยรายนี้</h4>
                  <div className="mt-4">
                    <PatientCareEndForm hospitalId={detail.hospital.id} hospitalName={detail.hospital.name} relationshipId={detail.relationshipId} />
                  </div>
                </Panel>
              ) : null}
            </ActionSection>
          )}

          <ActionSection title={detail.takeoverLock ? "กู้คืนบัญชีและตั้งรหัสผ่านใหม่" : "รีเซ็ตรหัสผ่าน"}>
            <Panel>
              <p className="mb-4 text-sm leading-6 text-text-muted">
                ผู้ใช้ต้องกรอกเลขบัตรประชาชนของตนเองและตั้งรหัสผ่านใหม่ เลือกวิธียืนยันตัวตนก่อนออกลิงก์
              </p>
              <MediatedPasswordResetControl
                eligibility={recoveryEligibility}
                hospitalId={detail.hospital.id}
                hospitalName={detail.hospital.name}
                locked={detail.takeoverLock !== null}
                relationshipId={detail.relationshipId}
                targetKind={detail.kind}
                targetName={detail.displayName}
              />
            </Panel>
          </ActionSection>

          <ActionSection id="user-takeover-heading" title="แจ้งสงสัยว่ามีผู้อื่นใช้บัญชีนี้">
            {detail.takeoverBlock === null || lockRetry ? (
              <UserTakeoverControl
                hospitalId={detail.hospital.id}
                hospitalName={detail.hospital.name}
                kind={detail.kind}
                resourceName={detail.displayName}
                relationshipId={detail.relationshipId}
                retry={lockRetry}
                updatedAt={detail.relationshipUpdatedAt}
              />
            ) : (
              <p className="text-sm leading-6 text-text-muted">{TAKEOVER_BLOCK_TEXT[detail.takeoverBlock]}</p>
            )}
          </ActionSection>

          <ActionSection id="user-delete-heading" title="ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน">
            {detail.deletionBlockers.length === 0 ? (
              <UserRecordDeleteControl
                directoryHref={directoryHref}
                hospitalId={detail.hospital.id}
                kind={detail.kind}
                resourceName={detail.displayName}
                relationshipId={detail.relationshipId}
                updatedAt={detail.relationshipUpdatedAt}
              />
            ) : (
              <div className="text-sm leading-6 text-text-muted">
                <p>ลบข้อมูลผู้ใช้นี้ไม่ได้ โปรดตรวจสอบเหตุผลด้านล่าง เพื่อเลือกขั้นตอนที่ตรงกับข้อมูลและเก็บประวัติไว้</p>
                <ul className="mt-2 list-disc pl-5">
                  {detail.deletionBlockers.map((blocker) => <li key={blocker}>{DELETION_BLOCKER_LABELS[blocker]}</li>)}
                </ul>
              </div>
            )}
          </ActionSection>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={detail.legacyHref}>
            เปิดหน้ารายละเอียดเดิม
          </Link>
          <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref}>กลับไปรายชื่อ</Link>
        </div>
      </div>
    </div>
  );
}

export default async function UserDetailPage({ params }: UserDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const route = await params;
  let detail: UserDetail;
  let workforce: WorkforceDetail | null = null;

  try {
    detail = await getHospitalUserDetail(actor, route);
    if (detail.kind !== "patient") {
      workforce = await getWorkforceDetail(actor, { kind: detail.kind, relationshipId: detail.relationshipId });
    }
  } catch (error: unknown) {
    if (error instanceof NotFoundError || error instanceof ValidationError) notFound();
    if (error instanceof ForbiddenError) redirect("/app/users");
    throw error;
  }

  const recoveryEligibility = await getMediatedPasswordResetEligibility(actor, {
    hospitalId: detail.hospital.id,
    relationshipId: detail.relationshipId,
    targetKind: detail.kind,
  });

  return <UserDetailView detail={detail} workforce={workforce} recoveryEligibility={recoveryEligibility} />;
}
