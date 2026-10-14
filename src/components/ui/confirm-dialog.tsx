"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  pendingLabel = "กำลังดำเนินการ...",
  confirmVariant = "default",
  pending = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element | null {
  const confirmLockRef = useRef(false);

  useEffect(() => {
    if (!open) {
      confirmLockRef.current = false;
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleConfirm(): void {
    if (pending || confirmDisabled || confirmLockRef.current) {
      return;
    }

    confirmLockRef.current = true;
    onConfirm();
  }

  return (
    <ModalDialog
      className="max-h-[calc(100svh-1rem)]"
      description={description}
      dismissible={!pending}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button className="w-full sm:w-auto" disabled={pending} onClick={onCancel} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={confirmDisabled}
            loading={pending}
            onClick={handleConfirm}
            variant={confirmVariant === "destructive" ? "danger" : "primary"}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      }
      onRequestClose={onCancel}
      size="compact"
      title={title}
    >
      {details ? <div className="space-y-3 text-sm leading-6 text-text-muted">{details}</div> : null}
    </ModalDialog>
  );
}
