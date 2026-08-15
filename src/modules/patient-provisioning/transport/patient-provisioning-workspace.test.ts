import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PatientProvisioningWorkspace } from "../../../../app/app/patients/provision/patient-provisioning-workspace";
import type { PatientProvisionActionState } from "./action-state";

const mockedUseActionState = vi.hoisted(() => vi.fn());

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return { ...actual, useActionState: mockedUseActionState };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("./server-actions", () => ({
  confirmPatientImportAction: vi.fn(),
  provisionPatientAction: vi.fn(),
  previewPatientImportAction: vi.fn(),
}));

vi.mock(
  "../../../../app/app/patients/provision/patient-activation-handoff",
  async () => {
    const react = await vi.importActual<typeof import("react")>("react");

    return {
      PatientActivationHandoff: () =>
        react.createElement("form", { "data-activation-form": "true" }),
    };
  },
);

const successState = {
  status: "SUCCESS",
  result: {
    outcome: "CREATED",
    userId: "11111111-1111-4111-8111-111111111111",
    patientProfileId: "22222222-2222-4222-8222-222222222222",
    hospitalId: "33333333-3333-4333-8333-333333333333",
    accountStatus: "PROVISIONED",
    reusedExistingUser: false,
  },
} satisfies PatientProvisionActionState;

function getMaximumFormDepth(markup: string): number {
  let depth = 0;
  let maximumDepth = 0;

  for (const match of markup.matchAll(/<\/?form\b[^>]*>/gu)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      continue;
    }

    depth += 1;
    maximumDepth = Math.max(maximumDepth, depth);
  }

  return maximumDepth;
}

describe("PatientProvisioningWorkspace form structure", () => {
  beforeEach(() => {
    mockedUseActionState.mockReturnValue([successState, vi.fn(), false]);
  });

  it("keeps the activation form outside the Patient provisioning form", () => {
    const scope = {
      hospitalId: successState.result.hospitalId,
      hospitalCode: "TEST-HOSPITAL",
      hospitalName: "โรงพยาบาลทดสอบ",
      canBulkImport: false,
    };
    const markup = renderToStaticMarkup(
      createElement(PatientProvisioningWorkspace, {
        scopes: [scope],
        selectedHospitalId: scope.hospitalId,
        selectedScope: scope,
      }),
    );

    expect(markup).toContain("data-activation-form");
    expect(getMaximumFormDepth(markup)).toBe(1);
  });
});
