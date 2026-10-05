import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { hospitalContentLocatorSchema } from "@/modules/hospital-content/schemas/hospital-content-schemas";
import { getHospitalContentDetailPageContext } from "@/modules/hospital-content/transport/hospital-content-page-context";

import { HospitalContentDetailWorkspace } from "./hospital-content-detail-workspace";

export const metadata: Metadata = { title: "ข่าวสารและความรู้" };

type HospitalContentDetailPageProps = {
  params: Promise<{ contentId: string }>;
};

export default async function HospitalContentDetailPage({ params }: HospitalContentDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const { contentId } = await params;
  if (!hospitalContentLocatorSchema.safeParse(contentId).success) notFound();
  const context = await getHospitalContentDetailPageContext(contentId);
  return (
    <HospitalContentDetailWorkspace
      content={context.content}
      key={`${context.requestScope}.${context.content.id}`}
    />
  );
}
