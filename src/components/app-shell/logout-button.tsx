"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { connectionFailureMessage, withConnectionFailure } from "@/components/ui/mutation-action-state";
import {
  initialLogoutActionState,
  type LogoutActionState,
} from "@/modules/auth/transport/action-state";
import { logoutAction } from "@/modules/auth/transport/server-actions";

export function LogoutButton({ fullWidth = false }: { fullWidth?: boolean } = {}): React.JSX.Element {
  const [state, formAction, pending] = useActionState<LogoutActionState, FormData>(
    withConnectionFailure(logoutAction, () => ({ status: "ERROR", message: connectionFailureMessage })),
    initialLogoutActionState,
  );

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
