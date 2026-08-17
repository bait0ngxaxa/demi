import "server-only";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { InfrastructureError, NotFoundError } from "@/shared/errors/application-error";

import {
  resolvePatientEvidenceAccessContext,
  type PatientEvidenceAccessDatabase,
  type PatientEvidencePatientSummary,
} from "./patient-evidence-access-service";
import {
  PATIENT_ARTIFACT_CREATE_CAPABILITY,
  PATIENT_ARTIFACT_READ_CAPABILITY,
  decidePatientEvidencePolicy,
} from "../policies/patient-evidence-policy";
import {
  PATIENT_EVIDENCE_LIST_LIMIT,
  PATIENT_EVIDENCE_SIGNED_URL_EXPIRY_SECONDS,
  patientEvidenceArtifactIdSchema,
} from "../schemas/patient-evidence-schemas";
import { getPatientEvidenceStorage } from "../storage/supabase-patient-evidence-storage";
import type { PatientEvidenceStorage } from "../storage/patient-evidence-storage";

export const patientEvidenceArtifactListSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  mediaType: true,
  byteSize: true,
  caption: true,
  createdAt: true,
  createdByUser: {
    select: {
      id: true,
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.PatientEvidenceArtifactSelect;

type PatientEvidenceArtifactListRecord = Prisma.PatientEvidenceArtifactGetPayload<{
  select: typeof patientEvidenceArtifactListSelect;
}>;

export type PatientEvidenceArtifactProjection = {
  id: string;
  patientHospitalRelationshipId: string;
  mediaType: string;
  byteSize: number;
  caption: string | null;
  createdAt: Date;
  creator: {
    id: string;
    displayName: string;
  };
};

export type PatientEvidencePageContext = {
  patient: PatientEvidencePatientSummary;
  artifacts: PatientEvidenceArtifactProjection[];
  canCreate: boolean;
};

export type PatientEvidenceQueryDependencies = {
  database?: PatientEvidenceAccessDatabase;
  storage?: PatientEvidenceStorage;
};

export type PatientEvidenceArtifactAccess = {
  artifactId: string;
  relationshipId: string;
  mediaType: string;
  temporaryAccessUrl: string;
};

function getDatabase(database?: PatientEvidenceAccessDatabase): PatientEvidenceAccessDatabase {
  return database ?? getPrisma();
}

function toDisplayName(person: {
  givenName: string | null;
  familyName: string | null;
}): string {
  const nameParts = [person.givenName, person.familyName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return nameParts.join(" ") || "ผู้บันทึก";
}

function toArtifactProjection(record: PatientEvidenceArtifactListRecord): PatientEvidenceArtifactProjection {
  return {
    id: record.id,
    patientHospitalRelationshipId: record.patientHospitalRelationshipId,
    mediaType: record.mediaType,
    byteSize: record.byteSize,
    caption: record.caption,
    createdAt: record.createdAt,
    creator: {
      id: record.createdByUser.id,
      displayName: toDisplayName(record.createdByUser.person),
    },
  };
}

async function listArtifactsForRelationship(
  database: PatientEvidenceAccessDatabase,
  relationshipId: string,
): Promise<PatientEvidenceArtifactProjection[]> {
  const artifacts = await database.patientEvidenceArtifact.findMany({
    where: { patientHospitalRelationshipId: relationshipId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PATIENT_EVIDENCE_LIST_LIMIT,
    select: patientEvidenceArtifactListSelect,
  });

  return artifacts.map(toArtifactProjection);
}

export async function listPatientEvidenceArtifacts(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientEvidenceQueryDependencies = {},
): Promise<PatientEvidenceArtifactProjection[]> {
  const access = await resolvePatientEvidenceAccessContext(
    actor,
    relationshipId,
    PATIENT_ARTIFACT_READ_CAPABILITY,
    dependencies.database,
  );

  try {
    return await listArtifactsForRelationship(
      getDatabase(dependencies.database),
      access.patient.patientHospitalRelationshipId,
    );
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) {
      throw error;
    }

    throw new InfrastructureError("Patient evidence could not be loaded");
  }
}

export async function getPatientEvidencePageContext(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  dependencies: PatientEvidenceQueryDependencies = {},
): Promise<PatientEvidencePageContext> {
  const access = await resolvePatientEvidenceAccessContext(
    actor,
    relationshipId,
    PATIENT_ARTIFACT_READ_CAPABILITY,
    dependencies.database,
  );

  try {
    const artifacts = await listArtifactsForRelationship(
      getDatabase(dependencies.database),
      access.patient.patientHospitalRelationshipId,
    );
    const createDecision = decidePatientEvidencePolicy({
      actor: access.actor,
      capability: PATIENT_ARTIFACT_CREATE_CAPABILITY,
      target: access.target,
    });

    return {
      patient: access.patient,
      artifacts,
      canCreate: createDecision.allowed,
    };
  } catch (error: unknown) {
    if (error instanceof InfrastructureError) {
      throw error;
    }

    throw new InfrastructureError("Patient evidence page could not be loaded");
  }
}

export async function getPatientEvidenceArtifactAccess(
  actor: ActorContext | null | undefined,
  relationshipId: unknown,
  artifactId: unknown,
  dependencies: PatientEvidenceQueryDependencies = {},
): Promise<PatientEvidenceArtifactAccess> {
  const access = await resolvePatientEvidenceAccessContext(
    actor,
    relationshipId,
    PATIENT_ARTIFACT_READ_CAPABILITY,
    dependencies.database,
  );

  const parsedArtifactId = patientEvidenceArtifactIdSchema.safeParse(artifactId);

  if (!parsedArtifactId.success) {
    throw new NotFoundError();
  }

  const artifact = await getDatabase(dependencies.database).patientEvidenceArtifact.findFirst({
    where: {
      id: parsedArtifactId.data.toLowerCase(),
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: {
      id: true,
      patientHospitalRelationshipId: true,
      storageObjectKey: true,
      mediaType: true,
    },
  });

  if (!artifact) {
    throw new NotFoundError();
  }

  const storage = dependencies.storage ?? getPatientEvidenceStorage();
  const temporaryAccessUrl = await storage.createTemporaryAccessUrl({
    objectKey: artifact.storageObjectKey,
    expiresInSeconds: PATIENT_EVIDENCE_SIGNED_URL_EXPIRY_SECONDS,
  });

  return {
    artifactId: artifact.id,
    relationshipId: artifact.patientHospitalRelationshipId,
    mediaType: artifact.mediaType,
    temporaryAccessUrl,
  };
}

export const patientEvidenceQueryInternals = {
  listArtifactsForRelationship,
  toArtifactProjection,
  toDisplayName,
};
