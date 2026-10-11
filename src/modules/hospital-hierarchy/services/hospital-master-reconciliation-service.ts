import {
  HospitalStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

export const APPROVED_HOSPITAL_MASTER_COUNTS = {
  total: 78,
  main: 43,
  subordinate: 35,
} as const;

export type HospitalMasterSourceRecord = {
  canonicalCode: string;
  nameTh: string;
  parentCanonicalCode: string | null;
};

export type HospitalMasterDatabaseRecord = {
  id: string;
  hospitalCode: string;
  name: string;
  status: HospitalStatus;
  parentHospitalId: string | null;
  updatedAt: Date;
};

export type HospitalMasterDifference = {
  hospitalCode: string;
  name: string;
  status: HospitalStatus | null;
  expectedParentCode: string | null;
  actualParentCode: string | null;
  reason?: string;
};

export type HospitalMasterReconciliationReport = {
  approved: { total: number; main: number; subordinate: number };
  databaseHospitalCount: number;
  categories: {
    MATCHED: HospitalMasterDifference[];
    MISSING_HOSPITAL: HospitalMasterDifference[];
    MISSING_PARENT: HospitalMasterDifference[];
    PARENT_MISMATCH: HospitalMasterDifference[];
    NAME_MISMATCH: HospitalMasterDifference[];
    UNEXPECTED_HOSPITAL: HospitalMasterDifference[];
    INVALID_HIERARCHY: HospitalMasterDifference[];
  };
  applied: { created: string[]; renamed: string[]; reparented: string[] };
};

export type HospitalMasterReconciliationOptions = {
  mode?: "dry-run" | "apply";
  confirmNameChanges?: boolean;
  confirmParentChanges?: boolean;
};

export class HospitalMasterReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HospitalMasterReconciliationError";
  }
}

const hospitalMasterSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  status: true,
  parentHospitalId: true,
  updatedAt: true,
} satisfies Prisma.HospitalSelect;

type HospitalMasterPrismaRecord = Prisma.HospitalGetPayload<{
  select: typeof hospitalMasterSelect;
}>;

const validStatuses = new Set<string>(Object.values(HospitalStatus));
const canonicalCodePattern = /^[A-Z0-9][A-Z0-9_-]{0,31}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateHospitalMasterSource(value: unknown): HospitalMasterSourceRecord[] {
  if (!Array.isArray(value) || value.length !== APPROVED_HOSPITAL_MASTER_COUNTS.total) {
    throw new HospitalMasterReconciliationError(
      `approved Master source must contain exactly ${APPROVED_HOSPITAL_MASTER_COUNTS.total} records`,
    );
  }

  const records: HospitalMasterSourceRecord[] = [];
  const byCode = new Map<string, HospitalMasterSourceRecord>();

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.canonicalCode !== "string" ||
      !canonicalCodePattern.test(candidate.canonicalCode) ||
      typeof candidate.nameTh !== "string" ||
      candidate.nameTh.trim().length === 0 ||
      (candidate.parentCanonicalCode !== undefined &&
        candidate.parentCanonicalCode !== null &&
        (typeof candidate.parentCanonicalCode !== "string" ||
          !canonicalCodePattern.test(candidate.parentCanonicalCode)))
    ) {
      throw new HospitalMasterReconciliationError("Master source contains an invalid Hospital identity");
    }

    const record: HospitalMasterSourceRecord = {
      canonicalCode: candidate.canonicalCode,
      nameTh: candidate.nameTh,
      parentCanonicalCode:
        typeof candidate.parentCanonicalCode === "string" ? candidate.parentCanonicalCode : null,
    };

    if (byCode.has(record.canonicalCode)) {
      throw new HospitalMasterReconciliationError(
        `Master source contains duplicate Hospital code ${record.canonicalCode}`,
      );
    }

    byCode.set(record.canonicalCode, record);
    records.push(record);
  }

  const mainCount = records.filter(({ parentCanonicalCode }) => parentCanonicalCode === null).length;
  const subordinateCount = records.length - mainCount;
  if (
    mainCount !== APPROVED_HOSPITAL_MASTER_COUNTS.main ||
    subordinateCount !== APPROVED_HOSPITAL_MASTER_COUNTS.subordinate
  ) {
    throw new HospitalMasterReconciliationError(
      `Master source must contain ${APPROVED_HOSPITAL_MASTER_COUNTS.main} main and ${APPROVED_HOSPITAL_MASTER_COUNTS.subordinate} subordinate Hospitals`,
    );
  }

  for (const record of records) {
    const parentCode = record.parentCanonicalCode;
    if (parentCode === null) continue;
    if (parentCode === record.canonicalCode) {
      throw new HospitalMasterReconciliationError(
        `Hospital ${record.canonicalCode} cannot be its own parent`,
      );
    }
    if (!byCode.has(parentCode)) {
      throw new HospitalMasterReconciliationError(
        `Hospital ${record.canonicalCode} references unknown parent ${parentCode}`,
      );
    }
  }

  for (const record of records) {
    const visitedCodes = new Set<string>([record.canonicalCode]);
    let parentCode = record.parentCanonicalCode;
    while (parentCode !== null) {
      if (visitedCodes.has(parentCode)) {
        throw new HospitalMasterReconciliationError(
          `Master source contains a Hospital hierarchy cycle at ${parentCode}`,
        );
      }
      visitedCodes.add(parentCode);
      parentCode = byCode.get(parentCode)?.parentCanonicalCode ?? null;
    }
  }

  for (const record of records) {
    const parentCode = record.parentCanonicalCode;
    if (parentCode !== null && byCode.get(parentCode)?.parentCanonicalCode !== null) {
      throw new HospitalMasterReconciliationError(
        `parent ${parentCode} for ${record.canonicalCode} must be a main Hospital`,
      );
    }
  }

  return records;
}

