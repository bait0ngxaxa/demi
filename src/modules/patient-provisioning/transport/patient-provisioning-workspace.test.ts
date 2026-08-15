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

const successState = {
  status: "SUCCESS",
  result: {
    outcome: "CREATED",
    accountStatus: "PROVISIONED",
    reusedExistingUser: false,
  },
} satisfies PatientProvisionActionState;

const hospitalId = "33333333-3333-4333-8333-333333333333";

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

  it("keeps activation issuance out of the Patient provisioning form", () => {
    const scope = {
      hospitalId,
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

    expect(markup).toContain("จัดการการเปิดใช้งานบัญชีผู้ป่วย");
    expect(markup).not.toContain("ออกลิงก์เปิดใช้งาน");
    expect(getMaximumFormDepth(markup)).toBe(1);
  });
});
