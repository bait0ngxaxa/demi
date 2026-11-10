"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { Alert } from "./alert";
import { ConfirmDialog } from "./confirm-dialog";
import { unknownOutcomeMessage } from "./mutation-action-state";
import { UnknownOutcomeAlert } from "./unknown-outcome-alert";

export type ConfirmableActionOutcome = "idle" | "success" | "error" | "unknown";

type ConfirmableAction = (formData: FormData) => void | Promise<void>;

type ConfirmationDetails = {
  title: string;
  description?: ReactNode;
  details?: ReactNode;
  confirmLabel?: string;
  /** Confirm button text while the request runs; defaults to `confirmLabel`. */
  pendingLabel?: string;
  confirmVariant?: "default" | "destructive";
};

type ConfirmableActionFormProps = Omit<ComponentProps<"form">, "action" | "children" | "onSubmit"> & {
  action: ConfirmableAction;
  children: ReactNode;
  /** Recovery actions remain interactive when the submitted form controls are locked. */
  recovery?: ReactNode;
  confirmation: ConfirmationDetails;
  outcome: ConfirmableActionOutcome;
  /** New identity for a confirmed result; stays unchanged when the prior result is unknown. */
  resultKey: unknown;
  pending: boolean;
  requiresConfirmation?: boolean;
  returnFocusTarget?: () => HTMLElement | null;
  /**
   * Called synchronously once the confirmed submission reached the action, outside its transition,
   * so an owner can lock sibling mutations immediately rather than when the request settles.
   */
  onSubmitted?: () => void;
};

const submissionDispatchErrorMessage = "ไม่สามารถส่งแบบฟอร์มได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง";

export function ConfirmableActionForm({
  action,
  children,
  recovery,
  className,
  confirmation,
  outcome,
  resultKey,
  pending,
  requiresConfirmation = true,
  returnFocusTarget,
  onSubmitted,
  ...formProps
}: ConfirmableActionFormProps): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);
  const submitterRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const bypassConfirmationRef = useRef(false);
  const waitingForResultRef = useRef(false);
  const sawPendingRef = useRef(false);
  const resultAtSubmitRef = useRef<unknown>(null);
  const unknownResultKeyRef = useRef<{ key: unknown } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [submissionDispatchError, setSubmissionDispatchError] = useState(false);

  useEffect(() => {
    if (!awaitingResult) {
      waitingForResultRef.current = false;
      const unknownResult = unknownResultKeyRef.current;
      if (
        unknownOutcome &&
        unknownResult &&
        !pending &&
        (outcome === "success" || outcome === "error") &&
        !Object.is(resultKey, unknownResult.key)
      ) {
        unknownResultKeyRef.current = null;
        setUnknownOutcome(false);
        setDialogOpen(false);
      }
      return;
    }

    if (pending) {
      sawPendingRef.current = true;
      return;
    }

    if (!sawPendingRef.current) {
      return;
    }

    waitingForResultRef.current = false;
    setAwaitingResult(false);

    if (
      resultKey === resultAtSubmitRef.current ||
      outcome === "idle" ||
      outcome === "unknown"
    ) {
      unknownResultKeyRef.current = { key: resultKey };
      setUnknownOutcome(true);
      return;
    }

    unknownResultKeyRef.current = null;
    setUnknownOutcome(false);
    setDialogOpen(false);
  }, [awaitingResult, outcome, pending, resultKey, unknownOutcome]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    if (bypassConfirmationRef.current) {
      bypassConfirmationRef.current = false;
      return;
    }

    if (pending || waitingForResultRef.current || unknownOutcome) {
      event.preventDefault();
      return;
    }

    setSubmissionDispatchError(false);

    if (!requiresConfirmation) {
      return;
    }

    event.preventDefault();
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter;
    submitterRef.current =
      submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
        ? submitter
        : null;
    setDialogOpen(true);
  }

  function confirmSubmission(): void {
    if (pending || waitingForResultRef.current || unknownOutcome) {
      return;
    }

    const form = formRef.current;
    if (!form) {
      return;
    }

    waitingForResultRef.current = true;
    sawPendingRef.current = false;
    resultAtSubmitRef.current = resultKey;
    bypassConfirmationRef.current = true;
    setAwaitingResult(true);

    const submitter = submitterRef.current;
    try {
      if (submitter?.form === form) {
        form.requestSubmit(submitter);
      } else {
        form.requestSubmit();
      }
    } catch {
      // A submit event may already have started the action before a host implementation throws.
      // Keep waiting in that case so the existing outcome reconciliation remains authoritative.
    }

    if (bypassConfirmationRef.current) {
      bypassConfirmationRef.current = false;
      waitingForResultRef.current = false;
      sawPendingRef.current = false;
      resultAtSubmitRef.current = null;
      setAwaitingResult(false);
      setDialogOpen(false);
      setSubmissionDispatchError(true);
      return;
    }

    onSubmitted?.();
  }

  function cancelSubmission(): void {
    if (pending || waitingForResultRef.current) {
      return;
    }
    setDialogOpen(false);
  }

  const dialogPending = pending || awaitingResult;

  function restoreFocusTarget(): HTMLElement | null {
    const requestedTarget = returnFocusTarget?.() ?? null;
    if (requestedTarget?.isConnected && !requestedTarget.matches(":disabled")) {
      return requestedTarget;
    }

    if (unknownOutcome) {
      return recoveryRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled)") ?? recoveryRef.current;
    }

    return submitterRef.current;
  }

  return (
    <form {...formProps} action={action} className={className} onSubmit={handleSubmit} ref={formRef}>
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={dialogPending || unknownOutcome}>
        {children}
      </fieldset>
      {recovery ? (
        <div aria-hidden={dialogOpen || undefined} ref={recoveryRef} tabIndex={unknownOutcome && !dialogOpen ? -1 : undefined}>
          {recovery}
        </div>
      ) : null}
      {!recovery && unknownOutcome ? (
        <div aria-hidden={dialogOpen || undefined} ref={recoveryRef} tabIndex={unknownOutcome && !dialogOpen ? -1 : undefined}>
          <UnknownOutcomeAlert active recovery={{ kind: "reload", message: unknownOutcomeMessage }} />
        </div>
      ) : null}
      {submissionDispatchError ? (
        <Alert className="mt-4" role="alert" variant="warning">
          {submissionDispatchErrorMessage}
        </Alert>
      ) : null}
      <ConfirmDialog
        cancelLabel={unknownOutcome ? "ปิดหน้าต่าง" : undefined}
        confirmDisabled={unknownOutcome}
        confirmLabel={confirmation.confirmLabel}
        pendingLabel={confirmation.pendingLabel}
        confirmVariant={confirmation.confirmVariant}
        description={unknownOutcome && recovery
          ? "ปิดหน้าต่างนี้เพื่อดำเนินการตรวจสอบผลด้วยวิธีที่ระบบเตรียมไว้"
          : confirmation.description}
        details={
          unknownOutcome ? (
            recovery ? null : <UnknownOutcomeAlert active recovery={{ kind: "reload", message: unknownOutcomeMessage }} />
          ) : confirmation.details
        }
        onCancel={cancelSubmission}
        onConfirm={confirmSubmission}
        open={dialogOpen}
        pending={dialogPending}
        returnFocusTarget={restoreFocusTarget}
        title={unknownOutcome && recovery ? "ยังยืนยันผลรายการนี้ไม่ได้" : confirmation.title}
      />
    </form>
  );
}
