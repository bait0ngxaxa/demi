"use client";

import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function WorkAppointmentError({ retry }: { retry: () => void }): React.JSX.Element {
  return (
    <div className="content-workspace space-y-4">
      <Alert role="alert" variant="danger">โหลดรายการนัดหมายไม่สำเร็จ กรุณาลองอีกครั้ง</Alert>
      <Button onClick={retry} type="button">ลองอีกครั้ง</Button>
      <Link className="ml-4 underline" href="/app/appointments">เริ่มใหม่</Link>
    </div>
  );
}
