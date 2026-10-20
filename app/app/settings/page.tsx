import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getSettingsPageContext } from "@/modules/account-settings/transport/settings-page-context";
import { ContactSettingsForm } from "./contact-settings-form";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default async function SettingsPage(): Promise<React.JSX.Element> {
  await connection();
  const context = await getSettingsPageContext();
  return (
    <div className="min-w-0 max-w-4xl space-y-6">
      <PageHeader title="ตั้งค่า" description="ข้อมูลติดต่อและการแจ้งเตือนของบัญชี" />
      <ContactSettingsForm initial={context.contact} patient={context.patient} />
      {context.canChangePassword ? (
        <section aria-labelledby="settings-security-heading" className="border-t border-border pt-6">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="settings-security-heading">ความปลอดภัยของบัญชี</h2>
          <Link
            className="mt-2 inline-flex min-h-11 items-center rounded-control text-sm font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href="/app/personal/password"
          >
            เปลี่ยนรหัสผ่าน
          </Link>
        </section>
      ) : null}
    </div>
  );
}
