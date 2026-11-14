"use client";

import { createContext, Fragment, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "./button";

const RefreshContext = createContext<(() => void) | null>(null);

/** Reset local recovery state only after an explicit refresh receives a new server response. */
export function InPlaceRefreshBoundary({ requestId, children }: {
  requestId: string;
  children: ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const [refreshFrom, setRefreshFrom] = useState<string | null>(null);
  const [generation, setGeneration] = useState(requestId);
  if (refreshFrom !== null && requestId !== refreshFrom) {
    setRefreshFrom(null);
    setGeneration(requestId);
  }
  function refresh(): void {
    setRefreshFrom(requestId);
    router.refresh();
  }
  return <RefreshContext value={refresh}><Fragment key={generation}>{children}</Fragment></RefreshContext>;
}

/** Also lets existing unknown-outcome reload controls use the containing page's recovery boundary. */
export function useInPlaceRefresh(): (() => void) | null {
  return useContext(RefreshContext);
}

export function InPlaceRefreshButton(props: Omit<ButtonProps, "onClick" | "type">): React.JSX.Element {
  const router = useRouter();
  const refresh = useInPlaceRefresh();
  return <Button {...props} type="button" onClick={refresh ?? (() => router.refresh())} />;
}