function difference(
  hospitalCode: string,
  name: string,
  status: HospitalStatus | null,
  expectedParentCode: string | null,
  actualParentCode: string | null,
  reason?: string,
): HospitalMasterDifference {
  return { hospitalCode, name, status, expectedParentCode, actualParentCode, ...(reason ? { reason } : {}) };
}

function detectDatabaseHierarchyIssues(
  rows: readonly HospitalMasterDatabaseRecord[],
): HospitalMasterDifference[] {
  const issues: HospitalMasterDifference[] = [];
  const byId = new Map<string, HospitalMasterDatabaseRecord>();
  const byCode = new Map<string, HospitalMasterDatabaseRecord>();

  for (const row of rows) {
    if (byId.has(row.id)) {
      issues.push(difference(row.hospitalCode, row.name, row.status, null, null, "duplicate Hospital id"));
    } else {
      byId.set(row.id, row);
    }
    if (byCode.has(row.hospitalCode)) {
      issues.push(difference(row.hospitalCode, row.name, row.status, null, null, "duplicate Hospital code"));
    } else {
      byCode.set(row.hospitalCode, row);
    }
    if (row.name.trim().length === 0) {
      issues.push(difference(row.hospitalCode, row.name, row.status, null, null, "empty Hospital name"));
    }
    if (!validStatuses.has(row.status)) {
      issues.push(difference(row.hospitalCode, row.name, row.status, null, null, "invalid Hospital status"));
    }
    if (row.parentHospitalId === row.id) {
      issues.push(difference(row.hospitalCode, row.name, row.status, null, row.hospitalCode, "self-parent relationship"));
    } else if (row.parentHospitalId !== null && !byId.has(row.parentHospitalId)) {
      // The complete row set is checked again below so ordering does not affect this result.
    }
  }

  for (const row of rows) {
    if (row.parentHospitalId !== null && !byId.has(row.parentHospitalId)) {
      issues.push(difference(row.hospitalCode, row.name, row.status, null, null, "parent Hospital reference is missing"));
      continue;
    }

    if (row.parentHospitalId !== null) {
      const parent = byId.get(row.parentHospitalId);
      if (parent?.parentHospitalId !== null && parent !== undefined) {
        issues.push(difference(row.hospitalCode, row.name, row.status, null, parent.hospitalCode, "parent is itself subordinate"));
      }
    }

    const path: string[] = [];
    const pathIndexes = new Map<string, number>();
    let current: HospitalMasterDatabaseRecord | undefined = row;
    while (current !== undefined && current.parentHospitalId !== null) {
      const cycleStart = pathIndexes.get(current.id);
      if (cycleStart !== undefined) {
        const cycleRows = path.slice(cycleStart).map((id) => byId.get(id)).filter(
          (candidate): candidate is HospitalMasterDatabaseRecord => candidate !== undefined,
        );
        for (const cycleRow of cycleRows) {
          if (!issues.some((issue) => issue.hospitalCode === cycleRow.hospitalCode && issue.reason === "cyclic Hospital hierarchy")) {
            issues.push(difference(cycleRow.hospitalCode, cycleRow.name, cycleRow.status, null, null, "cyclic Hospital hierarchy"));
          }
        }
        break;
      }
      pathIndexes.set(current.id, path.length);
      path.push(current.id);
      current = byId.get(current.parentHospitalId);
    }
  }

  return issues;
}

