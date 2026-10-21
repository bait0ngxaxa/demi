import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { roleLabels } from "@/components/app-shell/actor-presentation";
import {
  listNavigationHospitalWorkspaces,
  projectApplicationNavigation,
} from "@/components/app-shell/application-navigation";
import { LogoutButton } from "@/components/app-shell/logout-button";
import { projectMobileNavigation, projectMoreNavigation } from "@/components/app-shell/mobile-tab-projection";
import { MoreMenuNavigation } from "@/components/app-shell/more-menu-navigation";
import { resolveSelectedWorkspaceContext } from "@/components/app-shell/navigation-state";
import type { ApplicationWorkspaceContext } from "@/components/app-shell/navigation-types";
import { WorkspaceSwitch } from "@/components/app-shell/workspace-switch";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getActorDisplayName } from "@/modules/auth/services/actor-display-name-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "เพิ่มเติม",
};

type MorePageProps = {
  searchParams: Promise<{ workspace?: string | string[] }>;
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

function parseRequestedWorkspace(value: string | string[] | undefined): ApplicationWorkspaceContext | null {
  if (value === "personal" || value === "work") {
    return value;
  }

  return null;
}

export default async function MorePage({ searchParams }: MorePageProps): Promise<React.JSX.Element> {
  await connection();
  const [actor, query] = await Promise.all([resolveProtectedActor(), searchParams]);
  const navigation = projectApplicationNavigation(actor, await listNavigationHospitalWorkspaces(actor));
  const mobileNavigation = projectMobileNavigation(navigation);
  const requestedWorkspace = parseRequestedWorkspace(query.workspace);
  const selectedWorkspace = resolveSelectedWorkspaceContext(
    mobileNavigation.availableWorkspaces,
    requestedWorkspace,
  );
  const primaryTabs = selectedWorkspace
    ? mobileNavigation.tabsByWorkspace[selectedWorkspace]
    : [];
  const moreGroups = projectMoreNavigation(navigation, primaryTabs);
  const displayName = await getActorDisplayName(actor);
  // UI-01: the Patient reaches this hub from the Personal โปรไฟล์ tab; Work roles keep เพิ่มเติม.
  const isProfileHub = navigation.some(({ id, workspace }) => id === "primary" && workspace === selectedWorkspace);

  return (
    <div className="content-workspace break-words">
      {isProfileHub ? (
        <PageHeader description="บัญชี การตั้งค่า และเมนูอื่นตามสิทธิ์ของคุณ" title="โปรไฟล์" />
      ) : (
        <PageHeader description="เมนูและการตั้งค่าบัญชีของคุณ" title="เพิ่มเติม" />
      )}

      <section aria-label="บัญชีผู้ใช้" className="border-b border-border py-6">
        <p className="text-lg font-semibold text-text">{displayName}</p>
        <ul aria-label="บทบาทการใช้งาน" className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
          {actor.roles.map((role) => (
            <li key={role}>
              <StatusBadge variant="info">{roleLabels[role]}</StatusBadge>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-8 pt-8">
        <WorkspaceSwitch
          availableWorkspaces={mobileNavigation.availableWorkspaces}
          hrefs={{ personal: "/app/more?workspace=personal", work: "/app/more?workspace=work" }}
          tone="mobile"
        />
        <MoreMenuNavigation groups={moreGroups} selectedWorkspace={selectedWorkspace} />

        <section aria-label="ออกจากระบบ" className="border-t border-border pt-6">
          <LogoutButton fullWidth />
        </section>
      </div>
    </div>
  );
}
