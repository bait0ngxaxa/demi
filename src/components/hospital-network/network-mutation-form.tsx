"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialHospitalNetworkActionState,
  type HospitalNetworkActionState,
} from "@/modules/hospital-service-areas/transport/action-state";

type NetworkAction = (previous: HospitalNetworkActionState, formData: FormData) => Promise<HospitalNetworkActionState>;

/**
 * One network mutation (attach, end, transfer, role, registry). The server re-authorizes every request;
 * success refreshes the page so the authoritative state replaces the form, and errors stay inline.
 */
export function NetworkMutationForm({
  action,
  children,
  className,
  confirmation,
  hidden,
  pendingLabel = "กำลังบันทึก...",
  submitDisabled = false,
  submitLabel,
  submitVariant = "secondary",
}: {
  action: NetworkAction;
  children?: ReactNode;
  className?: string;
  confirmation?: { title: string; description: string; details?: ReactNode; confirmLabel: string; destructive?: boolean };
  hidden: Record<string, string>;
  pendingLabel?: string;
  /** Client-side guard only (e.g. nothing selected); the server still validates every request. */
  submitDisabled?: boolean;
  submitLabel: string;
  submitVariant?: ButtonVariant;
}): React.JSX.Element {
  const router = useRouter();
  const [state, dispatch, pending, unknownOutcome] = useMutationActionState(action, initialHospitalNetworkActionState);
  const handled = useRef<HospitalNetworkActionState | null>(null);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.status === "SUCCESS") {
      notify.success(state.message);
      router.refresh();
    } else if (state.status === "ERROR" && state.code === "FORBIDDEN") {
      notify.error(state.message);
    }
  }, [router, state]);

  const fields = (
    <>
      {Object.entries(hidden).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
      {children}
      <Button
        className={children ? "mt-3" : undefined}
        disabled={pending || unknownOutcome || submitDisabled}
        loading={pending}
        size="compact"
        type="submit"
        variant={submitVariant}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </>
  );

  return (
    <div className={className}>
      {confirmation ? (
        <ConfirmableActionForm
          action={dispatch}
          confirmation={{
            title: confirmation.title,
            description: confirmation.description,
            details: confirmation.details,
            confirmLabel: confirmation.confirmLabel,
            confirmVariant: confirmation.destructive ? "destructive" : "default",
          }}
          outcome={state.status === "SUCCESS" ? "success" : state.status === "ERROR" ? "error" : unknownOutcome ? "unknown" : "idle"}
          pending={pending}
          resultKey={state}
        >
          {fields}
        </ConfirmableActionForm>
      ) : (
        <form action={dispatch}>{fields}</form>
      )}
      {state.status === "ERROR" ? (
        <Alert className="mt-3" role="alert" variant={state.code === "CONFLICT" || state.code === "NOT_FOUND" ? "warning" : "danger"}>
          {state.message}
        </Alert>
      ) : null}
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-3" recovery={{ kind: "reload" }} />
    </div>
  );
}
