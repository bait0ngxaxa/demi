"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type LinkNavigationEvent = {
  preventDefault(): void;
};

type PendingNavigation = {
  href: string;
  message: string;
};

function getSafeInternalHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      (url.protocol !== "https:" && url.protocol !== "http:")
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function getMobileNavigationWarning(): string | null {
  const main = document.getElementById("application-main-content");
  if (!main) {
    return null;
  }

  const hasUnknownOutcome = main.querySelector(
    '[data-navigation-guard="unknown-outcome"]',
  ) !== null;
  const hasPendingAction = main.querySelector(
    'button[aria-busy="true"][disabled]',
  ) !== null;

  if (!hasUnknownOutcome && !hasPendingAction) {
    return null;
  }

  return hasUnknownOutcome
    ? "ระบบยังยืนยันผลการบันทึกไม่ได้ หากเปลี่ยนหน้า คุณอาจต้องกลับมาตรวจสอบสถานะก่อนดำเนินการต่อ ต้องการเปลี่ยนหน้าหรือไม่?"
    : "มีรายการกำลังดำเนินการอยู่ หากเปลี่ยนหน้าในตอนนี้ คุณอาจต้องตรวจสอบผลก่อนดำเนินการต่อ ต้องการเปลี่ยนหน้าหรือไม่?";
}

export function useMobileNavigationGuard(): {
  onNavigate: (href: string, event: LinkNavigationEvent) => void;
  dialog: React.JSX.Element;
} {
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  function onNavigate(href: string, event: LinkNavigationEvent): void {
    const message = getMobileNavigationWarning();
    if (!message) {
      return;
    }

    event.preventDefault();
    setPendingNavigation({ href, message });
  }

  function confirmNavigation(): void {
    if (!pendingNavigation) {
      return;
    }

    const href = getSafeInternalHref(pendingNavigation.href);
    setPendingNavigation(null);
    if (href) {
      router.push(href);
    }
  }

  return {
    onNavigate,
    dialog: (
      <ConfirmDialog
        cancelLabel="อยู่หน้านี้"
        confirmLabel="เปลี่ยนหน้า"
        description={pendingNavigation?.message}
        onCancel={() => setPendingNavigation(null)}
        onConfirm={confirmNavigation}
        open={pendingNavigation !== null}
        title="ต้องการเปลี่ยนหน้าหรือไม่?"
      />
    ),
  };
}
