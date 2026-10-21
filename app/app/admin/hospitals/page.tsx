import { randomUUID } from "node:crypto";

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

import { HOSPITAL_DIRECTORY_FILTERS, HospitalNetworkDirectory, type HospitalDirectoryFilter } from "./hospital-network-directory";

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

function parseFilter(value: string | string[] | undefined): HospitalDirectoryFilter {
  return HOSPITAL_DIRECTORY_FILTERS.find((item) => item.value === value)?.value ?? "network";
}

export default async function HospitalGovernanceDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}): Promise<React.JSX.Element> {
  await connection();
  const actor = await requirePlatformAdmin();
  const network = await listHospitalNetworkDirectoryForAdmin(actor);
  const { status } = await searchParams;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "ผู้ดูแลระบบ" }, { label: "การกำกับดูแลโรงพยาบาล" }]}
        description="เพิ่มโรงพยาบาลทีละแห่งหรือนำเข้าแม่ข่ายจากไฟล์ กำหนดแม่ข่าย–ลูกข่าย ตรวจสอบสถานะ โอนย้ายลูกข่ายระหว่างแม่ข่าย และถอนโรงพยาบาลที่ไม่ใช้งานออกจากรายชื่อรอสมัคร"
        title="การกำกับดูแลโรงพยาบาล"
      />
      <HospitalNetworkDirectory
        bulkSubmissionNonce={randomUUID()}
        filter={parseFilter(status)}
        hospitals={network}
        submissionNonce={randomUUID()}
      />
    </div>
  );
}
