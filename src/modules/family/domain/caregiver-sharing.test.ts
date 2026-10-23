import { describe, expect, it } from "vitest";

import {
  caregiverInvitationRequestedScopesSchema,
  createCaregiverInvitationInputSchema,
  updateCaregiverRelationshipLabelInputSchema,
} from "../schemas/caregiver-relationship-schemas";
import { FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2 } from "./appointment-grant-contract";
import { CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS, formatCaregiverRelationshipLabel } from "./caregiver-sharing-contract";
import { ageInBangkok } from "./family-health-summary";

const nationalId = "1000000000009";
const hospital = "33333333-3333-4333-8333-333333333333";

describe("AF-5 one-step add input", () => {
  it("accepts a label with the chosen scopes and defaults scopes to none", () => {
    expect(createCaregiverInvitationInputSchema.parse({ nationalId, relationshipLabel: "CHILD" }))
      .toEqual({ nationalId, relationshipLabel: "CHILD", appointmentRelationshipIds: [], resources: [] });
    expect(createCaregiverInvitationInputSchema.parse({
      nationalId, relationshipLabel: "OTHER", relationshipLabelOther: "  เพื่อนบ้าน ", appointmentRelationshipIds: [hospital.toUpperCase()], resources: ["MEDICATION"],
    })).toMatchObject({ relationshipLabelOther: "เพื่อนบ้าน", appointmentRelationshipIds: [hospital], resources: ["MEDICATION"] });
  });

  it.each([
    ["OTHER without text", { relationshipLabel: "OTHER" }],
    ["text without OTHER", { relationshipLabel: "SPOUSE", relationshipLabelOther: "คู่ชีวิต" }],
    ["text over 50 characters", { relationshipLabel: "OTHER", relationshipLabelOther: "ก".repeat(51) }],
    ["unknown label", { relationshipLabel: "FRIEND" }],
    ["duplicate hospital", { relationshipLabel: "CHILD", appointmentRelationshipIds: [hospital, hospital] }],
    ["duplicate resource", { relationshipLabel: "CHILD", resources: ["PROFILE_SUMMARY", "PROFILE_SUMMARY"] }],
    ["unknown resource", { relationshipLabel: "CHILD", resources: ["LAB_RESULTS"] }],
    ["client-chosen authority", { relationshipLabel: "CHILD", contractVersion: "family-appointment-read-v2" }],
  ])("rejects %s", (_label, extra) => {
    expect(createCaregiverInvitationInputSchema.safeParse({ nationalId, ...extra }).success).toBe(false);
  });

  it("re-parses stored scopes strictly", () => {
    expect(caregiverInvitationRequestedScopesSchema.safeParse({ appointmentRelationshipIds: [], resources: [] }).success).toBe(true);
    expect(caregiverInvitationRequestedScopesSchema.safeParse({ appointmentRelationshipIds: [], resources: [], extra: true }).success).toBe(false);
    expect(caregiverInvitationRequestedScopesSchema.safeParse({ resources: [] }).success).toBe(false);
  });

  it("requires an expected version for a label edit", () => {
    const input = { relationshipId: hospital, relationshipLabel: "SIBLING" };
    expect(updateCaregiverRelationshipLabelInputSchema.safeParse(input).success).toBe(false);
    expect(updateCaregiverRelationshipLabelInputSchema.safeParse({ ...input, expectedVersion: 1 }).success).toBe(true);
    expect(updateCaregiverRelationshipLabelInputSchema.safeParse({ ...input, expectedVersion: 0 }).success).toBe(false);
  });
});

describe("AF-5 contracts and presentation", () => {
  it("formats the label, preferring the Patient's own text for OTHER", () => {
    expect(formatCaregiverRelationshipLabel(null, null)).toBeNull();
    expect(formatCaregiverRelationshipLabel("CHILD", null)).toBe("บุตร");
    expect(formatCaregiverRelationshipLabel("OTHER", "เพื่อนบ้าน")).toBe("เพื่อนบ้าน");
  });

  it("states in every acceptance text that private phones are never shared", () => {
    for (const text of [FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2, CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS.PROFILE_SUMMARY]) {
      expect(text).toContain("ไม่เห็นเบอร์โทรส่วนตัวของผู้ป่วยหรือของ อสม.");
    }
    expect(FAMILY_APPOINTMENT_ACCEPTANCE_TEXT_V2).toContain("90 วันย้อนหลัง");
    for (const text of Object.values(CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS)) expect(text).toContain("ผู้ป่วยสามารถยกเลิกสิทธิ์ได้");
  });

  it("computes age on the Asia/Bangkok calendar day", () => {
    const dateOfBirth = new Date("1960-10-23T00:00:00.000Z");
    // 2026-10-22T17:00Z is already 2026-10-23 00:00 in Bangkok: the birthday has arrived.
    expect(ageInBangkok(dateOfBirth, new Date("2026-10-22T17:00:00.000Z"))).toBe(66);
    expect(ageInBangkok(dateOfBirth, new Date("2026-10-22T16:59:59.000Z"))).toBe(65);
    expect(ageInBangkok(new Date("2000-02-29T00:00:00.000Z"), new Date("2026-02-28T12:00:00.000Z"))).toBe(25);
  });
});
