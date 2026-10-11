"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function HospitalReportingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  return (
    <Panel className="max-w-3xl">
      <h1 className="text-xl font-semibold text-text">โหลดรายงานโรงพยาบาลไม่สำเร็จ</h1>
      <Alert className="mt-4" variant="danger">ระบบไม่สามารถโหลดข้อมูลรายงานได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง</Alert>
      <Button className="mt-4" onClick={reset} variant="secondary">ลองโหลดอีกครั้ง</Button>
    </Panel>
  );
}
