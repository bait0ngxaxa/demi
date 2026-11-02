"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "./button";
import { ModalDialog } from "./modal-dialog";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  confirmVariant?: "default" | "destructive";
  pending?: boolean;
  confirmDisabled?: boolean;
  /** Change only after a confirmed, explicitly recoverable failure. Pending changes alone do not unlock retry. */
  recoveryKey?: string | number | null;
  /** Return false to abort before the dialog locks confirmation. */
  onBeforeConfirm?: () => boolean;
  returnFocusTarget?: () => HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  details,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  pendingLabel = confirmLabel,
  confirmVariant = "default",
  pending = false,
  confirmDisabled = false,
  recoveryKey,
  onBeforeConfirm,
  returnFocusTarget,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  const confirmLockRef = useRef(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const recoveryKeyRef = useRef(recoveryKey);
  const [confirmationLocked, setConfirmationLocked] = useState(false);

  useLayoutEffect(() => {
    let shouldUnlock = !open;
    if (!Object.is(recoveryKeyRef.current, recoveryKey)) {
      recoveryKeyRef.current = recoveryKey;
      shouldUnlock = true;
    }
    if (shouldUnlock) {
      confirmLockRef.current = false;
      setConfirmationLocked(false);
    }
  }, [open, recoveryKey]);

  if (!open) {
    return null;
  }

  function handleConfirm(): void {
    if (pending || confirmDisabled || confirmLockRef.current) {
      return;
    }

    if (onBeforeConfirm && !onBeforeConfirm()) {
      return;
    }

    confirmLockRef.current = true;
    setConfirmationLocked(true);
    onConfirm();
  }

  return (
    <ModalDialog
      className="max-h-[calc(100svh-1rem)]"
      description={description}
      dismissible={!pending}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button ref={cancelButtonRef} className="w-full sm:w-auto" disabled={pending} onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={confirmDisabled || confirmationLocked}
            loading={pending}
            onClick={handleConfirm}
            variant={confirmVariant === "destructive" ? "danger" : "primary"}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      }
      initialFocusRef={cancelButtonRef}
      onRequestClose={onCancel}
      returnFocusTarget={returnFocusTarget}
      size="compact"
      title={title}
    >
      {details ? <div className="space-y-3 text-sm leading-6 text-text-muted">{details}</div> : null}
    </ModalDialog>
  );
}
