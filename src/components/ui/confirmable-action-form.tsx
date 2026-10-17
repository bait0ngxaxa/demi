"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { Alert } from "./alert";
import { ConfirmDialog } from "./confirm-dialog";
import { unknownOutcomeMessage } from "./mutation-action-state";

export type ConfirmableActionOutcome = "idle" | "success" | "error" | "unknown";

type ConfirmableAction = (formData: FormData) => void | Promise<void>;

type ConfirmationDetails = {
  title: string;
  description?: ReactNode;
  details?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
};

type ConfirmableActionFormProps = Omit<ComponentProps<"form">, "action" | "children" | "onSubmit"> & {
  action: ConfirmableAction;
  children: ReactNode;
  confirmation: ConfirmationDetails;
  outcome: ConfirmableActionOutcome;
  resultKey: unknown;
  pending: boolean;
  requiresConfirmation?: boolean;
};

const submissionDispatchErrorMessage = "ไม่สามารถส่งแบบฟอร์มได้ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง";

export function ConfirmableActionForm({
  action,
  children,
  className,
  confirmation,
  outcome,
  resultKey,
  pending,
  requiresConfirmation = true,
  ...formProps
}: ConfirmableActionFormProps): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const submitterRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const bypassConfirmationRef = useRef(false);
  const waitingForResultRef = useRef(false);
  const sawPendingRef = useRef(false);
  const resultAtSubmitRef = useRef<unknown>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [awaitingResult, setAwaitingResult] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [submissionDispatchError, setSubmissionDispatchError] = useState(false);

  useEffect(() => {
    if (!awaitingResult) {
      waitingForResultRef.current = false;
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
      setUnknownOutcome(true);
      return;
    }

    setUnknownOutcome(false);
    setDialogOpen(false);
  }, [awaitingResult, outcome, pending, resultKey]);

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
    }
  }

  function cancelSubmission(): void {
    if (pending || waitingForResultRef.current) {
      return;
    }
    setDialogOpen(false);
  }

  const dialogPending = pending || awaitingResult;

  return (
    <form {...formProps} action={action} className={className} onSubmit={handleSubmit} ref={formRef}>
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled={dialogPending || unknownOutcome}>
        {children}
      </fieldset>
      {unknownOutcome ? (
        <Alert className="mt-4" role="alert" variant="warning">
          {unknownOutcomeMessage}
        </Alert>
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
        confirmVariant={confirmation.confirmVariant}
        description={confirmation.description}
        details={
          unknownOutcome ? (
            <Alert role="alert" variant="warning">
              {unknownOutcomeMessage}
            </Alert>
          ) : confirmation.details
        }
        onCancel={cancelSubmission}
        onConfirm={confirmSubmission}
        open={dialogOpen}
        pending={dialogPending}
        title={confirmation.title}
      />
    </form>
  );
}
