"use client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ retry }: { retry: () => void }): React.JSX.Element {
  return <Alert variant="danger">ยังโหลดบันทึกไม่ได้ <Button variant="secondary" onClick={retry}>ลองโหลดใหม่</Button></Alert>;
}
