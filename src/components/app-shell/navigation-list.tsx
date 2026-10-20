"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LoadingSpinner } from "@/components/ui/button";
import { classNames } from "@/components/ui/class-names";

import { getMoreNavigationIcon, MobileNavigationGlyph } from "./mobile-navigation-glyph";
import { compareNavigationSections } from "./navigation-sections";
import {
  getWorkspaceContextForPathname,
  resolveActiveNavigationHrefs,
  resolveSelectedWorkspaceContext,
} from "./navigation-state";
import { useNavigationWorkspaceContext } from "./navigation-workspace-provider";
import type {
  ApplicationNavigationGroup,
  ApplicationWorkspaceContext,
} from "./navigation-types";

type NavigationListProps = {
  groups: readonly ApplicationNavigationGroup[];
  availableContexts?: readonly ApplicationWorkspaceContext[];
  /** Icon rail: every item stays reachable as an icon link named by `aria-label`; headings are visually hidden. */
  collapsed?: boolean;
  /** Desktop sidebar height budget (UI-4.1): 40px items and tighter section spacing. */
  density?: "default" | "compact";
  /** Called for client-side navigations only; may cancel the link navigation to perform it itself. */
  onNavigate?: (event: { preventDefault: () => void }, href: string) => void;
  tone?: "desktop" | "mobile";
};

export function NavigationList({
  availableContexts: providedAvailableContexts,
  collapsed = false,
  density = "default",
  groups,
  onNavigate,
  tone = "desktop",
}: NavigationListProps): React.JSX.Element {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const navigationWorkspace = useNavigationWorkspaceContext();
  const availableContexts = providedAvailableContexts ?? Array.from(
    new Set(
      groups
        .map(({ workspace }) => workspace)
        .filter(
          (workspace): workspace is ApplicationWorkspaceContext =>
            workspace === "personal" || workspace === "work",
        ),
    ),
  );
  const selectedContext = resolveSelectedWorkspaceContext(
    availableContexts,
    navigationWorkspace ?? getWorkspaceContextForPathname(pathname),
  );
  const visibleGroups = groups
    .filter(({ workspace }) => workspace === undefined || workspace === "all" || workspace === selectedContext)
    .sort((left, right) => compareNavigationSections(left.id, right.id));
  const activeHrefs = resolveActiveNavigationHrefs(
    pathname,
    search,
    visibleGroups.flatMap(({ items }) => items),
  );

  return (
    <div className={collapsed || density === "compact" ? "space-y-3" : "space-y-6"}>
      {visibleGroups.map((group) => {
        const groupActive = group.items.some(({ href }) => activeHrefs.has(href));
        const headingId = `navigation-section-${tone}-${group.id}`;

        return (
          <div key={group.id}>
            {group.label ? (
              <p
                className={classNames(
                  collapsed
                    ? "sr-only"
                    : density === "compact"
                      ? "mb-1 px-3 text-xs font-medium leading-4 tracking-[0.01em]"
                      : "mb-2 px-3 text-xs font-medium tracking-[0.01em]",
                  tone === "desktop"
                    ? groupActive
                      ? "text-brand-bright"
                      : "text-white/55"
                    : groupActive
                      ? "text-brand-strong"
                      : "text-text-subtle",
                )}
                id={headingId}
              >
                {group.label}
              </p>
            ) : null}
            <ul aria-labelledby={group.label ? headingId : undefined} className={density === "compact" ? "space-y-0.5" : "space-y-1"}>
              {group.items.map((item) => {
                const active = activeHrefs.has(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={classNames(
                        "flex min-w-0 items-center gap-3 rounded-control text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4",
                        density === "compact" ? "min-h-10 py-1.5" : "min-h-11 py-2",
                        collapsed ? "justify-center px-0" : "px-3",
                        tone === "desktop"
                          ? active
                            ? "type-nav-active bg-navigation-active text-brand-deep focus-visible:ring-brand-bright"
                            : "text-white/82 hover:bg-navigation-hover hover:text-white focus-visible:ring-brand-bright"
                          : active
                            ? "type-nav-active bg-brand-soft text-brand-deep focus-visible:ring-focus-ring"
                            : "text-text hover:bg-surface-muted focus-visible:ring-focus-ring",
                      )}
                      data-navigation-tooltip={collapsed ? item.label : undefined}
                      href={item.href}
                      prefetch={item.prefetch}
                      onNavigate={onNavigate ? (event) => onNavigate(event, item.href) : undefined}
                    >
                      <MobileNavigationGlyph icon={getMoreNavigationIcon(item.href)} />
                      {collapsed ? null : <span className="min-w-0 flex-1">{item.label}</span>}
                      <NavigationPendingHint />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Navigation links are not prefetched, so the destination's loading UI cannot appear until the server answers. */
function NavigationPendingHint(): React.JSX.Element | null {
  const { pending } = useLinkStatus();

  if (!pending) {
    return null;
  }

  return (
    <>
      <LoadingSpinner className="ml-2 shrink-0" />
      <span className="sr-only">กำลังเปิดหน้า</span>
    </>
  );
}
