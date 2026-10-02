"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type QrResult =
  | { invitationLink: string; status: "READY"; dataUrl: string }
  | { invitationLink: string; status: "ERROR" };

export function FamilyInvitationQr({
  invitationLink,
}: {
  invitationLink: string;
}): React.JSX.Element {
  const [result, setResult] = useState<QrResult | null>(null);

  useEffect(() => {
    let active = true;
    async function generate(): Promise<void> {
      try {
        const dataUrl = await QRCode.toDataURL(invitationLink, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: 240,
          color: { dark: "#000000ff", light: "#ffffffff" },
        });
        if (active) setResult({ invitationLink, status: "READY", dataUrl });
      } catch {
        if (active) setResult({ invitationLink, status: "ERROR" });
      }
    }
    void generate();
    return () => { active = false; };
  }, [invitationLink]);

  // Hide the previous image immediately, even before the new effect runs.
  const current = result?.invitationLink === invitationLink ? result : null;

  return (
    <div className="mx-auto w-60 max-w-full shrink-0 sm:mx-0" aria-busy={!current}>
      {current?.status === "READY" ? (
        // Local transient data URL; Next image optimization must not receive the secret.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="คิวอาร์โค้ดคำเชิญผู้ดูแล DEMI"
          className="aspect-square h-auto w-full"
          height={240}
          src={current.dataUrl}
          width={240}
        />
      ) : (
        <p className="text-sm leading-6" role="status">
          {current?.status === "ERROR"
            ? "ไม่สามารถสร้างคิวอาร์โค้ดได้ กรุณาใช้ลิงก์คำเชิญแทน"
            : "กำลังสร้างคิวอาร์โค้ดคำเชิญ..."}
        </p>
      )}
    </div>
  );
}
