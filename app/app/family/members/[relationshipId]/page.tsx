import type { Metadata } from "next";
import { connection } from "next/server";

import { getFamilyHealthSummaryPageContext } from "@/modules/family/transport/appointment-grant-page-context";

import { FamilyHealthSummaryView } from "../family-health-summary-view";

export const metadata: Metadata = { title: "สรุปสุขภาพสมาชิกครอบครัว" };

export default async function FamilyHealthSummaryPage({ params }: { params: Promise<{ relationshipId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  return <FamilyHealthSummaryView summary={await getFamilyHealthSummaryPageContext(relationshipId)} />;
}
