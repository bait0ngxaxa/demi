import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getStaffPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { staffPatientHospitalProfileUpdateSchema } from "@/modules/patient-hospital-profile/schemas/patient-hospital-profile-schemas";
import { patientHealthHistorySchema } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { getPatientHealthHistory } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { HospitalPatientEditForm } from "../hospital-patient-edit-form";

export default async function HospitalPatientProfilePage({ params }: { params: Promise<{ relationshipId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const actor = await getProtectedApplicationActor();
  const { relationshipId } = await params;
  let record;
  let health;
  try {
    record = await getStaffPatientHospitalProfile(actor, relationshipId);
    health = await getPatientHealthHistory(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const profile = record.hospitalProfile ?? record.patientProfile;
  return <div className="max-w-3xl space-y-6">
      <Link href={`/app/patients/${relationshipId}`} className="font-semibold text-brand-strong underline">กลับไปข้อมูลผู้ป่วย</Link>
      <h1 className="text-2xl font-semibold text-text">ข้อมูลสำหรับ{record.hospital.name}</h1>
      <p className="text-text-muted">{record.patientProfile.person.givenName} {record.patientProfile.person.familyName} · ชื่อ-สกุลแก้ไขไม่ได้</p>
      <Panel><h2 className="mb-5 text-lg font-semibold text-text">ข้อมูลติดต่อและข้อมูลทั่วไป</h2>
        <HospitalPatientEditForm relationshipId={relationshipId} version={record.hospitalProfile?.version ?? 0} health={false} values={Object.fromEntries(Object.entries(profile).filter((entry): entry is [string, string | number | null] => (entry[0] in staffPatientHospitalProfileUpdateSchema.shape) && (entry[1] === null || typeof entry[1] === "string"))) } />
      </Panel>
      <Panel><h2 className="mb-5 text-lg font-semibold text-text">ประวัติสุขภาพ</h2>
        <HospitalPatientEditForm relationshipId={relationshipId} version={health?.version ?? 0} health values={health ? Object.fromEntries(Object.entries(health).filter((entry): entry is [string, string | number | null] => (entry[0] in patientHealthHistorySchema.shape) && (entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number"))) : {}} />
      </Panel>
    </div>;
}
