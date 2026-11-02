"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { dispatchFormDataPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { useDialogFormDraft } from "@/components/ui/use-dialog-form-draft";
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
  taskDialog,
  hidden,
  onSuccess,
  returnFocusTarget,
  pendingLabel = "กำลังบันทึก...",
  submitDisabled = false,
  submitLabel,
  submitVariant = "secondary",
}: {
  action: NetworkAction;
  children?: ReactNode;
  className?: string;
  confirmation?: { title: string; description: string; details?: ReactNode; confirmLabel: string; destructive?: boolean };
  /** One modal surface for a bounded edit or a destructive form that includes required fields. */
  taskDialog?: {
    title: string;
    triggerLabel: string;
    description?: ReactNode;
    destructive?: boolean;
    initialFocusRef?: RefObject<HTMLElement | null>;
    returnFocusTarget?: () => HTMLElement | null;
    size?: "default" | "compact" | "fullscreen";
  };
  hidden: Record<string, string>;
  onSuccess?: () => void;
  returnFocusTarget?: () => HTMLElement | null;
  pendingLabel?: string;
  /** Client-side guard only (e.g. nothing selected); the server still validates every request. */
  submitDisabled?: boolean;
  submitLabel: string;
  submitVariant?: ButtonVariant;
}): React.JSX.Element {
  const router = useRouter();
  const [state, dispatch, pending, unknownOutcome] = useMutationActionState(action, initialHospitalNetworkActionState);
  const handled = useRef<HospitalNetworkActionState | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskDialogBaseline, setTaskDialogBaseline] = useState(state);
  const [dialogHidden, setDialogHidden] = useState<Record<string, string> | null>(null);
  const formId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const taskFlightRef = useRef(false);
  const taskResultAtSubmitRef = useRef<HospitalNetworkActionState>(state);
  const taskDialogSucceeded = taskDialogOpen && state.status === "SUCCESS" && state !== taskDialogBaseline;
  const visibleTaskDialogOpen = taskDialogOpen && !taskDialogSucceeded;
  const { formRef, preserveDraft, clearDraft } = useDialogFormDraft(visibleTaskDialogOpen);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.status === "SUCCESS") {
      if (taskDialog && taskDialogSucceeded) clearDraft();
      onSuccess?.();
      notify.success(state.message);
      router.refresh();
    } else if (state.status === "ERROR" && state.code === "FORBIDDEN") {
      notify.error(state.message);
    }
  }, [clearDraft, onSuccess, router, state, taskDialog, taskDialogSucceeded]);

  useEffect(() => {
    if (!pending && !unknownOutcome && taskFlightRef.current && !Object.is(state, taskResultAtSubmitRef.current)) {
      taskFlightRef.current = false;
    }
  }, [pending, state, unknownOutcome]);

  function handleTaskSubmit(event: React.FormEvent<HTMLFormElement>): void {
    if (pending || unknownOutcome || taskFlightRef.current) {
      event.preventDefault();
      return;
    }
    taskFlightRef.current = true;
    taskResultAtSubmitRef.current = state;
    setTaskDialogBaseline(state);
    dispatchFormDataPreservingInput(event, dispatch);
  }

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

  if (taskDialog) {
    const closeTaskDialog = (): void => {
      if (!pending) {
        if (!preserveDraft()) setDialogHidden(null);
        setTaskDialogOpen(false);
      }
    };

    return (
      <div className={className}>
        <Button
          disabled={pending || unknownOutcome}
          onClick={() => {
            if (dialogHidden === null || taskDialogSucceeded) setDialogHidden({ ...hidden });
            setTaskDialogBaseline(state);
            setTaskDialogOpen(true);
          }}
          size="compact"
          type="button"
          variant={submitVariant}
        >
          {taskDialog.triggerLabel}
        </Button>
        {taskDialogOpen && !taskDialogSucceeded ? (
          <ModalDialog
            description={taskDialog.description}
            dismissible={!pending}
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={pending} onClick={closeTaskDialog} variant="secondary">
                  ยกเลิก
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  disabled={pending || unknownOutcome || submitDisabled}
                  form={formId}
                  loading={pending}
                  size="compact"
                  type="submit"
                  variant={taskDialog.destructive ? "danger" : submitVariant === "primary" ? "primary" : "secondary"}
                >
                  {pending ? pendingLabel : submitLabel}
                </Button>
              </div>
            }
            initialFocusRef={taskDialog.destructive ? cancelButtonRef : taskDialog.initialFocusRef}
            onRequestClose={closeTaskDialog}
            returnFocusTarget={taskDialog.returnFocusTarget}
            size={taskDialog.size ?? "compact"}
            title={taskDialog.title}
          >
            <form action={dispatch} id={formId} onSubmit={handleTaskSubmit} ref={formRef}>
              {Object.entries(dialogHidden ?? hidden).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
              <fieldset className="m-0 min-w-0 border-0 p-0" disabled={pending || unknownOutcome || submitDisabled}>
                {children}
              </fieldset>
            </form>
            {state.status === "ERROR" ? (
              <Alert className="mt-3" role="alert" variant={state.code === "CONFLICT" || state.code === "NOT_FOUND" ? "warning" : "danger"}>
                {state.message}
              </Alert>
            ) : null}
            {unknownOutcome ? <UnknownOutcomeAlert active recovery={{ kind: "reload" }} /> : null}
          </ModalDialog>
        ) : null}
        {!taskDialogOpen && state.status === "ERROR" ? (
          <Alert className="mt-3" role="alert" variant={state.code === "CONFLICT" || state.code === "NOT_FOUND" ? "warning" : "danger"}>
            {state.message}
          </Alert>
        ) : null}
        {!taskDialogOpen ? <UnknownOutcomeAlert active={unknownOutcome} className="mt-3" recovery={{ kind: "reload" }} /> : null}
      </div>
    );
  }

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
          returnFocusTarget={returnFocusTarget}
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
