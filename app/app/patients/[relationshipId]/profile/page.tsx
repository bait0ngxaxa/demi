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

import { PatientCareEndForm } from "../../patient-care-end-form";
import { PatientNameCorrectionForm } from "../../patient-name-correction-form";
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
  // Presentation only; correctPatientName re-checks OWNER and the single-hospital rule on the server.
  const isHospitalOwner = actor.hospitalMemberships.some((membership) => membership.hospitalId === record.hospital.id
    && membership.membershipType === "OWNER" && membership.status === "ACTIVE");
  return <div className="max-w-3xl space-y-6">
      <Link href={`/app/patients/${relationshipId}`} className="font-semibold text-brand-strong underline">กลับไปข้อมูลผู้ป่วย</Link>
      <h1 className="text-2xl font-semibold text-text">ข้อมูลสำหรับ{record.hospital.name}</h1>
      {isHospitalOwner ? <Panel><h2 className="text-lg font-semibold text-text">ชื่อ-สกุลผู้ป่วย</h2>
        <p className="mb-5 mt-2 text-sm leading-6 text-text-muted">แก้ได้เมื่อผู้ป่วยเชื่อมกับโรงพยาบาลนี้เพียงแห่งเดียว หากเชื่อมหลายโรงพยาบาล ระบบจะให้ติดต่อผู้ดูแลระบบ</p>
        <PatientNameCorrectionForm relationshipId={relationshipId} version={record.patientProfile.person.version} givenName={record.patientProfile.person.givenName} familyName={record.patientProfile.person.familyName} />
      </Panel> : <p className="text-text-muted">{record.patientProfile.person.givenName} {record.patientProfile.person.familyName} · ชื่อ-สกุลแก้ไขได้โดยเจ้าของโรงพยาบาล</p>}
      <Panel><h2 className="mb-5 text-lg font-semibold text-text">ข้อมูลติดต่อและข้อมูลทั่วไป</h2>
        <HospitalPatientEditForm relationshipId={relationshipId} version={record.hospitalProfile?.version ?? 0} health={false} values={Object.fromEntries(Object.entries(profile).filter((entry): entry is [string, string | number | null] => (entry[0] in staffPatientHospitalProfileUpdateSchema.shape) && (entry[1] === null || typeof entry[1] === "string"))) } />
      </Panel>
      <Panel><h2 className="mb-5 text-lg font-semibold text-text">ประวัติสุขภาพ</h2>
        <HospitalPatientEditForm relationshipId={relationshipId} version={health?.version ?? 0} health values={health ? Object.fromEntries(Object.entries(health).filter((entry): entry is [string, string | number | null] => (entry[0] in patientHealthHistorySchema.shape) && (entry[1] === null || typeof entry[1] === "string" || typeof entry[1] === "number"))) : {}} />
      </Panel>
      {isHospitalOwner ? <Panel><h2 className="text-lg font-semibold text-text">สิ้นสุดการดูแลผู้ป่วย</h2>
        <div className="mt-4"><PatientCareEndForm hospitalName={record.hospital.name} relationshipId={relationshipId} /></div>
      </Panel> : null}
    </div>;
}
