import Link from "next/link";

import { getNavigationItemIcon } from "@/components/app-shell/mobile-navigation-glyph";
import type { ApplicationNavigationGroup, ApplicationWorkspaceContext } from "@/components/app-shell/navigation-types";

import type { HomeShortcut } from "./home-shortcut-grid";

/** UI-01: Home shows the same five top-menu entries, in the same order and wording, as the navigation projection. */
export function projectHomeTopMenu(
  navigation: readonly ApplicationNavigationGroup[],
  workspace: ApplicationWorkspaceContext,
): HomeShortcut[] {
  return navigation
    .filter(({ id, workspace: groupWorkspace }) => id === "top-menu" && groupWorkspace === workspace)
    .flatMap(({ items }) => items.map((item): HomeShortcut => ({
      href: item.href,
      icon: getNavigationItemIcon(item),
      label: item.label,
      ...(item.prefetch === undefined ? {} : { prefetch: item.prefetch }),
    })));
}

/** UI-01 Home entry point for the existing application issue report (`/app/support`). */
export function HomeSupportLink(): React.JSX.Element {
  return (
    <p className="mt-8 border-t border-border pt-4">
      <Link
        className="inline-flex min-h-12 items-center rounded-control text-sm font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href="/app/support"
        prefetch={false}
      >
        แจ้งปัญหาการใช้งาน
      </Link>
    </p>
  );
}
