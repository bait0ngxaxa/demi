"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Panel } from "@/components/ui/panel";

export function PublicAccountRecoveryForm(): React.JSX.Element {
  useEffect(() => {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);
  return (
    <Panel>
      <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-text">ยังไม่สามารถกู้คืนรหัสผ่านได้</h1>
      <p className="mt-3 break-words text-sm leading-6 text-text-muted">ขณะนี้ยังไม่มีวิธียืนยันว่าคุณเป็นเจ้าของบัญชีเพื่อเปลี่ยนรหัสผ่าน ลิงก์กู้คืนที่มีอยู่ใช้เปลี่ยนรหัสผ่านไม่ได้ โปรดติดต่อผู้ดูแลระบบเพื่อสอบถามแนวทาง</p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
    </Panel>
  );
}
