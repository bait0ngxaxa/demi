"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";

import { CredentialLinkActions } from "./credential-link-actions";
import { CredentialQrActions } from "./credential-qr-actions";

/** Fits small phones and the LINE in-app browser: the body scrolls inside the dialog and the footer stays visible. */
export const credentialHandoffDialogClassName =
  "[max-height:calc(100svh-2*max(1rem,env(safe-area-inset-top,0px),env(safe-area-inset-bottom,0px)))]! [max-width:calc(100dvw-2*max(1rem,env(safe-area-inset-left,0px),env(safe-area-inset-right,0px)))]!";

const LeaveContext = createContext<((href: string) => void) | null>(null);

/**
 * For flow-specific actions inside the hand-off: leaves the page on purpose (for example to start activation on
 * this device) without the leave warning. Call the returned function from an event handler only.
 */
export function useCredentialHandoffLeave(): (href: string) => void {
  const leaveTo = useContext(LeaveContext);
  if (!leaveTo) throw new Error("useCredentialHandoffLeave must be used inside a credential hand-off");
  return leaveTo;
}

/** A one-time credential link supplied by the server. It is held only in component memory and cannot be shown again. */
export type CredentialHandoff = {
  url: string;
  expiresAt: string | Date | null;
  oneTimeNotice: ReactNode;
  qr: { alt: string; fileName: string; shareTitle: string };
  link: { label: string; shareTitle: string };
  /** Flow-specific actions, such as starting on this device or issuing a new link. */
  extraActions?: ReactNode;
};

export type CredentialHandoffStepOptions = {
  /** Null while no link is live: the step and its leave guard are inactive. */
  handoff: CredentialHandoff | null;
  /** True while a flow action (such as a reissue) runs: the dialog cannot be closed or handed over. */
  busy?: boolean;
  onHandedOver: () => void;
  onDiscard: () => void;
};

/** What a ModalDialog needs to show the hand-off, including the confirmation step that protects the link. */
export type CredentialHandoffStep = {
  stepKey: string;
  body: ReactNode;
  footer: ReactNode;
  requestClose: () => void;
  dismissible: boolean;
  focusOnStepChange: boolean;
};

