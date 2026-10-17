"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

export default function ParentAreaOverviewError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.JSX.Element {
  return (
    <Panel className="max-w-3xl">
      <h1 className="text-xl font-semibold text-text">โหลดเขตความรับผิดชอบไม่สำเร็จ</h1>
      <Alert className="mt-4" variant="danger">ระบบไม่สามารถโหลดตัวเลขสรุปของโรงพยาบาลลูกข่ายได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง</Alert>
      <Button className="mt-4" onClick={retry} variant="secondary">ลองโหลดอีกครั้ง</Button>
    </Panel>
  );
}
