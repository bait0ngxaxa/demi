"use client";

import { useActionState } from "react";

import {
  initialLogoutActionState,
  type LogoutActionState,
} from "@/modules/auth/transport/action-state";
import { logoutAction } from "@/modules/auth/transport/server-actions";

export function LogoutButton() {
  const [state, formAction, pending] = useActionState<LogoutActionState, FormData>(
    logoutAction,
    initialLogoutActionState,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <button
          className="inline-flex h-11 items-center justify-center rounded-[12px] border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brand-strong disabled:cursor-not-allowed disabled:text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
          disabled={pending}
          type="submit"
        >
          {pending ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
        </button>
      </form>
      {state.status === "ERROR" ? (
        <p className="max-w-xs text-right text-sm leading-5 text-danger" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
