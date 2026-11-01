"use client";

import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

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
  /** A preferred focus target for dialogs whose first task action should receive focus. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Changing this value scrolls content to the top; focus moves only when `focusOnStepChange` is true. */
  stepKey?: string;
  /** Focuses the owner-selected logical return target after close, if supplied. */
  returnFocusTarget?: () => HTMLElement | null;
  /** Optional post-close owner hook. When supplied, the owner is responsible for focus restoration. */
  onClosed?: () => void;
  /** Whether a step change should intentionally return focus to the heading. */
  focusOnStepChange?: boolean;
  size?: "default" | "compact" | "fullscreen";
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
  initialFocusRef,
  stepKey,
  returnFocusTarget,
  onClosed,
  focusOnStepChange = false,
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
  const returnFocusTargetRef = useRef(returnFocusTarget);
  const cleaningUpRef = useRef(false);
  const pendingCloseCallbackRef = useRef<{ cancelled: boolean } | null>(null);
  const previousStepKeyRef = useRef(stepKey);
  const titleId = useId();
  const descriptionId = useId();

  useLayoutEffect(() => {
    dismissibleRef.current = dismissible;
    onRequestCloseRef.current = onRequestClose;
    onClosedRef.current = onClosed;
    returnFocusTargetRef.current = returnFocusTarget;
  }, [dismissible, onRequestClose, onClosed, returnFocusTarget]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (pendingCloseCallbackRef.current) {
      pendingCloseCallbackRef.current.cancelled = true;
      pendingCloseCallbackRef.current = null;
    }
    cleaningUpRef.current = false;
    const activeElement = dialog.ownerDocument.activeElement;
    previousFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== dialog.ownerDocument.body && !dialog.contains(activeElement)
        ? activeElement
        : null;
    const cleanup = setupModalDialogLifecycle({ document: dialog.ownerDocument, dialog });

    return () => {
      cleaningUpRef.current = true;
      cleanup();

      const closedCallback = onClosedRef.current;
      if (!closedCallback) {
        const logicalReturnTarget = returnFocusTargetRef.current?.() ?? null;
        const returnTarget = logicalReturnTarget ?? previousFocusRef.current;
        const preserveScroll = logicalReturnTarget === null || logicalReturnTarget === previousFocusRef.current;
        if (!focusTarget(returnTarget, dialog, preserveScroll) && returnTarget !== previousFocusRef.current) {
          focusTarget(previousFocusRef.current, dialog, true);
        }
      }

      if (closedCallback) {
        const callbackToken = { cancelled: false };
        pendingCloseCallbackRef.current = callbackToken;
        queueMicrotask(() => {
          if (!callbackToken.cancelled) {
            closedCallback();
          }
          if (pendingCloseCallbackRef.current === callbackToken) {
            pendingCloseCallbackRef.current = null;
          }
        });
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (
      initialFocusRef?.current &&
      dialogRef.current?.contains(initialFocusRef.current) &&
      !initialFocusRef.current.matches(":disabled")
    ) {
      initialFocusRef.current.focus({ preventScroll: true });
    } else {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [initialFocusRef]);

  useLayoutEffect(() => {
    if (Object.is(previousStepKeyRef.current, stepKey)) {
      return;
    }

    previousStepKeyRef.current = stepKey;
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
    if (focusOnStepChange) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [focusOnStepChange, stepKey]);

  function handleNativeClose(): void {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open || cleaningUpRef.current) {
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
          : size === "fullscreen"
            ? "w-[min(64rem,calc(100vw-2rem))] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top,0px)] max-sm:pb-[env(safe-area-inset-bottom,0px)] max-sm:pl-[env(safe-area-inset-left,0px)] max-sm:pr-[env(safe-area-inset-right,0px)]"
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
            className="text-lg font-semibold tracking-[-0.02em] text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
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

function focusTarget(target: HTMLElement | null, dialog: HTMLDialogElement, preventScroll: boolean): boolean {
  if (!target?.isConnected || dialog.contains(target) || target.matches(":disabled")) {
    return false;
  }

  target.focus({ preventScroll });
  return dialog.ownerDocument.activeElement === target;
}
