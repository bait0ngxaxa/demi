import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getLegalSettingsView } from "@/modules/legal/transport/legal-settings-context";

import { LegalSettings } from "./legal-settings";

export const metadata: Metadata = { title: "เงื่อนไขและการใช้งาน" };

/** ADR-0028 (Canva: โปรไฟล์ → การตั้งค่า → เงื่อนไขและการใช้งาน). Works in the LINE in-app browser (LIFF). */
export default async function LegalSettingsPage(): Promise<React.JSX.Element> {
  await connection();
  const legal = await getLegalSettingsView();
  return (
    <div className="min-w-0 max-w-3xl space-y-6 [overflow-wrap:anywhere]">
      <PageHeader
        breadcrumbs={[{ label: "ตั้งค่าบัญชีส่วนตัว", href: "/app/settings" }, { label: "เงื่อนไขและการใช้งาน" }]}
        description="ข้อกำหนดการใช้บริการ นโยบายการคุ้มครองข้อมูลส่วนบุคคล และความยินยอมของคุณ"
        title="เงื่อนไขและการใช้งาน"
      />
      <LegalSettings legal={legal} />
    </div>
  );
}
