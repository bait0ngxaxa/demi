"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function HospitalContactError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    void error;
  }, [error]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold tracking-[-0.03em] text-text">ข้อมูลติดต่อโรงพยาบาล</h1>
      <Alert className="mt-6" variant="danger">
        <p className="font-semibold">โหลดข้อมูลติดต่อไม่สำเร็จ</p>
        <p className="mt-1">ข้อมูลยังไม่พร้อมแสดง กรุณาลองโหลดอีกครั้ง</p>
      </Alert>
      <Button className="mt-5" onClick={reset} type="button" variant="secondary">
        ลองโหลดอีกครั้ง
      </Button>
    </div>
  );
}
