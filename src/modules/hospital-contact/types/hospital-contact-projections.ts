export type HospitalContactOwnerHospital = {
  id: string;
  hospitalCode: string;
  name: string;
};

export type HospitalContactEditorProjection = {
  hospital: HospitalContactOwnerHospital;
  addressText: string | null;
  phoneNumber: string | null;
  expectedUpdatedAt: string | null;
};

export type PatientHospitalContactProjection = {
  hospital: {
    hospitalCode: string;
    name: string;
  };
  addressText: string | null;
  phoneNumber: string | null;
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
