import type { ReactNode } from "react";

import type { ApplicationNavigationGroup } from "./navigation-types";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { MobileBottomNavigation } from "./mobile-bottom-navigation";
import { NavigationWorkspaceProvider } from "./navigation-workspace-provider";
import { projectMobileNavigation } from "./mobile-tab-projection";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";

type AppShellProps = {
  children: ReactNode;
  displayName: string;
  navigation: readonly ApplicationNavigationGroup[];
  roleLabels: readonly string[];
  passwordResetNoticeAt?: Date | null;
  /** LG-D7: a newer TERMS or PRIVACY_POLICY version awaits acceptance; informational, never blocks use. */
  legalReacceptanceNeeded?: boolean;
};

export function AppShell({
  children,
  displayName,
  navigation,
  roleLabels,
  passwordResetNoticeAt = null,
  legalReacceptanceNeeded = false,
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
        <AppSidebar
          availableWorkspaces={mobileNavigation.availableWorkspaces}
          displayName={displayName}
          navigation={navigation}
          roleLabels={roleLabels}
        />
        <div className="min-w-0 flex-1">
          <AppHeader />
          <main
            className="app-shell-horizontal-gutter app-shell-main-content @container/workspace min-w-0 w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12"
            id="application-main-content"
            tabIndex={-1}
          >
            {passwordResetNoticeAt ? (
              <Alert className="mb-6" variant="warning">
                รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(passwordResetNoticeAt)} หากไม่ใช่คุณ ติดต่อโรงพยาบาล
              </Alert>
            ) : null}
            {legalReacceptanceNeeded ? (
              <Alert className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1" variant="info">
                <span>มีข้อกำหนดหรือนโยบายการคุ้มครองข้อมูลส่วนบุคคลฉบับใหม่ ใช้งานต่อได้ตามปกติ</span>
                <Link
                  className="inline-flex min-h-11 items-center rounded-control font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                  href="/app/settings/legal"
                >
                  อ่านและยอมรับ
                </Link>
              </Alert>
            ) : null}
            {children}
          </main>
        </div>
        <MobileBottomNavigation projection={mobileNavigation} />
      </div>
    </NavigationWorkspaceProvider>
  );
}
