import { HospitalStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import approvedSource from "../../../../prisma/seed/hospital-master-v2.json";

import {
  APPROVED_HOSPITAL_MASTER_COUNTS,
  compareHospitalMaster,
  HospitalMasterReconciliationError,
  reconcileHospitalMaster,
  validateHospitalMasterSource,
  type HospitalMasterDatabaseRecord,
} from "./hospital-master-reconciliation-service";

const source = validateHospitalMasterSource(approvedSource);

function databaseRows(): HospitalMasterDatabaseRecord[] {
  const idsByCode = new Map(source.map(({ canonicalCode }, index) => [canonicalCode, `hospital-${index}`]));
  return source.map((record, index) => ({
    id: idsByCode.get(record.canonicalCode) ?? `hospital-${index}`,
    hospitalCode: record.canonicalCode,
    name: record.nameTh,
    status: HospitalStatus.PENDING_VERIFICATION,
    parentHospitalId: record.parentCanonicalCode === null
      ? null
      : idsByCode.get(record.parentCanonicalCode) ?? null,
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  }));
}

describe("Hospital Master reconciliation", () => {
  it("validates the 78 approved records and their 43/35 direct hierarchy", () => {
    expect(validateHospitalMasterSource(approvedSource)).toHaveLength(APPROVED_HOSPITAL_MASTER_COUNTS.total);
    expect(APPROVED_HOSPITAL_MASTER_COUNTS).toEqual({ total: 78, main: 43, subordinate: 35 });
  });

  it("rejects missing, duplicate, unknown-parent, self-parent, cyclic and nested source records", () => {
    expect(() => validateHospitalMasterSource(source.slice(1))).toThrow(HospitalMasterReconciliationError);

    const duplicate = source.map((record) => ({ ...record }));
    duplicate[1] = { ...duplicate[1]!, canonicalCode: duplicate[0]!.canonicalCode };
    expect(() => validateHospitalMasterSource(duplicate)).toThrow(/duplicate Hospital code/u);

    const unknownParent = source.map((record) => ({ ...record }));
    const child = unknownParent.find(({ parentCanonicalCode }) => parentCanonicalCode !== null);
    if (!child) throw new Error("approved source is expected to contain subordinate Hospitals");
    child.parentCanonicalCode = "UNKNOWN_PARENT";
    expect(() => validateHospitalMasterSource(unknownParent)).toThrow(/unknown parent/u);

    const selfParent = source.map((record) => ({ ...record }));
    const selfChild = selfParent.find(({ parentCanonicalCode }) => parentCanonicalCode !== null);
    if (!selfChild) throw new Error("approved source is expected to contain subordinate Hospitals");
    selfChild.parentCanonicalCode = selfChild.canonicalCode;
    expect(() => validateHospitalMasterSource(selfParent)).toThrow(/cannot be its own parent/u);

    const cycle = source.map((record) => ({ ...record }));
    const cycleChildren = cycle.filter(({ parentCanonicalCode }) => parentCanonicalCode !== null).slice(0, 2);
    const first = cycleChildren[0];
    const second = cycleChildren[1];
    if (!first || !second) throw new Error("approved source is expected to contain two subordinate Hospitals");
    first.parentCanonicalCode = second.canonicalCode;
    second.parentCanonicalCode = first.canonicalCode;
    expect(() => validateHospitalMasterSource(cycle)).toThrow(/cycle/u);

    const nested = source.map((record) => ({ ...record }));
    const nestedChild = nested.find(({ parentCanonicalCode }) => parentCanonicalCode !== null);
    const anotherChild = nested.find(
      ({ canonicalCode, parentCanonicalCode }) => canonicalCode !== nestedChild?.canonicalCode && parentCanonicalCode !== null,
    );
    if (!nestedChild || !anotherChild) throw new Error("approved source is expected to contain two subordinate Hospitals");
    nestedChild.parentCanonicalCode = anotherChild.canonicalCode;
    expect(() => validateHospitalMasterSource(nested)).toThrow(/must be a main Hospital/u);
  });

  it("categorizes missing hospitals and parents, relationship/name mismatches, unexpected rows and cycles", () => {
    const rows = databaseRows();
    const expectedChild = source.find(({ parentCanonicalCode }) => parentCanonicalCode !== null);
    const expectedParent = source.find(({ canonicalCode }) => canonicalCode === expectedChild?.parentCanonicalCode);
    const otherMain = source.find(
      ({ canonicalCode, parentCanonicalCode }) => parentCanonicalCode === null && canonicalCode !== expectedParent?.canonicalCode,
    );
    const changedChild = rows.find(({ hospitalCode }) => hospitalCode === expectedChild?.canonicalCode);
    const renamedHospital = rows[0];
    if (!expectedChild || !expectedParent || !otherMain || !changedChild || !renamedHospital) {
      throw new Error("approved Master fixture is incomplete");
    }
    changedChild.parentHospitalId = rows.find(({ hospitalCode }) => hospitalCode === otherMain.canonicalCode)?.id ?? null;
    renamedHospital.name = "ชื่อเดิมในฐานข้อมูล";

    const removedParentIndex = rows.findIndex(({ hospitalCode }) => hospitalCode === expectedParent.canonicalCode);
    rows.splice(removedParentIndex, 1);
    rows.push({
      id: "unexpected-one",
      hospitalCode: "NEW-UNIT-1",
      name: "หน่วยบริการที่เพิ่มใหม่",
      status: HospitalStatus.ACTIVE,
      parentHospitalId: "unexpected-two",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    rows.push({
      id: "unexpected-two",
      hospitalCode: "NEW-UNIT-2",
      name: "หน่วยบริการใหม่อีกแห่ง",
      status: HospitalStatus.SUSPENDED,
      parentHospitalId: "unexpected-one",
      updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    });

    const report = compareHospitalMaster(source, rows);
    expect(report.categories.MISSING_HOSPITAL.map(({ hospitalCode }) => hospitalCode)).toContain(expectedParent.canonicalCode);
    expect(report.categories.MISSING_PARENT.some(({ expectedParentCode }) => expectedParentCode === expectedParent.canonicalCode)).toBe(true);
    expect(report.categories.PARENT_MISMATCH.map(({ hospitalCode }) => hospitalCode)).toContain(expectedChild.canonicalCode);
    expect(report.categories.NAME_MISMATCH).toHaveLength(1);
    expect(report.categories.UNEXPECTED_HOSPITAL.map(({ hospitalCode }) => hospitalCode)).toEqual(["NEW-UNIT-1", "NEW-UNIT-2"]);
    expect(report.categories.INVALID_HIERARCHY.filter(({ reason }) => reason === "cyclic Hospital hierarchy")).toHaveLength(2);
  });

  it("defaults to a read-only dry-run", async () => {
    const findMany = vi.fn().mockResolvedValue(databaseRows());
    const create = vi.fn();
    const update = vi.fn();
    const transaction = vi.fn();
    const database = {
      hospital: { findMany, create, update },
      $transaction: transaction,
    } as unknown as PrismaClient;

    const report = await reconcileHospitalMaster(database, approvedSource);

    expect(report.categories.MATCHED).toHaveLength(78);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects unconfirmed existing name or parent updates before writing", async () => {
    const rows = databaseRows();
    const expectedChild = source.find(({ parentCanonicalCode }) => parentCanonicalCode !== null);
    const existing = rows.find(({ hospitalCode }) => hospitalCode === expectedChild?.canonicalCode);
    if (!expectedChild || !existing) throw new Error("approved Master fixture is incomplete");
    existing.name = "ชื่อที่ไม่ตรงกับ Master";
    existing.parentHospitalId = null;

    const findMany = vi.fn().mockResolvedValue(rows);
    const create = vi.fn();
    const update = vi.fn();
    const executeRaw = vi.fn().mockResolvedValue(0);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      hospital: { findMany, create, update },
      $executeRaw: executeRaw,
    }));
    const database = { hospital: { findMany, create, update }, $transaction: transaction } as unknown as PrismaClient;

    await expect(reconcileHospitalMaster(database, approvedSource, { mode: "apply" })).rejects.toThrow(
      /confirm-name-changes/u,
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
