import "server-only";

import { MembershipType, Role } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  findNetworkReportExportScope,
  listNetworkScopes,
  type HospitalNetworkDatabase,
  type HospitalNetworkFacility,
} from "@/modules/hospital-service-areas/services/hospital-network-access";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import type { NetworkReportingHospital } from "../projections/hospital-report-projection";
import {
  networkReportExportRequestSchema,
  type HospitalReportCohort,
} from "../schemas/hospital-report-schemas";

export type NetworkReportExportContext = {
  actor: ActorContext;
  accessBasis: "OWNER" | "MEMBER";
  parent: HospitalNetworkFacility;
  cohort: HospitalReportCohort;
  /** The Parent first (when selected), then Children by name. */
  targets: NetworkReportingHospital[];
};

export type NetworkReportExportParent = {
  parent: HospitalNetworkFacility;
  children: HospitalNetworkFacility[];
};

const NOT_ELIGIBLE_NAME_LIMIT = 5;

function validateActor(actor: ActorContext | null | undefined): asserts actor is ActorContext {
  if (!actor || !actor.roles.includes(Role.HOSPITAL)) throw new ForbiddenError();
}

async function notEligibleError(
  database: HospitalNetworkDatabase,
  hospitalIds: readonly string[],
): Promise<ConflictError> {
  const hospitals = await database.hospital.findMany({
    where: { id: { in: [...hospitalIds] } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: NOT_ELIGIBLE_NAME_LIMIT,
    select: { name: true },
  });
  const names = hospitals.map(({ name }) => name);
  if (names.length < Math.min(hospitalIds.length, NOT_ELIGIBLE_NAME_LIMIT)) names.push("หน่วยบริการที่ไม่พบในระบบ");
  const more = hospitalIds.length > NOT_ELIGIBLE_NAME_LIMIT ? ` และอีก ${hospitalIds.length - NOT_ELIGIBLE_NAME_LIMIT} แห่ง` : "";
  return new ConflictError(`หน่วยบริการต่อไปนี้ไม่อยู่ในเครือข่ายที่ส่งออกได้แล้ว: ${names.join(", ")}${more} กรุณาโหลดหน้าใหม่แล้วเลือกอีกครั้ง`);
}

/**
 * ADR-0025: authority for one network report export, rebuilt from persisted state on every call. The actor must
 * be an ACTIVE HOSPITAL User with an ACTIVE OWNER or MEMBER membership of the ACTIVE Parent (network role PARENT);
 * targets are the Parent and its ACTIVE Children with an active association. No grant is consulted. An explicit
 * selection must be a subset of those targets: any other id is a conflict, never silently dropped.
 */
export async function resolveNetworkReportExportContext(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: HospitalNetworkDatabase = getPrisma(),
): Promise<NetworkReportExportContext> {
  validateActor(actor);
  const parsed = networkReportExportRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง");

  try {
    const scope = await findNetworkReportExportScope(database, actor.userId, parsed.data.parentHospitalId);
    if (!scope) throw new NotFoundError();

    const eligible: NetworkReportingHospital[] = [
      { ...scope.parent, kind: "PARENT" },
      ...scope.children.map((child): NetworkReportingHospital => ({ ...child, kind: "CHILD" })),
    ];
    let targets = eligible;
    if (parsed.data.hospitalIds !== "ALL") {
      const requested = new Set(parsed.data.hospitalIds);
      const eligibleIds = new Set(eligible.map(({ id }) => id));
      const notEligible = parsed.data.hospitalIds.filter((hospitalId) => !eligibleIds.has(hospitalId));
      if (notEligible.length > 0) throw await notEligibleError(database, notEligible);
      targets = eligible.filter(({ id }) => requested.has(id));
    }

    return {
      actor,
      accessBasis: scope.membershipType === MembershipType.OWNER ? "OWNER" : "MEMBER",
      parent: scope.parent,
      cohort: parsed.data.cohort ?? "ACTIVE",
      targets,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    throw new InfrastructureError("Network report export access could not be verified");
  }
}

/** Parents whose network the actor may export, with their active Children; display locators only. */
export async function listNetworkReportExportParents(
  actor: ActorContext | null | undefined,
  database: HospitalNetworkDatabase = getPrisma(),
): Promise<NetworkReportExportParent[]> {
  if (!actor) throw new ForbiddenError();
  if (!actor.roles.includes(Role.HOSPITAL)) return [];

  try {
    return await listNetworkScopes(database, actor.userId, "REPORT_EXPORT");
  } catch {
    throw new InfrastructureError("Network report export access could not be loaded");
  }
}
