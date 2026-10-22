import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  activationMethodFilterSchema,
  userKindSchema,
  userStatusSchema,
} from "@/modules/user-management/domain/user-management-values";
import { listHospitalUsers } from "@/modules/user-management/services/user-directory-service";
import { listWorkforceHospitals } from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import { UsersDirectory, type UsersDirectoryFilters } from "./users-directory";

export const metadata: Metadata = {
  title: "จัดการผู้ใช้งาน",
};

type UsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export default async function UsersPage({ searchParams }: UsersPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  // UM-1: OWNER-only; the same direct-OWNER Hospital list as workforce management.
  const hospitals = await listWorkforceHospitals(actor).catch((error: unknown) => {
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  });
  const firstHospital = hospitals[0];
  if (!firstHospital) redirect("/app");

  const params = await searchParams;
  const scalar = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value;
  const requestedHospitalId = scalar(params.hospitalId);
  const hospitalId = hospitals.some(({ id }) => id === requestedHospitalId) ? requestedHospitalId! : firstHospital.id;
  const filters: UsersDirectoryFilters = {
    kind: userKindSchema.catch("staff").parse(scalar(params.tab)),
    status: userStatusSchema.nullable().catch(null).parse(scalar(params.status) || null),
    method: activationMethodFilterSchema.nullable().catch(null).parse(scalar(params.method) || null),
    search: (scalar(params.search) ?? "").trim().slice(0, 120),
    cursor: scalar(params.cursor) || null,
  };
  const query = {
    targetHospitalId: hospitalId,
    kind: filters.kind,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.search ? { search: filters.search } : {}),
  };

  let page;
  try {
    page = await listHospitalUsers(actor, filters.cursor ? { ...query, cursor: filters.cursor } : query);
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) redirect("/app");
    // A stale or foreign cursor restarts at the first page of the same filters.
    if (error instanceof ValidationError && filters.cursor) {
      page = await listHospitalUsers(actor, query);
      filters.cursor = null;
    } else {
      throw error;
    }
  }

  return (
    <UsersDirectory
      filters={filters}
      hospitals={hospitals.map(({ id, name }) => ({ id, name }))}
      key={`${hospitalId}:${filters.kind}`}
      page={page}
    />
  );
}
