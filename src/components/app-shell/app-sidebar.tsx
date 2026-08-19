import type { ApplicationNavigationGroup } from "./navigation-types";
import { NavigationList } from "./navigation-list";

type AppSidebarProps = {
  navigation: readonly ApplicationNavigationGroup[];
};

export function AppSidebar({ navigation }: AppSidebarProps): React.JSX.Element {
  return (
    <aside className="sticky top-0 hidden h-svh w-app-sidebar shrink-0 bg-navigation-background text-white lg:flex lg:flex-col">
      <div className="border-b border-white/12 px-6 py-6">
        <p className="text-2xl font-bold tracking-[-0.03em]">DEMI</p>
        <p className="mt-1 text-sm text-white/65">ระบบงานบริการสุขภาพ</p>
      </div>
      <nav aria-label="เมนูหลัก" className="flex-1 overflow-y-auto px-4 py-6">
        <NavigationList groups={navigation} />
      </nav>
    </aside>
  );
}
