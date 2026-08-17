import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabasePatientEvidenceStorage } from "./supabase-patient-evidence-storage";

function createClient(): {
  client: SupabaseClient;
  from: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
  createSignedUrl: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const upload = vi.fn().mockResolvedValue({ data: { path: "relationship-evidence/id" }, error: null });
  const createSignedUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: "https://signed.example.invalid/temporary" }, error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const from = vi.fn().mockReturnValue({ upload, createSignedUrl, remove });

  return {
    client: { storage: { from } } as unknown as SupabaseClient,
    from,
    upload,
    createSignedUrl,
    remove,
  };
}

describe("Supabase Patient Evidence storage adapter", () => {
  it("uploads validated bytes to the configured private bucket without upsert", async () => {
    const fake = createClient();
    const storage = new SupabasePatientEvidenceStorage(fake.client, "patient-evidence");
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);

    await storage.uploadObject({
      objectKey: "relationship-evidence/11111111-1111-4111-8111-111111111111",
      bytes,
      mediaType: "image/jpeg",
    });

    expect(fake.from).toHaveBeenCalledWith("patient-evidence");
    expect(fake.upload).toHaveBeenCalledWith(
      "relationship-evidence/11111111-1111-4111-8111-111111111111",
      bytes,
      { cacheControl: "3600", contentType: "image/jpeg", upsert: false },
    );
  });

  it("requests temporary access with the caller-provided bounded expiry", async () => {
    const fake = createClient();
    const storage = new SupabasePatientEvidenceStorage(fake.client, "patient-evidence");

    await expect(
      storage.createTemporaryAccessUrl({
        objectKey: "relationship-evidence/11111111-1111-4111-8111-111111111111",
        expiresInSeconds: 300,
      }),
    ).resolves.toBe("https://signed.example.invalid/temporary");
    expect(fake.createSignedUrl).toHaveBeenCalledWith(
      "relationship-evidence/11111111-1111-4111-8111-111111111111",
      300,
    );
  });

  it("keeps removal available only as the compensation primitive", async () => {
    const fake = createClient();
    const storage = new SupabasePatientEvidenceStorage(fake.client, "patient-evidence");

    await storage.removeObject({ objectKey: "relationship-evidence/11111111-1111-4111-8111-111111111111" });

    expect(fake.remove).toHaveBeenCalledWith([
      "relationship-evidence/11111111-1111-4111-8111-111111111111",
    ]);
  });
});
