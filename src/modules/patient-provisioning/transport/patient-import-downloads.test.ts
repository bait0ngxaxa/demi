import ExcelJS from "exceljs";
import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";
import {
  readPatientImportCandidates,
  type PatientImportUpload,
} from "../adapters/excel-patient-import-adapter";
import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";
import { createPatientImportTemplateWorkbook } from "../import/patient-import-template";
import {
  PATIENT_IMPORT_TEMPLATE_COLUMNS,
  PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME,
  PATIENT_IMPORT_TEMPLATE_SHEET_NAME,
} from "../import/patient-import-template-contract";
import type { PatientImportFailedRowsInput } from "../schemas/patient-provisioning-schemas";
import type { PatientImportPreview, PatientImportPreviewRow } from "../services/patient-roster-import-types";
import {
  createPatientImportPreviewBinding,
  hashPatientImportFile,
} from "./patient-import-file-binding";
import {
  createPatientImportFailedRowsDownload,
  createPatientImportTemplateDownload,
} from "./patient-import-downloads";

const mockedResolveTarget = vi.hoisted(() => vi.fn());
const mockedPreview = vi.hoisted(() => vi.fn());

vi.mock("../services/patient-import-template-service", () => ({
  resolvePatientImportTemplateTarget: mockedResolveTarget,
}));
vi.mock("../services/patient-roster-import-service", () => ({
  previewPatientRosterImport: mockedPreview,
}));

const hospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const target = { hospitalId, hospitalCode: "SYN-A", hospitalName: "โรงพยาบาลสังเคราะห์เอ" };

const actor = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId,
    membershipType: MembershipType.MEMBER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
} satisfies ActorContext;

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  type ExcelJsInputBuffer = Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer as unknown as ExcelJsInputBuffer);
  return workbook;
}

const patientValues: Record<string, ExcelJS.CellValue> = {
  nationalId: "1000000000009",
  givenName: "ตัวอย่าง",
  familyName: "ผู้ป่วย",
  hospitalNumber: "HN-1",
  weight: 70,
  diabetesClassification: "เบาหวาน",
};

async function createSourceUpload(rowCount: number): Promise<PatientImportUpload> {
  const workbook = await createPatientImportTemplateWorkbook(target);
  const worksheet = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

  if (!worksheet) {
    throw new Error("missing sheet");
  }

  for (let index = 0; index < rowCount; index += 1) {
    for (const column of PATIENT_IMPORT_TEMPLATE_COLUMNS) {
      const base = patientValues[column.field] ?? null;
      worksheet.getCell(`${column.column}${index + 3}`).value =
        column.field === "nationalId" ? `10000000000${index}9` : column.field === "sourceSequenceNumber" ? index + 1 : base;
    }
  }

  const written = await workbook.xlsx.writeBuffer();
  const bytes = Uint8Array.from(new Uint8Array(written));

  return {
    name: "patients.xlsx",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
  };
}

function previewRow(rowNumber: number, classification: PatientImportPreviewRow["classification"], reason: string | null): PatientImportPreviewRow {
  return {
    rowNumber,
    identityDisplay: "••••••0009",
    givenName: "ตัวอย่าง",
    familyName: "ผู้ป่วย",
    hospitalNumber: "HN-1",
    classification,
    reason,
    baselineStatus: "NOT_APPLICABLE",
    requirementGatedFields: [],
    diagnosticCodes: [],
    patientClassification: { status: "NOT_APPLICABLE", sourceClassification: null },
  };
}

function previewOf(rows: PatientImportPreviewRow[]): PatientImportPreview {
  return {
    targetHospitalId: hospitalId,
    effectiveDate: null,
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    baselineDateRequired: false,
    rows,
    file: null,
  };
}

async function requestFor(
  file: PatientImportUpload,
  overrides: Partial<PatientImportFailedRowsInput> = {},
): Promise<PatientImportFailedRowsInput> {
  const fileFingerprint = await hashPatientImportFile(file);

  return {
    targetHospitalId: hospitalId,
    previewTargetHospitalId: hospitalId,
    fileFingerprint,
    previewBinding: createPatientImportPreviewBinding(fileFingerprint, hospitalId, actor.userId),
    importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    failedRowNumbers: [],
    ...overrides,
  };
}

