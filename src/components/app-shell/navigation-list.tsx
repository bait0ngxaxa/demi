"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { classNames } from "@/components/ui/class-names";

import { isNavigationItemActive } from "./navigation-state";
import type { ApplicationNavigationGroup } from "./navigation-types";

type NavigationListProps = {
  groups: readonly ApplicationNavigationGroup[];
  onNavigate?: () => void;
  tone?: "desktop" | "mobile";
};

export function NavigationList({
  groups,
  onNavigate,
  tone = "desktop",
}: NavigationListProps): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {groups.map((group, groupIndex) => {
        const groupActive = group.items.some((item) => isNavigationItemActive(pathname, item));

        return (
          <div key={group.label ?? `root-${groupIndex}`}>
            {group.label ? (
              <p
                className={classNames(
                  "mb-2 px-3 text-xs font-medium tracking-[0.01em]",
                  tone === "desktop"
                    ? groupActive
                      ? "text-brand-bright"
                      : "text-white/55"
                    : groupActive
                      ? "text-brand-strong"
                      : "text-text-subtle",
                )}
              >
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isNavigationItemActive(pathname, item);

                return (
                  <li key={item.href}>
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={classNames(
                        "flex min-h-11 items-center rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4",
                        tone === "desktop"
                          ? active
                            ? "type-nav-active bg-navigation-active text-brand-deep focus-visible:ring-brand-bright"
                            : "text-white/82 hover:bg-navigation-hover hover:text-white focus-visible:ring-brand-bright"
                          : active
                            ? "type-nav-active bg-brand-soft text-brand-deep focus-visible:ring-focus-ring"
                            : "text-text hover:bg-surface-muted focus-visible:ring-focus-ring",
                      )}
                      href={item.href}
                      onClick={onNavigate}
                    >
                      {item.label}
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
