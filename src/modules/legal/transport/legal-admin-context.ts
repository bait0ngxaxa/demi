import "server-only";

import type { LegalDocumentKind, LegalDocumentStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { getLegalVersionForAdmin, listLegalVersions, type AdminLegalVersion } from "../services/legal-service";

export type AdminLegalVersionView = {
  id: string;
  kind: LegalDocumentKind;
  versionLabel: string;
  title: string;
  body: string;
  isPlaceholder: boolean;
  status: LegalDocumentStatus;
  publishedAt: string | null;
  updatedAt: string;
  isCurrent: boolean;
};

function toView(version: AdminLegalVersion): AdminLegalVersionView {
  return {
    id: version.id,
    kind: version.kind,
    versionLabel: version.versionLabel,
    title: version.title,
    body: version.body,
    isPlaceholder: version.isPlaceholder,
    status: version.status,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    updatedAt: version.updatedAt.toISOString(),
    isCurrent: version.isCurrent,
  };
}

function redirectWhenNotAdmin(error: unknown): never {
  if (error instanceof ApplicationError) {
    if (error.code === "UNAUTHENTICATED") redirect("/login");
    if (error.code === "FORBIDDEN") redirect("/app");
    if (error.code === "NOT_FOUND") notFound();
  }
  throw error;
}

/** `/app/admin/legal`: every version of every kind; the service re-checks the persisted ADMIN role. */
export async function getAdminLegalVersionsView(): Promise<AdminLegalVersionView[]> {
  try {
    const actor = await getProtectedApplicationActor();
    return (await listLegalVersions(actor)).map(toView);
  } catch (error: unknown) {
    redirectWhenNotAdmin(error);
  }
}

/** `/app/admin/legal/[versionId]`: one version, drafts included, for edit and preview. */
export async function getAdminLegalVersionView(versionId: string): Promise<AdminLegalVersionView> {
  try {
    const actor = await getProtectedApplicationActor();
    return toView(await getLegalVersionForAdmin(actor, versionId));
  } catch (error: unknown) {
    redirectWhenNotAdmin(error);
  }
}
