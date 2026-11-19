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

export default async function AccountPasswordPage(): Promise<React.JSX.Element> {
  await connection();
  await getProtectedApplicationActor();

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: "พื้นที่ส่วนตัว", href: "/app/personal" },
          { label: "ตั้งค่า", href: "/app/settings" },
          { label: "เปลี่ยนรหัสผ่าน" },
        ]}
        title="เปลี่ยนรหัสผ่าน"
      />
      <Panel className="mt-6">
        <PasswordChangeForm />
        <Link
          className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-brand-strong underline underline-offset-4"
          href="/app/settings"
        >
          กลับไปตั้งค่า
        </Link>
      </Panel>
    </div>
  );
}
