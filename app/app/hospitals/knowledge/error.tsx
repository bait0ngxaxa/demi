"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function HospitalContentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.JSX.Element {
  useEffect(() => { void error; }, [error]);
  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold tracking-[-0.03em] text-text">ข่าวสารและความรู้</h1>
      <Alert className="mt-6" variant="danger">
        <p className="font-semibold">โหลดรายการไม่สำเร็จ</p>
        <p className="mt-1">ระบบยังยืนยันรายการปัจจุบันไม่ได้ กรุณาลองโหลดอีกครั้ง</p>
      </Alert>
      <Button className="mt-5" onClick={reset} type="button" variant="secondary">ลองโหลดอีกครั้ง</Button>
    </div>
  );
}
