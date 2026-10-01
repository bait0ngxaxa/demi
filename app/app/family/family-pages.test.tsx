import { CaregiverInvitationStatus, CaregiverRelationshipStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";

import { FamilyManagementWorkspace } from "./family-management-workspace";
import { FamilyInvitationPreview } from "./invitations/family-invitation-preview";

const confirmation = vi.hoisted(() => ({ open: false }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: (initial: unknown) => actual.useState(initial === false && confirmation.open ? true : initial) };
});
afterEach(() => { confirmation.open = false; });

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

  it("shows bounded caregiver identity beside Patient management actions", () => {
    const overview: FamilyManagementOverview = {
      patient: {
        invitations: [
          {
            participant: { givenName: "สมหญิง", familyName: "ใจดี" },
            invitationId: "11111111-1111-4111-8111-111111111111",
            status: CaregiverInvitationStatus.PENDING,
            issuedAt: new Date("2026-10-01T00:00:00.000Z"),
            expiresAt: new Date("2026-10-02T00:00:00.000Z"),
          },
        ],
        nextInvitationsCursor: null,
        relationships: [
          {
            participant: { givenName: "สมหญิง", familyName: "ใจดี" },
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

    expect(markup).toContain("สมหญิง ใจดี");
    expect(markup).toContain("ยกเลิกคำเชิญ");
    expect(markup).toContain("ยุติความสัมพันธ์ผู้ดูแล");
    expect(markup).not.toContain("1000000000009");
  });


  it("distinguishes many-to-many rows and binds destructive forms to their own IDs", () => {
    confirmation.open = true;
    const now = new Date("2026-10-01T00:00:00Z");
    const caregivers = ["สมหญิง", "สมศรี"];
    const patients = ["สมชาย", "สมบัติ"];
    const relationships = (givenNames: string[], prefix: string) => givenNames.map((givenName, index) => ({
      participant: { givenName, familyName: "ใจดี" }, relationshipId: `${prefix}-${index}`,
      status: CaregiverRelationshipStatus.ACTIVE, activatedAt: now, revokedAt: null, withdrawnAt: null,
    }));
    const invitations = (givenNames: string[], prefix: string) => givenNames.map((givenName, index) => ({
      participant: { givenName, familyName: "ใจดี" }, invitationId: `${prefix}-${index}`,
      status: CaregiverInvitationStatus.PENDING, issuedAt: now, expiresAt: now,
    }));
    const overview: FamilyManagementOverview = {
      patient: { ...emptyOverview.patient, invitations: invitations(caregivers, "invite"), relationships: relationships(caregivers, "revoke"), nextInvitationsCursor: null, nextRelationshipsCursor: null },
      caregiver: { ...emptyOverview.caregiver, invitations: invitations(patients, "received"), relationships: relationships(patients, "withdraw") },
    };
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={overview} />);
    const rows = markup.match(/<li\b[\s\S]*?<\/li>/g) ?? [];
    for (const [prefix, names] of [["invite", caregivers], ["revoke", caregivers], ["withdraw", patients]] as const) {
      names.forEach((name, index) => {
        const row = rows.find((candidate) => candidate.includes(`value="${prefix}-${index}"`));
        expect(row).toBeDefined();
        expect(row).toContain(`${name} ใจดี`);
        expect(row).not.toContain(`${names[1 - index]} ใจดี`);
      });
    }
    patients.forEach((name) => expect(markup).toContain(`${name} ใจดี`));
    expect(markup).not.toMatch(/identityKeyHash|authSubject|hospitalNumber|nationalId="|emergencyContact|screening|goalPlan/);
  });

  it("uses a truthful name fallback without substituting private identifiers", () => {
    const now = new Date();
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={{ ...emptyOverview, caregiver: {
      ...emptyOverview.caregiver, relationships: [{ participant: { givenName: null, familyName: " " }, relationshipId: "unnamed", status: CaregiverRelationshipStatus.ACTIVE, activatedAt: now, revokedAt: null, withdrawnAt: null }],
    } }} />);
    expect(markup).toContain("ไม่ระบุชื่อผู้ป่วย");
    expect(markup).not.toContain("identityKeyHash");
  });

  it("does not accept an invitation while rendering the link page", () => {
    const markup = renderToStaticMarkup(<FamilyInvitationPreview />);

    expect(markup).toContain("กำลังตรวจสอบคำเชิญ");
    expect(markup).not.toContain("ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแล");
    expect(markup).not.toContain("ปฏิเสธคำเชิญ");
  });
});
