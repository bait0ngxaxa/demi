import type { Metadata } from "next";
import { connection } from "next/server";

import { getOwnPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { getPatientHealthInformation } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { listOwnActiveMedicationSummaries } from "@/modules/medications/services/personal-medication-query-service";
import { getOwnLatestPatientGoalPlan, getOwnNextAppointmentForRelationship } from "@/modules/patient-self/services/patient-self-care-query-service";
import { getOwnCurrentAssignedOsm, getOwnLatestStaffMeasurements } from "@/modules/patient-self/services/patient-self-health-query-service";
import { listOwnPatientSelfMeasurements } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { getPatientPersonalHomePageContext } from "@/modules/patient-self/transport/patient-self-page-context";
import { getActivePatientHospitals, selectPatientPersonalHomeHospital } from "@/modules/patient-self/transport/patient-personal-home-selection";
import { isPatientAccessUnavailable } from "@/modules/patient-self/transport/patient-access-unavailable";

import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";
import { PatientHealthSummary } from "./patient-health-summary";

export const metadata: Metadata = { title: "ข้อมูลสุขภาพ" };

export default async function PatientHealthPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}): Promise<React.JSX.Element> {
  await connection();
  const paramsPromise: Promise<Record<string, string | string[] | undefined>> = searchParams ?? Promise.resolve({});
  const [patient, params] = await Promise.all([getPatientPersonalHomePageContext(), paramsPromise]);
  if (isPatientAccessUnavailable(patient)) return <PatientAccessUnavailableState title="ข้อมูลสุขภาพ" />;
  const selected = patient ? selectPatientPersonalHomeHospital(patient, params.relationshipId) : null;
  if (!patient || !selected) return <PatientHealthSummary hospitals={[]} selected={null} summary={null} />;

  // Every source retains its own persisted SELF authorization; no caller-provided owner or Hospital ID is trusted.
  const { actor } = patient;
  const id = selected.relationshipId;
  const [profile, health, measurements, selfMeasurements, medications, appointment, osm, plan] = await Promise.all([
    getOwnPatientHospitalProfile(actor, id),
    getPatientHealthInformation(actor, id),
    getOwnLatestStaffMeasurements(actor, id),
    listOwnPatientSelfMeasurements(actor),
    listOwnActiveMedicationSummaries(actor),
    getOwnNextAppointmentForRelationship(actor, id),
    getOwnCurrentAssignedOsm(actor, id),
    getOwnLatestPatientGoalPlan(actor, id),
  ]);
  return <PatientHealthSummary
    hospitals={getActivePatientHospitals(patient)}
    selected={{ relationshipId: id, hospitalName: selected.hospitalName,
      hospitalPhone: selected.hospitalContact.status === "AVAILABLE" ? selected.hospitalContact.contact.phoneNumber : null }}
    summary={{ person: profile.person, dateOfBirth: health.dateOfBirth, history: health.history,
      emergencyContactName: profile.profile.emergencyContactName, emergencyContactPhone: profile.profile.emergencyContactPhone,
      measurements, selfMeasurement: selfMeasurements.items[0] ?? null, medications, appointment, osm, plan }}
  />;
}
