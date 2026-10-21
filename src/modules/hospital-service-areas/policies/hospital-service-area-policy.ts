import "server-only";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { decideHospitalOwnerPolicy, HOSPITAL_OWNER_CAPABILITIES } from "@/modules/workforce/policies/hospital-owner-policy";
import { ForbiddenError } from "@/shared/errors/application-error";

export const HOSPITAL_SERVICE_AREA_CAPABILITIES = {
  read: "hospital-network:area:read",
  manage: "hospital-network:area:manage",
  // ADR-0018: Parent OWNER creates a Child and manages it until its own OWNER takes over.
  childCreate: "hospital-network:child:create",
  childManage: "hospital-network:child:manage",
} as const;

export type HospitalServiceAreaCapability = (typeof HOSPITAL_SERVICE_AREA_CAPABILITIES)[keyof typeof HOSPITAL_SERVICE_AREA_CAPABILITIES];

/** Preliminary context check only; services always revalidate persisted authority. */
export function assertHospitalServiceAreaPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  parentHospitalId: string;
}): void {
  if (!Object.values<unknown>(HOSPITAL_SERVICE_AREA_CAPABILITIES).includes(input.capability)) throw new ForbiddenError();
  if (!decideHospitalOwnerPolicy({
    actor: input.actor,
    capability: HOSPITAL_OWNER_CAPABILITIES.readGovernance,
    targetHospitalId: input.parentHospitalId,
  }).allowed) throw new ForbiddenError();
}
