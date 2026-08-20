"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  initialLogoutActionState,
  type LogoutActionState,
} from "@/modules/auth/transport/action-state";
import { logoutAction } from "@/modules/auth/transport/server-actions";

export function LogoutButton(): React.JSX.Element {
  const [state, formAction, pending] = useActionState<LogoutActionState, FormData>(
    logoutAction,
    initialLogoutActionState,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <Button loading={pending} size="compact" type="submit" variant="secondary">
          {pending ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
        </Button>
      </form>
      {state.status === "ERROR" ? (
        <p className="max-w-xs text-right text-sm leading-5 text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
