import "server-only";

import { type SupabaseClient } from "@supabase/supabase-js";

import { getPatientEvidenceStorageEnv } from "@/lib/env/server";
import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";

import type { PatientEvidenceStorage } from "./patient-evidence-storage";
import { PatientEvidenceStorageError } from "./patient-evidence-storage";

export class SupabasePatientEvidenceStorage implements PatientEvidenceStorage {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(
    client: SupabaseClient = getSupabaseAdminClient(),
    bucket = getPatientEvidenceStorageEnv().SUPABASE_PATIENT_EVIDENCE_BUCKET,
  ) {
    this.client = client;
    this.bucket = bucket;
  }

  async uploadObject(input: {
    objectKey: string;
    bytes: Uint8Array;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
  }): Promise<void> {
    try {
      const { error } = await this.client.storage.from(this.bucket).upload(input.objectKey, input.bytes, {
        cacheControl: "3600",
        contentType: input.mediaType,
        upsert: false,
      });

      if (error) {
        throw new Error("Supabase upload failed");
      }
    } catch {
      throw new PatientEvidenceStorageError("upload");
    }
  }

  async createTemporaryAccessUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .createSignedUrl(input.objectKey, input.expiresInSeconds);

      if (error || !data?.signedUrl) {
        throw new Error("Supabase signed URL creation failed");
      }

      return data.signedUrl;
    } catch {
      throw new PatientEvidenceStorageError("signed-url");
    }
  }

  async removeObject(input: { objectKey: string }): Promise<void> {
    try {
      const { error } = await this.client.storage.from(this.bucket).remove([input.objectKey]);

      if (error) {
        throw new Error("Supabase object removal failed");
      }
    } catch {
      throw new PatientEvidenceStorageError("remove");
    }
  }
}

let cachedStorage: SupabasePatientEvidenceStorage | undefined;

export function getPatientEvidenceStorage(): PatientEvidenceStorage {
  if (!cachedStorage) {
    cachedStorage = new SupabasePatientEvidenceStorage();
  }

  return cachedStorage;
}
