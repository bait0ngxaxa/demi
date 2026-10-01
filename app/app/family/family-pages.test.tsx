import { CaregiverInvitationStatus, CaregiverRelationshipStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";

import { FamilyManagementWorkspace } from "./family-management-workspace";
import { FamilyInvitationPreview } from "./invitations/family-invitation-preview";

const emptyOverview: FamilyManagementOverview = {
  patient: {
    invitations: [],
    nextInvitationsCursor: null,
    relationships: [],
    nextRelationshipsCursor: null,
  },
  caregiver: {
    invitations: [],
    nextInvitationsCursor: null,
    relationships: [],
    nextRelationshipsCursor: null,
  },
};

describe("Family relationship management pages", () => {
  it("renders both bounded management perspectives and explicit empty states in Thai", () => {
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={emptyOverview} />);

    expect(markup).toContain("ผู้ที่ดูแลคุณ");
    expect(markup).toContain("ผู้ที่คุณดูแล");
    expect(markup).toContain("ยังไม่มีคำเชิญผู้ดูแล");
    expect(markup).toContain("ยังไม่มีคำเชิญผู้ดูแลถึงบัญชีนี้");
    expect(markup).toContain("ไม่เปิดสิทธิ์อ่านข้อมูลสุขภาพ");
  });

  it("keeps Patient-side caregiver lists free of caregiver names and offers terminal actions only while active", () => {
    const overview: FamilyManagementOverview = {
      patient: {
        invitations: [
          {
            invitationId: "11111111-1111-4111-8111-111111111111",
            status: CaregiverInvitationStatus.PENDING,
            issuedAt: new Date("2026-10-01T00:00:00.000Z"),
            expiresAt: new Date("2026-10-02T00:00:00.000Z"),
          },
        ],
        nextInvitationsCursor: null,
        relationships: [
          {
            relationshipId: "22222222-2222-4222-8222-222222222222",
            status: CaregiverRelationshipStatus.ACTIVE,
            activatedAt: new Date("2026-10-01T00:00:00.000Z"),
            revokedAt: null,
            withdrawnAt: null,
          },
        ],
        nextRelationshipsCursor: null,
      },
      caregiver: {
        invitations: [],
        nextInvitationsCursor: null,
        relationships: [],
        nextRelationshipsCursor: null,
      },
    };
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={overview} />);

    expect(markup).toContain("ยกเลิกคำเชิญ");
    expect(markup).toContain("ยุติความสัมพันธ์ผู้ดูแล");
    expect(markup).not.toContain("1000000000009");
  });

  it("does not accept an invitation while rendering the link page", () => {
    const markup = renderToStaticMarkup(<FamilyInvitationPreview />);

    expect(markup).toContain("กำลังตรวจสอบคำเชิญ");
    expect(markup).not.toContain("ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแล");
    expect(markup).not.toContain("ปฏิเสธคำเชิญ");
  });
});
