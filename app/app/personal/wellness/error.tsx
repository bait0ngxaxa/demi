"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }): React.JSX.Element {
  return <Alert variant="danger">ยังโหลดบันทึกไม่ได้ <Button variant="secondary" onClick={reset}>ลองโหลดใหม่</Button></Alert>;
}
