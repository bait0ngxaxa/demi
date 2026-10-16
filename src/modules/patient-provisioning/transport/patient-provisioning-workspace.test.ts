import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PatientImportUploadGuidance,
  PatientProvisioningWorkspace,
} from "../../../../app/app/patients/provision/patient-provisioning-workspace";
import {
  PATIENT_IMPORT_FIELD_KEYS,
  PATIENT_IMPORT_SAVED_FIELD_KEYS,
  PATIENT_IMPORT_UNSAVED_FIELD_KEYS,
} from "../import/patient-import-contract";
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

    expect(markup).toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
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

    expect(markup).toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(markup).not.toContain("อยู่ในสถานะรอเปิดใช้งาน");
    expect(markup).not.toContain("จัดการการเปิดใช้งานบัญชีผู้ป่วย");
    expect(markup).not.toContain('href="/app/patients/activation');
    expect(markup).not.toContain('href="/app/patients/44444444-4444-4444-8444-444444444444"');
  });

  it("publishes the hospital-bound template for the selected hospital beside the upload control", () => {
    const scope = {
      hospitalId,
      hospitalCode: "TEST-HOSPITAL",
      hospitalName: "โรงพยาบาลทดสอบ",
      canBulkImport: true,
    };
    const markup = renderToStaticMarkup(
      createElement(PatientProvisioningWorkspace, {
        scopes: [scope],
        selectedHospitalId: scope.hospitalId,
        selectedScope: scope,
      }),
    );

    expect(markup).toContain(
      `href="/api/v1/hospital/patient-import/template?hospitalId=${hospitalId}"`,
    );
    expect(markup).toContain('download="DEMI_patient_import_TEST-HOSPITAL_v2.xlsx"');
    expect(markup).toContain("ดาวน์โหลดไฟล์ตัวอย่าง Excel ของ โรงพยาบาลทดสอบ");
    expect(markup).toContain("ใช้ไฟล์ตัวอย่าง Excel ของระบบสำหรับนำเข้ารายชื่อผู้ป่วย");
    expect(markup).toContain("รองรับสูงสุด 500 รายการต่อไฟล์");
    expect(markup).toContain("ไฟล์นี้ใช้ได้กับโรงพยาบาลนี้เท่านั้น");
    expect(markup).not.toContain("/templates/demi-patient-import-template");
    expect(markup).not.toContain("PATIENT_IMPORT_TEMPLATE_VERSION");
    expect(markup).not.toContain("contractVersion");
  });

  it("points the template link at the newly selected hospital", () => {
    const otherHospitalId = "55555555-5555-4555-8555-555555555555";
    const scopes = [
      { hospitalId, hospitalCode: "TEST-A", hospitalName: "โรงพยาบาลเอ", canBulkImport: true },
      { hospitalId: otherHospitalId, hospitalCode: "TEST-B", hospitalName: "โรงพยาบาลบี", canBulkImport: true },
    ];
    const markup = renderToStaticMarkup(
      createElement(PatientProvisioningWorkspace, {
        scopes,
        selectedHospitalId: otherHospitalId,
        selectedScope: scopes[1],
      }),
    );

    expect(markup).toContain(`hospitalId=${otherHospitalId}`);
    expect(markup).toContain("DEMI_patient_import_TEST-B_v2.xlsx");
    expect(markup).not.toContain("DEMI_patient_import_TEST-A_v2.xlsx");
  });

  it("explains that re-import adds new patients only and that OSM is assigned afterwards", () => {
    const markup = renderToStaticMarkup(createElement(PatientImportUploadGuidance));

    expect(markup).toContain("นำเข้าซ้ำได้");
    expect(markup).toContain("เพิ่มเฉพาะผู้ป่วยใหม่");
    expect(markup).toContain("ไม่ถูกนำไปใช้ ให้แก้ไขในระบบ");
    expect(markup).toContain("การกำหนด อสม. ทำหลังนำเข้า");
  });

  it("explains all profile fields are saved and sequence is only row metadata", () => {
    const markup = renderToStaticMarkup(createElement(PatientImportUploadGuidance));
    const [saved = "", notSaved = ""] = markup.split("ใช้สำหรับอ้างอิงแถวในไฟล์");

    expect(saved).toContain("ระบบบันทึกจากไฟล์");
    for (const label of ["เลขบัตรประชาชน", "ชื่อ", "HN", "น้ำหนัก", "HbA1c", "ประเภทเบาหวาน/กลุ่มเสี่ยง"]) {
      expect(saved).toContain(label);
    }
    for (const label of ["วันเกิด", "เพศ", "เบอร์โทรศัพท์", "บ้านเลขที่", "ชื่อผู้ติดต่อฉุกเฉิน"]) {
      expect(saved).toContain(label);
      expect(notSaved).not.toContain(label);
    }
  });

  it("keeps the saved and unsaved key sets disjoint and covering every template column", () => {
    const saved: readonly string[] = PATIENT_IMPORT_SAVED_FIELD_KEYS;

    expect(PATIENT_IMPORT_UNSAVED_FIELD_KEYS.filter((field) => saved.includes(field))).toEqual([]);
    expect(saved.length + PATIENT_IMPORT_UNSAVED_FIELD_KEYS.length).toBe(PATIENT_IMPORT_FIELD_KEYS.length);
  });
});
