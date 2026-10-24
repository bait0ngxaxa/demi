"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createWorkforceActivationUrlBuilder,
  isApplicationPublicOriginConfigurationError,
} from "@/lib/env/server";
import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  hospitalMemberProvisionSchema,
  workforceContactPhoneUpdateSchema,
  hospitalMembershipProfessionUpdateSchema,
  hospitalMembershipReportExportGrantSchema,
  hospitalMembershipTransitionSchema,
  hospitalOwnerGovernanceMutationSchema,
  osmRelationshipTransitionSchema,
  osmProvisionSchema,
  workforceActivationCompletionSchema,
  workforceActivationRequestSchema,
  workforceKindSchema,
  workforcePasswordResetRequestSchema,
  WORKFORCE_BULK_MAX_ROWS,
} from "../schemas/workforce-schemas";
import {
  completeWorkforceActivation,
  completeWorkforcePasswordReset,
  demoteHospitalOwner,
  issueWorkforcePasswordReset,
  previewWorkforceActivation,
  promoteHospitalOwner,
  provisionHospitalMember,
  setHospitalMembershipNetworkPatientReadGrant,
  setHospitalMembershipReportExportGrant,
  provisionOsm,
  provisionWorkforceBulk,
  regenerateWorkforceActivation,
  revokeIssuedWorkforceActivation,
  WorkforceBulkDuplicateError,
  restoreOsmRelationship,
  restoreHospitalMembership,
  suspendOsmRelationship,
  suspendHospitalMembership,
  updateHospitalMembershipProfession,
  updateWorkforceContactPhone,
} from "../services/workforce-service";
import type {
  WorkforceActivationActionState,
  WorkforceActivationPreviewState,
  WorkforceBulkActionState,
  WorkforceCompletionActionState,
  WorkforcePasswordResetActionState,
  WorkforceField,
  WorkforceMembershipMutationActionState,
  WorkforceMembershipMutationResultState,
  WorkforceOsmRelationshipMutationActionState,
  WorkforceOsmRelationshipMutationResultState,
  WorkforceOwnerGovernanceMutationActionState,
  WorkforceReportExportGrantActionState,
  WorkforceOwnerGovernanceMutationResultState,
  WorkforceProvisionActionState,
  WorkforceProvisionResultState,
} from "./action-state";

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function mapFieldErrors(
  issues: readonly { path: readonly unknown[] }[],
): Partial<Record<WorkforceField, string>> {
  const fieldErrors: Partial<Record<WorkforceField, string>> = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (typeof field === "string" && !fieldErrors[field as WorkforceField]) {
      const messages: Partial<Record<WorkforceField, string>> = {
        nationalId: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง",
        givenName: "กรุณากรอกชื่อ",
        familyName: "กรุณากรอกนามสกุล",
        targetHospitalId: "กรุณาเลือกโรงพยาบาลที่มีสิทธิ์จัดการ",
        profession: "กรุณาเลือกวิชาชีพที่กำหนด",
        contactPhone: "กรุณากรอกเบอร์ติดต่อไทยให้ถูกต้อง",
        userId: "ไม่พบผู้ใช้งานที่ต้องการดำเนินการ",
        relationshipId: "ไม่พบความสัมพันธ์บุคลากรที่ต้องการดำเนินการ",
        expectedUpdatedAt: "ข้อมูลบุคลากรล้าสมัย กรุณาโหลดข้อมูลใหม่",
      };
      const message = messages[field as WorkforceField];

      if (message) {
        fieldErrors[field as WorkforceField] = message;
      }
    }
  }

  return fieldErrors;
}

function mapWorkforceError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง" };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์จัดการบุคลากรของโรงพยาบาลนี้" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้ กรุณาตรวจสอบสถานะแล้วลองใหม่",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapCompletionError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบรหัสผ่านให้ถูกต้อง" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return { code: "CONFLICT", message: ACTIVATION_UNAVAILABLE_MESSAGE };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบยังไม่สามารถเปิดใช้งานบัญชีได้ กรุณาลองใหม่หรือติดต่อผู้ดูแลโรงพยาบาล",
  };
}

