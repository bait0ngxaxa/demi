"use client";

import Link from "next/link";

import { classNames } from "@/components/ui/class-names";

import { MobileNavigationGlyph } from "./mobile-navigation-glyph";
import { useNavigationWorkspaceContext } from "./navigation-workspace-provider";
import type { ApplicationWorkspaceContext } from "./navigation-types";

const workspacePresentation: Record<ApplicationWorkspaceContext, { label: string; icon: "profile" | "hospital" }> = {
  personal: { label: "ส่วนตัว", icon: "profile" },
  work: { label: "งาน", icon: "hospital" },
};

/** UI-4: switching workspace is a segmented control, not a navigation section. */
export function WorkspaceSwitch({
  availableWorkspaces,
  collapsed = false,
  hrefs,
  tone,
}: {
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
  collapsed?: boolean;
  hrefs: Readonly<Record<ApplicationWorkspaceContext, string>>;
  tone: "desktop" | "mobile";
}): React.JSX.Element | null {
  const selectedWorkspace = useNavigationWorkspaceContext();

  if (availableWorkspaces.length < 2) {
    return null;
  }

  return (
    <nav aria-label="พื้นที่ใช้งาน">
      <ul
        className={classNames(
          "m-0 grid list-none gap-1 rounded-control p-1",
          collapsed ? "grid-cols-1" : "grid-cols-2",
          tone === "desktop" ? "bg-white/8" : "bg-surface-muted",
        )}
      >
        {availableWorkspaces.map((workspace) => {
          const { icon, label } = workspacePresentation[workspace];
          const selected = workspace === selectedWorkspace;

          return (
            <li className="min-w-0" key={workspace}>
              <Link
                aria-current={selected ? "location" : undefined}
                aria-label={collapsed ? `พื้นที่${label}` : undefined}
                className={classNames(
                  "flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 motion-reduce:transition-none",
                  tone === "desktop"
                    ? selected
                      ? "bg-navigation-active text-brand-deep focus-visible:ring-brand-bright"
                      : "text-white/82 hover:bg-navigation-hover hover:text-white focus-visible:ring-brand-bright"
                    : selected
                      ? "bg-surface text-brand-deep focus-visible:ring-focus-ring"
                      : "text-text-muted hover:text-text focus-visible:ring-focus-ring",
                )}
                data-navigation-tooltip={collapsed ? `พื้นที่${label}` : undefined}
                href={hrefs[workspace]}
                prefetch={false}
              >
                <MobileNavigationGlyph icon={icon} />
                {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
