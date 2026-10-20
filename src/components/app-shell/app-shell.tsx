import type { ReactNode } from "react";

import type { ApplicationNavigationGroup } from "./navigation-types";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { MobileBottomNavigation } from "./mobile-bottom-navigation";
import { NavigationWorkspaceProvider } from "./navigation-workspace-provider";
import { projectMobileNavigation } from "./mobile-tab-projection";

type AppShellProps = {
  children: ReactNode;
  navigation: readonly ApplicationNavigationGroup[];
  roleLabels: readonly string[];
};

export function AppShell({
  children,
  navigation,
  roleLabels,
}: AppShellProps): React.JSX.Element {
  const mobileNavigation = projectMobileNavigation(navigation);

  return (
    <NavigationWorkspaceProvider availableWorkspaces={mobileNavigation.availableWorkspaces}>
      <div className="min-h-svh bg-canvas text-text lg:flex">
        <a
          className="type-action fixed left-4 top-4 z-50 -translate-y-24 rounded-control bg-brand-deep px-4 py-3 text-white shadow-floating transition-transform motion-reduce:transition-none focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-focus-ring focus:ring-offset-2"
          href="#application-main-content"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <AppSidebar navigation={navigation} />
        <div className="min-w-0 flex-1">
          <AppHeader roleLabels={roleLabels} />
          <main
            className="app-shell-horizontal-gutter app-shell-main-content @container/workspace min-w-0 w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12"
            id="application-main-content"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
        <MobileBottomNavigation projection={mobileNavigation} />
      </div>
    </NavigationWorkspaceProvider>
  );
}
