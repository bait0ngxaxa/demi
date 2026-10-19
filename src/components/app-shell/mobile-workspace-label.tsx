"use client";

import { usePathname } from "next/navigation";

import {
  getWorkspaceContextForPathname,
  resolveSelectedWorkspaceContext,
} from "./navigation-state";
import type { ApplicationWorkspaceContext } from "./navigation-types";

type MobileWorkspaceLabelProps = {
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
};

export function MobileWorkspaceLabel({
  availableWorkspaces,
}: MobileWorkspaceLabelProps): React.JSX.Element {
  const pathname = usePathname();
  const selectedWorkspace = resolveSelectedWorkspaceContext(
    availableWorkspaces,
    getWorkspaceContextForPathname(pathname),
  );

  return (
    <p className="truncate text-xs text-text-muted">
      {selectedWorkspace === "personal"
        ? "พื้นที่ส่วนตัว"
        : selectedWorkspace === "work"
          ? "พื้นที่งาน"
          : "พื้นที่ใช้งาน"}
    </p>
  );
}
