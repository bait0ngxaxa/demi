"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export type CredentialLinkActionsProps = {
  url: string;
  label: string;
  shareTitle: string;
};

const copyUnavailable = "คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกจากช่องลิงก์";

/** A read-only, selectable one-time link with copy and share actions. */
export function CredentialLinkActions({ url, label, shareTitle }: CredentialLinkActionsProps): React.JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Feedback belongs to the link it was given for: a reissued link starts without stale feedback.
  const [feedback, setFeedback] = useState<{ url: string; message: string } | null>(null);
  const message = feedback?.url === url ? feedback.message : "";

  function selectLink(): void {
    inputRef.current?.focus();
    inputRef.current?.select();
  }

  async function copyLink(): Promise<void> {
    const copiedFor = url;
    if (typeof navigator.clipboard?.writeText !== "function") {
      setFeedback({ url: copiedFor, message: copyUnavailable });
      selectLink();
      return;
    }

    try {
      await navigator.clipboard.writeText(copiedFor);
      setFeedback({ url: copiedFor, message: "คัดลอกลิงก์แล้ว" });
    } catch {
      setFeedback({ url: copiedFor, message: copyUnavailable });
      selectLink();
    }
  }

  async function shareLink(): Promise<void> {
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }

    const sharedFor = url;
    try {
      await navigator.share({ title: shareTitle, url: sharedFor });
      setFeedback({ url: sharedFor, message: "ส่งลิงก์แล้ว" });
    } catch {
      setFeedback({ url: sharedFor, message: "ยังไม่ได้ส่งลิงก์" });
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-text" htmlFor={inputId}>
        {label}
      </label>
      <input
        autoComplete="off"
        className="min-h-12 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        id={inputId}
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        ref={inputRef}
        spellCheck={false}
        type="text"
        value={url}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copyLink()} size="compact" type="button" variant="secondary">
          คัดลอกลิงก์
        </Button>
        <Button onClick={() => void shareLink()} size="compact" type="button" variant="secondary">
          แชร์ลิงก์
        </Button>
      </div>
      {message ? (
        <p className="text-sm text-text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
