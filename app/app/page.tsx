import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { HospitalStatus } from "@prisma/client";

import {
  projectApplicationWorkspace,
  type ApplicationWorkspaceAction,
  type ApplicationHospitalWorkspace,
} from "@/components/app-shell/application-workspace";
import { roleLabels } from "@/components/app-shell/actor-presentation";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listActorHospitalWorkspaces } from "@/modules/auth/services/actor-workspace-service";
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
}: {
  actions: readonly ApplicationWorkspaceAction[];
}): React.JSX.Element {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {actions.map((action) => (
        <li key={action.href}>
          <Link
            className="flex min-h-16 flex-col justify-center gap-1 py-4 text-left transition-colors hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href={action.href}
          >
            <span className="font-semibold text-text">{action.label}</span>
            <span className="text-sm leading-6 text-text-muted">{action.description}</span>
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

  return (
    <Panel aria-labelledby={`hospital-workspace-${workspace.hospitalId}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            className="text-lg font-semibold tracking-[-0.02em] text-text"
            id={`hospital-workspace-${workspace.hospitalId}`}
          >
            {workspace.hospitalName}
          </h3>
          <p className="mt-1 text-sm text-text-muted">รหัส {workspace.hospitalCode}</p>
        </div>
        <StatusBadge
          variant={
            isActive ? "success" : workspace.hospitalStatus === HospitalStatus.SUSPENDED ? "danger" : "warning"
          }
        >
          {isActive ? "พร้อมดำเนินงาน" : hospitalStatusLabel(workspace.hospitalStatus)}
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
          <WorkspaceActionList actions={workspace.actions} />
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-text-muted">
          ยังไม่มีงานที่พร้อมใช้งานสำหรับขอบเขตของบัญชีนี้
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

  return (
    <div className="max-w-4xl">
      <PageHeader
        description="พื้นที่ทำงานตามบทบาทและงานที่พร้อมให้คุณดำเนินการ"
        title="ยินดีต้อนรับสู่ DEMI"
      />

      <section aria-labelledby="account-heading" className="pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" id="account-heading">
            บัญชีปัจจุบัน
          </h2>
          <StatusBadge variant="success">บัญชีใช้งานอยู่</StatusBadge>
        </div>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          เลือกงานจากเมนูหลัก ระบบจะตรวจสิทธิ์ของแต่ละรายการอีกครั้งเมื่อเปิดหน้าหรือดำเนินการ
        </p>
        <div className="mt-6 border-y border-border py-5">
          <h3 className="text-sm font-semibold text-text">บทบาทของคุณ</h3>
          {actor.roles.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="บทบาทของผู้ใช้งาน">
              {actor.roles.map((role) => (
                <li key={role}>
                  <StatusBadge variant="info">{roleLabels[role]}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีบทบาทสำหรับแสดงผล</p>
          )}
        </div>
      </section>

      <section aria-labelledby="workspace-heading" className="pt-8">
        <h2 className="text-xl font-semibold tracking-[-0.02em]" id="workspace-heading">
          งานถัดไป
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          เลือกงานที่ต้องการดำเนินการจากรายการด้านล่าง
        </p>

        <div className="mt-5 space-y-5">
          {projection.governanceActions.length > 0 ? (
            <Panel>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">งานกำกับดูแล</h3>
              <p className="mt-1 text-sm leading-6 text-text-muted">รายการสำหรับผู้ดูแลระบบแพลตฟอร์มตามสิทธิ์ปัจจุบัน</p>
              <div className="mt-5">
                <WorkspaceActionList actions={projection.governanceActions} />
              </div>
            </Panel>
          ) : null}

          {projection.assignedPatientsAction ? (
            <Panel>
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-text">งานภาคสนาม</h3>
              <div className="mt-5">
                <WorkspaceActionList actions={[projection.assignedPatientsAction]} />
              </div>
            </Panel>
          ) : null}

          {projection.hospitals.map((workspace) => (
            <HospitalWorkspaceSection key={workspace.hospitalId} workspace={workspace} />
          ))}

          {projection.patientOnly ? (
            <Alert variant="info">
              <p className="font-semibold">บัญชีผู้ป่วยเปิดใช้งานแล้ว</p>
              <p className="mt-1">ขณะนี้ยังไม่มีรายการงานสำหรับผู้ป่วยในหน้านี้</p>
            </Alert>
          ) : null}

          {!projection.patientOnly &&
          projection.governanceActions.length === 0 &&
          !projection.assignedPatientsAction &&
          projection.hospitals.length === 0 ? (
            <Alert variant="neutral">
              <p className="font-semibold">ยังไม่มีพื้นที่ทำงานที่พร้อมใช้งาน</p>
              <p className="mt-1">ระบบยังไม่พบงานที่เปิดให้บัญชีนี้ดำเนินการได้ในขณะนี้</p>
            </Alert>
          ) : null}
        </div>
      </section>
    </div>
  );
}
