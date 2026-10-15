"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";

/** Keeps the application shell and navigation when a workspace page fails to load. */
export default function ApplicationWorkspaceError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.JSX.Element {
  return (
    <div className="max-w-3xl">
      <Alert variant="danger">
        <p className="font-semibold">ยังไม่สามารถแสดงหน้านี้ได้</p>
        <p className="mt-1">ระบบโหลดข้อมูลไม่สำเร็จ กรุณาลองโหลดอีกครั้ง หรือกลับไปหน้าหลัก</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={retry} size="compact" type="button" variant="secondary">
            ลองโหลดอีกครั้ง
          </Button>
          <Link className={buttonClassName({ size: "compact", variant: "ghost" })} href="/app">
            กลับหน้าหลัก
          </Link>
        </div>
      </Alert>
    </div>
  );
}
