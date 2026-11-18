import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { HospitalStatus, Role } from "@prisma/client";

import {
  projectApplicationWorkspace,
  type ApplicationHospitalWorkspace,
  type ApplicationWorkspaceAction,
} from "@/components/app-shell/application-workspace";
import { projectApplicationNavigation } from "@/components/app-shell/application-navigation";
import { roleLabels } from "@/components/app-shell/actor-presentation";
import { HomeContentSection } from "@/components/home/home-content-section";
import { HomeHero, HomeHeroCard } from "@/components/home/home-hero";
import { HomeHospitalChip } from "@/components/home/home-hospital-chip";
import { HomeShortcutGrid } from "@/components/home/home-shortcut-grid";
import { loadHomeSection } from "@/components/home/load-home-section";
import {
  projectActiveOsmHospitalIds,
  projectWorkHome,
  type WorkHomeScope,
} from "@/components/home/work-home-projection";
import { WorkHomePendingQueue } from "@/components/home/work-home-pending-queue";
import { WorkHomeToolGroups } from "@/components/home/work-home-tool-groups";
import { Alert } from "@/components/ui/alert";
import { ChevronGlyph } from "@/components/ui/glyphs";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { countWorkAppointmentsAwaitingMyAcceptance } from "@/modules/appointments/services/work-appointment-query-service";
import { listActorHospitalWorkspaces } from "@/modules/auth/services/actor-workspace-service";
import { listHospitalWorkContent } from "@/modules/hospital-content/services/hospital-content-work-query-service";
import { listHospitalOwnerInvitationsForActor } from "@/modules/hospital-service-areas/services/child-facility-service";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { getPendingActions } from "@/modules/pending-actions/services/pending-action-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ChildOwnerInvitations } from "./child-owner-invitations";

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

function WorkHomeChip({ scope }: { scope: WorkHomeScope }): React.JSX.Element {
  if (scope.kind === "hospital") {
    return (
      <HomeHospitalChip
        action="/app"
        fieldName="hospitalId"
        groups={scope.groups.map(({ network, hospitals }) => ({
          label: `เครือข่าย ${network.name}`,
          options: hospitals.map(({ hospitalId, hospitalName }) => ({ value: hospitalId, label: hospitalName })),
        }))}
        selectId="work-home-hospital"
        selectedLabel={scope.hospital.hospitalName}
        selectedValue={scope.hospital.hospitalId}
      />
    );
  }

  return (
    <HomeHospitalChip
      action="/app"
      emptyLabel={scope.kind === "system" ? "ระบบ DEMI ทั้งหมด" : undefined}
      fieldName="hospitalId"
      groups={[]}
      selectId="work-home-hospital"
      selectedLabel={null}
      selectedValue={null}
    />
  );
}

function WorkHomePrimaryAction({ action }: { action: ApplicationWorkspaceAction }): React.JSX.Element {
  return (
    <HomeHeroCard heading="เริ่มงาน" headingId="work-home-primary-heading">
      <Link
        className="group mt-2 flex min-h-11 w-full min-w-0 items-center gap-3 rounded-control text-brand-strong no-underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface lg:mt-0"
        href={action.href}
        prefetch={action.prefetch ?? false}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold group-hover:underline">{action.label}</span>
          <span className="basis-full text-sm leading-6 text-header-muted lg:basis-auto">{action.description}</span>
        </span>
        <ChevronGlyph direction="right" className="size-5 shrink-0" />
      </Link>
    </HomeHeroCard>
  );
}

