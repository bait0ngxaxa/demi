"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { classNames } from "@/components/ui/class-names";

import { confirmMobileNavigation } from "./mobile-navigation-guard";
import { getMoreNavigationIcon, MobileNavigationGlyph } from "./mobile-navigation-glyph";
import { isNavigationItemActive } from "./navigation-state";
import type {
  ApplicationNavigationGroup,
  ApplicationWorkspaceContext,
} from "./navigation-types";

type MoreMenuNavigationProps = {
  groups: readonly ApplicationNavigationGroup[];
  selectedWorkspace: ApplicationWorkspaceContext | null;
};

export function MoreMenuNavigation({
  groups,
  selectedWorkspace,
}: MoreMenuNavigationProps): React.JSX.Element {
  const pathname = usePathname() ?? "";
  const visibleGroups = groups.filter(({ workspace }) =>
    workspace === undefined || workspace === "all" || workspace === selectedWorkspace,
  );

  return (
    <nav aria-label="เมนูเพิ่มเติม" className="space-y-8">
      {visibleGroups.map((group, groupIndex) => {
        const headingId = `more-navigation-heading-${groupIndex}`;

        return (
          <section aria-labelledby={headingId} className="space-y-3" key={group.label ?? `group-${groupIndex}`}>
            <h2 className="text-sm font-semibold text-text-muted" id={headingId}>
              {group.label ?? "เมนูอื่น"}
            </h2>
            <ul className="m-0 list-none divide-y divide-border border-y border-border p-0">
              {group.items.map((item) => {
                const active = item.workspaceContext
                  ? item.workspaceContext === selectedWorkspace
                  : isNavigationItemActive(pathname, item);

                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? (item.workspaceContext ? "location" : "page") : undefined}
                      className={classNames(
                        "group flex min-h-12 min-w-0 items-center gap-3 px-2 py-2 text-sm font-medium transition-colors focus-visible:relative focus-visible:z-10 focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring motion-reduce:transition-none",
                        active
                          ? "bg-brand-soft text-brand-deep"
                          : "text-text hover:bg-surface-muted hover:text-brand-strong",
                      )}
                      href={item.href}
                      onNavigate={(event) => {
                        if (!confirmMobileNavigation()) {
                          event.preventDefault();
                        }
                      }}
                      prefetch={item.prefetch}
                    >
                      <span
                        className={classNames(
                          "flex size-10 shrink-0 items-center justify-center rounded-control",
                          active ? "bg-surface text-brand-strong" : "bg-surface-muted text-text-muted",
                        )}
                      >
                        <MobileNavigationGlyph icon={getMoreNavigationIcon(item.href)} />
                      </span>
                      <span className="min-w-0 flex-1">{item.label}</span>
                      <svg
                        aria-hidden="true"
                        className="size-4 shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path d="m9 5 7 7-7 7" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