describe("patient import template download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveTarget.mockResolvedValue(target);
  });

  it("generates a workbook bound to the authorized hospital", async () => {
    const download = await createPatientImportTemplateDownload(actor, hospitalId);
    const workbook = await loadWorkbook(download.buffer);

    expect(mockedResolveTarget).toHaveBeenCalledWith(actor, hospitalId);
    expect(download.filename).toBe("DEMI_patient_import_SYN-A_v2.xlsx");
    expect(workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME)?.getCell("B2").text).toBe("SYN-A");
  });

  it("generates nothing for an out-of-scope hospital", async () => {
    mockedResolveTarget.mockRejectedValue(new ForbiddenError());

    await expect(createPatientImportTemplateDownload(actor, otherHospitalId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("patient import failed-rows download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedResolveTarget.mockResolvedValue(target);
  });

  it("exports INVALID, CONFLICT and DUPLICATE rows with original values and reasons, never ALREADY_EXISTS", async () => {
    const file = await createSourceUpload(5);
    mockedPreview.mockResolvedValue(
      previewOf([
        previewRow(3, "READY", null),
        previewRow(4, "ALREADY_EXISTS", "มีผู้ป่วยรายนี้ในโรงพยาบาลแล้ว"),
        previewRow(5, "INVALID", "เลขบัตรประชาชนไม่ถูกต้อง"),
        previewRow(6, "CONFLICT", "HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน"),
        previewRow(7, "DUPLICATE_IN_FILE", null),
      ]),
    );

    const download = await createPatientImportFailedRowsDownload(actor, await requestFor(file), file);
    const workbook = await loadWorkbook(download.buffer);
    const worksheet = workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

    expect(download.filename).toBe("DEMI_patient_import_SYN-A_v2_failed_rows.xlsx");
    expect(worksheet?.getCell("AA1").text).toBe("เหตุผล");
    expect(worksheet?.getCell("AA3").text).toBe("เลขบัตรประชาชนไม่ถูกต้อง");
    expect(worksheet?.getCell("AA4").text).toBe("HN ของความสัมพันธ์กับโรงพยาบาลนี้ไม่ตรงกัน");
    expect(worksheet?.getCell("AA5").text).toBe("พบเลขบัตรประชาชนซ้ำในไฟล์เดียวกัน");
    expect(worksheet?.getCell("AA6").value).toBeNull();
    // Original values of source rows 5, 6, 7 (sequence numbers 3, 4, 5), in order.
    expect([3, 4, 5].map((index) => worksheet?.getCell(`A${index}`).value)).toEqual([3, 4, 5]);
    expect(worksheet?.getCell("B3").text).toBe("1000000000029");
    expect(worksheet?.getCell("D3").text).toBe("ตัวอย่าง");
    expect(worksheet?.getCell("L3").text).toBe("เบาหวาน");
    expect(workbook.getWorksheet(PATIENT_IMPORT_TEMPLATE_METADATA_SHEET_NAME)?.getCell("B2").text).toBe("SYN-A");
  });

  it("includes a READY row only when the client reports that its commit failed", async () => {
    const file = await createSourceUpload(3);
    mockedPreview.mockResolvedValue(
      previewOf([
        previewRow(3, "READY", null),
        previewRow(4, "READY", null),
        previewRow(5, "ALREADY_EXISTS", "มีอยู่แล้ว"),
      ]),
    );

    const download = await createPatientImportFailedRowsDownload(
      actor,
      await requestFor(file, { failedRowNumbers: [4, 5, 99] }),
      file,
    );
    const worksheet = (await loadWorkbook(download.buffer)).getWorksheet(PATIENT_IMPORT_TEMPLATE_SHEET_NAME);

    expect(worksheet?.getCell("A3").value).toBe(2);
    expect(worksheet?.getCell("AA3").text).toContain("ระบบบันทึกแถวนี้ไม่สำเร็จ");
    expect(worksheet?.getCell("A4").value).toBeNull();
  });

  it("re-previews with the bound effective date and contract version", async () => {
    const file = await createSourceUpload(1);
    mockedPreview.mockResolvedValue(previewOf([previewRow(3, "INVALID", "ข้อมูลไม่ถูกต้อง")]));

    const fileFingerprint = await hashPatientImportFile(file);
    await createPatientImportFailedRowsDownload(
      actor,
      await requestFor(file, {
        effectiveDate: "2026-08-01",
        previewBinding: createPatientImportPreviewBinding(
          fileFingerprint,
          hospitalId,
          actor.userId,
          "2026-08-01",
          PATIENT_IMPORT_CONTRACT_VERSION,
        ),
      }),
      file,
    );

    expect(mockedPreview).toHaveBeenCalledWith(
      actor,
      hospitalId,
      expect.any(Array),
      undefined,
      { effectiveDate: "2026-08-01", importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION },
    );
  });

  it("produces a file that parses again with the reason column ignored (fix, re-import, succeed)", async () => {
    const file = await createSourceUpload(2);
    mockedPreview.mockResolvedValue(
      previewOf([previewRow(3, "ALREADY_EXISTS", null), previewRow(4, "INVALID", "ข้อมูลไม่ถูกต้อง")]),
    );

    const download = await createPatientImportFailedRowsDownload(actor, await requestFor(file), file);
    const failedUpload: PatientImportUpload = {
      name: download.filename,
      size: download.buffer.byteLength,
      arrayBuffer: async () =>
        download.buffer.buffer.slice(
          download.buffer.byteOffset,
          download.buffer.byteOffset + download.buffer.byteLength,
        ) as ArrayBuffer,
    };

    const candidates = await readPatientImportCandidates(failedUpload, target);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.canonicalRow.identity.givenName).toBe("ตัวอย่าง");
    expect(candidates[0]?.canonicalRow.identity.nationalId).toBe("1000000000019");
  });

  it("refuses when every row is imported or already exists", async () => {
    const file = await createSourceUpload(2);
    mockedPreview.mockResolvedValue(
      previewOf([previewRow(3, "ALREADY_EXISTS", null), previewRow(4, "READY", null)]),
    );

    await expect(
      createPatientImportFailedRowsDownload(actor, await requestFor(file), file),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects another file, another hospital and a forged binding before reading the workbook", async () => {
    const file = await createSourceUpload(1);
    const request = await requestFor(file);
    const otherFile = await createSourceUpload(2);

    await expect(createPatientImportFailedRowsDownload(actor, request, otherFile)).rejects.toMatchObject({
      name: "PatientImportPreviewBindingError",
    });
    await expect(
      createPatientImportFailedRowsDownload(actor, { ...request, previewTargetHospitalId: otherHospitalId }, file),
    ).rejects.toMatchObject({ name: "PatientImportPreviewBindingError" });
    await expect(
      createPatientImportFailedRowsDownload(actor, { ...request, previewBinding: "f".repeat(64) }, file),
    ).rejects.toMatchObject({ name: "PatientImportPreviewBindingError" });
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it("rejects an oversized or empty upload before hashing or parsing it", async () => {
    const file = await createSourceUpload(1);
    const request = await requestFor(file);

    await expect(
      createPatientImportFailedRowsDownload(actor, request, { ...file, size: 5 * 1024 * 1024 + 1 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createPatientImportFailedRowsDownload(actor, request, { ...file, size: 0 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it("denies an out-of-scope hospital before the binding or the file is touched", async () => {
    const file = await createSourceUpload(1);
    mockedResolveTarget.mockRejectedValue(new ForbiddenError());

    await expect(
      createPatientImportFailedRowsDownload(actor, await requestFor(file), file),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it("rejects hospital B's file when hospital A is selected, with no workbook", async () => {
    const workbook = await createPatientImportTemplateWorkbook({
      hospitalCode: "SYN-B",
      hospitalName: "โรงพยาบาลสังเคราะห์บี",
    });
    const written = await workbook.xlsx.writeBuffer();
    const bytes = Uint8Array.from(new Uint8Array(written));
    const file: PatientImportUpload = {
      name: "other.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer,
    };

    await expect(
      createPatientImportFailedRowsDownload(actor, await requestFor(file), file),
    ).rejects.toThrow("โรงพยาบาลสังเคราะห์เอ");
    expect(mockedPreview).not.toHaveBeenCalled();
  });
});
