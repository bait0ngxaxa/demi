import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/shared/errors/application-error";

const { mockedGetAccess, mockedGetProtectedApplicationActor } = vi.hoisted(() => ({
  mockedGetAccess: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
}));

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-evidence/services/patient-evidence-query-service", () => ({
  getPatientEvidenceArtifactAccess: mockedGetAccess,
}));

import { GET } from "./route";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "33333333-3333-4333-8333-333333333333" };

describe("Patient Evidence content Route Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
  });

  it("redirects only after the service returns an authorized temporary URL", async () => {
    mockedGetAccess.mockResolvedValue({
      artifactId,
      relationshipId,
      mediaType: "image/jpeg",
      temporaryAccessUrl: "https://signed.example.invalid/temporary",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ relationshipId, artifactId }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed.example.invalid/temporary");
    expect(mockedGetAccess).toHaveBeenCalledWith(actor, relationshipId, artifactId);
  });

  it("does not reveal inaccessible artifacts", async () => {
    mockedGetAccess.mockRejectedValue(new NotFoundError());

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ relationshipId, artifactId }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).not.toContain("artifactId");
  });
});
