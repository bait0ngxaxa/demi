import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import { PasswordChangeForm } from "./password-change-form";

export const metadata: Metadata = {
  title: "เปลี่ยนรหัสผ่าน",
};

export default async function PatientPasswordPage(): Promise<React.JSX.Element> {
  await connection();
  await getProtectedApplicationActor();

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: "พื้นที่ส่วนตัว", href: "/app/personal" },
          { label: "ข้อมูลของฉัน", href: "/app/personal/profile" },
          { label: "เปลี่ยนรหัสผ่าน" },
        ]}
        description="เปลี่ยนรหัสผ่านของบัญชี DEMI ที่คุณใช้เข้าสู่ระบบ"
        title="เปลี่ยนรหัสผ่าน"
      />
      <Panel className="mt-6">
        <p className="break-words text-sm leading-6 text-text-muted">
          บัญชี DEMI หนึ่งบัญชีใช้ร่วมกันในทุกบทบาทและทุกโรงพยาบาลที่เชื่อมต่อ
          การเปลี่ยนรหัสผ่านที่นี่จึงเปลี่ยนข้อมูลเข้าสู่ระบบของบัญชีเดียวกัน
        </p>
        <PasswordChangeForm />
        <Link
          className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-brand-strong underline underline-offset-4"
          href="/app/personal/profile"
        >
          กลับไปข้อมูลของฉัน
        </Link>
      </Panel>
    </div>
  );
}
