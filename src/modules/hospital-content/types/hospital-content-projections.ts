import type { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";

export type HospitalContentHospitalProjection = {
  id: string;
  hospitalCode: string;
  name: string;
};

export type HospitalContentOwnerHospital = HospitalContentHospitalProjection;

export type HospitalContentListItem = {
  id: string;
  title: string;
  category: HospitalContentCategory;
  status: HospitalContentStatus;
  firstPublishedAt: string | null;
  latestPublishedAt: string | null;
  expectedUpdatedAt: string;
};

export type HospitalContentDetailProjection = {
  id: string;
  hospital: HospitalContentHospitalProjection;
  title: string;
  body: string;
  category: HospitalContentCategory;
  sourceText: string | null;
  status: HospitalContentStatus;
  firstPublishedAt: string | null;
  latestPublishedAt: string | null;
  expectedUpdatedAt: string;
};

export type HospitalContentListProjection = {
  hospital: HospitalContentHospitalProjection;
  items: readonly HospitalContentListItem[];
  nextCursor: string | null;
};

export type HospitalContentCreateResult =
  | { outcome: "CREATED" | "REPLAY"; content: HospitalContentDetailProjection }
  | { outcome: "UNCONFIRMED" };

export type HospitalContentMutationResult =
  | { outcome: "UPDATED" | "NOOP" | "PUBLISHED" | "WITHDRAWN" | "ARCHIVED"; content: HospitalContentDetailProjection }
  | { outcome: "UNCONFIRMED" };

export type HospitalContentReconciliationResult =
  | { status: "FOUND"; content: HospitalContentDetailProjection }
  | { status: "ABSENT" };
