"use server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import type { AssigneeSearchResult } from "@/shared/search/assignee-search";

import { staffProfessionLabel } from "../domain/appointment-people";
import {
  searchAppointmentOsmCandidates,
  searchAppointmentResponsibleMembers,
} from "../services/appointment-query-service";

const INVALID_SEARCH = "คำค้นหาไม่ถูกต้อง กรุณาค้นหาใหม่";

function searchError(error: unknown, unavailable: string): AssigneeSearchResult {
  return {
    status: "ERROR",
    message: error instanceof ApplicationError && error.code === "VALIDATION" ? INVALID_SEARCH : unavailable,
  };
}

/** ADR-0027 (AP-1): one page of the Patient's Hospital operators for the appointment form; staff only. */
export async function searchAppointmentResponsibleMembersAction(
  relationshipId: string,
  value: string,
  page: number,
): Promise<AssigneeSearchResult> {
  try {
    const actor = await getProtectedApplicationActor();
    const { items, ...position } = await searchAppointmentResponsibleMembers(actor, { relationshipId, value, page });
    return {
      status: "OK",
      ...position,
      items: items.map((member) => ({
        id: member.userId,
        displayName: member.displayName,
        detail: staffProfessionLabel(member.profession),
      })),
    };
  } catch (error: unknown) {
    return searchError(error, "ไม่สามารถค้นหาเจ้าหน้าที่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
  }
}

/** ADR-0027 (AP-2): one page of the Hospital's other ACTIVE อสม. for the appointment form; staff only. */
export async function searchAppointmentOsmCandidatesAction(
  relationshipId: string,
  value: string,
  page: number,
): Promise<AssigneeSearchResult> {
  try {
    const actor = await getProtectedApplicationActor();
    const { items, ...position } = await searchAppointmentOsmCandidates(actor, { relationshipId, value, page });
    return {
      status: "OK",
      ...position,
      items: items.map((candidate) => ({ id: candidate.userId, displayName: candidate.displayName })),
    };
  } catch (error: unknown) {
    return searchError(error, "ไม่สามารถค้นหา อสม. ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
  }
}
