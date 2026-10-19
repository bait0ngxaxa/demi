"use client";

import { useNavigationWorkspaceContext } from "./navigation-workspace-provider";

export function MobileWorkspaceLabel(): React.JSX.Element {
  const selectedWorkspace = useNavigationWorkspaceContext();

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
