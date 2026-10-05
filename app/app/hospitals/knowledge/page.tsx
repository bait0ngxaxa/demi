import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getHospitalContentListPageContext } from "@/modules/hospital-content/transport/hospital-content-page-context";

import { HospitalContentListWorkspace } from "./hospital-content-list-workspace";

export const metadata: Metadata = { title: "ข่าวสารและความรู้" };

type HospitalContentListPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[]; cursor?: string | string[] }>;
};

export default async function HospitalContentListPage({
  searchParams,
}: HospitalContentListPageProps): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  if ((Array.isArray(params.hospitalId) && params.hospitalId.length !== 1) || (Array.isArray(params.cursor) && params.cursor.length !== 1)) {
    notFound();
  }
  const requestedHospitalId = Array.isArray(params.hospitalId) ? params.hospitalId[0] : params.hospitalId;
  const cursor = Array.isArray(params.cursor) ? params.cursor[0] : params.cursor;
  const context = await getHospitalContentListPageContext(requestedHospitalId, cursor);

  return (
    <HospitalContentListWorkspace
      hospitals={context.hospitals}
      page={context.page}
      selectedHospitalId={context.selectedHospitalId}
    />
  );
}
