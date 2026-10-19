"use client";

import { useActionState } from "react";

import { connectionFailureMessage, withConnectionFailure } from "@/components/ui/mutation-action-state";
import { initialLogoutActionState, type LogoutActionState } from "@/modules/auth/transport/action-state";
import { switchDemiAccountForLineAction } from "@/modules/auth/transport/server-actions";

const switchAction = withConnectionFailure(
  switchDemiAccountForLineAction,
  (): LogoutActionState => ({ status: "ERROR", message: connectionFailureMessage }),
);

/** Ends the DEMI session only; the LINE binding is unchanged. Login returns here. */
export function LineDemiAccountSwitch({ label, hint, className, disabled = false }: {
  label: string;
  hint?: string;
  className: string;
  disabled?: boolean;
}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<LogoutActionState, FormData>(switchAction, initialLogoutActionState);
  return (
    <form action={formAction} className="space-y-2">
      <button type="submit" disabled={disabled || pending} className={className}>
        {pending ? "กำลังออกจากระบบ DEMI..." : label}
      </button>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {state.status === "ERROR" ? <p className="text-sm text-danger" role="alert">{state.message}</p> : null}
    </form>
  );
}
