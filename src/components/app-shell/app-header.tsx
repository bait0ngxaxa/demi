import type { ApplicationNavigationGroup } from "./navigation-types";
import { LogoutButton } from "./logout-button";
import { MobileNavigation } from "./mobile-navigation";

type AppHeaderProps = {
  navigation: readonly ApplicationNavigationGroup[];
  roleLabels: readonly string[];
};

export function AppHeader({ navigation, roleLabels }: AppHeaderProps): React.JSX.Element {
  return (
    <header className="sticky top-0 z-30 flex min-h-app-header items-center justify-between gap-4 border-b border-border bg-surface px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavigation navigation={navigation} />
        <div className="min-w-0 lg:hidden">
          <p className="text-lg font-bold tracking-[-0.03em] text-text">DEMI</p>
          <p className="truncate text-xs text-text-muted">พื้นที่ทำงาน</p>
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="text-sm font-semibold text-text">พื้นที่ทำงาน DEMI</p>
          <p className="truncate text-xs text-text-muted">
            {roleLabels.length > 0 ? roleLabels.join(" · ") : "ผู้ใช้งาน DEMI"}
          </p>
        </div>
      </div>
      <LogoutButton />
    </header>
  );
}