const CONFIGURED_ACTIVATION_ORIGIN_MESSAGE =
  "ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับลิงก์เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ";

function isConfiguredActivationOriginError(error: unknown): boolean {
  return isApplicationPublicOriginConfigurationError(error);
}

function toProvisionResultState(
  result: Awaited<ReturnType<typeof provisionHospitalMember>>,
  urls: ReturnType<typeof createWorkforceActivationUrlBuilder> | null,
): WorkforceProvisionResultState {
  if (result.activationToken && !urls) {
    throw new Error("Activation URL builder is required when provisioning returns a token");
  }

  return {
    kind: result.kind,
    userId: result.userId,
    hospitalId: result.hospitalId,
    relationshipId: result.relationshipId,
    accountStatus: result.accountStatus,
    relationshipStatus: result.relationshipStatus,
    activationRequired: result.activationRequired,
    activationToken: result.activationToken,
    activationUrl: result.activationToken && urls ? urls.build(result.activationToken) : null,
    activationExpiresAt: result.activationExpiresAt?.toISOString() ?? null,
    activationMode: result.activationMode,
    reusedExistingUser: result.reusedExistingUser,
    idempotent: result.idempotent,
  };
}

function getProvisionInput(formData: FormData) {
  return {
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    contactPhone: getString(formData, "contactPhone"),
    targetHospitalId: getString(formData, "targetHospitalId"),
    profession: getString(formData, "profession"),
  };
}

function mapOsmRelationshipError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { code: "INVALID_INPUT", message: "กรุณาตรวจสอบข้อมูลความสัมพันธ์ อสม. ให้ถูกต้อง" };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์จัดการความสัมพันธ์ อสม. ของโรงพยาบาลนี้" };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "ไม่สามารถเปลี่ยนสถานะความสัมพันธ์ อสม. ได้ กรุณาตรวจสอบสถานะและจำนวนผู้ป่วยแล้วลองใหม่",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมเปลี่ยนสถานะความสัมพันธ์ อสม. ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function mapHospitalOwnerGovernanceError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "ข้อมูลการเปลี่ยนแปลงสิทธิ์เจ้าของโรงพยาบาลไม่ถูกต้อง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์จัดการสิทธิ์เจ้าของโรงพยาบาล",
      };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message:
          "ไม่สามารถเปลี่ยนสิทธิ์เจ้าของโรงพยาบาลได้ กรุณาโหลดข้อมูลล่าสุดแล้วตรวจสอบสถานะสมาชิกอีกครั้ง",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมเปลี่ยนสิทธิ์เจ้าของโรงพยาบาลในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function getMembershipMutationInput(formData: FormData) {
  return {
    relationshipId: getString(formData, "relationshipId"),
    targetHospitalId: getString(formData, "targetHospitalId"),
    expectedUpdatedAt: getString(formData, "expectedUpdatedAt"),
  };
}

function getProfessionUpdateInput(formData: FormData) {
  return {
    ...getMembershipMutationInput(formData),
    profession: getString(formData, "profession"),
  };
}

function toMembershipMutationResultState(
  result: Awaited<ReturnType<typeof updateHospitalMembershipProfession>>,
): WorkforceMembershipMutationResultState {
  if (result.membershipStatus !== "ACTIVE" && result.membershipStatus !== "SUSPENDED") {
    throw new Error("Unexpected Hospital membership lifecycle status");
  }

  return {
    relationshipId: result.relationshipId,
    hospitalId: result.hospitalId,
    membershipStatus: result.membershipStatus,
    profession: result.profession,
    updatedAt: result.updatedAt.toISOString(),
  };
}

function toOsmRelationshipMutationResultState(
  result: Awaited<ReturnType<typeof suspendOsmRelationship>>,
): WorkforceOsmRelationshipMutationResultState {
  if (result.relationshipStatus !== "ACTIVE" && result.relationshipStatus !== "SUSPENDED") {
    throw new Error("Unexpected OSM relationship lifecycle status");
  }

  return {
    relationshipId: result.relationshipId,
    hospitalId: result.hospitalId,
    relationshipStatus: result.relationshipStatus,
    updatedAt: result.updatedAt.toISOString(),
  };
}

