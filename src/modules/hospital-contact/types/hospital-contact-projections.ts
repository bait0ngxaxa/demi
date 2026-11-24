import type { HospitalLocation } from "../domain/hospital-location";

export type { HospitalLocation } from "../domain/hospital-location";

export type HospitalContactOwnerHospital = {
  id: string;
  hospitalCode: string;
  name: string;
};

export type HospitalContactEditorProjection = {
  hospital: HospitalContactOwnerHospital;
  addressText: string | null;
  phoneNumber: string | null;
  location: HospitalLocation | null;
  expectedUpdatedAt: string | null;
};

export type PatientHospitalContactProjection = {
  hospital: {
    hospitalCode: string;
    name: string;
  };
  addressText: string | null;
  phoneNumber: string | null;
  location: HospitalLocation | null;
};

export type HospitalWorkContactProjection = {
  hospital: {
    hospitalCode: string;
    name: string;
  };
  availability: "AVAILABLE" | "UNAVAILABLE";
  addressText: string | null;
  phoneNumber: string | null;
  location: HospitalLocation | null;
};

export type PatientHospitalContactRead =
  | {
      relationshipId: string;
      availability: "AVAILABLE";
      contact: PatientHospitalContactProjection;
    }
  | {
      relationshipId: string;
      availability: "UNAVAILABLE";
    };

export type HospitalContactMutationResult =
  | { outcome: "CREATED" | "UPDATED" | "NOOP"; contact: HospitalContactEditorProjection }
  | { outcome: "UNCONFIRMED" };
