"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { connectionFailureMessage, withConnectionFailure } from "@/components/ui/mutation-action-state";
import {
  initialLogoutActionState,
  type LogoutActionState,
} from "@/modules/auth/transport/action-state";
import { logoutAction } from "@/modules/auth/transport/server-actions";

export function LogoutButton({
  fullWidth = false,
  iconOnly = false,
}: { fullWidth?: boolean; iconOnly?: boolean } = {}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<LogoutActionState, FormData>(
    withConnectionFailure(logoutAction, () => ({ status: "ERROR", message: connectionFailureMessage })),
    initialLogoutActionState,
  );

  if (iconOnly) {
    // Desktop icon rail: named by aria-label; the sidebar shows the tooltip from data-navigation-tooltip.
    return (
      <form action={formAction}>
        <button
          aria-label={pending ? "กำลังออกจากระบบ" : "ออกจากระบบ"}
          className="flex size-10 shrink-0 items-center justify-center rounded-control text-white/82 transition-colors hover:bg-navigation-hover hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-bright disabled:opacity-60"
          data-navigation-tooltip={state.status === "ERROR" ? state.message : "ออกจากระบบ"}
          disabled={pending}
          type="submit"
        >
          <svg aria-hidden="true" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24">
            <path d="M14 4.5H6.5v15H14M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
          </svg>
        </button>
        {state.status === "ERROR" ? <p className="sr-only" role="alert">{state.message}</p> : null}
      </form>
    );
  }

  return (
    <div className={fullWidth ? "flex w-full flex-col items-stretch gap-2" : "flex flex-col items-end gap-2"}>
      <form action={formAction} className={fullWidth ? "w-full" : undefined}>
        <Button
          className={fullWidth ? "w-full" : undefined}
          loading={pending}
          size={fullWidth ? "default" : "compact"}
          type="submit"
          variant="secondary"
        >
          {pending ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
        </Button>
      </form>
      {state.status === "ERROR" ? (
        <p className={fullWidth ? "text-sm leading-5 text-danger" : "max-w-xs text-right text-sm leading-5 text-danger"} role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