function SharedActionList({ actions }: { actions: readonly ApplicationWorkspaceAction[] }): React.JSX.Element {
  return (
    <ul className="mt-3 divide-y divide-border border-y border-border">
      {actions.map((action) => (
        <li key={action.href}>
          <Link
            className="flex min-h-16 flex-col justify-center gap-1 py-4 text-left transition-colors hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href={action.href}
            prefetch={action.prefetch ?? false}
          >
            <span className="font-semibold">{action.label}</span>
            <span className="text-sm leading-6 text-text-muted">{action.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function hospitalStatusPresentation(workspace: ApplicationHospitalWorkspace): {
  label: string;
  message: string;
  variant: "danger" | "warning" | "neutral";
} {
  if (workspace.hospitalStatus === HospitalStatus.SUSPENDED) {
    return { label: "โรงพยาบาลถูกระงับการใช้งาน", message: "ขณะนี้ยังทำงานในโรงพยาบาลนี้ไม่ได้", variant: "danger" };
  }
  if (workspace.hospitalStatus !== HospitalStatus.ACTIVE) {
    return { label: "โรงพยาบาลยังไม่เปิดใช้งาน", message: "ขณะนี้ยังทำงานในโรงพยาบาลนี้ไม่ได้", variant: "warning" };
  }

  return { label: "ยังไม่มีสิทธิ์ทำงาน", message: "ขณะนี้คุณยังไม่มีสิทธิ์ทำงานในโรงพยาบาลนี้", variant: "neutral" };
}

function UnavailableHospitalList({
  hospitals,
}: {
  hospitals: readonly ApplicationHospitalWorkspace[];
}): React.JSX.Element {
  return (
    <section aria-labelledby="work-home-unavailable-heading" className="mt-8 min-w-0">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="work-home-unavailable-heading">
        โรงพยาบาลที่ยังเข้าใช้งานไม่ได้
      </h2>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {hospitals.map((workspace) => {
          const status = hospitalStatusPresentation(workspace);

          return (
            <li className="flex min-w-0 flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between" key={workspace.hospitalId}>
              <div className="min-w-0">
                <p className="break-words font-semibold text-text">{workspace.hospitalName}</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">{workspace.contextLabel}</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">{status.message}</p>
              </div>
              <StatusBadge variant={status.variant}>{`สถานะ: ${status.label}`}</StatusBadge>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function ApplicationPage(
  { searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {},
): Promise<React.JSX.Element> {
  await connection();
  const paramsPromise: Promise<Record<string, string | string[] | undefined>> =
    searchParams ?? Promise.resolve({});
  const [actor, params] = await Promise.all([resolveProtectedActor(), paramsPromise]);
  if (actor.roles.length === 1 && actor.roles[0] === Role.CAREGIVER) {
    redirect("/app/family");
  }
  const [hospitalWorkspaces, awaitingOsmAcceptanceCount] = await Promise.all([
    listActorHospitalWorkspaces(actor),
    countWorkAppointmentsAwaitingMyAcceptance(actor),
  ]);
  const navigation = projectApplicationNavigation(actor, hospitalWorkspaces, awaitingOsmAcceptanceCount);
  const projection = projectApplicationWorkspace(actor, hospitalWorkspaces, navigation);
  // ADR-0018: a pending Child OWNER invitation is answered here, so it keeps even a Patient-only account on this page.
  const invitations = await loadHomeSection(() => listHospitalOwnerInvitationsForActor(actor));
  const hasInvitations = invitations.status === "LOADED" && invitations.value.length > 0;

  if (
    !hasInvitations &&
    projection.availableWorkspaces.length === 1 &&
    projection.availableWorkspaces[0] === "personal"
  ) {
    redirect("/app/personal");
  }

  await scheduleCurrentLineAccountReconciliation();

  // Home ranks permitted navigation destinations with core care and OWNER tools first.
  const home = projectWorkHome(
    projection,
    navigation,
    projectActiveOsmHospitalIds(actor),
    params.hospitalId,
  );
  const selectedHospital = home.scope.kind === "hospital" ? home.scope.hospital : null;
  // The feed re-applies the persisted work-membership predicate; the locator only narrows it.
  // An infrastructure failure stays inside the news section; authorization errors still propagate.
  const [pendingActions, teamNews] = await Promise.all([
    getPendingActions(actor.userId),
    selectedHospital
      ? loadHomeSection(() => listHospitalWorkContent(actor, { hospitalId: selectedHospital.hospitalId, limit: 3 }))
      : null,
  ]);
  const hospitalNames = new Map(projection.areaGroups.flatMap(({ hospitals }) =>
    hospitals.map(({ hospitalId, hospitalName }) => [hospitalId, hospitalName] as const),
  ));
  const hasPersonalWorkspace = projection.availableWorkspaces.includes("personal");
  const hasNoActions = projection.governanceActions.length === 0 && !projection.assignedPatientsAction &&
    !projection.hospitals.some(({ actions }) => actions.length > 0) &&
    projection.requestActions.length === 0 && projection.supportingActions.length === 0;

  return (
    <div className="content-workspace min-w-0 break-words">
      <HomeHero chip={<WorkHomeChip scope={home.scope} />} headingId="work-home-heading" title="พื้นที่ทำงาน">
        {home.hero ? <WorkHomePrimaryAction action={home.hero} /> : null}
        {hasPersonalWorkspace ? (
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 lg:mt-2">
            <p className="text-sm leading-6 text-header-muted">หน้านี้เป็นพื้นที่ทำงาน ข้อมูลและบริการของคุณเองอยู่ในพื้นที่ส่วนตัว</p>
            <Link
              className="inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header-surface"
              href="/app/personal"
              prefetch={false}
            >
              ไปพื้นที่ส่วนตัว
            </Link>
          </div>
        ) : null}
      </HomeHero>

      <ChildOwnerInvitations invitations={invitations} />

      <div className="lg:mt-8 lg:grid lg:items-start lg:gap-x-8 lg:@5xl/workspace:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:@5xl/workspace:grid-rows-[auto_1fr]">
        <div className="contents lg:block lg:min-w-0">
          <div className="hidden lg:block">
            <WorkHomePendingQueue hospitalNames={hospitalNames} result={pendingActions} />
          </div>
          {home.toolGroups.length > 0 ? (
            <div className="mt-8 hidden lg:block">
              <WorkHomeToolGroups groups={home.toolGroups} />
            </div>
          ) : null}

          {home.tiles.length > 0 ? (
            <>
              <div className="lg:hidden">
                <HomeShortcutGrid heading="เมนูงาน" headingId="work-home-menu-heading" shortcuts={home.tiles} />
              </div>
              {/* ADR-0019: only a direct OWNER has administration actions. */}
              {selectedHospital?.actions.some(({ category }) => category === "administration") ? (
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  บริหารโรงพยาบาล · สิทธิ์แอดมินโรงพยาบาลโดยตรง เครื่องมือแสดงตามสิทธิ์ของคุณในโรงพยาบาลนี้
                </p>
              ) : null}
            </>
          ) : selectedHospital ? (
            <p className="mt-7 text-sm leading-6 text-text-muted">
              ยังไม่มีงานที่เปิดให้คุณทำในโรงพยาบาลนี้ การมีบัญชีหรือได้รับคำเชิญยังไม่ทำให้มีสิทธิ์ดูแลผู้ป่วยโดยอัตโนมัติ
            </p>
          ) : null}

          {home.sharedActions.length > 0 ? (
            <section aria-labelledby="work-home-shared-heading" className="mt-8 min-w-0">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="work-home-shared-heading">
                งานจากทุกโรงพยาบาล
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                รายการเหล่านี้ครอบคลุมทุกโรงพยาบาลที่บัญชีนี้มีสิทธิ์ ไม่จำกัดเฉพาะโรงพยาบาลที่เลือก
              </p>
              <SharedActionList actions={home.sharedActions} />
            </section>
          ) : null}
        </div>
        {selectedHospital && teamNews ? (
          <HomeContentSection
            allHref={`/app/hospitals/content?hospitalId=${encodeURIComponent(selectedHospital.hospitalId)}`}
            className="lg:order-last lg:@5xl/workspace:col-start-2 lg:@5xl/workspace:row-span-2 lg:@5xl/workspace:row-start-1 lg:@5xl/workspace:mt-0"
            emptyMessage={`ยังไม่มีข่าวสารสำหรับทีมงานจาก${selectedHospital.hospitalName}`}
            heading="ข่าวสารทีมงาน"
            failure={teamNews.status === "FAILED"
              ? { message: "โหลดข่าวสารไม่สำเร็จ", retryHref: `/app?hospitalId=${encodeURIComponent(selectedHospital.hospitalId)}` }
              : undefined}
            id="work-home-news-heading"
            itemHrefBase="/app/hospitals/content"
            items={teamNews.status === "LOADED" ? teamNews.value.items : []}
          />
        ) : null}
        {home.unavailableHospitals.length > 0 ? <UnavailableHospitalList hospitals={home.unavailableHospitals} /> : null}
      </div>

      {hasNoActions && !hasInvitations ? (
        <Alert className="mt-8" variant="neutral">
          <p className="font-semibold">ยังไม่มีการดำเนินงานที่พร้อมใช้งาน</p>
          <p className="mt-1">เมื่อคุณมีสิทธิ์ทำงาน รายการที่คุณเข้าถึงได้จะแสดงที่นี่</p>
        </Alert>
      ) : null}

      <details className="mt-8 border-t border-border pt-3">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring">ข้อมูลบัญชีและสิทธิ์</summary>
        <StatusBadge variant="success">บัญชีใช้งานอยู่</StatusBadge>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="บทบาทการทำงาน">
          {actor.roles.filter((role) => role !== Role.PATIENT).map((role) => (
            <li key={role}><StatusBadge variant="info">{roleLabels[role]}</StatusBadge></li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-text-muted">ระบบตรวจสิทธิ์อีกครั้งเมื่อเปิดหน้าหรือดำเนินการ การเลือกโรงพยาบาลไม่เพิ่มสิทธิ์ให้บัญชี</p>
      </details>
    </div>
  );
}
