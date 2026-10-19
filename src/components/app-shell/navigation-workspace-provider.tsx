"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { resolveWorkspaceContextForPathname } from "./navigation-state";
import type { ApplicationWorkspaceContext } from "./navigation-types";

const NavigationWorkspaceContext = createContext<ApplicationWorkspaceContext | null>(null);

type NavigationWorkspaceProviderProps = {
  availableWorkspaces: readonly ApplicationWorkspaceContext[];
  children: ReactNode;
};

export function NavigationWorkspaceProvider({
  availableWorkspaces,
  children,
}: NavigationWorkspaceProviderProps): React.JSX.Element {
  const pathname = usePathname() ?? "";
  const selectionIdentity = JSON.stringify([pathname, availableWorkspaces]) ?? "[]";
  const [selectionState, setSelectionState] = useState(() => ({
    identity: selectionIdentity,
    context: resolveWorkspaceContextForPathname(pathname, availableWorkspaces, null),
  }));
  const selectedContext = resolveWorkspaceContextForPathname(
    pathname,
    availableWorkspaces,
    selectionState.context,
  );

  if (selectionState.identity !== selectionIdentity) {
    setSelectionState({ identity: selectionIdentity, context: selectedContext });
  }

  return (
    <NavigationWorkspaceContext.Provider value={selectedContext}>
      {children}
    </NavigationWorkspaceContext.Provider>
  );
}

export function useNavigationWorkspaceContext(): ApplicationWorkspaceContext | null {
  return useContext(NavigationWorkspaceContext);
}
