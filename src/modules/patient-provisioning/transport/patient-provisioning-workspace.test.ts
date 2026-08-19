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
    relationshipId: "44444444-4444-4444-8444-444444444444",
    hospitalId: "33333333-3333-4333-8333-333333333333",
    accountStatus: "PROVISIONED",
    reusedExistingUser: false,
    canOpenPatientDetail: true,
    canManagePatientActivation: true,
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
    expect(markup).toContain(
      'href="/app/patients/44444444-4444-4444-8444-444444444444"',
    );
    expect(markup).toContain(
      'href="/app/patients/activation?hospitalId=33333333-3333-4333-8333-333333333333"',
    );
    expect(markup).not.toContain("ออกลิงก์เปิดใช้งาน");
    expect(getMaximumFormDepth(markup)).toBe(1);
  });

  it("keeps Patient Detail primary when an ACTIVE User is reused", () => {
    mockedUseActionState.mockReturnValue([
      {
        status: "SUCCESS",
        result: {
          ...successState.result,
          accountStatus: "ACTIVE",
          reusedExistingUser: true,
        },
      },
      vi.fn(),
      false,
    ]);
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

    expect(markup).toContain(
      'href="/app/patients/44444444-4444-4444-8444-444444444444"',
    );
    expect(markup).not.toContain('href="/app/patients/activation');
    expect(markup).not.toContain("อยู่ในสถานะรอเปิดใช้งาน");
  });

  it("keeps an OSM-only success truthful without unauthorized continuations", () => {
    mockedUseActionState.mockReturnValue([
      {
        status: "SUCCESS",
        result: {
          ...successState.result,
          canOpenPatientDetail: false,
          canManagePatientActivation: false,
        },
      },
      vi.fn(),
      false,
    ]);
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

    expect(markup).toContain("เพิ่มข้อมูลผู้ป่วยเรียบร้อยแล้ว");
    expect(markup).toContain("ยังไม่มีสิทธิ์ดำเนินการต่อ");
    expect(markup).not.toContain('href="/app/patients/44444444-4444-4444-8444-444444444444"');
    expect(markup).not.toContain('href="/app/patients/activation');
  });

  it("applies capability-aware continuations to already provisioned results", () => {
    mockedUseActionState.mockReturnValue([
      {
        status: "SUCCESS",
        result: {
          ...successState.result,
          outcome: "ALREADY_PROVISIONED",
          canOpenPatientDetail: false,
          canManagePatientActivation: false,
        },
      },
      vi.fn(),
      false,
    ]);
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

    expect(markup).toContain("ผู้ป่วยรายนี้มีข้อมูลในโรงพยาบาลแล้ว");
    expect(markup).toContain("ยังไม่มีสิทธิ์ดำเนินการต่อ");
    expect(markup).not.toContain('href="/app/patients/44444444-4444-4444-8444-444444444444"');
    expect(markup).not.toContain('href="/app/patients/activation');
  });

  it("does not advertise activation management for an ACTIVE OSM-only reuse", () => {
    mockedUseActionState.mockReturnValue([
      {
        status: "SUCCESS",
        result: {
          ...successState.result,
          accountStatus: "ACTIVE",
          reusedExistingUser: true,
          canOpenPatientDetail: false,
          canManagePatientActivation: false,
        },
      },
      vi.fn(),
      false,
    ]);
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

    expect(markup).toContain("เพิ่มข้อมูลผู้ป่วยเรียบร้อยแล้ว");
    expect(markup).not.toContain("อยู่ในสถานะรอเปิดใช้งาน");
    expect(markup).not.toContain("จัดการการเปิดใช้งานบัญชีผู้ป่วย");
    expect(markup).not.toContain('href="/app/patients/activation');
    expect(markup).not.toContain('href="/app/patients/44444444-4444-4444-8444-444444444444"');
  });
});
