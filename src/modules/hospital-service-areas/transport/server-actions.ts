"use server";

import { revalidatePath } from "next/cache";

import {
  createWorkforceActivationUrlBuilder,
  isApplicationPublicOriginConfigurationError,
} from "@/lib/env/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  applyHospitalBulkRegistration,
  createHospital,
  HospitalBulkRegistrationRejectedError,
  HospitalRetirementIneligibleError,
  previewHospitalBulkRegistration,
  renameHospital,
  restoreRetiredHospital,
  retireHospital,
  retireHospitals,
  type HospitalRetirementIneligibility,
} from "@/modules/hospital-governance/services/hospital-governance-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  adminEndHospitalServiceArea,
  clearHospitalNetworkRole,
  setHospitalNetworkRole,
  transferHospitalServiceArea,
} from "../services/hospital-network-governance-service";
import {
  acceptChildOwnerInvitation,
  cancelPendingChildFacility,
  changeChildOwnerInvitee,
  createChildFacility,
  declineChildOwnerInvitation,
  inviteReplacementChildOwner,
  issueChildOwnerLink,
  renameChildFacility,
  revokeChildOwnerLink,
  type ChildOwnerInvitationIssue,
} from "../services/child-facility-service";
import { attachHospitalServiceArea, endHospitalServiceArea } from "../services/hospital-service-area-service";
import type {
  ChildOwnerInvitationActionState,
  HospitalBulkRegistrationActionState,
  HospitalNetworkActionState,
} from "./action-state";

type ErrorCopy = Partial<Record<Extract<HospitalNetworkActionState, { status: "ERROR" }>["code"], string>>;

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

const retirementIneligibilityCopy: Record<HospitalRetirementIneligibility, string> = {
  NOT_FOUND: "ไม่พบในระบบแล้ว",
  NOT_PENDING: "ไม่ได้อยู่ในสถานะรอขึ้นทะเบียน",
  ACTIVE_SERVICE_AREA: "อยู่ในเครือข่ายแม่ข่าย–ลูกข่ายที่ใช้งานอยู่ ต้องนำออกจากเครือข่ายก่อน",
  PENDING_APPLICATION: "มีคำขอขึ้นทะเบียนรอพิจารณา ต้องปฏิเสธคำขอก่อน",
};

function toErrorState(error: unknown, copy: ErrorCopy): HospitalNetworkActionState {
  if (error instanceof HospitalRetirementIneligibleError) {
    const names = error.ineligible.map(({ hospitalCode, name, reason }) =>
      `${name ?? "โรงพยาบาลที่เลือก"}${hospitalCode ? ` (${hospitalCode})` : ""}: ${retirementIneligibilityCopy[reason]}`);
    return { status: "ERROR", code: "CONFLICT", message: `ยังไม่ได้ถอนโรงพยาบาลใด เนื่องจาก ${names.join(" · ")}` };
  }
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return { status: "ERROR", code: "INVALID_INPUT", message: copy.INVALID_INPUT ?? "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" };
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { status: "ERROR", code: "FORBIDDEN", message: copy.FORBIDDEN ?? "บัญชีนี้ไม่มีสิทธิ์ดำเนินการนี้" };
    }
    if (error.code === "CONFLICT") {
      return { status: "ERROR", code: "CONFLICT", message: copy.CONFLICT ?? "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง" };
    }
    if (error.code === "NOT_FOUND") {
      return { status: "ERROR", code: "NOT_FOUND", message: copy.NOT_FOUND ?? "ไม่พบข้อมูลนี้แล้ว กรุณาโหลดหน้าใหม่" };
    }
  }
  return { status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
}

async function run(
  work: (actor: ActorContext) => Promise<unknown>,
  successMessage: string,
  copy: ErrorCopy,
  paths: readonly string[],
): Promise<HospitalNetworkActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await work(actor);
    // The admin directory and every Hospital detail page share the admin layout.
    for (const path of paths) revalidatePath(path, path === "/app/admin/hospitals" ? "layout" : "page");
    return { status: "SUCCESS", message: successMessage, completedAt: Date.now() };
  } catch (error: unknown) {
    return toErrorState(error, copy);
  }
}

const confirmed = (formData: FormData): boolean | string => getString(formData, "confirm") === "true" || getString(formData, "confirm");

// Parent OWNER (ADR-0015): attach a free Child / end an own association.

