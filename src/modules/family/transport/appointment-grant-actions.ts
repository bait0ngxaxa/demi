"use server";

import { revalidatePath } from "next/cache";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { acceptAppointmentGrant, proposeAppointmentGrant, revokeAppointmentGrant } from "../services/appointment-grant-service";
import { acceptResourceGrant, proposeResourceGrant, revokeResourceGrant } from "../services/caregiver-resource-grant-service";
import type { FamilyMutationActionState } from "./action-state";

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function invalidateFamily(): void {
  revalidatePath("/app/family");
  revalidatePath("/app/family/grants/[grantId]/appointments", "page");
  revalidatePath("/app/family/grants/[grantId]/appointments/[appointmentId]", "page");
  revalidatePath("/app/family/members/[relationshipId]", "page");
  revalidatePath("/app/personal/appointments");
}

export async function proposeAppointmentGrantAction(_previous: FamilyMutationActionState, form: FormData): Promise<FamilyMutationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await proposeAppointmentGrant(actor, { caregiverRelationshipId: formString(form, "caregiverRelationshipId"), patientHospitalRelationshipId: formString(form, "patientHospitalRelationshipId") });
    invalidateFamily();
    return { status: "SUCCESS", message: "เสนอสิทธิ์ดูนัดหมายแล้ว รอผู้ดูแลยอมรับ" };
  } catch { return { status: "ERROR", message: "ไม่สามารถแชร์นัดหมายสำหรับรายการนี้ได้ กรุณาตรวจสอบรายการอีกครั้ง" }; }
}

export async function acceptAppointmentGrantAction(_previous: FamilyMutationActionState, form: FormData): Promise<FamilyMutationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await acceptAppointmentGrant(actor, formString(form, "grantId"));
    invalidateFamily();
    return { status: "SUCCESS", message: "ยอมรับสิทธิ์ดูนัดหมายแล้ว" };
  } catch { return { status: "ERROR", message: "รายการนี้ไม่พร้อมดำเนินการ กรุณาตรวจสอบรายการอีกครั้ง" }; }
}

export async function revokeAppointmentGrantAction(_previous: FamilyMutationActionState, form: FormData): Promise<FamilyMutationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await revokeAppointmentGrant(actor, formString(form, "grantId"));
    invalidateFamily();
    return { status: "SUCCESS", message: "ยกเลิกสิทธิ์ดูนัดหมายแล้ว" };
  } catch { return { status: "ERROR", message: "รายการนี้ไม่พร้อมดำเนินการ กรุณาตรวจสอบรายการอีกครั้ง" }; }
}

export async function proposeResourceGrantAction(_previous: FamilyMutationActionState, form: FormData): Promise<FamilyMutationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await proposeResourceGrant(actor, { caregiverRelationshipId: formString(form, "caregiverRelationshipId"), resource: formString(form, "resource") });
    invalidateFamily();
    return { status: "SUCCESS", message: "เสนอสิทธิ์แล้ว รอผู้ดูแลยอมรับ" };
  } catch { return { status: "ERROR", message: "ไม่สามารถแชร์ข้อมูลนี้ได้ อาจแชร์อยู่แล้วหรือรายการไม่พร้อมใช้งาน กรุณาตรวจสอบอีกครั้ง" }; }
}

export async function acceptResourceGrantAction(_previous: FamilyMutationActionState, form: FormData): Promise<FamilyMutationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await acceptResourceGrant(actor, formString(form, "grantId"));
    invalidateFamily();
    return { status: "SUCCESS", message: "ยอมรับสิทธิ์แล้ว" };
  } catch { return { status: "ERROR", message: "รายการนี้ไม่พร้อมดำเนินการ กรุณาตรวจสอบรายการอีกครั้ง" }; }
}

export async function revokeResourceGrantAction(_previous: FamilyMutationActionState, form: FormData): Promise<FamilyMutationActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    await revokeResourceGrant(actor, formString(form, "grantId"));
    invalidateFamily();
    return { status: "SUCCESS", message: "ยกเลิกสิทธิ์แล้ว" };
  } catch { return { status: "ERROR", message: "รายการนี้ไม่พร้อมดำเนินการ กรุณาตรวจสอบรายการอีกครั้ง" }; }
}
