import { describe, expect, it } from "vitest";

import { suspectedTakeoverLockSchema, userRecordDeletionSchema } from "./user-management-schemas";

const relationshipId = "22222222-2222-4222-8222-222222222222";
const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const expectedUpdatedAt = "2026-10-01T00:00:00Z";
const base = { kind: "staff", relationshipId, targetHospitalId, expectedUpdatedAt };

describe("user management confirmation phrases", () => {
  it("accepts only the canonical unused-user deletion confirmation", () => {
    expect(userRecordDeletionSchema.safeParse({ ...base, confirmation: "ลบข้อมูลผู้ใช้ที่ยังไม่เปิดใช้งาน" }).success).toBe(true);
    expect(userRecordDeletionSchema.safeParse({ ...base, confirmation: "ลบรายการ" }).success).toBe(false);
    expect(userRecordDeletionSchema.safeParse({ ...base, confirmation: "ลบ" }).success).toBe(false);
  });

  it("accepts only the canonical suspected-account-takeover confirmation", () => {
    expect(suspectedTakeoverLockSchema.safeParse({ ...base, confirmation: "สงสัยว่ามีผู้อื่นใช้บัญชีนี้" }).success).toBe(true);
    expect(suspectedTakeoverLockSchema.safeParse({ ...base, confirmation: "ไม่ใช่เจ้าของจริง" }).success).toBe(false);
    expect(suspectedTakeoverLockSchema.safeParse({ ...base, confirmation: "ยืนยัน" }).success).toBe(false);
  });
});
