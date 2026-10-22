"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function UsersError({ retry }: { retry: () => void }): React.JSX.Element {
  return (
    <div className="content-workspace space-y-4">
      <Alert variant="danger" role="alert">โหลดข้อมูลผู้ใช้งานไม่สำเร็จ กรุณาลองอีกครั้ง หรือเริ่มค้นหาใหม่</Alert>
      <Button onClick={retry} type="button">ลองอีกครั้ง</Button>
      <Link className="ml-4 underline" href="/app/users">เริ่มค้นหาใหม่</Link>
    </div>
  );
}
