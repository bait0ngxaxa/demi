import { LogoutButton } from "./logout-button";
import { MobileWorkspaceLabel } from "./mobile-workspace-label";
import type { ApplicationWorkspaceContext } from "./navigation-types";

type AppHeaderProps = {
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
  roleLabels: readonly string[];
};

export function AppHeader({ availableWorkspaces, roleLabels }: AppHeaderProps): React.JSX.Element {
  return (
    <header className="app-shell-header app-shell-horizontal-gutter sticky top-0 z-30 flex min-h-app-header items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 lg:hidden">
          <p className="text-lg font-bold tracking-[-0.03em] text-text">DEMI</p>
          <MobileWorkspaceLabel availableWorkspaces={availableWorkspaces} />
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="text-sm font-semibold text-text">ระบบงาน DEMI</p>
          <p className="truncate text-xs text-text-muted">
            {roleLabels.length > 0 ? roleLabels.join(" · ") : "ผู้ใช้งาน DEMI"}
          </p>
        </div>
      </div>
      <LogoutButton />
    </header>
  );
}
