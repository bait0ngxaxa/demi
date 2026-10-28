"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "./button";
import { classNames } from "./class-names";
import { decideModalDialogNativeClose, setupModalDialogLifecycle } from "./modal-dialog-lifecycle";

export type ModalDialogProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Called on Escape or the close button. Not called while `dismissible` is false. */
  onRequestClose: () => void;
  /** False while a mutation runs: Escape and the close button are blocked so the outcome stays visible. */
  dismissible?: boolean;
  /** Changing this value moves focus to the title and scrolls the body to the top (a new step in the flow). */
  stepKey?: string;
  /** Called after the dialog has closed and unmounted; use it to move focus back into the page. */
  onClosed?: () => void;
  size?: "default" | "compact";
  className?: string;
};

/**
 * Native modal dialog for a focused review step. Render it only while open: mounting opens it with
 * `showModal()` (inert background, native focus containment) and unmounting closes it.
 */
export function ModalDialog({
  title,
  description,
  children,
  footer,
  onRequestClose,
  dismissible = true,
  stepKey,
  onClosed,
  size = "default",
  className,
}: ModalDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dismissibleRef = useRef(dismissible);
  const onRequestCloseRef = useRef(onRequestClose);
  const onClosedRef = useRef(onClosed);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    dismissibleRef.current = dismissible;
    onRequestCloseRef.current = onRequestClose;
    onClosedRef.current = onClosed;
  }, [dismissible, onRequestClose, onClosed]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const activeElement = document.activeElement;
    previousFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null;
    const cleanup = setupModalDialogLifecycle({ document, dialog });
    const closedCallbackRef = onClosedRef;

    return () => {
      cleanup();
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected && !previousFocus.matches(":disabled")) {
        previousFocus.focus({ preventScroll: true });
      }
      closedCallbackRef.current?.();
    };
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [stepKey]);

  function handleNativeClose(): void {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }

    if (decideModalDialogNativeClose(dismissibleRef.current) === "REOPEN") {
      dialog.showModal();
      return;
    }

    onRequestCloseRef.current();
  }

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={classNames(
        "m-auto max-h-[calc(100svh-2rem)] max-w-none flex-col overflow-hidden open:flex rounded-dialog border border-border bg-surface p-0 text-text shadow-floating backdrop:bg-brand-deep/45",
        size === "compact"
          ? "w-[min(32rem,calc(100vw-2rem))]"
          : "w-[min(64rem,calc(100vw-2rem))]",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissibleRef.current) {
          onRequestCloseRef.current();
        }
      }}
      onClose={handleNativeClose}
      ref={dialogRef}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2
            className="text-lg font-semibold tracking-[-0.02em] text-ink focus:outline-none"
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
          >
            {title}
          </h2>
          {description ? (
            <div className="mt-1 text-sm leading-6 text-muted" id={descriptionId}>
              {description}
            </div>
          ) : null}
        </div>
        <Button
          aria-label="ปิดหน้าต่าง"
          className="size-11 shrink-0 p-0"
          disabled={!dismissible}
          onClick={onRequestClose}
          size="compact"
          variant="ghost"
        >
          <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
          </svg>
        </Button>
      </header>
      {children !== null && children !== undefined ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6" ref={bodyRef}>
          {children}
        </div>
      ) : null}
      {footer ? (
        <footer className="shrink-0 border-t border-border bg-surface-muted px-5 py-4 sm:px-6">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}
