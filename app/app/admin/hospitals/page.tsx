import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  assertHospitalGovernanceCapability,
  HOSPITAL_GOVERNANCE_CAPABILITIES,
} from "@/modules/hospital-governance/policies/hospital-governance-policy";
import { getHospitalHierarchyDirectory } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalHierarchyDirectory } from "./hospital-hierarchy-directory";

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
  const directory = await getHospitalHierarchyDirectory(actor);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "ผู้ดูแลระบบ" }, { label: "การกำกับดูแลโรงพยาบาล" }]}
        description="ตรวจสอบสถานะ จัดการโรงพยาบาล และดูโครงสร้างแม่ข่าย–ลูกข่ายปัจจุบัน"
        title="การกำกับดูแลโรงพยาบาล"
      />
      <HospitalHierarchyDirectory directory={directory} />
    </div>
  );
}