export async function attachServiceAreaAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => attachHospitalServiceArea(actor, {
      parentHospitalId: getString(formData, "parentHospitalId"),
      childHospitalId: getString(formData, "childHospitalId"),
    }),
    "เพิ่มลูกข่ายเข้าเครือข่ายแล้ว",
    {
      CONFLICT: "โรงพยาบาลนี้มีแม่ข่ายดูแลอยู่แล้ว หากต้องการย้าย กรุณาติดต่อผู้ดูแลระบบ",
      INVALID_INPUT: "โรงพยาบาลนี้ยังเพิ่มเป็นลูกข่ายไม่ได้ (ต้องเป็นลูกข่ายที่ใช้งานอยู่)",
    },
    ["/app/hospitals/network", "/app/hospitals/areas"],
  );
}

export async function endServiceAreaAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => endHospitalServiceArea(actor, {
      parentHospitalId: getString(formData, "parentHospitalId"),
      areaId: getString(formData, "areaId"),
      confirm: confirmed(formData),
      endReason: getString(formData, "endReason"),
    }),
    "นำลูกข่ายออกจากเครือข่ายแล้ว สิทธิ์ดูข้อมูลของแม่ข่ายสิ้นสุดทันที",
    { INVALID_INPUT: "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)" },
    ["/app/hospitals/network", "/app/hospitals/areas"],
  );
}

// Platform ADMIN (ADR-0015): registry, network role and cross-Parent governance.

export async function createNetworkHospitalAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => createHospital(actor, {
      name: getString(formData, "name"),
      submissionNonce: getString(formData, "submissionNonce"),
    }),
    "เพิ่มโรงพยาบาลแม่ข่ายแล้ว ผู้รับผิดชอบสมัครใช้งานผ่านขั้นตอนขึ้นทะเบียนได้ทันที",
    {
      CONFLICT: "แบบฟอร์มนี้ถูกส่งไปแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
      INVALID_INPUT: "กรุณากรอกชื่อโรงพยาบาล (ไม่เกิน 200 ตัวอักษร)",
    },
    ["/app/admin/hospitals"],
  );
}

export async function renameHospitalAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  const hospitalId = getString(formData, "hospitalId");
  return run(
    (actor) => renameHospital(actor, {
      hospitalId,
      expectedUpdatedAt: getString(formData, "expectedUpdatedAt"),
      name: getString(formData, "name"),
    }),
    "บันทึกชื่อโรงพยาบาลแล้ว",
    { INVALID_INPUT: "กรุณากรอกชื่อใหม่ที่ต่างจากชื่อเดิม (ไม่เกิน 200 ตัวอักษร)" },
    ["/app/admin/hospitals", `/app/admin/hospitals/${hospitalId}`],
  );
}

// Phase N1: withdraw unclaimed Hospitals from the onboarding list and put them back. Nothing is deleted.

export async function retireHospitalAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  const hospitalId = getString(formData, "hospitalId");
  return run(
    (actor) => retireHospital(actor, {
      hospitalId,
      expectedUpdatedAt: getString(formData, "expectedUpdatedAt"),
      reason: getString(formData, "reason"),
    }),
    "ถอนโรงพยาบาลออกจากรายชื่อรอสมัครแล้ว",
    { INVALID_INPUT: "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)" },
    ["/app/admin/hospitals", `/app/admin/hospitals/${hospitalId}`],
  );
}

export async function retireHospitalsAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  const hospitalIds = formData.getAll("hospitalId").filter((value): value is string => typeof value === "string");
  return run(
    (actor) => retireHospitals(actor, { hospitalIds, reason: getString(formData, "reason") }),
    `ถอนโรงพยาบาล ${hospitalIds.length.toLocaleString("th-TH")} แห่งออกจากรายชื่อรอสมัครแล้ว`,
    { INVALID_INPUT: "กรุณาเลือกโรงพยาบาล 1–100 แห่งและระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)" },
    ["/app/admin/hospitals"],
  );
}

export async function restoreRetiredHospitalAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  const hospitalId = getString(formData, "hospitalId");
  return run(
    (actor) => restoreRetiredHospital(actor, {
      hospitalId,
      expectedUpdatedAt: getString(formData, "expectedUpdatedAt"),
      reason: getString(formData, "reason"),
    }),
    "คืนโรงพยาบาลสู่รายชื่อรอสมัครแล้ว",
    { INVALID_INPUT: "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)" },
    ["/app/admin/hospitals", `/app/admin/hospitals/${hospitalId}`],
  );
}

