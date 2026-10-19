"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LoadingSpinner } from "@/components/ui/button";
import { classNames } from "@/components/ui/class-names";

import {
  getWorkspaceContextForPathname,
  resolveSelectedWorkspaceContext,
} from "./navigation-state";
import { useNavigationWorkspaceContext } from "./navigation-workspace-provider";
import { confirmMobileNavigation } from "./mobile-navigation-guard";
import { MobileNavigationGlyph } from "./mobile-navigation-glyph";
import { MoreNavigation } from "./more-navigation";
import { resolveActiveMobileTabId } from "./mobile-navigation-state";
import type {
  MobileNavigationProjection,
  MobileNavigationTab,
} from "./mobile-tab-projection";
import type { ApplicationNavigationGroup } from "./navigation-types";

type MobileBottomNavigationProps = {
  navigation: readonly ApplicationNavigationGroup[];
  projection: MobileNavigationProjection;
};

function MobileTabLinkContent({ tab }: { tab: MobileNavigationTab }): React.JSX.Element {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-busy={pending || undefined}
      className="flex min-w-0 flex-col items-center justify-center gap-0.5"
    >
      {pending ? (
        <LoadingSpinner aria-hidden="true" className="size-5" />
      ) : (
        <MobileNavigationGlyph icon={tab.icon} />
      )}
      <span className="max-w-full truncate text-xs leading-4">{tab.label}</span>
      {pending ? <span className="sr-only" role="status">กำลังเปิด{tab.accessibleLabel}</span> : null}
    </span>
  );
}

export function MobileBottomNavigation({
  navigation,
  projection,
}: MobileBottomNavigationProps): React.JSX.Element | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationWorkspace = useNavigationWorkspaceContext();
  const selectedWorkspace = resolveSelectedWorkspaceContext(
    projection.availableWorkspaces,
    navigationWorkspace ?? getWorkspaceContextForPathname(pathname),
  );

  if (!selectedWorkspace) {
    return null;
  }

  const tabs = projection.tabsByWorkspace[selectedWorkspace];
  if (tabs.length === 0) {
    return null;
  }

  const activeTabId = resolveActiveMobileTabId(pathname, searchParams.toString(), tabs);

  return (
    <nav
      aria-label="เมนูหลักบนมือถือ"
      className="app-mobile-bottom-navigation fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface shadow-surface lg:hidden"
    >
      <ul
        className="m-0 grid h-full list-none p-0"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <li className="min-w-0" key={`${selectedWorkspace}:${tab.id}`}>
            {tab.id === "more" ? (
              <MoreNavigation
                active={activeTabId === tab.id}
                availableWorkspaces={projection.availableWorkspaces}
                navigation={navigation}
                primaryTabs={tabs}
                selectedWorkspace={selectedWorkspace}
              />
            ) : tab.href ? (
              <Link
                aria-current={activeTabId === tab.id ? "page" : undefined}
                aria-label={tab.accessibleLabel}
                className={classNames(
                  "flex h-full min-h-11 min-w-0 flex-col items-center justify-center rounded-control px-1 text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-inset motion-reduce:transition-none",
                  activeTabId === tab.id
                    ? "type-nav-active bg-brand-soft text-brand-strong"
                    : "hover:bg-surface-muted hover:text-text",
                )}
                href={tab.href}
                onNavigate={(event) => {
                  if (!confirmMobileNavigation()) {
                    event.preventDefault();
                  }
                }}
                prefetch={false}
              >
                <MobileTabLinkContent tab={tab} />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
