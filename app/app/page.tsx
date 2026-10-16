import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { HospitalStatus, Role } from "@prisma/client";

import {
  projectApplicationWorkspace,
  type ApplicationWorkspaceAction,
  type ApplicationHospitalWorkspace,
} from "@/components/app-shell/application-workspace";
import { roleLabels } from "@/components/app-shell/actor-presentation";
import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listActorHospitalWorkspaces } from "@/modules/auth/services/actor-workspace-service";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "หน้าหลัก",
};

async function resolveProtectedActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect("/login");
    }

    throw error;
  }
}

function WorkspaceActionList({
  actions,
  primary = false,
}: {
  actions: readonly ApplicationWorkspaceAction[];
  primary?: boolean;
}): React.JSX.Element {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {actions.map((action, index) => (
        <li key={action.href}>
          <Link
            className={primary && index === 0
              ? buttonClassName({ className: "my-3 w-full flex-col items-start gap-1 whitespace-normal text-left" })
              : "flex min-h-16 flex-col justify-center gap-1 py-4 text-left transition-colors hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"}
            href={action.href}
            prefetch={action.prefetch ?? false}
          >
            <span className="font-semibold">{action.label}</span>
            <span className={primary && index === 0 ? "text-sm leading-6" : "text-sm leading-6 text-text-muted"}>{action.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function hospitalStatusLabel(status: HospitalStatus): string {
  return status === HospitalStatus.SUSPENDED ? "ถูกระงับ" : "ยังไม่พร้อมใช้งาน";
}

function HospitalWorkspaceSection({
  workspace,
}: {
  workspace: ApplicationHospitalWorkspace;
}): React.JSX.Element {
  const isActive = workspace.hospitalStatus === HospitalStatus.ACTIVE;
  const operationalActions = workspace.actions.filter(({ category }) => category !== "administration");
  const administrationActions = workspace.actions.filter(({ category }) => category === "administration");

  return (
    <Panel aria-labelledby={`hospital-workspace-${workspace.hospitalId}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3
            className="scroll-mt-24 break-words text-lg font-semibold tracking-[-0.02em] text-text"
            id={`hospital-workspace-${workspace.hospitalId}`}
            tabIndex={-1}
          >
            {workspace.hospitalName}
          </h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">{workspace.contextLabel}</p>
        </div>
        <StatusBadge
          variant={
            isActive ? "success" : workspace.hospitalStatus === HospitalStatus.SUSPENDED ? "danger" : "warning"
          }
        >
          {isActive ? "โรงพยาบาลใช้งานอยู่" : hospitalStatusLabel(workspace.hospitalStatus)}
        </StatusBadge>
      </div>

      {workspace.hospitalStatus === HospitalStatus.SUSPENDED ? (
        <Alert className="mt-5" variant="danger">
          <p className="font-semibold">สถานะโรงพยาบาล: ถูกระงับ</p>
          <p className="mt-1">ขณะนี้ไม่สามารถดำเนินงานภายใต้โรงพยาบาลนี้ได้</p>
        </Alert>
      ) : workspace.hospitalStatus !== HospitalStatus.ACTIVE ? (
        <Alert className="mt-5" variant="warning">
          <p className="font-semibold">โรงพยาบาลยังไม่พร้อมใช้งาน</p>
          <p className="mt-1">ขณะนี้ยังไม่สามารถดำเนินงานภายใต้โรงพยาบาลนี้ได้</p>
        </Alert>
      ) : workspace.actions.length > 0 ? (
        <div className="mt-5">
          {operationalActions.length > 0 ? (
            <div>
              <h4 className="mb-3 font-semibold text-text">งานผู้ป่วยในโรงพยาบาลนี้</h4>
              <WorkspaceActionList actions={operationalActions} primary />
            </div>
          ) : null}
          {administrationActions.length > 0 ? (
            <div className="mt-6">
              <h4 className="font-semibold text-text">
                {workspace.administrationScope === "OWNER"
                  ? "บริหารโรงพยาบาล · สิทธิ์เจ้าของโดยตรง"
                  : "จัดการ อสม. · สิทธิ์สมาชิกโดยตรง"}
              </h4>
              <p className="mb-3 mt-1 text-sm leading-6 text-text-muted">
                {workspace.administrationScope === "OWNER"
                  ? "เครื่องมือแสดงตามสิทธิ์ของคุณในโรงพยาบาลนี้ สมาชิกทั่วไปไม่ได้รับสิทธิ์บริหารจากบทบาทบุคลากร"
                  : "สมาชิกเพิ่มและดูแลการเปิดใช้งานบัญชี อสม. ได้เท่านั้น การบริหารบุคลากรและการจัดการอื่นเป็นสิทธิ์ของเจ้าของโรงพยาบาล"}
              </p>
              <WorkspaceActionList actions={administrationActions} />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-text-muted">
          ยังไม่มีการดำเนินงานที่เปิดให้บัญชีนี้ในโรงพยาบาลนี้ ความสัมพันธ์หรือสถานะสมาชิกไม่ได้ให้สิทธิ์ดูแลผู้ป่วยโดยอัตโนมัติ
        </p>
      )}
    </Panel>
  );
}

export default async function ApplicationPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveProtectedActor();
  const projection = projectApplicationWorkspace(
    actor,
    await listActorHospitalWorkspaces(actor),
  );

  if (
    projection.availableWorkspaces.length === 1 &&
    projection.availableWorkspaces[0] === "personal"
  ) {
    redirect("/app/personal");
  }

  await scheduleCurrentLineAccountReconciliation();

  return (
    <div className="content-workspace break-words">
      <PageHeader
        description={projection.assignedPatientsAction || projection.hospitals.some(({ actions }) => actions.length > 0)
          ? "เริ่มจากผู้ป่วยที่รับผิดชอบ หรือเลือกโรงพยาบาลเพื่อทำงานตามสิทธิ์ของคุณ"
          : projection.governanceActions.length > 0
            ? "เลือกงานกำกับดูแลหรือรายงานระบบตามสิทธิ์ของคุณ"
            : "พื้นที่และรายการดำเนินงานแสดงตามสิทธิ์ปัจจุบันของบัญชี"}
        title="พื้นที่ทำงาน"
        actions={projection.availableWorkspaces.includes("personal") ? (
          <Link className={buttonClassName({ variant: "secondary" })} href="/app/personal">ไปพื้นที่ส่วนตัว</Link>
        ) : undefined}
      />
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="บทบาทการทำงาน">
        {actor.roles.filter((role) => role !== Role.PATIENT).map((role) => (
          <li key={role}><StatusBadge variant="info">{roleLabels[role]}</StatusBadge></li>
        ))}
      </ul>
      {projection.availableWorkspaces.includes("personal") ? (
        <p className="mt-3 text-sm leading-6 text-text-muted">หน้านี้เป็นพื้นที่ทำงาน ข้อมูลและบริการของคุณเองอยู่ในพื้นที่ส่วนตัว</p>
      ) : null}

      {projection.assignedPatientsAction || projection.hospitals.length > 0 || projection.governanceActions.length === 0 ? (
        <section aria-labelledby="workspace-heading" className="pt-8">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" id="workspace-heading">เริ่มงานดูแลผู้ป่วย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">เลือกผู้ป่วยจากรายชื่อเพื่อเปิดข้อมูล โปรแกรม และประวัติการดูแล</p>
          {projection.hospitals.length > 1 ? (
            <nav aria-label="ไปยังบริบทโรงพยาบาล" className="mt-4">
              <ul className="flex flex-wrap gap-2">
                {projection.hospitals.map((workspace) => (
                  <li key={workspace.hospitalId} className="min-w-0 max-w-full">
                    <Link className={buttonClassName({ variant: "secondary", className: "max-w-full whitespace-normal text-left" })} href={`#hospital-workspace-${workspace.hospitalId}`} prefetch={false}>
                      {workspace.hospitalName}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="mt-5 grid min-w-0 gap-5 grid-cols-[repeat(auto-fit,minmax(min(100%,28rem),1fr))]">
            {projection.assignedPatientsAction ? (
              <Panel aria-labelledby="assigned-heading">
                <h3 className="text-lg font-semibold text-text" id="assigned-heading">ผู้ป่วยที่ อสม. รับผิดชอบ</h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">รวมเฉพาะขอบเขตการมอบหมายที่คุณมีสิทธิ์ ไม่ใช่รายชื่อผู้ป่วยทั้งหมดของโรงพยาบาล</p>
                <div className="mt-5"><WorkspaceActionList actions={[projection.assignedPatientsAction]} primary /></div>
              </Panel>
            ) : null}
            {projection.hospitals.map((workspace) => (
              <HospitalWorkspaceSection key={workspace.hospitalId} workspace={workspace} />
            ))}
            {!projection.assignedPatientsAction && projection.hospitals.length === 0 ? (
              <p className="text-sm leading-6 text-text-muted">บัญชีนี้ยังไม่มีขอบเขตงานดูแลผู้ป่วยที่เปิดให้ใช้งาน</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {projection.requestActions.length > 0 ? (
        <section aria-labelledby="requests-heading" className="pt-8">
          <h2 className="text-xl font-semibold text-text" id="requests-heading">ทบทวนคำขอผู้ป่วย</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">แสดงคำขอจากทุกโรงพยาบาลที่คุณมีสิทธิ์ ไม่จำกัดเฉพาะโรงพยาบาลเดียว</p>
          <div className="mt-5"><WorkspaceActionList actions={projection.requestActions} /></div>
        </section>
      ) : null}

      {projection.governanceActions.length > 0 ? (
        <section aria-labelledby="governance-heading" className="pt-8">
          <h2 className="text-xl font-semibold text-text" id="governance-heading">กำกับดูแลและรายงานระบบ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">งานผู้ดูแลระบบ DEMI แยกจากสิทธิ์ดูแลผู้ป่วยในโรงพยาบาล</p>
          <div className="mt-5"><WorkspaceActionList actions={projection.governanceActions} primary /></div>
        </section>
      ) : null}

      {projection.supportingActions.length > 0 ? (
        <section aria-labelledby="supporting-heading" className="pt-8">
          <h2 className="text-xl font-semibold text-text" id="supporting-heading">ตั้งค่าบริการที่ผู้ป่วยขอได้</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">รวมโรงพยาบาลที่คุณมีสิทธิ์เจ้าของโดยตรง หน้าปลายทางแสดงแต่ละโรงพยาบาลแยกกัน ไม่กรองตามโรงพยาบาลที่เปิดก่อนหน้า</p>
          <div className="mt-5"><WorkspaceActionList actions={projection.supportingActions} /></div>
        </section>
      ) : null}

      {projection.governanceActions.length === 0 && !projection.assignedPatientsAction &&
        !projection.hospitals.some(({ actions }) => actions.length > 0) &&
        projection.requestActions.length === 0 && projection.supportingActions.length === 0 ? (
        <Alert className="mt-8" variant="neutral">
          <p className="font-semibold">ยังไม่มีการดำเนินงานที่พร้อมใช้งาน</p>
          <p className="mt-1">เมื่อมีบทบาทและความสัมพันธ์ที่ใช้งานได้ รายการตามสิทธิ์จะแสดงที่นี่</p>
        </Alert>
      ) : null}

      <details className="mt-8 border-t border-border pt-3">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">ข้อมูลบัญชีและสิทธิ์</summary>
        <StatusBadge variant="success">บัญชีใช้งานอยู่</StatusBadge>
        <p className="mt-3 text-sm leading-6 text-text-muted">ระบบตรวจสิทธิ์อีกครั้งเมื่อเปิดหน้าหรือดำเนินการ การเลือกโรงพยาบาลไม่เพิ่มสิทธิ์ให้บัญชี</p>
      </details>
    </div>
  );
}
