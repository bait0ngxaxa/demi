"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { readPatientImportCandidates, type PatientImportUpload } from "../adapters/excel-patient-import-adapter";
import {
  patientImportFileSchema,
  patientProvisionFormSchema,
} from "../schemas/patient-provisioning-schemas";
import {
  importPatientProvisioning,
  PatientProvisioningConflictError,
  previewPatientProvisioning,
  provisionPatient,
} from "../services/patient-provisioning-service";
import type {
  PatientImportActionState,
  PatientImportPreviewActionState,
  PatientProvisionActionState,
} from "./action-state";

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function isPatientImportUpload(value: unknown): value is PatientImportUpload {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

function mapPatientError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof PatientProvisioningConflictError) {
    if (error.kind === "IDENTITY_CONFLICT") {
      return {
        code: "CONFLICT",
        message: "ข้อมูลตัวตนของผู้ป่วยขัดแย้งกับข้อมูลเดิม ต้องตรวจสอบโดยผู้ดูแล",
      };
    }

    if (error.kind === "RELATIONSHIP_CONFLICT") {
      return {
        code: "CONFLICT",
        message: "ข้อมูลความสัมพันธ์กับโรงพยาบาลขัดแย้งกับข้อมูลเดิม",
      };
    }

    return {
      code: "CONFLICT",
      message: "ข้อมูลผู้ป่วยอยู่ในสถานะที่ต้องตรวจสอบโดยผู้ดูแล",
    };
  }

  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง" };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์เพิ่มผู้ป่วยในโรงพยาบาลนี้" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return { code: "CONFLICT", message: "ข้อมูลผู้ป่วยขัดแย้งกับข้อมูลเดิม ต้องตรวจสอบโดยผู้ดูแล" };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapFieldErrors(
  issues: readonly { path: readonly unknown[] }[],
): Partial<Record<"nationalId" | "givenName" | "familyName" | "hospitalNumber", string>> {
  const fieldErrors: Partial<
    Record<"nationalId" | "givenName" | "familyName" | "hospitalNumber", string>
  > = {};
  const messages: Record<"nationalId" | "givenName" | "familyName" | "hospitalNumber", string> = {
    nationalId: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง",
    givenName: "กรุณากรอกชื่อ",
    familyName: "กรุณากรอกนามสกุล",
    hospitalNumber: "HN ยาวเกินจำนวนที่รองรับ",
  };

  for (const issue of issues) {
    const field = issue.path[0];

    if (
      (field === "nationalId" ||
        field === "givenName" ||
        field === "familyName" ||
        field === "hospitalNumber") &&
      !fieldErrors[field]
    ) {
      fieldErrors[field] = messages[field];
    }
  }

  return fieldErrors;
}

function getPatientFormInput(formData: FormData) {
  return {
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    hospitalNumber: getString(formData, "hospitalNumber"),
    targetHospitalId: getString(formData, "targetHospitalId"),
  };
}

export async function provisionPatientAction(
  _previousState: PatientProvisionActionState,
  formData: FormData,
): Promise<PatientProvisionActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const parsed = patientProvisionFormSchema.safeParse(getPatientFormInput(formData));

    if (!parsed.success) {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาตรวจสอบข้อมูลผู้ป่วยให้ถูกต้อง",
        fieldErrors: mapFieldErrors(parsed.error.issues),
      };
    }

    const result = await provisionPatient(actor, {
      identity: {
        namespace: "thai-national-id",
        value: parsed.data.nationalId,
      },
      givenName: parsed.data.givenName,
      familyName: parsed.data.familyName,
      hospitalNumber: parsed.data.hospitalNumber,
      targetHospitalId: parsed.data.targetHospitalId,
    });

    revalidatePath("/app/patients/provision");

    return {
      status: "SUCCESS",
      result: {
        outcome: result.outcome,
        accountStatus: result.accountStatus,
        reusedExistingUser: result.reusedExistingUser,
      },
    };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapPatientError(error) };
  }
}

function getImportRequest(formData: FormData): {
  targetHospitalId: string;
  file: unknown;
} {
  return {
    targetHospitalId: getString(formData, "targetHospitalId"),
    file: formData.get("file"),
  };
}

export async function previewPatientImportAction(
  _previousState: PatientImportPreviewActionState,
  formData: FormData,
): Promise<PatientImportPreviewActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const request = getImportRequest(formData);
    const parsed = patientImportFileSchema.safeParse({
      targetHospitalId: request.targetHospitalId,
    });

    if (!parsed.success || !isPatientImportUpload(request.file)) {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาเลือกไฟล์ Excel และโรงพยาบาลที่ถูกต้อง",
      };
    }

    const candidates = await readPatientImportCandidates(request.file, parsed.data.targetHospitalId);
    const preview = await previewPatientProvisioning(
      actor,
      parsed.data.targetHospitalId,
      candidates,
    );

    return { status: "SUCCESS", preview };
  } catch (error: unknown) {
    const mapped = mapPatientError(error);
    return {
      status: "ERROR",
      code: mapped.code === "CONFLICT" ? "UNAVAILABLE" : mapped.code,
      message: mapped.message,
    };
  }
}

export async function confirmPatientImportAction(
  _previousState: PatientImportActionState,
  formData: FormData,
): Promise<PatientImportActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const request = getImportRequest(formData);
    const parsed = patientImportFileSchema.safeParse({
      targetHospitalId: request.targetHospitalId,
    });

    if (!parsed.success || !isPatientImportUpload(request.file)) {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message: "กรุณาเลือกไฟล์ Excel และโรงพยาบาลที่ถูกต้อง",
      };
    }

    const candidates = await readPatientImportCandidates(request.file, parsed.data.targetHospitalId);
    const summary = await importPatientProvisioning(
      actor,
      parsed.data.targetHospitalId,
      candidates,
    );

    revalidatePath("/app/patients/provision");
    return { status: "SUCCESS", summary };
  } catch (error: unknown) {
    const mapped = mapPatientError(error);
    return {
      status: "ERROR",
      code: mapped.code === "CONFLICT" ? "UNAVAILABLE" : mapped.code,
      message: mapped.message,
    };
  }
}