export function compareHospitalMaster(
  sourceValue: unknown,
  databaseRows: readonly HospitalMasterDatabaseRecord[],
): HospitalMasterReconciliationReport {
  const source = validateHospitalMasterSource(sourceValue);
  const sourceByCode = new Map(source.map((record) => [record.canonicalCode, record]));
  const databaseByCode = new Map(databaseRows.map((record) => [record.hospitalCode, record]));
  const databaseById = new Map(databaseRows.map((record) => [record.id, record]));
  const categories: HospitalMasterReconciliationReport["categories"] = {
    MATCHED: [],
    MISSING_HOSPITAL: [],
    MISSING_PARENT: [],
    PARENT_MISMATCH: [],
    NAME_MISMATCH: [],
    UNEXPECTED_HOSPITAL: [],
    INVALID_HIERARCHY: detectDatabaseHierarchyIssues(databaseRows),
  };

  for (const expected of source) {
    const existing = databaseByCode.get(expected.canonicalCode);
    const expectedParentExists =
      expected.parentCanonicalCode === null || databaseByCode.has(expected.parentCanonicalCode);

    if (!existing) {
      categories.MISSING_HOSPITAL.push(
        difference(expected.canonicalCode, expected.nameTh, null, expected.parentCanonicalCode, null),
      );
    }

    if (!expectedParentExists && expected.parentCanonicalCode !== null) {
      categories.MISSING_PARENT.push(
        difference(expected.canonicalCode, expected.nameTh, existing?.status ?? null, expected.parentCanonicalCode, null),
      );
    }

    if (!existing) continue;

    const actualParent = existing.parentHospitalId === null
      ? null
      : databaseById.get(existing.parentHospitalId)?.hospitalCode ?? null;
    const parentMatches = expected.parentCanonicalCode === null
      ? existing.parentHospitalId === null
      : existing.parentHospitalId !== null && actualParent === expected.parentCanonicalCode;

    if (!parentMatches) {
      categories.PARENT_MISMATCH.push(
        difference(expected.canonicalCode, existing.name, existing.status, expected.parentCanonicalCode, actualParent),
      );
    }

    if (existing.name !== expected.nameTh) {
      categories.NAME_MISMATCH.push(
        difference(expected.canonicalCode, existing.name, existing.status, expected.parentCanonicalCode, actualParent, `expected name: ${expected.nameTh}`),
      );
    }

    if (parentMatches && existing.name === expected.nameTh && expectedParentExists) {
      categories.MATCHED.push(
        difference(expected.canonicalCode, existing.name, existing.status, expected.parentCanonicalCode, actualParent),
      );
    }
  }

  for (const existing of databaseRows) {
    if (!sourceByCode.has(existing.hospitalCode)) {
      const actualParent = existing.parentHospitalId === null
        ? null
        : databaseById.get(existing.parentHospitalId)?.hospitalCode ?? null;
      categories.UNEXPECTED_HOSPITAL.push(
        difference(existing.hospitalCode, existing.name, existing.status, null, actualParent),
      );
    }
  }

  return {
    approved: {
      total: source.length,
      main: source.filter(({ parentCanonicalCode }) => parentCanonicalCode === null).length,
      subordinate: source.filter(({ parentCanonicalCode }) => parentCanonicalCode !== null).length,
    },
    databaseHospitalCount: databaseRows.length,
    categories,
    applied: { created: [], renamed: [], reparented: [] },
  };
}

