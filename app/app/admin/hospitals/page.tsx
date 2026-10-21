import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "@/modules/hospital-governance/policies/hospital-governance-policy";
import { listHospitalNetworkDirectoryForAdmin } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalNetworkDirectory } from "./hospital-network-directory";

export const metadata: Metadata = {
  title: "การกำกับดูแลโรงพยาบาล",
};

async function requirePlatformAdmin() {
  try {
    const actor = await getProtectedApplicationActor();
    assertHospitalGovernanceCapability(
      actor,
      HOSPITAL_GOVERNANCE_CAPABILITIES.readGovernance,
    );
    return actor;
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export default async function HospitalGovernanceDirectoryPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await requirePlatformAdmin();
  const network = await listHospitalNetworkDirectoryForAdmin(actor);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "ผู้ดูแลระบบ" }, { label: "การกำกับดูแลโรงพยาบาล" }]}
        description="เพิ่มโรงพยาบาล กำหนดแม่ข่าย–ลูกข่าย ตรวจสอบสถานะ และโอนย้ายลูกข่ายระหว่างแม่ข่าย"
        title="การกำกับดูแลโรงพยาบาล"
      />
      <HospitalNetworkDirectory hospitals={network} />
    </div>
  );
}
