import type { ReactNode } from "react";

import type { ApplicationNavigationGroup } from "./navigation-types";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

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
  return (
    <div className="min-h-svh bg-canvas text-text lg:flex">
      <a
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-control bg-brand-deep px-4 py-3 font-semibold text-white shadow-floating transition-transform focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-focus-ring focus:ring-offset-2"
        href="#application-main-content"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>
      <AppSidebar navigation={navigation} />
      <div className="min-w-0 flex-1">
        <AppHeader navigation={navigation} roleLabels={roleLabels} />
        <main
          className="mx-auto w-full max-w-app-content px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12"
          id="application-main-content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
