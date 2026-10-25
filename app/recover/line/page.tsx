import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Panel } from "@/components/ui/panel";
import { isRecoveryLineEnabled } from "@/lib/env/server";

export const metadata: Metadata = { title: "กู้คืนรหัสผ่านผ่าน LINE", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LineRecoveryEntryPage(): Promise<React.JSX.Element> {
  await connection();
  if (!isRecoveryLineEnabled()) redirect("/recover");
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <Panel>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">รับลิงก์ทาง LINE</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">ช่องทางนี้ยังไม่เปิดให้บริการ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน</p>
        <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href="/recover">กลับไปเลือกวิธีกู้คืน</Link>
      </Panel>
    </main>
  );
}