export async function setNetworkRoleAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  const hospitalId = getString(formData, "hospitalId");
  const kind = getString(formData, "kind");
  return run(
    (actor) => kind === "NONE"
      ? clearHospitalNetworkRole(actor, { hospitalId, confirm: true })
      : setHospitalNetworkRole(actor, { hospitalId, kind }),
    "บันทึกประเภทในเครือข่ายแล้ว",
    {
      CONFLICT: "เปลี่ยนประเภทไม่ได้ขณะที่ยังมีความสัมพันธ์แม่ข่าย–ลูกข่ายอยู่ หรือโรงพยาบาลถูกถอนออกจากรายชื่อ กรุณาโหลดหน้าใหม่แล้วตรวจสอบ",
      NOT_FOUND: "โรงพยาบาลนี้ยังไม่ได้กำหนดประเภท",
    },
    ["/app/admin/hospitals", `/app/admin/hospitals/${hospitalId}`],
  );
}

export async function transferServiceAreaAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => transferHospitalServiceArea(actor, {
      areaId: getString(formData, "areaId"),
      toParentHospitalId: getString(formData, "toParentHospitalId"),
      confirm: confirmed(formData),
      reason: getString(formData, "reason"),
    }),
    "โอนลูกข่ายไปยังแม่ข่ายใหม่แล้ว",
    { INVALID_INPUT: "กรุณาเลือกแม่ข่ายปลายทางที่ใช้งานอยู่และระบุเหตุผล" },
    ["/app/admin/hospitals"],
  );
}

export async function adminEndServiceAreaAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => adminEndHospitalServiceArea(actor, {
      areaId: getString(formData, "areaId"),
      confirm: confirmed(formData),
      endReason: getString(formData, "endReason"),
    }),
    "นำลูกข่ายออกจากเครือข่ายแล้ว",
    { INVALID_INPUT: "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)" },
    ["/app/admin/hospitals"],
  );
}

// ADR-0018: Parent OWNER creates Child facilities and invites their first or replacement OWNER.

const NETWORK_PATHS = ["/app/hospitals/network", "/app/hospitals/areas"] as const;

const childOwnerInviteeCopy: ErrorCopy = {
  INVALID_INPUT: "กรุณาตรวจสอบข้อมูล: ชื่อหน่วยบริการ (ไม่เกิน 200 ตัวอักษร) เลขบัตรประชาชน 13 หลัก และชื่อ–นามสกุลผู้ดูแล",
  CONFLICT: "ดำเนินการไม่ได้ บัญชีของผู้ถูกเชิญต้องตรวจสอบโดยผู้ดูแลระบบก่อน หรือข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
  NOT_FOUND: "หน่วยบริการนี้ไม่ได้อยู่ในเครือข่ายของคุณแล้ว กรุณาโหลดหน้าใหม่",
};

function inviteeInput(formData: FormData): Record<string, string> {
  return {
    parentHospitalId: getString(formData, "parentHospitalId"),
    nationalId: getString(formData, "nationalId"),
    givenName: getString(formData, "givenName"),
    familyName: getString(formData, "familyName"),
    mode: getString(formData, "mode") || "REMOTE",
  };
}

async function runInvitation(
  work: (actor: ActorContext) => Promise<{ invitation: ChildOwnerInvitationIssue; message: string }>,
  copy: ErrorCopy,
): Promise<ChildOwnerInvitationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const urls = createWorkforceActivationUrlBuilder();
    const { invitation, message } = await work(actor);
    for (const path of NETWORK_PATHS) revalidatePath(path, "page");
    return {
      status: "SUCCESS",
      message,
      completedAt: Date.now(),
      invitation: invitation.status === "ACTIVATION_LINK"
        ? {
            kind: "ACTIVATION_LINK",
            activationToken: invitation.activationToken,
            activationUrl: urls.build(invitation.activationToken),
            activationExpiresAt: invitation.activationExpiresAt.toISOString(),
            activationMode: invitation.activationMode,
          }
        : { kind: invitation.status },
    };
  } catch (error: unknown) {
    if (isApplicationPublicOriginConfigurationError(error)) {
      return {
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับลิงก์เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
      };
    }
    const state = toErrorState(error, copy);
    return state.status === "ERROR" ? state : { status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้" };
  }
}

export async function createChildFacilityAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(async (actor) => {
    const result = await createChildFacility(actor, {
      ...inviteeInput(formData),
      name: getString(formData, "name"),
      submissionNonce: getString(formData, "submissionNonce"),
    });
    return { invitation: result.invitation, message: `สร้าง ${result.child.name} (${result.child.hospitalCode}) ในเครือข่ายแล้ว · รอเปิดใช้งาน` };
  }, childOwnerInviteeCopy);
}

