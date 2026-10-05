import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getHospitalContentCreatePageContext } from "@/modules/hospital-content/transport/hospital-content-page-context";

import { HospitalContentCreateForm } from "./hospital-content-create-form";

export const metadata: Metadata = { title: "สร้างข่าวสารและความรู้" };

type HospitalContentCreatePageProps = {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
};

export default async function HospitalContentCreatePage({ searchParams }: HospitalContentCreatePageProps): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  if (Array.isArray(params.hospitalId) && params.hospitalId.length !== 1) notFound();
  const requestedHospitalId = Array.isArray(params.hospitalId) ? params.hospitalId[0] : params.hospitalId;
  const context = await getHospitalContentCreatePageContext(requestedHospitalId);
  return (
    <HospitalContentCreateForm
      key={context.recoveryScope + "." + context.selectedHospitalId}
      hospitals={context.hospitals}
      recoveryScope={context.recoveryScope}
      selectedHospitalId={context.selectedHospitalId}
    />
  );
}
