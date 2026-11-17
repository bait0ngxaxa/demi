import { beforeEach, describe, expect, it, vi } from "vitest";

import PatientEvidencePage from "../../../../app/app/patients/[relationshipId]/evidence/page";
import { PatientEvidenceForm } from "../../../../app/app/patients/[relationshipId]/evidence/evidence-form";
import { PatientEvidenceRemoveControl } from "../../../../app/app/patients/[relationshipId]/evidence/evidence-remove-control";
import type { PatientEvidencePageArtifact, PatientEvidencePageContext } from "../services/patient-evidence-query-service";

const {
  mockedConnection,
  mockedGetPageContext,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetPageContext: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({ notFound: mockedNotFound, redirect: mockedRedirect }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/patient-evidence/services/patient-evidence-query-service", () => ({
  getPatientEvidencePageContext: mockedGetPageContext,
}));
vi.mock("@/modules/patient-evidence/transport/patient-evidence-server-actions", () => ({
  removePatientEvidenceArtifactAction: vi.fn(),
}));

const relationshipId = "11111111-1111-4111-8111-111111111111";
const actor = { userId: "22222222-2222-4222-8222-222222222222" };
const patient = {
  patientHospitalRelationshipId: relationshipId,
  displayName: "สมชาย ผู้ป่วย",
  hospitalNumber: "HN-001",
  hospital: { id: "33333333-3333-4333-8333-333333333333", name: "โรงพยาบาล ก" },
};

function containsString(value: unknown, needle: string, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return value.includes(needle);
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsString(item, needle, seen));
  }

  return Object.values(value).some((item) => containsString(item, needle, seen));
}

type TreeElement = { type: unknown; props: Record<string, unknown> };

function isTreeElement(value: unknown): value is TreeElement {
  return typeof value === "object" && value !== null && "type" in value && "props" in value;
}

/** Collects elements in an unrendered tree whose props match; does not enter component bodies. */
function findElements(value: unknown, predicate: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(value)) {
    value.forEach((item) => findElements(item, predicate, found));
  } else if (isTreeElement(value)) {
    if (predicate(value)) {
      found.push(value);
    }
    findElements(value.props.children, predicate, found);
    Object.values(value.props).forEach((prop) => {
      if (isTreeElement(prop)) findElements(prop, predicate, found);
    });
  }

  return found;
}

/** Renders each evidence card (a hook-free server component) one level, so its children can be inspected. */
function renderEvidenceCards(page: unknown): Map<string, unknown> {
  const cards = findElements(page, (element) => typeof element.type === "function" && "artifact" in element.props);

  return new Map(
    cards.map((card) => [
      (card.props.artifact as PatientEvidencePageArtifact).id,
      (card.type as (props: Record<string, unknown>) => unknown)(card.props),
    ]),
  );
}

function pageArtifact(id: string, overrides: Partial<PatientEvidencePageArtifact> = {}): PatientEvidencePageArtifact {
  return {
    id,
    patientHospitalRelationshipId: relationshipId,
    mediaType: "image/jpeg",
    byteSize: 2048,
    caption: null,
    createdAt: new Date("2026-08-17T06:00:00.000Z"),
    creator: { id: actor.userId, displayName: "ผู้ บันทึก" },
    serviceOneAssociated: false,
    canRemove: false,
    ...overrides,
  };
}

function context(overrides: Partial<PatientEvidencePageContext> = {}): PatientEvidencePageContext {
  return {
    patient,
    artifacts: [],
    canCreate: true,
    ...overrides,
  };
}

describe("Patient Evidence page workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);
    mockedGetPageContext.mockResolvedValue(context());
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("renders the create/list/view workflow for a writable relationship", async () => {
    const page = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(page, "หลักฐาน / รูปภาพสถานะ")).toBe(true);
    expect(containsString(page, "ยังไม่มีรูปหลักฐาน")).toBe(true);
    expect(containsString(page, "ดูหลักฐาน")).toBe(true);
    expect(page).toBeTruthy();
  });

  it("shows the form component only when create capability is granted", async () => {
    const page = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(page, "เพิ่มรูปหลักฐาน")).toBe(true);
    expect(PatientEvidenceForm).toBeTypeOf("function");

    mockedGetPageContext.mockResolvedValueOnce(context({ canCreate: false }));
    const readOnlyPage = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });

    expect(containsString(readOnlyPage, "ไม่มีสิทธิ์เพิ่มรูปหลักฐาน")).toBe(true);
  });

  it("shows the remove action only on photos the actor may remove (N4)", async () => {
    const removable = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const notRemovable = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const associated = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    mockedGetPageContext.mockResolvedValueOnce(
      context({
        artifacts: [
          pageArtifact(removable, { canRemove: true }),
          pageArtifact(notRemovable),
          pageArtifact(associated, { serviceOneAssociated: true }),
        ],
      }),
    );

    const page = await PatientEvidencePage({ params: Promise.resolve({ relationshipId }) });
    const cards = renderEvidenceCards(page);
    const removeControls = (id: string) =>
      findElements(cards.get(id), (element) => element.type === PatientEvidenceRemoveControl);

    expect(cards.size).toBe(3);
    expect(removeControls(removable)).toHaveLength(1);
    expect(removeControls(removable)[0]?.props).toMatchObject({ artifactId: removable, relationshipId });
    expect(removeControls(notRemovable)).toHaveLength(0);
    expect(removeControls(associated)).toHaveLength(0);
    expect(containsString(cards.get(associated), "กิจกรรม Service 1")).toBe(true);
    expect(containsString(cards.get(notRemovable), "กิจกรรม Service 1")).toBe(false);
  });
});