async function readHospitalRows(
  database: Pick<PrismaClient, "hospital"> | Prisma.TransactionClient,
): Promise<HospitalMasterPrismaRecord[]> {
  return database.hospital.findMany({
    orderBy: [{ hospitalCode: "asc" }, { id: "asc" }],
    select: hospitalMasterSelect,
  });
}

function assertSafeToApply(
  report: HospitalMasterReconciliationReport,
  options: HospitalMasterReconciliationOptions,
): void {
  if (report.categories.INVALID_HIERARCHY.length > 0) {
    throw new HospitalMasterReconciliationError(
      "apply rejected because the database contains an invalid Hospital hierarchy",
    );
  }
  if (report.categories.NAME_MISMATCH.length > 0 && !options.confirmNameChanges) {
    throw new HospitalMasterReconciliationError(
      "apply requires --confirm-name-changes to update existing Hospital names",
    );
  }
  if (report.categories.PARENT_MISMATCH.length > 0 && !options.confirmParentChanges) {
    throw new HospitalMasterReconciliationError(
      "apply requires --confirm-parent-changes to update existing parent relationships",
    );
  }
}

export async function reconcileHospitalMaster(
  database: PrismaClient,
  sourceValue: unknown,
  options: HospitalMasterReconciliationOptions = {},
): Promise<HospitalMasterReconciliationReport> {
  const source = validateHospitalMasterSource(sourceValue);
  const mode = options.mode ?? "dry-run";

  if (mode === "dry-run") {
    return compareHospitalMaster(source, await readHospitalRows(database));
  }

  return database.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(735829104)`;
      const beforeRows = await readHospitalRows(transaction);
      const before = compareHospitalMaster(source, beforeRows);
      assertSafeToApply(before, options);

      const existingByCode = new Map(beforeRows.map((record) => [record.hospitalCode, record]));
      const idsByCode = new Map(beforeRows.map((record) => [record.hospitalCode, record.id]));
      const created: string[] = [];

      for (const record of source) {
        if (existingByCode.has(record.canonicalCode)) continue;
        const hospital = await transaction.hospital.create({
          data: {
            hospitalCode: record.canonicalCode,
            name: record.nameTh,
            status: HospitalStatus.PENDING_VERIFICATION,
          },
          select: { id: true },
        });
        idsByCode.set(record.canonicalCode, hospital.id);
        created.push(record.canonicalCode);
      }

      const renamed: string[] = [];
      const reparented: string[] = [];

      for (const record of source) {
        const existing = existingByCode.get(record.canonicalCode);
        const hospitalId = idsByCode.get(record.canonicalCode);
        if (!hospitalId) {
          throw new HospitalMasterReconciliationError(
            `could not resolve database identity for Hospital ${record.canonicalCode}`,
          );
        }

        const update: Prisma.HospitalUncheckedUpdateInput = {};
        if (existing && existing.name !== record.nameTh && options.confirmNameChanges) {
          update.name = record.nameTh;
          renamed.push(record.canonicalCode);
        }

        const expectedParentId = record.parentCanonicalCode === null
          ? null
          : idsByCode.get(record.parentCanonicalCode) ?? null;
        if (record.parentCanonicalCode !== null && expectedParentId === null) {
          throw new HospitalMasterReconciliationError(
            `could not resolve approved parent ${record.parentCanonicalCode} for ${record.canonicalCode}`,
          );
        }

        const parentChanged = existing
          ? record.parentCanonicalCode === null
            ? existing.parentHospitalId !== null
            : existing.parentHospitalId !== expectedParentId
          : record.parentCanonicalCode !== null;

        if (parentChanged && (!existing || options.confirmParentChanges)) {
          update.parentHospitalId = expectedParentId;
          if (existing) reparented.push(record.canonicalCode);
        }

        if (Object.keys(update).length > 0) {
          await transaction.hospital.update({
            where: existing
              ? { id: existing.id, updatedAt: existing.updatedAt }
              : { id: hospitalId },
            data: update,
          });
        }
      }

      const after = compareHospitalMaster(source, await readHospitalRows(transaction));
      after.applied = { created, renamed, reparented };
      return after;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}
