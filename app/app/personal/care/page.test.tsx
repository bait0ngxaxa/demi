// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATIENT_ACCESS_UNAVAILABLE } from "@/modules/patient-self/transport/patient-access-unavailable";
import { getPatientSelfRelationshipNavigationPageContext, getPatientServiceProgressPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/modules/patient-self/transport/patient-self-care-page-context", () => ({ getPatientSelfRelationshipNavigationPageContext: vi.fn(), getPatientServiceProgressPageContext: vi.fn() }));
vi.mock("../patient-round-recording", () => ({ PatientRoundRecording: () => null }));

import Page from "./page";

describe("ติดตาม landing", () => {
  beforeEach(() => {
    vi.mocked(getPatientServiceProgressPageContext).mockResolvedValue([]);
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue([]);
  });

  it("puts current services before the unchanged multi-Hospital history links", async () => {
    vi.mocked(getPatientSelfRelationshipNavigationPageContext).mockResolvedValue(["one", "two"].map((relationshipId) => ({
      relationshipId, hospitalCode: relationshipId, hospitalName: `โรงพยาบาล ${relationshipId}`, hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null,
    })));
    const markup = renderToStaticMarkup(await Page());
    expect(markup.indexOf("บริการของฉันตอนนี้")).toBeLessThan(markup.indexOf("ประวัติการดูแล"));
    for (const id of ["one", "two"]) expect(markup).toContain(`href="/app/personal/care/${id}"`);
  });

  it("fails closed when the SELF service read is unavailable", async () => {
    vi.mocked(getPatientServiceProgressPageContext).mockResolvedValue(PATIENT_ACCESS_UNAVAILABLE);
    const markup = renderToStaticMarkup(await Page());
    expect(markup).not.toContain("บริการของฉันตอนนี้");
    expect(markup).not.toContain("<form");
  });
});