export async function issueChildOwnerLinkAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(async (actor) => ({
    invitation: await issueChildOwnerLink(actor, {
      parentHospitalId: getString(formData, "parentHospitalId"),
      childHospitalId: getString(formData, "childHospitalId"),
      mode: getString(formData, "mode") || "REMOTE",
    }),
    message: "ออกลิงก์เปิดใช้งานใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก",
  }), { CONFLICT: "ออกลิงก์ไม่ได้ ผู้ถูกเชิญอาจกำลังเปิดใช้งาน ใช้บัญชีเดิมตอบรับ หรือข้อมูลเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่" });
}

export async function changeChildOwnerInviteeAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(async (actor) => ({
    invitation: await changeChildOwnerInvitee(actor, { ...inviteeInput(formData), childHospitalId: getString(formData, "childHospitalId") }),
    message: "เปลี่ยนผู้ถูกเชิญแล้ว คำเชิญเดิมสิ้นสุดทันที",
  }), childOwnerInviteeCopy);
}

export async function inviteReplacementChildOwnerAction(
  _previous: ChildOwnerInvitationActionState,
  formData: FormData,
): Promise<ChildOwnerInvitationActionState> {
  return runInvitation(async (actor) => ({
    invitation: await inviteReplacementChildOwner(actor, { ...inviteeInput(formData), childHospitalId: getString(formData, "childHospitalId") }),
    message: "ส่งคำเชิญผู้ดูแลคนใหม่แล้ว",
  }), childOwnerInviteeCopy);
}

export async function revokeChildOwnerLinkAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => revokeChildOwnerLink(actor, {
      parentHospitalId: getString(formData, "parentHospitalId"),
      childHospitalId: getString(formData, "childHospitalId"),
    }),
    "ยกเลิกลิงก์เปิดใช้งานแล้ว ออกลิงก์ใหม่ได้เมื่อพร้อม",
    { CONFLICT: "ยกเลิกไม่ได้ ผู้ถูกเชิญอาจกำลังเปิดใช้งานอยู่ กรุณาโหลดหน้าใหม่" },
    NETWORK_PATHS,
  );
}

export async function cancelPendingChildFacilityAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => cancelPendingChildFacility(actor, {
      parentHospitalId: getString(formData, "parentHospitalId"),
      childHospitalId: getString(formData, "childHospitalId"),
      confirm: confirmed(formData),
      reason: getString(formData, "reason"),
    }),
    "ยกเลิกหน่วยบริการแล้ว คำเชิญและลิงก์ทั้งหมดใช้ไม่ได้อีก",
    {
      INVALID_INPUT: "กรุณาระบุเหตุผล (ไม่เกิน 500 ตัวอักษร)",
      CONFLICT: "ยกเลิกไม่ได้ หน่วยบริการอาจเปิดใช้งานแล้ว หรือผู้ถูกเชิญกำลังเปิดใช้งานอยู่ กรุณาโหลดหน้าใหม่",
    },
    NETWORK_PATHS,
  );
}

export async function renameChildFacilityAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => renameChildFacility(actor, {
      parentHospitalId: getString(formData, "parentHospitalId"),
      childHospitalId: getString(formData, "childHospitalId"),
      name: getString(formData, "name"),
      expectedUpdatedAt: getString(formData, "expectedUpdatedAt"),
    }),
    "บันทึกชื่อหน่วยบริการแล้ว",
    { INVALID_INPUT: "กรุณากรอกชื่อใหม่ที่ต่างจากชื่อเดิม (ไม่เกิน 200 ตัวอักษร)" },
    NETWORK_PATHS,
  );
}

// ADR-0018 (O-D6): the invitee answers in their own authenticated session.

export async function acceptChildOwnerInvitationAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => acceptChildOwnerInvitation(actor, { membershipId: getString(formData, "membershipId") }),
    "ตอบรับแล้ว คุณเป็นผู้ดูแลหน่วยบริการนี้แล้ว",
    {
      CONFLICT: "คำเชิญนี้ใช้ไม่ได้แล้ว หน่วยบริการอาจถูกยกเลิก ย้ายออกจากเครือข่าย หรือมีผู้ดูแลแล้ว",
      NOT_FOUND: "ไม่พบคำเชิญนี้แล้ว",
    },
    ["/app"],
  );
}

