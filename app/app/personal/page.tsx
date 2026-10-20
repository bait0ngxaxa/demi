import type { Metadata } from "next";
import { connection } from "next/server";
import { HospitalContentCategory } from "@prisma/client";

import { getOwnNextAppointmentForRelationship } from "@/modules/patient-self/services/patient-self-care-query-service";
import { listPatientHospitalContent } from "@/modules/hospital-content/services/hospital-content-patient-query-service";
import { getActivePatientHospitals, selectPatientPersonalHomeHospital } from "@/modules/patient-self/transport/patient-personal-home-selection";
import { getPatientPersonalHomePageContext } from "@/modules/patient-self/transport/patient-self-page-context";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { isPatientAccessUnavailable } from "@/modules/patient-self/transport/patient-access-unavailable";

import { PatientAccessUnavailableState } from "./patient-access-unavailable-state";
import { PatientPersonalHome } from "./patient-personal-home";

export const metadata: Metadata = {
  title: "พื้นที่ส่วนตัว",
};

export default async function PatientPersonalPage(
  { searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {},
): Promise<React.JSX.Element> {
  await connection();
  const paramsPromise: Promise<Record<string, string | string[] | undefined>> =
    searchParams ?? Promise.resolve({});
  const [patient, params] = await Promise.all([
    getPatientPersonalHomePageContext(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WORKSPACE),
    paramsPromise,
  ]);
  if (isPatientAccessUnavailable(patient)) {
    return <PatientAccessUnavailableState title="พื้นที่ส่วนตัว" />;
  }
  await scheduleCurrentLineAccountReconciliation();

  if (patient === null) {
    return <PatientPersonalHome patient={null} />;
  }

  const activeHospitals = getActivePatientHospitals(patient);
  const selectedHospital = selectPatientPersonalHomeHospital(patient, params.hospital);
  const [nextAppointment, newsPage, knowledgePage] = selectedHospital
    ? await Promise.all([
        getOwnNextAppointmentForRelationship(patient.actor, selectedHospital.relationshipId),
        listPatientHospitalContent(patient.actor, {
          category: HospitalContentCategory.NEWS,
          hospitalId: selectedHospital.hospitalId,
          limit: 3,
        }),
        listPatientHospitalContent(patient.actor, {
          hospitalId: selectedHospital.hospitalId,
          limit: 3,
        }),
      ])
    : [null, null, null];
  const patientPresentation = {
    person: patient.person,
  };
  const activeHospitalOptions = activeHospitals.map(({ relationshipId, hospitalName }) => ({
    relationshipId,
    hospitalName,
  }));
  const selectedHospitalPresentation = selectedHospital
    ? {
        relationshipId: selectedHospital.relationshipId,
        hospitalName: selectedHospital.hospitalName,
        hospitalContact: selectedHospital.hospitalContact,
      }
    : null;

  return (
    <PatientPersonalHome
      activeHospitals={activeHospitalOptions}
      knowledgeItems={knowledgePage?.items ?? []}
      newsItems={newsPage?.items ?? []}
      patient={patientPresentation}
      selectedHospital={selectedHospitalPresentation}
      nextAppointment={nextAppointment && selectedHospital
        ? {
            href: `/app/personal/appointments/${encodeURIComponent(selectedHospital.relationshipId)}/${encodeURIComponent(nextAppointment.appointmentId)}`,
            scheduledAt: nextAppointment.scheduledAt,
          }
        : null}
    />
  );
}
