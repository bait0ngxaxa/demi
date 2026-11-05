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
import { listParentOnboardingPaths } from "@/modules/hospital-onboarding/services/parent-owner-invitation-service";
import { HOSPITAL_DIRECTORY_SEARCH_MAX_LENGTH } from "@/modules/hospital-service-areas/schemas/hospital-service-area-schemas";
import { listHospitalNetworkDirectoryForAdmin } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { parsePageSearchParam } from "@/shared/pagination/page-number";

import {
  HOSPITAL_DIRECTORY_FILTERS,
  HOSPITAL_DIRECTORY_PLACEMENTS,
  HospitalNetworkDirectory,
  type HospitalDirectoryFilter,
  type HospitalDirectoryPlacement,
  type ParentOnboardingPathLabels,
} from "./hospital-network-directory";

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

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilter(value: string | string[] | undefined): HospitalDirectoryFilter {
  const raw = firstSearchParam(value);
  return HOSPITAL_DIRECTORY_FILTERS.find((item) => item.value === raw)?.value ?? "network";
}

function parsePlacement(value: string | string[] | undefined): HospitalDirectoryPlacement {
  const raw = firstSearchParam(value);
  return HOSPITAL_DIRECTORY_PLACEMENTS.find((item) => item.value === raw)?.value ?? "all";
}

/** A search longer than the limit is cut to the limit rather than refused. */
function parseSearch(value: string | string[] | undefined): string {
  return (firstSearchParam(value) ?? "").trim().slice(0, HOSPITAL_DIRECTORY_SEARCH_MAX_LENGTH).trim();
}

export default async function HospitalGovernanceDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    placement?: string | string[];
    value?: string | string[];
    page?: string | string[];
  }>;
}): Promise<React.JSX.Element> {
  await connection();
  const actor = await requirePlatformAdmin();
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const placement = filter === "network" ? parsePlacement(params.placement) : "all";
  const value = parseSearch(params.value);
  const directory = await listHospitalNetworkDirectoryForAdmin(actor, {
    filter, placement, value, page: parsePageSearchParam(params.page),
  });
  // ADR-0024: only a pending or ACTIVE Parent can have an open first-OWNER path; one page of at most 25 ids.
  const parentIds = directory.items
    .filter(({ role, status: hospitalStatus }) => role === "PARENT" && (hospitalStatus === "PENDING_VERIFICATION" || hospitalStatus === "ACTIVE"))
    .map(({ id }) => id);
  const onboardingPaths: Record<string, ParentOnboardingPathLabels[string]> = {};
  if (parentIds.length > 0) {
    for (const [hospitalId, path] of await listParentOnboardingPaths(actor, parentIds)) onboardingPaths[hospitalId] = path;
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "ผู้ดูแลระบบ DEMI" }, { label: "การกำกับดูแลโรงพยาบาล" }]}
        description="เพิ่มโรงพยาบาลทีละแห่งหรือนำเข้าแม่ข่ายจากไฟล์ กำหนดแม่ข่าย–ลูกข่าย ตรวจสอบสถานะ โอนย้ายลูกข่ายระหว่างแม่ข่าย และถอนโรงพยาบาลที่ไม่ใช้งานออกจากรายชื่อรอสมัคร"
        title="การกำกับดูแลโรงพยาบาล"
      />
      <HospitalNetworkDirectory
        bulkSubmissionNonce={randomUUID()}
        directory={directory}
        filter={filter}
        onboardingPaths={onboardingPaths}
        placement={placement}
        submissionNonce={randomUUID()}
        value={value}
      />
    </div>
  );
}