export async function declineChildOwnerInvitationAction(
  _previous: HospitalNetworkActionState,
  formData: FormData,
): Promise<HospitalNetworkActionState> {
  return run(
    (actor) => declineChildOwnerInvitation(actor, { membershipId: getString(formData, "membershipId") }),
    "ปฏิเสธคำเชิญแล้ว แม่ข่ายจะเห็นว่าคุณปฏิเสธ",
    { NOT_FOUND: "ไม่พบคำเชิญนี้แล้ว" },
    ["/app"],
  );
}

// O1-A: Platform ADMIN registers Parent Hospitals from a CSV file (preview, then apply).

const bulkFileErrorCopy = {
  EMPTY: "ไม่พบข้อมูลในไฟล์",
  TOO_LARGE: "ไฟล์มีขนาดใหญ่เกินไป",
  MALFORMED: "ไฟล์ CSV มีเครื่องหมายคำพูดไม่ครบหรือผิดรูปแบบ",
  HEADER: "บรรทัดแรกของไฟล์ต้องเป็นหัวคอลัมน์ name เพียงคอลัมน์เดียว กรุณาใช้ไฟล์ตัวอย่าง",
  NO_ROWS: "ไม่พบรายการโรงพยาบาลในไฟล์",
  TOO_MANY_ROWS: "นำเข้าได้ครั้งละไม่เกิน 200 รายการ",
} as const;

async function readCsvFile(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 256 * 1024) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function toBulkErrorState(error: unknown, csvText: string, submissionNonce: string): HospitalBulkRegistrationActionState {
  if (error instanceof HospitalBulkRegistrationRejectedError) {
    if (error.fileError) return { status: "ERROR", message: bulkFileErrorCopy[error.fileError] };
    return {
      status: "PREVIEW",
      csvText,
      submissionNonce,
      rows: [...error.rows],
      message: error.unconfirmedRowNumbers.length > 0
        ? "มีรายการชื่อใกล้เคียงที่ยังไม่ได้ยืนยัน ยังไม่ได้เพิ่มโรงพยาบาลใด"
        : "ข้อมูลเปลี่ยนไปหรือมีรายการที่ต้องแก้ไข ยังไม่ได้เพิ่มโรงพยาบาลใด",
    };
  }
  const state = toErrorState(error, {
    CONFLICT: "ไฟล์นี้ถูกส่งไปแล้วด้วยข้อมูลอื่น หรือข้อมูลเปลี่ยนไประหว่างนำเข้า กรุณาโหลดหน้าใหม่แล้วตรวจสอบอีกครั้ง",
  });
  return { status: "ERROR", message: state.status === "ERROR" ? state.message : "ระบบไม่พร้อมดำเนินการในขณะนี้" };
}

export async function previewHospitalBulkRegistrationAction(
  _previous: HospitalBulkRegistrationActionState,
  formData: FormData,
): Promise<HospitalBulkRegistrationActionState> {
  const submissionNonce = getString(formData, "submissionNonce");
  const csvText = await readCsvFile(formData);
  if (csvText === null) return { status: "ERROR", message: "กรุณาเลือกไฟล์ .csv ที่บันทึกแบบ UTF-8 ขนาดไม่เกิน 256 KB" };
  try {
    const actor = await getProtectedApplicationActor();
    const rows = await previewHospitalBulkRegistration(actor, { csvText });
    return { status: "PREVIEW", csvText, submissionNonce, rows, message: null };
  } catch (error: unknown) {
    return toBulkErrorState(error, csvText, submissionNonce);
  }
}

export async function applyHospitalBulkRegistrationAction(
  _previous: HospitalBulkRegistrationActionState,
  formData: FormData,
): Promise<HospitalBulkRegistrationActionState> {
  const csvText = getString(formData, "csvText");
  const submissionNonce = getString(formData, "submissionNonce");
  const confirmedRowNumbers = formData.getAll("confirmRow").flatMap((value) => {
    const rowNumber = typeof value === "string" ? Number(value) : Number.NaN;
    return Number.isInteger(rowNumber) ? [rowNumber] : [];
  });
  try {
    const actor = await getProtectedApplicationActor();
    const result = await applyHospitalBulkRegistration(actor, { csvText, submissionNonce, confirmedRowNumbers });
    revalidatePath("/app/admin/hospitals", "layout");
    return { status: "APPLIED", submissionNonce, count: result.hospitals.length, replayed: result.replayed, completedAt: Date.now() };
  } catch (error: unknown) {
    return toBulkErrorState(error, csvText, submissionNonce);
  }
}
