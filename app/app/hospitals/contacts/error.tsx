"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function HospitalWorkContactsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.JSX.Element {
  useEffect(() => {
    void error;
  }, [error]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold tracking-[-0.03em] text-text">ติดต่อโรงพยาบาล</h1>
      <Alert className="mt-6" variant="danger">
        <p className="font-semibold">โหลดข้อมูลติดต่อไม่สำเร็จ</p>
        <p className="mt-1">ข้อมูลยังไม่พร้อมแสดง กรุณาลองโหลดอีกครั้ง</p>
      </Alert>
      <Button className="mt-5" onClick={retry} type="button" variant="secondary">
        ลองโหลดอีกครั้ง
      </Button>
    </div>
  );
}
