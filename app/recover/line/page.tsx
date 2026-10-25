import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Panel } from "@/components/ui/panel";
import { isRecoveryLineEnabled } from "@/lib/env/server";
import { LinePasswordRecoveryRequestForm } from "./line-password-recovery-request-form";

export const metadata: Metadata = { title: "กู้คืนรหัสผ่านผ่าน LINE", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LineRecoveryEntryPage(): Promise<React.JSX.Element> {
  await connection();
  if (!isRecoveryLineEnabled()) redirect("/recover");
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <Panel>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">รับลิงก์ทาง LINE</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">หากบัญชีผูก LINE ไว้ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปยัง LINE ที่เชื่อมกับบัญชีนั้น ลิงก์ใช้ได้ 15 นาที</p>
        <LinePasswordRecoveryRequestForm />
        <p className="mt-5 text-sm leading-6 text-text-muted">ถ้าไม่ได้รับลิงก์ ให้ตรวจว่ายังเป็นเพื่อนกับ LINE OA ของ DEMI หรือติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตน</p>
        <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/recover">กลับไปเลือกวิธีกู้คืน</Link>
      </Panel>
    </main>
  );
}
