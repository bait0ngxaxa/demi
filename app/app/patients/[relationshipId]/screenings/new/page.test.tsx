// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "@/shared/errors/application-error";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  getPatient: vi.fn(),
  getOverview: vi.fn(),
  getGap: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.getActor }));
vi.mock("@/modules/screening/services/screening-query-service", () => ({ getScreeningPatientForSubmission: mocks.getPatient }));
vi.mock("@/modules/patient-program-rounds/services/round-query-service", () => ({
  getProgramRoundsOverview: mocks.getOverview,
  getRoundOneScreeningGap: mocks.getGap,
}));
vi.mock("./screening-form", async () => {
  const { RoundOneScreeningAlert } = await import("./round-one-screening-alert");
  return {
    ScreeningForm: ({ programId, roundOneHref }: { programId?: string; roundOneHref?: string | null }) => (
      <div data-form="" data-program={programId ?? ""}>
        {programId ? null : roundOneHref ? <RoundOneScreeningAlert href={roundOneHref} /> : <p>บันทึกนอกโปรแกรม</p>}
      </div>
    ),
  };
});

import NewScreeningPage from "./page";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";

async function render(searchParams: Record<string, string>): Promise<HTMLDivElement> {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await NewScreeningPage({
    params: Promise.resolve({ relationshipId }),
    searchParams: Promise.resolve(searchParams),
  }));
  return root;
}

describe("new screening: OSM-SCREENING-IN-ROUND1 round-1 hint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue({ userId: "actor" });
    mocks.getPatient.mockResolvedValue({ displayName: "สมชาย", hospitalNumber: null, hospital: { name: "รพ.ก" } });
    mocks.getOverview.mockResolvedValue({ rounds: [{ roundNumber: 1, state: "IN_PROGRESS" }] });
    mocks.getGap.mockResolvedValue(null);
  });

  it("links the chosen instrument to round 1 of the ACTIVE Program while it is missing there", async () => {
    mocks.getGap.mockResolvedValue({ patientProgramId: programId, missing: ["PAM"] });
    const root = await render({ instrument: "PAM" });

    expect(mocks.getGap).toHaveBeenCalledWith({ userId: "actor" }, relationshipId, "PAM");
    const alert = root.querySelector("[data-round-one-screening]");
    expect(alert?.textContent).toContain("ผู้ป่วยอยู่ในครั้งที่ 1 ของโปรแกรม บันทึกจากครั้งที่ 1 เพื่อให้นับในโปรแกรม");
    expect(alert?.querySelector("a")?.getAttribute("href"))
      .toBe(`/app/patients/${relationshipId}/screenings/new?instrument=PAM&programId=${programId}`);
    // The unlinked form stays available below.
    expect(root.querySelector("[data-form]")).not.toBeNull();
  });

  it("shows the hint above the chooser, keeping the chooser itself unlinked", async () => {
    mocks.getGap.mockResolvedValue({ patientProgramId: programId, missing: ["PAM", "PROMS"] });
    const root = await render({});

    expect(mocks.getGap).toHaveBeenCalledWith({ userId: "actor" }, relationshipId, null);
    expect(root.querySelector("[data-round-one-screening] a")?.getAttribute("href"))
      .toBe(`/app/patients/${relationshipId}/screenings/new?programId=${programId}`);
    expect(root.querySelector(`a[href="/app/patients/${relationshipId}/screenings/new?instrument=PROMS"]`)).not.toBeNull();
  });

  it("shows no hint without an open round-1 gap, and never asks when a programId is given", async () => {
    expect((await render({ instrument: "PROMS" })).querySelector("[data-round-one-screening]")).toBeNull();

    const linked = await render({ instrument: "PAM", programId });
    expect(mocks.getGap).toHaveBeenCalledTimes(1);
    expect(linked.querySelector("[data-round-one-screening]")).toBeNull();
    expect(linked.querySelector("[data-form]")?.getAttribute("data-program")).toBe(programId);
  });

  it("records without the hint for a screener who may not read Programs", async () => {
    mocks.getGap.mockRejectedValue(new ForbiddenError());
    const root = await render({ instrument: "PAM" });

    expect(root.querySelector("[data-round-one-screening]")).toBeNull();
    expect(root.querySelector("[data-form]")).not.toBeNull();
  });
});
