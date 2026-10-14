import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getSettingsPageContext } from "@/modules/account-settings/transport/settings-page-context";
import { ContactSettingsForm } from "./contact-settings-form";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default async function SettingsPage(): Promise<React.JSX.Element> {
  await connection();
  const context = await getSettingsPageContext();
  return <div className="min-w-0 max-w-4xl space-y-6"><PageHeader title="ตั้งค่า" description="ข้อมูลติดต่อและการแจ้งเตือนของบัญชี" /><ContactSettingsForm initial={context.contact} patient={context.patient} /></div>;
}
