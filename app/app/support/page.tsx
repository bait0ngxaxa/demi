import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getSupportFormContext } from "@/modules/support/transport/support-report-page-context";
import { SupportReportForm } from "./support-report-form";

export const metadata: Metadata = { title: "แจ้งปัญหาการใช้งาน" };

export default async function SupportPage(): Promise<React.JSX.Element> {
  await connection();
  const context = await getSupportFormContext();
  return <div className="min-w-0 max-w-4xl space-y-6"><PageHeader title="แจ้งปัญหาการใช้งาน" description="ส่งรายละเอียดให้เจ้าของโรงพยาบาลตรวจสอบ" /><SupportReportForm hospitals={context.hospitals} /></div>;
}