function toOwnerGovernanceMutationResultState(
  result: Awaited<ReturnType<typeof promoteHospitalOwner>>,
): WorkforceOwnerGovernanceMutationResultState {
  if (result.membershipType !== "OWNER" && result.membershipType !== "MEMBER") {
    throw new Error("Unexpected Hospital Owner governance membership type");
  }

  return {
    relationshipId: result.relationshipId,
    hospitalId: result.hospitalId,
    membershipType: result.membershipType,
    updatedAt: result.updatedAt.toISOString(),
  };
}

function revalidateWorkforceMembership(relationshipId: string): void {
  revalidatePath("/app/workforce");
  revalidatePath(`/app/workforce/staff/${relationshipId}`);
}

function revalidateOsmRelationship(relationshipId: string): void {
  revalidatePath("/app/workforce");
  revalidatePath(`/app/workforce/osm/${relationshipId}`);
}

function revalidateHospitalOwnerGovernance(relationshipId: string): void {
  revalidatePath("/app/workforce");
  revalidatePath(`/app/workforce/staff/${relationshipId}`);
}

export async function provisionHospitalMemberAction(
  _previousState: WorkforceProvisionActionState,
  formData: FormData,
): Promise<WorkforceProvisionActionState> {
  const parsed = hospitalMemberProvisionSchema.safeParse(getProvisionInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const deferActivation = getString(formData, "deferActivation") === "true";
    const urls = deferActivation ? null : createWorkforceActivationUrlBuilder();
    const result = deferActivation
      ? await provisionHospitalMember(actor, parsed.data, undefined, { issueInitialActivation: false })
      : await provisionHospitalMember(actor, parsed.data);
    revalidatePath("/app/workforce");
    return { status: "SUCCESS", result: toProvisionResultState(result, urls) };
  } catch (error: unknown) {
    if (isConfiguredActivationOriginError(error)) {
      return { status: "ERROR", code: "CONFIGURATION", message: CONFIGURED_ACTIVATION_ORIGIN_MESSAGE };
    }
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function provisionOsmAction(
  _previousState: WorkforceProvisionActionState,
  formData: FormData,
): Promise<WorkforceProvisionActionState> {
  const parsed = osmProvisionSchema.safeParse({
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    contactPhone: getString(formData, "contactPhone"),
    targetHospitalId: getString(formData, "targetHospitalId"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const deferActivation = getString(formData, "deferActivation") === "true";
    const urls = deferActivation ? null : createWorkforceActivationUrlBuilder();
    const result = deferActivation
      ? await provisionOsm(actor, parsed.data, undefined, { issueInitialActivation: false })
      : await provisionOsm(actor, parsed.data);
    revalidatePath("/app/workforce");
    return { status: "SUCCESS", result: toProvisionResultState(result, urls) };
  } catch (error: unknown) {
    if (isConfiguredActivationOriginError(error)) {
      return { status: "ERROR", code: "CONFIGURATION", message: CONFIGURED_ACTIVATION_ORIGIN_MESSAGE };
    }
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export type WorkforceContactPhoneActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; result: { relationshipId: string; hospitalId: string; updatedAt: string } }
  | { status: "ERROR"; code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE"; message: string };

export async function updateWorkforceContactPhoneAction(
  _previousState: WorkforceContactPhoneActionState,
  formData: FormData,
): Promise<WorkforceContactPhoneActionState> {
  const parsed = workforceContactPhoneUpdateSchema.safeParse({
    ...getMembershipMutationInput(formData), kind: getString(formData, "kind"),
    contactPhone: formData.get("contactPhone"),
  });
  if (!parsed.success) return { status: "ERROR", code: "INVALID_INPUT", message: "กรุณากรอกเบอร์ติดต่อไทยให้ถูกต้อง" };
  try {
    const actor = await getProtectedApplicationActor();
    const result = await updateWorkforceContactPhone(actor, parsed.data);
    revalidatePath("/app/workforce");
    revalidatePath(`/app/workforce/${parsed.data.kind}/${result.relationshipId}`);
    revalidatePath(`/app/users/${parsed.data.kind}/${result.relationshipId}`);
    return { status: "SUCCESS", result: { ...result, updatedAt: result.updatedAt.toISOString() } };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function updateHospitalMembershipProfessionAction(
  _previousState: WorkforceMembershipMutationActionState,
  formData: FormData,
): Promise<WorkforceMembershipMutationActionState> {
  const parsed = hospitalMembershipProfessionUpdateSchema.safeParse(
    getProfessionUpdateInput(formData),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลวิชาชีพและโหลดข้อมูลใหม่หากจำเป็น",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await updateHospitalMembershipProfession(actor, parsed.data);
    revalidateWorkforceMembership(result.relationshipId);
    return { status: "SUCCESS", result: toMembershipMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function suspendHospitalMembershipAction(
  _previousState: WorkforceMembershipMutationActionState,
  formData: FormData,
): Promise<WorkforceMembershipMutationActionState> {
  const parsed = hospitalMembershipTransitionSchema.safeParse(
    getMembershipMutationInput(formData),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการระงับความสัมพันธ์บุคลากรไม่ถูกต้อง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await suspendHospitalMembership(actor, parsed.data);
    revalidateWorkforceMembership(result.relationshipId);
    return { status: "SUCCESS", result: toMembershipMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function restoreHospitalMembershipAction(
  _previousState: WorkforceMembershipMutationActionState,
  formData: FormData,
): Promise<WorkforceMembershipMutationActionState> {
  const parsed = hospitalMembershipTransitionSchema.safeParse(
    getMembershipMutationInput(formData),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการคืนสถานะความสัมพันธ์บุคลากรไม่ถูกต้อง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await restoreHospitalMembership(actor, parsed.data);
    revalidateWorkforceMembership(result.relationshipId);
    return { status: "SUCCESS", result: toMembershipMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function setHospitalMembershipReportExportGrantAction(
  _previousState: WorkforceReportExportGrantActionState,
  formData: FormData,
): Promise<WorkforceReportExportGrantActionState> {
  const granted = getString(formData, "granted");
  const parsed = hospitalMembershipReportExportGrantSchema.safeParse({
    ...getMembershipMutationInput(formData),
    granted: granted === "true" ? true : granted === "false" ? false : granted,
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลสิทธิ์ส่งออกรายงานไม่ถูกต้อง กรุณาโหลดหน้าใหม่",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await setHospitalMembershipReportExportGrant(actor, parsed.data);
    revalidateWorkforceMembership(result.relationshipId);
    return { status: "SUCCESS", granted: result.granted };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

/** ADR-0016: same form contract as the report export grant, for read-only network Patient access. */
export async function setHospitalMembershipNetworkPatientReadGrantAction(
  _previousState: WorkforceReportExportGrantActionState,
  formData: FormData,
): Promise<WorkforceReportExportGrantActionState> {
  const granted = getString(formData, "granted");
  const parsed = hospitalMembershipReportExportGrantSchema.safeParse({
    ...getMembershipMutationInput(formData),
    granted: granted === "true" ? true : granted === "false" ? false : granted,
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลสิทธิ์ดูผู้ป่วยในเครือข่ายไม่ถูกต้อง กรุณาโหลดหน้าใหม่",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await setHospitalMembershipNetworkPatientReadGrant(actor, parsed.data);
    revalidateWorkforceMembership(result.relationshipId);
    return { status: "SUCCESS", granted: result.granted };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function promoteHospitalOwnerAction(
  _previousState: WorkforceOwnerGovernanceMutationActionState,
  formData: FormData,
): Promise<WorkforceOwnerGovernanceMutationActionState> {
  const parsed = hospitalOwnerGovernanceMutationSchema.safeParse(
    getMembershipMutationInput(formData),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการเลื่อนสถานะเป็นเจ้าของโรงพยาบาลไม่ถูกต้อง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await promoteHospitalOwner(actor, parsed.data);
    revalidateHospitalOwnerGovernance(result.relationshipId);
    return { status: "SUCCESS", result: toOwnerGovernanceMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapHospitalOwnerGovernanceError(error) };
  }
}

export async function demoteHospitalOwnerAction(
  _previousState: WorkforceOwnerGovernanceMutationActionState,
  formData: FormData,
): Promise<WorkforceOwnerGovernanceMutationActionState> {
  const parsed = hospitalOwnerGovernanceMutationSchema.safeParse(
    getMembershipMutationInput(formData),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการลดสถานะเจ้าของโรงพยาบาลไม่ถูกต้อง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await demoteHospitalOwner(actor, parsed.data);
    revalidateHospitalOwnerGovernance(result.relationshipId);
    return { status: "SUCCESS", result: toOwnerGovernanceMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapHospitalOwnerGovernanceError(error) };
  }
}

export async function suspendOsmRelationshipAction(
  _previousState: WorkforceOsmRelationshipMutationActionState,
  formData: FormData,
): Promise<WorkforceOsmRelationshipMutationActionState> {
  const parsed = osmRelationshipTransitionSchema.safeParse(getMembershipMutationInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการระงับความสัมพันธ์ อสม. ไม่ถูกต้อง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await suspendOsmRelationship(actor, parsed.data);
    revalidateOsmRelationship(result.relationshipId);
    return { status: "SUCCESS", result: toOsmRelationshipMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapOsmRelationshipError(error) };
  }
}

export async function restoreOsmRelationshipAction(
  _previousState: WorkforceOsmRelationshipMutationActionState,
  formData: FormData,
): Promise<WorkforceOsmRelationshipMutationActionState> {
  const parsed = osmRelationshipTransitionSchema.safeParse(getMembershipMutationInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการคืนสถานะความสัมพันธ์ อสม. ไม่ถูกต้อง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await restoreOsmRelationship(actor, parsed.data);
    revalidateOsmRelationship(result.relationshipId);
    return { status: "SUCCESS", result: toOsmRelationshipMutationResultState(result) };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapOsmRelationshipError(error) };
  }
}

function getActivationRequest(formData: FormData, mode: "REMOTE" | "ASSISTED") {
  return {
    userId: getString(formData, "userId"),
    targetHospitalId: getString(formData, "targetHospitalId"),
    kind: getString(formData, "kind"),
    mode,
  };
}

function toActivationResultState(
  result: Awaited<ReturnType<typeof regenerateWorkforceActivation>>,
  urls: ReturnType<typeof createWorkforceActivationUrlBuilder>,
): WorkforceActivationActionState {
  return {
    status: "SUCCESS",
    result: {
      userId: result.userId,
      hospitalId: result.hospitalId,
      kind: result.kind,
      activationToken: result.activationToken,
      activationUrl: urls.build(result.activationToken),
      activationExpiresAt: result.activationExpiresAt.toISOString(),
      activationMode: result.activationMode,
    },
  };
}

export async function regenerateWorkforceActivationAction(
  _previousState: WorkforceActivationActionState,
  formData: FormData,
): Promise<WorkforceActivationActionState> {
  const parsed = workforceActivationRequestSchema.safeParse(
    getActivationRequest(formData, "REMOTE"),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถออกลิงก์เปิดใช้งานใหม่ได้",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const urls = createWorkforceActivationUrlBuilder();
    const result = await regenerateWorkforceActivation(actor, parsed.data);
    revalidatePath("/app/workforce");
    return toActivationResultState(result, urls);
  } catch (error: unknown) {
    if (isConfiguredActivationOriginError(error)) {
      return { status: "ERROR", code: "CONFIGURATION", message: CONFIGURED_ACTIVATION_ORIGIN_MESSAGE };
    }
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

export async function startAssistedWorkforceActivationAction(
  _previousState: WorkforceActivationActionState,
  formData: FormData,
): Promise<WorkforceActivationActionState> {
  const parsed = workforceActivationRequestSchema.safeParse(
    getActivationRequest(formData, "ASSISTED"),
  );

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถเริ่มการเปิดใช้งานแบบช่วยเหลือได้",
      fieldErrors: mapFieldErrors(parsed.error.issues),
    };
  }

  let actor;

  try {
    actor = await getProtectedApplicationActor();
    const urls = createWorkforceActivationUrlBuilder();
    const result = await regenerateWorkforceActivation(actor, parsed.data);

    try {
      await signOutCurrentSession();
    } catch {
      try {
        await revokeIssuedWorkforceActivation(actor, { activationId: result.activationId });
      } catch {
        return {
          status: "ERROR",
          code: "UNAVAILABLE",
          message: "ระบบไม่สามารถปิดเซสชันผู้ดูแลได้ จึงยกเลิกการเปิดใช้งานชั่วคราวไม่สำเร็จ",
        };
      }

      return {
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "ระบบไม่สามารถส่งต่ออุปกรณ์ให้ผู้ใช้งานได้ กรุณาลองใหม่อีกครั้ง",
      };
    }

    revalidatePath("/app/workforce");
    return toActivationResultState(result, urls);
  } catch (error: unknown) {
    if (isConfiguredActivationOriginError(error)) {
      return { status: "ERROR", code: "CONFIGURATION", message: CONFIGURED_ACTIVATION_ORIGIN_MESSAGE };
    }
    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}

const ACTIVATION_UNAVAILABLE_MESSAGE =
  "ไม่สามารถยืนยันได้ ลิงก์อาจไม่ถูกต้อง หมดอายุ ถูกใช้แล้ว หรือเลขบัตรประชาชนไม่ตรงกัน หากกรอกผิดหลายครั้งลิงก์จะถูกยกเลิก";

export async function previewWorkforceActivationAction(
  token: string,
): Promise<WorkforceActivationPreviewState> {
  try {
    const preview = await previewWorkforceActivation(token);
    return { status: "SUCCESS", maskedName: preview.maskedName, purpose: preview.purpose };
  } catch {
    return { status: "ERROR", message: ACTIVATION_UNAVAILABLE_MESSAGE };
  }
}

export async function completeWorkforceActivationAction(
  token: string,
  purpose: "ACTIVATION" | "RESET" | "CHILD_OWNER_ONBOARDING",
  _previousState: WorkforceCompletionActionState,
  formData: FormData,
): Promise<WorkforceCompletionActionState> {
  const parsed = workforceActivationCompletionSchema.safeParse({
    nationalId: getString(formData, "nationalId"),
    password: getString(formData, "password"),
    passwordConfirmation: getString(formData, "passwordConfirmation"),
  });

  if (!parsed.success) {
    const fieldErrors: { nationalId?: string; password?: string; passwordConfirmation?: string } =
      {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0];

      if (field === "nationalId" && !fieldErrors.nationalId) {
        fieldErrors.nationalId = "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง";
      }

      if (field === "password" && !fieldErrors.password) {
        fieldErrors.password = "รหัสผ่านต้องมีความยาว 12–128 ตัวอักษร";
      }

      if (field === "passwordConfirmation" && !fieldErrors.passwordConfirmation) {
        fieldErrors.passwordConfirmation = "กรุณายืนยันรหัสผ่านให้ตรงกัน";
      }
    }

    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลที่กรอกให้ถูกต้อง",
      fieldErrors,
    };
  }

  try {
    if (purpose === "RESET") {
      await completeWorkforcePasswordReset(token, parsed.data);
    } else {
      await completeWorkforceActivation(token, parsed.data);
    }
  } catch (error: unknown) {
    return { status: "ERROR", ...mapCompletionError(error) };
  }

  redirect(purpose === "RESET" ? "/login?reset=1" : "/login?activated=1");
}

export async function issueWorkforcePasswordResetAction(
  _previousState: WorkforcePasswordResetActionState,
  formData: FormData,
): Promise<WorkforcePasswordResetActionState> {
  const parsed = workforcePasswordResetRequestSchema.safeParse({
    userId: getString(formData, "userId"),
    targetHospitalId: getString(formData, "targetHospitalId"),
  });

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไม่สามารถเริ่มการรีเซ็ตรหัสผ่านได้",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await issueWorkforcePasswordReset(actor, parsed.data);
    // The service is fail-closed. Never expose a credential or perform issuer handoff for RESET.
    return { status: "ERROR", code: "FORBIDDEN", message: "การกู้คืนรหัสผ่านยังไม่เปิดใช้งาน ต้องมีวิธียืนยันเจ้าของบัญชีที่เป็นอิสระจากผู้ดูแลก่อน" };
  } catch (error: unknown) {
    return { status: "ERROR", ...mapWorkforceError(error), message: "การกู้คืนรหัสผ่านยังไม่เปิดใช้งาน ต้องมีวิธียืนยันเจ้าของบัญชีที่เป็นอิสระจากผู้ดูแลก่อน" };
  }
}

export async function provisionWorkforceBulkAction(
  _previousState: WorkforceBulkActionState,
  formData: FormData,
): Promise<WorkforceBulkActionState> {
  const kind = workforceKindSchema.safeParse(getString(formData, "kind"));
  const nationalIds = formData.getAll("nationalId");
  const givenNames = formData.getAll("givenName");
  const familyNames = formData.getAll("familyName");
  const professions = formData.getAll("profession");
  const contactPhones = formData.getAll("contactPhone");

  if (!kind.success || nationalIds.length > WORKFORCE_BULK_MAX_ROWS) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: `เพิ่มได้ครั้งละไม่เกิน ${WORKFORCE_BULK_MAX_ROWS} รายการ`,
    };
  }

  const text = (values: FormDataEntryValue[], index: number): string => {
    const value = values[index];
    return typeof value === "string" ? value.trim() : "";
  };
  const rows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];

  for (let index = 0; index < nationalIds.length; index += 1) {
    const contactPhone = contactPhones[index];
    const row: Record<string, string> = {
      nationalId: text(nationalIds, index),
      givenName: text(givenNames, index),
      familyName: text(familyNames, index),
      contactPhone: typeof contactPhone === "string" ? contactPhone : "",
    };

    if (kind.data === "HOSPITAL_MEMBER") {
      row.profession = text(professions, index);
    }

    // Untouched rows are skipped; reported row numbers still refer to the visible form row.
    if (row.nationalId || row.givenName || row.familyName || row.profession || row.contactPhone) {
      rows.push(row);
      rowNumbers.push(index + 1);
    }
  }

  if (rows.length === 0) {
    return { status: "ERROR", code: "INVALID_INPUT", message: "กรุณากรอกข้อมูลอย่างน้อย 1 แถว" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await provisionWorkforceBulk(actor, {
      submissionId: getString(formData, "submissionId"),
      kind: kind.data,
      targetHospitalId: getString(formData, "targetHospitalId"),
      rows,
      rowNumbers,
    });
    revalidatePath("/app/workforce");

    return {
      status: "SUCCESS",
      result: {
        kind: result.kind,
        hospitalId: result.hospitalId,
        rows: result.rows.map((row) => {
          const rowNumber = rowNumbers[row.rowNumber - 1];

          return row.status === "invalid"
            ? { rowNumber, status: row.status, reason: row.reason }
            : { rowNumber, status: row.status, activationRequired: row.activationRequired };
        }),
      },
    };
  } catch (error: unknown) {
    if (error instanceof WorkforceBulkDuplicateError) {
      return {
        status: "ERROR",
        code: "INVALID_INPUT",
        message:
          "พบเลขบัตรประชาชนซ้ำในรายการที่ส่ง ไม่มีการบันทึกข้อมูล กรุณาแก้ไขแถวที่ซ้ำแล้วลองใหม่",
        duplicateRowNumbers: error.rowNumbers.map((number) => rowNumbers[number - 1]),
      };
    }

    return { status: "ERROR", ...mapWorkforceError(error) };
  }
}
