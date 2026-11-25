"use client";

import { useState } from "react";

import { CredentialHandoffDialog, useCredentialHandoffLeave } from "@/components/credential-handoff/credential-handoff-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Displays a one-time credential URL supplied by the server; credentials remain in component memory. */
type ActivationPresentationProps = {
  activationUrl: string;
  expiresAt: string | null;
  title: string;
  maskedName?: string;
  /** Called once the dialog closes, whether the link was handed over or closed without handing over. */
  onFinish?: () => void;
  /** ASSISTED mode: offers to start activation on this device from the dialog. */
  assisted?: boolean;
};

export function ActivationPresentation(props: ActivationPresentationProps): React.JSX.Element {
  return <ActivationPresentationContent key={props.activationUrl} {...props} />;
}

function ActivationPresentationContent({
  activationUrl,
  expiresAt,
  title,
  maskedName,
  onFinish,
  assisted = false,
}: ActivationPresentationProps): React.JSX.Element {
  const [closed, setClosed] = useState<"HANDED_OVER" | "DISCARDED" | null>(null);

  function close(outcome: "HANDED_OVER" | "DISCARDED"): void {
    setClosed(outcome);
    onFinish?.();
  }

  return (
    <>
      {closed === "HANDED_OVER" ? (
        <Alert variant="success">
          <p className="font-semibold">ส่งมอบลิงก์แล้ว</p>
          <p className="mt-1 text-muted">ลิงก์นี้จะแสดงซ้ำไม่ได้</p>
        </Alert>
      ) : closed === "DISCARDED" ? (
        <Alert variant="warning">
          <p className="font-semibold">ปิดลิงก์โดยยังไม่ได้ส่งมอบ</p>
          <p className="mt-1">ลิงก์นี้จะแสดงซ้ำไม่ได้ หากต้องการส่งมอบ ให้ออกลิงก์ใหม่</p>
        </Alert>
      ) : null}
      <CredentialHandoffDialog
        expiresAt={expiresAt}
        extraActions={assisted ? <StartOnThisDeviceButton activationUrl={activationUrl} /> : undefined}
        link={{ label: "ลิงก์เปิดใช้งาน", shareTitle: "ลิงก์เปิดใช้งาน DEMI" }}
        onDiscard={() => close("DISCARDED")}
        onHandedOver={() => close("HANDED_OVER")}
        oneTimeNotice="ใช้ได้ครั้งเดียว · ห้ามส่งต่อ"
        open={closed === null}
        qr={{ alt: "QR Code สำหรับเปิดใช้งาน DEMI", fileName: "demi-activation-qr.png", shareTitle: "QR Code สำหรับเปิดใช้งาน DEMI" }}
        subject={maskedName}
        title={title}
        url={activationUrl}
      />
    </>
  );
}

function StartOnThisDeviceButton({ activationUrl }: { activationUrl: string }): React.JSX.Element {
  const leaveTo = useCredentialHandoffLeave();
  return (
    <Button onClick={() => leaveTo(activationUrl)} size="compact" type="button" variant="secondary">
      เริ่มเปิดใช้งานบนเครื่องนี้
    </Button>
  );
}
