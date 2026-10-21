"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createHospital, renameHospital } from "@/modules/hospital-governance/services/hospital-governance-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  adminEndHospitalServiceArea,
  clearHospitalNetworkRole,
  setHospitalNetworkRole,
  transferHospitalServiceArea,
} from "../services/hospital-network-governance-service";
import { attachHospitalServiceArea, endHospitalServiceArea } from "../services/hospital-service-area-service";
import type { HospitalNetworkActionState } from "./action-state";

type ErrorCopy = Partial<Record<Extract<HospitalNetworkActionState, { status: "ERROR" }>["code"], string>>;

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function toErrorState(error: unknown, copy: ErrorCopy): HospitalNetworkActionState {
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
      hospitalCode: getString(formData, "hospitalCode"),
      name: getString(formData, "name"),
      networkRole: getString(formData, "networkRole"),
    }),
    "เพิ่มโรงพยาบาลแล้ว ผู้รับผิดชอบสมัครใช้งานผ่านขั้นตอนขึ้นทะเบียนได้ทันที",
    {
      CONFLICT: "มีโรงพยาบาลที่ใช้รหัสนี้อยู่แล้ว",
      INVALID_INPUT: "กรุณากรอกชื่อและเลือกประเภท หากระบุรหัสเอง ใช้ได้เฉพาะ A-Z, 0-9, - หรือ _ ไม่เกิน 32 ตัว",
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
      CONFLICT: "เปลี่ยนประเภทไม่ได้ขณะที่ยังมีความสัมพันธ์แม่ข่าย–ลูกข่ายอยู่ กรุณานำออกหรือโอนก่อน",
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
