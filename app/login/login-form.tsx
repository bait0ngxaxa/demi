"use client";

import { useActionState, useEffect, useMemo, useSyncExternalStore } from "react";

import { LoadingSpinner } from "@/components/ui/button";
import {
  initialLoginActionState,
  type LoginActionState,
} from "@/modules/auth/transport/action-state";
import { loginAction } from "@/modules/auth/transport/server-actions";
import {
  loginFamilyInvitationReturnToSchema,
  type LoginReturnTo,
} from "@/modules/auth/schemas/login-schema";

type LoginFormProps = {
  applicationAccessDenied: boolean;
  safeReturnTo: LoginReturnTo | null;
};

function createFamilyInvitationReturnToStore(): {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  getServerSnapshot: () => string;
  hydrate: () => void;
} {
  let destination = "";
  let hydrated = false;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return destination;
    },
    getServerSnapshot() {
      return "";
    },
    hydrate() {
      if (hydrated) {
        return;
      }
      hydrated = true;

      let fragment = "";
      try {
        fragment = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        fragment = "";
      }

      const parsedDestination = loginFamilyInvitationReturnToSchema.safeParse(
        `/app/family/invitations#${fragment}`,
      );
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      destination = parsedDestination.success ? parsedDestination.data : "";
      listeners.forEach((listener) => listener());
    },
  };
}

export function LoginForm({ applicationAccessDenied, safeReturnTo }: LoginFormProps) {
  const invitationReturnToStore = useMemo(() => createFamilyInvitationReturnToStore(), []);
  const familyInvitationReturnTo = useSyncExternalStore(
    invitationReturnToStore.subscribe,
    invitationReturnToStore.getSnapshot,
    invitationReturnToStore.getServerSnapshot,
  );
  const [state, formAction, pending] = useActionState<LoginActionState, FormData>(
    loginAction,
    initialLoginActionState,
  );
  const errorMessage = state.status === "ERROR" ? state.message : undefined;
  const returnTo = familyInvitationReturnTo || safeReturnTo;

  useEffect(() => {
    invitationReturnToStore.hydrate();
  }, [invitationReturnToStore]);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {returnTo ? (
        <input name="returnTo" type="hidden" value={returnTo} />
      ) : null}
      {applicationAccessDenied ? (
        <div
          className="rounded-[14px] bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
          role="status"
        >
          บัญชีที่ยืนยันตัวตนอยู่ยังไม่สามารถเข้าใช้งาน DEMI ได้
          กรุณาใช้บัญชีที่ได้รับการเปิดใช้งาน หรือติดต่อผู้ดูแลระบบ
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="nationalId">
          เลขบัตรประชาชน / ตัวระบุผู้ดูแลระบบ
        </label>
        <input
          aria-describedby={errorMessage ? "login-error" : undefined}
          autoCapitalize="none"
          autoComplete="username"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="nationalId"
          inputMode="text"
          maxLength={32}
          name="nationalId"
          placeholder="เลขบัตรประชาชน หรือรหัสผู้ดูแลระบบ"
          required
          spellCheck={false}
          type="text"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-ink" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          aria-describedby={errorMessage ? "login-error" : undefined}
          autoComplete="current-password"
          className="h-12 w-full rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] focus:border-brand focus:ring-4 focus:ring-brand-soft"
          disabled={pending}
          id="password"
          maxLength={128}
          name="password"
          required
          type="password"
        />
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <p className="text-sm leading-6 text-danger" id="login-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <button
        aria-busy={pending || undefined}
        className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white shadow-[0_8px_22px_rgba(18,103,89,0.22)] transition-[background-color,box-shadow,transform] hover:bg-brand-strong hover:shadow-[0_10px_26px_rgba(18,103,89,0.28)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
        disabled={pending}
        type="submit"
      >
        {pending ? <LoadingSpinner className="mr-2" /> : null}
        {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
