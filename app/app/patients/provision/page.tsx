import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { Role } from "@prisma/client";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import {
  decidePatientOsmAssignmentPolicy,
  PATIENT_ASSIGN_OSM_CAPABILITY,
} from "@/modules/patient-assignment/policies/patient-osm-assignment-policy";
import { listPatientProvisioningScopes } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientProvisioningWorkspace } from "./patient-provisioning-workspace";

export const metadata: Metadata = {
  title: "นำเข้าผู้ป่วย",
};

type PatientProvisioningPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
};

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect(buildLoginReturnHref(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_PROVISIONING));
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

export default async function PatientProvisioningPage({
  searchParams,
}: PatientProvisioningPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const scopes = await listPatientProvisioningScopes(actor);

  if (scopes.length === 0) {
    if (!actor.roles.includes(Role.OSM) && !actor.roles.includes(Role.HOSPITAL)) {
      redirect("/app");
    }

    return (
      <div className="content-workspace">
        <PageHeader
          breadcrumbs={[{ href: "/app", label: "พื้นที่ทำงาน" }, { label: "นำเข้าผู้ป่วย" }]}
          description="นำเข้าผู้ป่วยได้เฉพาะในโรงพยาบาลที่บัญชีนี้มีขอบเขตใช้งานอยู่"
          title="นำเข้าผู้ป่วย"
        />
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ไม่พบโรงพยาบาลที่เปิดให้ดำเนินการ</p>
          <p className="mt-1">ขณะนี้บัญชีนี้ไม่มีขอบเขตโรงพยาบาลที่ใช้งานได้สำหรับนำเข้าผู้ป่วย กรุณาติดต่อผู้ดูแลโรงพยาบาลเพื่อตรวจสอบสิทธิ์และความสัมพันธ์ปัจจุบัน</p>
        </Alert>
        <Link className={buttonClassName({ className: "mt-5", variant: "secondary" })} href="/app">
          กลับพื้นที่ทำงาน
        </Link>
      </div>
    );
  }

  const params = await searchParams;
  const requestedHospitalId = Array.isArray(params.hospitalId)
    ? params.hospitalId[0]
    : params.hospitalId;
  const requestedScope = scopes.find(({ hospitalId }) => hospitalId === requestedHospitalId);
  const selectedHospitalId = requestedScope?.hospitalId ?? scopes[0].hospitalId;
  const selectedScope = scopes.find(({ hospitalId }) => hospitalId === selectedHospitalId);

  if (!selectedScope) {
    redirect("/app");
  }

  return (
    <PatientProvisioningWorkspace
      canAssignOsm={
        decidePatientOsmAssignmentPolicy({
          actor,
          capability: PATIENT_ASSIGN_OSM_CAPABILITY,
          targetHospitalId: selectedHospitalId,
        }).allowed
      }
      key={selectedHospitalId}
      scopes={scopes}
      selectedHospitalId={selectedHospitalId}
      selectedScope={selectedScope}
    />
  );
}
