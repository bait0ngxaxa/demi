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
import { ApplicationError } from "@/shared/errors/application-error";

import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";
import { PatientHealthSummary } from "./patient-health-summary";

export const metadata: Metadata = { title: "ข้อมูลสุขภาพ" };

type HealthSourceResult<T> =
  | { value: T; failed: false }
  | { value: null; failed: true };

async function loadHealthSource<T>(source: Promise<T>): Promise<HealthSourceResult<T>> {
  try {
    return { value: await source, failed: false };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code !== "INFRASTRUCTURE") {
      throw error;
    }
    return { value: null, failed: true };
  }
}

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
    loadHealthSource(getOwnPatientHospitalProfile(actor, id)),
    loadHealthSource(getPatientHealthInformation(actor, id)),
    loadHealthSource(getOwnLatestStaffMeasurements(actor, id)),
    loadHealthSource(listOwnPatientSelfMeasurements(actor)),
    loadHealthSource(listOwnActiveMedicationSummaries(actor)),
    loadHealthSource(getOwnNextAppointmentForRelationship(actor, id)),
    loadHealthSource(getOwnCurrentAssignedOsm(actor, id)),
    loadHealthSource(getOwnLatestPatientGoalPlan(actor, id)),
  ]);
  return <PatientHealthSummary
    hospitals={getActivePatientHospitals(patient)}
    selected={{ relationshipId: id, hospitalName: selected.hospitalName,
      hospitalPhone: selected.hospitalContact.status === "AVAILABLE" ? selected.hospitalContact.contact.phoneNumber : null }}
    summary={{
      person: profile.value?.person ?? null,
      dateOfBirth: health.value?.dateOfBirth ?? null,
      history: health.value?.history ?? null,
      emergencyContactName: profile.value?.profile.emergencyContactName ?? null,
      emergencyContactPhone: profile.value?.profile.emergencyContactPhone ?? null,
      measurements: measurements.value,
      selfMeasurement: selfMeasurements.value?.items[0] ?? null,
      medications: medications.value,
      appointment: appointment.value,
      osm: osm.value,
      plan: plan.value,
      readFailures: {
        profile: profile.failed,
        health: health.failed,
        measurements: measurements.failed,
        selfMeasurement: selfMeasurements.failed,
        medications: medications.failed,
        appointment: appointment.failed,
        osm: osm.failed,
        plan: plan.failed,
      },
    }}
  />;
}
