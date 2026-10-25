import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Panel } from "@/components/ui/panel";
import { getLineLiffId } from "@/lib/env/server";
import { isLinePasswordRecoveryCompletionConfigured } from "@/modules/line/services/line-password-recovery-configuration";
import { LinePasswordRecoveryClient } from "./line-password-recovery-client";

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function LinePasswordRecoveryPage(): Promise<React.JSX.Element> {
  await connection();
  if (!isLinePasswordRecoveryCompletionConfigured()) {
    return (
      <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Panel>
          <h1 className="text-2xl font-semibold text-text">กู้คืนรหัสผ่านผ่าน LINE ยังไม่พร้อมให้บริการ</h1>
          <p className="mt-3 text-sm leading-6 text-text-muted">ขณะนี้ไม่สามารถยืนยันลิงก์ผ่าน LINE ได้ กรุณาติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน</p>
          <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/recover#recover-hospital">ดูวิธีติดต่อโรงพยาบาล</Link>
          <Link className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/login">ไปหน้าเข้าสู่ระบบ</Link>
        </Panel>
      </main>
    );
  }
  return <LinePasswordRecoveryClient liffId={getLineLiffId()} />;
}