export function formatCredentialExpiry(value: string | Date | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

type Confirmation = { url: string; anchor: HTMLAnchorElement | null };

/**
 * The shared hand-off content and its dismiss protection. While a link is live, closing the dialog, reloading
 * the page or following a link first asks for confirmation, because the link cannot be shown again.
 */
export function useCredentialHandoffStep({
  handoff,
  busy = false,
  onHandedOver,
  onDiscard,
}: CredentialHandoffStepOptions): CredentialHandoffStep | null {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const allowLeaveRef = useRef(false);
  const bypassLinkGuardRef = useRef(false);
  const url = handoff?.url ?? null;
  const confirming = confirmation !== null && confirmation.url === url;

  useEffect(() => {
    if (url === null) return;
    allowLeaveRef.current = false;
    const guardedUrl = url;

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      if (allowLeaveRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function confirmLinkNavigation(event: MouseEvent): void {
      const target = event.target;
      if (
        bypassLinkGuardRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(target instanceof Element)
      ) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.protocol !== "http:" && destination.protocol !== "https:") return;

      event.preventDefault();
      event.stopPropagation();
      setConfirmation({ url: guardedUrl, anchor });
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmLinkNavigation, true);
    };
  }, [url]);

  if (!handoff || url === null) return null;

  function leaveTo(href: string): void {
    allowLeaveRef.current = true;
    window.location.assign(href);
  }

  function discard(): void {
    const anchor = confirmation?.url === url ? confirmation.anchor : null;
    setConfirmation(null);
    allowLeaveRef.current = true;
    onDiscard();
    if (anchor?.isConnected) {
      // Continue the navigation the user asked for, now that they chose to leave without handing over.
      bypassLinkGuardRef.current = true;
      try {
        anchor.click();
      } finally {
        bypassLinkGuardRef.current = false;
      }
    }
  }

  if (confirming) {
    return {
      stepKey: "confirm-discard",
      dismissible: true,
      focusOnStepChange: false,
      requestClose: () => setConfirmation(null),
      body: (
        <div className="space-y-2">
          <p className="font-semibold text-text">ยังไม่ได้ส่งมอบลิงก์</p>
          <p className="text-sm leading-6 text-text-muted">ลิงก์นี้จะแสดงซ้ำไม่ได้ หากปิดตอนนี้ ต้องออกลิงก์ใหม่เพื่อส่งมอบ</p>
        </div>
      ),
      footer: <ConfirmDiscardFooter onBack={() => setConfirmation(null)} onDiscard={discard} />,
    };
  }

  return {
    stepKey: `handoff:${url}`,
    dismissible: !busy,
    focusOnStepChange: true,
    requestClose: () => {
      if (!busy) setConfirmation({ url, anchor: null });
    },
    body: (
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="font-semibold text-text">ลิงก์หมดอายุ {formatCredentialExpiry(handoff.expiresAt)}</p>
          <div className="text-sm leading-6 text-text-muted">{handoff.oneTimeNotice}</div>
        </div>
        <CredentialQrActions alt={handoff.qr.alt} fileName={handoff.qr.fileName} shareTitle={handoff.qr.shareTitle} url={url} />
        <CredentialLinkActions label={handoff.link.label} shareTitle={handoff.link.shareTitle} url={url} />
        {handoff.extraActions ? (
          <LeaveContext.Provider value={leaveTo}>
            <div className="border-t border-border pt-4">{handoff.extraActions}</div>
          </LeaveContext.Provider>
        ) : null}
      </div>
    ),
    footer: (
      <div className="flex flex-col sm:flex-row sm:justify-end">
        <Button className="w-full sm:w-auto" disabled={busy} onClick={onHandedOver} type="button">
          ส่งมอบแล้ว
        </Button>
      </div>
    ),
  };
}

function ConfirmDiscardFooter({ onBack, onDiscard }: { onBack: () => void; onDiscard: () => void }): React.JSX.Element {
  const backRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    backRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
      <Button className="w-full sm:w-auto" onClick={onBack} ref={backRef} type="button" variant="secondary">
        กลับไปที่ลิงก์
      </Button>
      <Button className="w-full sm:w-auto" onClick={onDiscard} type="button" variant="danger">
        ปิดโดยไม่ส่งมอบ
      </Button>
    </div>
  );
}

export type CredentialHandoffDialogProps = Omit<CredentialHandoff, "url"> & {
  open: boolean;
  title: string;
  /** The masked name and/or Hospital the link belongs to. */
  subject?: ReactNode;
  url: string;
  busy?: boolean;
  onHandedOver: () => void;
  onDiscard: () => void;
};

/**
 * One dialog for every one-time credential hand-off (activation, invitation, password reset): the QR with
 * save/share, the link with copy/share, flow-specific actions, and protection against closing it by accident.
 */
export function CredentialHandoffDialog({
  open,
  title,
  subject,
  busy,
  onHandedOver,
  onDiscard,
  ...handoff
}: CredentialHandoffDialogProps): React.JSX.Element | null {
  // A result often arrives while a confirmation dialog is still closing; opening one task later guarantees the
  // hand-off never stacks on another dialog and that focus returns to the trigger, not to a closed dialog.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open || ready) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [open, ready]);

  const visible = open && ready;
  const step = useCredentialHandoffStep({ handoff: visible ? handoff : null, busy, onHandedOver, onDiscard });
  if (!step) return null;

  return (
    <ModalDialog
      className={credentialHandoffDialogClassName}
      description={subject ? <p className="wrap-anywhere">{subject}</p> : undefined}
      dismissible={step.dismissible}
      focusOnStepChange={step.focusOnStepChange}
      footer={step.footer}
      onRequestClose={step.requestClose}
      size="compact"
      stepKey={step.stepKey}
      title={title}
    >
      {step.body}
    </ModalDialog>
  );
}
