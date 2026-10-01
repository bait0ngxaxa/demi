"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function FamilyManagementError({
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
      <Alert variant="danger">
        <p className="font-semibold">ไม่สามารถโหลดข้อมูลความสัมพันธ์ผู้ดูแลได้</p>
        <p className="mt-1">กรุณาลองอีกครั้ง หากยังพบปัญหาให้กลับมาใหม่ภายหลัง</p>
        <Button className="mt-4" onClick={reset} size="compact" type="button" variant="secondary">
          ลองอีกครั้ง
        </Button>
      </Alert>
    </div>
  );
}
