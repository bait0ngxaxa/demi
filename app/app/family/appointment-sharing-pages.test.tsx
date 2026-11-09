import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppointmentSharingWorkspace } from "./appointment-sharing-workspace";
import { AppointmentFields } from "./grants/[grantId]/appointments/appointment-fields";
import { FamilyManagementWorkspace } from "./family-management-workspace";
import { FAMILY_APPOINTMENT_LATEST_READ_CONTRACT, FAMILY_APPOINTMENT_READ_CONTRACT, FAMILY_APPOINTMENT_READ_CONTRACT_V2, type FamilyAppointmentReadContract } from "@/modules/family/domain/appointment-grant-contract";
import { CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS, CAREGIVER_RESOURCE_LABELS } from "@/modules/family/domain/caregiver-sharing-contract";
import type { AppointmentGrantManagement, AppointmentGrantManagementItem } from "@/modules/family/services/appointment-grant-management-query-service";
import type { ResourceGrantManagementItem } from "@/modules/family/services/caregiver-resource-grant-service";
import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";
const mocks = vi.hoisted(() => ({ detail: vi.fn(), connection: vi.fn(), redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), redirect: mocks.redirect }));
vi.mock("@/modules/family/transport/appointment-grant-page-context", () => ({ getDelegatedAppointmentPageContext: mocks.detail }));
import ListPage from "./grants/[grantId]/appointments/page";
import DetailPage from "./grants/[grantId]/appointments/[appointmentId]/page";

const now = new Date("2026-10-02T00:00:00Z");
const participant = { givenName: "สมชาย", familyName: "ใจดี", nameIsSelfAsserted: false };
const relationship = { participant, relationshipId: "parent-locator", status: "ACTIVE" as const, activatedAt: now, revokedAt: null, withdrawnAt: null, relationshipLabel: null, relationshipLabelOther: null, relationshipLabelVersion: 1 };
const grant = { participant, grantId: "grant-locator", hospitalName: "หน่วยบริการทดสอบ", status: "PENDING" as const, proposedAt: now, acceptedAt: null, revokedAt: null,
  contractVersion: "family-appointment-read-v1" as const };
const overview: AppointmentGrantManagement = { patient: { grants: [grant, { ...grant, grantId: "active-locator", status: "ACTIVE", acceptedAt: now }], nextCursor: null,
  hospitals: [{ relationshipId: "phr-locator", hospitalName: "หน่วยบริการทดสอบ" }], nextHospitalsCursor: null }, caregiver: { grants: [grant, { ...grant, grantId: "read-locator", status: "ACTIVE", acceptedAt: now }], nextCursor: null } };
const appointment = { appointmentId: "appointment-locator", hospitalName: "หน่วยบริการทดสอบ", type: "FOLLOW_UP" as const, scheduledAt: now, durationMinutes: null, locationType: null, status: "CANCELLED" as const, extension: null };

function onlyRecordCard(markup: string): string {
  const cards = Array.from(markup.matchAll(/<li class="min-w-0">[\s\S]*?<\/li>/gu), ([card]) => card);
  if (cards.length !== 1 || cards[0] === undefined) throw new Error(`Expected one grant card, found ${cards.length}`);
  return cards[0];
}

function recordFieldValue(card: string, label: string): string | undefined {
  return Array.from(card.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/gu))
    .find(([, fieldLabel]) => fieldLabel === label)?.[2];
}

function renderAppointmentGrantCard(grantRecord: AppointmentGrantManagementItem): string {
  const markup = renderToStaticMarkup(<AppointmentSharingWorkspace relationships={[relationship]}
    management={{ patient: { grants: [grantRecord], nextCursor: null, hospitals: [], nextHospitalsCursor: null }, caregiver: { grants: [], nextCursor: null } }} />);
  return onlyRecordCard(markup);
}

function renderResourceGrantCard(grantRecord: ResourceGrantManagementItem): string {
  const markup = renderToStaticMarkup(<AppointmentSharingWorkspace relationships={[relationship]}
    management={{ patient: null, caregiver: { grants: [], nextCursor: null } }}
    resources={{ patient: [grantRecord], caregiver: [], availableResources: [] }} />);
  return onlyRecordCard(markup);
}

const appointmentContractReadbacks = [
  {
    contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT,
    scopeSummary: "ดูเฉพาะนัดหมายที่จะถึงใน 90 วัน โดยเห็นชื่อหน่วยบริการ ประเภทนัด วันและเวลา ระยะเวลา รูปแบบสถานที่ และสถานะ (อ่านอย่างเดียว)",
  },
  {
    contractVersion: FAMILY_APPOINTMENT_READ_CONTRACT_V2,
    scopeSummary: "ดูนัดหมายย้อนหลังและล่วงหน้าอย่างละ 90 วัน พร้อมรายละเอียดสถานที่ ผู้รับผิดชอบ และ อสม. ตอนสร้างนัด โดยไม่รวมบริการและที่มาของนัด (อ่านอย่างเดียว)",
  },
  {
    contractVersion: FAMILY_APPOINTMENT_LATEST_READ_CONTRACT,
    scopeSummary: "ดูนัดหมายย้อนหลังและล่วงหน้าอย่างละ 90 วัน พร้อมรายละเอียดสถานที่ ผู้รับผิดชอบ และ อสม. ตอนสร้างนัด โดยรวมบริการและที่มาของนัด (อ่านอย่างเดียว)",
  },
] as const satisfies readonly { contractVersion: FamilyAppointmentReadContract; scopeSummary: string }[];

const appointmentGrantStatuses = [
  { status: "PENDING", statusLabel: "รอผู้ดูแลยอมรับ", scopeLabel: "ขอบเขตที่เสนอให้แชร์" },
  { status: "ACTIVE", statusLabel: "ยอมรับสิทธิ์แล้ว", scopeLabel: "ขอบเขตที่ได้รับสิทธิ์" },
  { status: "REVOKED", statusLabel: "ยกเลิกสิทธิ์แล้ว", scopeLabel: "ขอบเขตของสิทธิ์ที่ยกเลิกแล้ว" },
] as const;

const appointmentGrantReadbackCases = appointmentGrantStatuses.flatMap((statusCase) => appointmentContractReadbacks.map((contract) => ({ ...statusCase, ...contract })));
const resourceGrantStatuses = [
  { status: "PENDING", statusLabel: "รอผู้ดูแลยอมรับ", scopeLabel: "ข้อมูลที่เสนอให้เข้าถึง" },
  { status: "ACTIVE", statusLabel: "ยอมรับสิทธิ์แล้ว", scopeLabel: "ข้อมูลที่อนุญาตแล้ว" },
] as const;
const resources = ["PROFILE_SUMMARY", "HEALTH_PLAN", "MEDICATION"] as const;
const resourceGrantReadbackCases = resourceGrantStatuses.flatMap((statusCase) => resources.map((resource) => ({ ...statusCase, resource })));

describe("bounded appointment sharing UI", () => {
  it("identifies exact participants/Hospital, own selection, pending/active and exact revoke/accept row", () => {
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace management={overview} relationships={[relationship]} />);
    for (const text of ["สมชาย ใจดี", "หน่วยบริการทดสอบ", "ผู้ดูแลที่คุณอนุญาต", "อ่านอย่างเดียว", "รอผู้ดูแลยอมรับ", "ยอมรับสิทธิ์แล้ว", "ยกเลิกข้อเสนอ", "ยอมรับสิทธิ์ดูนัดหมาย"]) expect(markup).toContain(text);
    expect(markup).toContain('name="grantId" value="grant-locator"'); expect(markup).toContain('name="grantId" value="active-locator"');
    expect(markup).toContain('/app/personal/appointments?subject=read-locator&amp;tab=upcoming');
    expect(markup).not.toContain('/app/personal/appointments?subject=grant-locator&amp;tab=upcoming');
    for (const text of ["ชื่อหน่วยบริการ", "ประเภทนัด", "วันและเวลา", "ระยะเวลา", "รูปแบบสถานที่", "สถานะนัด", "90 วัน", "นัดใหม่", "ไม่มีวันหมดอายุอัตโนมัติ", "ผู้ป่วยสามารถยกเลิกสิทธิ์ได้", "ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย"]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/hospitalNumber|SECRET-HN|ญาติที่ผ่านการยืนยัน|CAREgiver|ข้อมูลสุขภาพทั้งหมด/);
  });
  it("keeps appointment status, care-ended restriction, contract version, scope, and dates independently readable", () => {
    const active = { ...grant, grantId: "active", status: "ACTIVE" as const, acceptedAt: now };
    const revoked = { ...grant, grantId: "revoked", status: "REVOKED" as const, revokedAt: now };
    const careEnded = { ...active, grantId: "care-ended", careEnded: true };
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace relationships={[relationship]}
      management={{ patient: { ...overview.patient!, grants: [grant, active, revoked, careEnded] }, caregiver: { grants: [], nextCursor: null } }} />);

    for (const text of ["รอผู้ดูแลยอมรับ", "ยอมรับสิทธิ์แล้ว", "ยกเลิกสิทธิ์แล้ว", "สิ้นสุดการดูแลแล้ว", "สิทธิ์ตามสัญญาเดิม", "หน่วยบริการ", "เสนอเมื่อ", "ยอมรับเมื่อ", "ยกเลิกเมื่อ"]) expect(markup).toContain(text);
    expect(markup).toContain("ผู้ดูแลจึงไม่เห็นนัดหมายของโรงพยาบาลนี้");
    expect(markup.match(/<details/g)).toHaveLength(4);
    expect(markup).toContain(`<time dateTime="${now.toISOString()}">`);
  });
  it.each(appointmentGrantReadbackCases)("shows $status scope for $contractVersion on its own appointment grant card", ({ status, statusLabel, scopeLabel, contractVersion, scopeSummary }) => {
    const card = renderAppointmentGrantCard({
      ...grant,
      grantId: `${status}-${contractVersion}`,
      status,
      acceptedAt: status === "PENDING" ? null : now,
      revokedAt: status === "REVOKED" ? now : null,
      contractVersion,
    });

    expect(card).toContain(statusLabel);
    expect(recordFieldValue(card, scopeLabel)).toBe(scopeSummary);
  });
  it("renders only six allowed resource fields, truthful cancelled and null source values", () => {
    const markup = renderToStaticMarkup(<AppointmentFields appointment={appointment} />);
    expect((markup.match(/<dt /g) ?? []).length).toBe(6);
    expect(markup).toContain("ยกเลิกแล้ว"); expect(markup).toContain("ยังไม่ระบุ");
    expect(markup).not.toMatch(/appointment-locator|HN|ผู้รับผิดชอบ|อสม.|ยืนยันนัด|ขอยกเลิก|หมายเหตุ|สถานที่โดยละเอียด/);
  });
  it("ordinary Family management explains that a relationship alone grants no access", () => {
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={{ patient: { invitations: [], relationships: [relationship], nextInvitationsCursor: null, nextRelationshipsCursor: null }, caregiver: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null } }} />);
    expect(markup).toContain("สร้างลิงก์คำเชิญ"); expect(markup).toContain("ยกเลิกการเชื่อมต่อกับผู้ดูแล");
    expect(markup).not.toContain("เสนอสิทธิ์ดูนัดหมาย");
    for (const emptyState of ["ยังไม่มีคำเชิญผู้ดูแล", "ยังไม่มีคำเชิญผู้ดูแลถึงบัญชีนี้", "ยังไม่มีผู้ป่วยที่คุณตอบรับคำเชิญให้ดูแล"]) expect(markup).toContain(emptyState);
    expect(markup).toContain("ผู้ดูแลจะเห็นเฉพาะข้อมูลที่คุณเลือกแชร์เป็นรายการและผู้ดูแลยอมรับแล้ว");
  });
  it("groups invitation and relationship readbacks by record, with role-specific status, dates, and active-only navigation", () => {
    const issuedAt = new Date("2026-10-01T00:00:00.000Z");
    const expiresAt = new Date("2026-10-08T00:00:00.000Z");
    const invitations = (["PENDING", "ACCEPTED", "REJECTED", "REVOKED", "EXPIRED"] as const).map((status) => ({
      invitationId: `invitation-${status.toLowerCase()}`,
      participant: { givenName: "ผู้ดูแลชื่อยาวทดสอบการตัดบรรทัด", familyName: "ครอบครัวตัวอย่าง", nameIsSelfAsserted: true },
      status,
      issuedAt,
      expiresAt,
    }));
    const patientRelationship = {
      participant: { givenName: "ผู้ดูแล", familyName: "ที่เชื่อมไว้", nameIsSelfAsserted: true },
      relationshipId: "patient-relationship-active",
      status: "ACTIVE" as const,
      activatedAt: issuedAt,
      revokedAt: null,
      withdrawnAt: null,
      relationshipLabel: "CHILD" as const,
      relationshipLabelOther: null,
      relationshipLabelVersion: 1,
    };
    const overview: FamilyManagementOverview = {
      patient: {
        invitations,
        relationships: [patientRelationship, { ...patientRelationship, relationshipId: "patient-relationship-revoked", status: "REVOKED", revokedAt: expiresAt }, { ...patientRelationship, relationshipId: "patient-relationship-withdrawn", status: "WITHDRAWN", withdrawnAt: expiresAt }],
        nextInvitationsCursor: "patient-invitations-next",
        nextRelationshipsCursor: "patient-relationships-next",
      },
      caregiver: {
        invitations,
        relationships: [
          { ...patientRelationship, relationshipId: "caregiver-relationship-active", participant: { givenName: "ผู้ป่วย", familyName: "ที่แชร์ให้", nameIsSelfAsserted: true } },
          { ...patientRelationship, relationshipId: "caregiver-relationship-revoked", participant: { givenName: "ผู้ป่วย", familyName: "ที่แชร์ให้", nameIsSelfAsserted: false }, status: "REVOKED", revokedAt: expiresAt },
          { ...patientRelationship, relationshipId: "caregiver-relationship-withdrawn", participant: { givenName: "ผู้ป่วย", familyName: "ที่แชร์ให้", nameIsSelfAsserted: false }, status: "WITHDRAWN", withdrawnAt: expiresAt },
        ],
        nextInvitationsCursor: "caregiver-invitations-next",
        nextRelationshipsCursor: "caregiver-relationships-next",
      },
    };
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={overview} />);

    for (const text of ["รอการตอบรับ", "ยอมรับแล้ว", "ปฏิเสธแล้ว", "ยกเลิกแล้ว", "หมดอายุ", "สร้างเมื่อ", "หมดอายุ", "ชื่อที่ผู้ดูแลแจ้งเอง", "ชื่อที่ผู้ป่วยแจ้งเอง", "ความสัมพันธ์: บุตร", "เริ่มเมื่อ", "ยุติการเชื่อมต่อเมื่อ", "ผู้ดูแลหยุดเชื่อมต่อเมื่อ"]) expect(markup).toContain(text);
    expect(markup).toContain(`<time dateTime="${issuedAt.toISOString()}">`);
    expect(markup).toContain(`<time dateTime="${expiresAt.toISOString()}">`);
    expect(markup.match(/aria-label="แสดงคิวอาร์โค้ดคำเชิญ:/g)).toHaveLength(1);
    expect(markup).toContain('/app/family/members/caregiver-relationship-active');
    expect(markup).not.toContain('/app/family/members/caregiver-relationship-revoked');
    expect(markup).not.toContain('/app/family/members/caregiver-relationship-withdrawn');
    expect(markup).toContain("ผู้ดูแลจะเห็นเฉพาะข้อมูลที่คุณเลือกแชร์เป็นรายการและผู้ดูแลยอมรับแล้ว");
    expect(markup).toContain("สร้างลิงก์คำเชิญ");
    expect(markup).toContain('patientInvitationsCursor=patient-invitations-next');
    expect(markup).toContain('caregiverRelationshipsCursor=caregiver-relationships-next');
  });
  it("legacy list deep links land on the member's hub selection; detail stays scoped and returns to the hub", async () => {
    mocks.redirect.mockImplementation(() => { throw new Error("redirected"); });
    await expect(ListPage({ params: Promise.resolve({ grantId: "grant" }) })).rejects.toThrow("redirected");
    expect(mocks.redirect).toHaveBeenCalledWith("/app/personal/appointments?subject=grant&tab=upcoming");
    mocks.detail.mockResolvedValue(appointment);
    const detail = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ grantId: "grant", appointmentId: "appointment" }) }));
    expect(mocks.detail).toHaveBeenCalledWith("grant", "appointment"); expect(detail).toContain("ยกเลิกแล้ว");
    expect(detail).toContain('href="/app/personal/appointments?subject=grant&amp;tab=upcoming"');
    expect(detail).not.toMatch(/<form|<button|การรับทราบนัดหมาย|คำขอยกเลิก|ผู้รับผิดชอบ|OSM|\/app\/personal\/appointments\/|\/app\/patients/);
    mocks.detail.mockRejectedValue(new Error("denied"));
    await expect(DetailPage({ params: Promise.resolve({ grantId: "grant", appointmentId: "foreign" }) })).rejects.toThrow("denied");
  });
  it("AF-5: one-step add offers per-Hospital appointments and only the resources the server allows", () => {
    const empty = { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null };
    const render = (resources: ("PROFILE_SUMMARY" | "HEALTH_PLAN" | "MEDICATION")[]) => renderToStaticMarkup(<FamilyManagementWorkspace
      overview={{ patient: empty, caregiver: empty }} sharingOptions={{ hospitals: [{ relationshipId: "phr-locator", hospitalName: "รพ.สต. บ้านใหม่" }], resources }} />);
    const profileOnly = render(["PROFILE_SUMMARY"]);
    for (const text of ['name="relationshipLabel"', "ผู้ดูแลเกี่ยวข้องกับคุณอย่างไร", "บุตร", 'name="appointmentRelationshipIds" value="phr-locator"', "นัดหมายที่ รพ.สต. บ้านใหม่", 'value="PROFILE_SUMMARY"', "ข้อมูลทั่วไป"]) expect(profileOnly).toContain(text);
    expect(profileOnly).not.toMatch(/HEALTH_PLAN|MEDICATION|แผนสุขภาพ/u);
    expect(render(["PROFILE_SUMMARY", "HEALTH_PLAN", "MEDICATION"])).toMatch(/value="HEALTH_PLAN"[\s\S]*value="MEDICATION"/u);
  });
  it("AF-5: an active v1 grant offers the Patient the v2 upgrade; a pending v2 shows the v2 acceptance text", () => {
    const v1 = { ...grant, grantId: "v1-locator", status: "ACTIVE" as const, acceptedAt: now, scope: { caregiverRelationshipId: "parent-locator", patientHospitalRelationshipId: "phr-locator" } };
    const v2 = { ...grant, grantId: "v2-locator", contractVersion: "family-appointment-read-v2" as const };
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace relationships={[relationship]}
      management={{ patient: { ...overview.patient!, grants: [v1] }, caregiver: { grants: [v2], nextCursor: null } }} />);
    expect(markup).toContain("เสนอสิทธิ์แบบใหม่");
    expect(markup).toContain('name="patientHospitalRelationshipId" value="phr-locator"');
    expect(markup).toContain("สิทธิ์แบบเดิม");
    for (const text of ["หน่วยบริการแม่ข่าย", "รายละเอียดสถานที่", "90 วันย้อนหลัง", "ไม่เห็นเบอร์โทรส่วนตัวของผู้ป่วยหรือของ อสม."]) expect(markup).toContain(text);
  });
  it("SR-C1: an active v2 grant explains in Thai that service/source is missing and offers the v3 upgrade; v3 rows offer none", () => {
    const scope = { caregiverRelationshipId: "parent-locator", patientHospitalRelationshipId: "phr-locator" };
    const active = { ...grant, status: "ACTIVE" as const, acceptedAt: now, scope };
    const render = (contractVersion: "family-appointment-read-v2" | "family-appointment-read-v3") => renderToStaticMarkup(<AppointmentSharingWorkspace relationships={[relationship]}
      management={{ patient: { ...overview.patient!, grants: [{ ...active, grantId: `${contractVersion}-locator`, contractVersion }] }, caregiver: { grants: [], nextCursor: null } }} />);
    const v2 = render("family-appointment-read-v2");
    expect(v2).toContain("ผู้ดูแลไม่เห็นว่านัดเป็นบริการใด");
    expect(v2).toContain("เสนอสิทธิ์แบบใหม่");
    const v3 = render("family-appointment-read-v3");
    expect(v3).not.toContain("สิทธิ์แบบเดิม");
    expect(v3).not.toContain("เสนอสิทธิ์แบบใหม่");
  });
  it("SR-C1: a pending v3 proposal shows the v3 acceptance text to the caregiver", () => {
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace relationships={[relationship]}
      management={{ patient: null, caregiver: { grants: [{ ...grant, grantId: "v3-locator", contractVersion: "family-appointment-read-v3" }], nextCursor: null } }} />);
    expect(markup).toContain("ประเภทนัด บริการและที่มาของนัด");
  });
  it("AF-5: resource grants are listed per side and each scope has an explicit accept or revoke action", () => {
    const item = { grantId: "resource-locator", caregiverRelationshipId: "parent-locator", resource: "MEDICATION" as const, status: "ACTIVE" as const,
      proposedAt: now, acceptedAt: now, participant };
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace management={overview} relationships={[relationship]}
      resources={{ patient: [item], caregiver: [
        { ...item, grantId: "pending-locator", resource: "PROFILE_SUMMARY", status: "PENDING", acceptedAt: null },
        { ...item, grantId: "active-plan-locator", resource: "HEALTH_PLAN" },
      ], availableResources: ["PROFILE_SUMMARY", "HEALTH_PLAN", "MEDICATION"] }} />);
    for (const text of ["แชร์ข้อมูลสุขภาพอื่นให้ผู้ดูแล", 'name="grantId" value="resource-locator"', "ยกเลิกสิทธิ์", "ยอมรับสิทธิ์ดูข้อมูลทั่วไป", "อายุ ชื่อ อสม. ที่ดูแล", "แผนสุขภาพ", 'value="MEDICATION">ยา</option>']) expect(markup).toContain(text);
    expect(markup).toMatch(/name="resource"[\s\S]*value="HEALTH_PLAN"[\s\S]*value="MEDICATION"/u);
    expect(markup).toContain(CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS.PROFILE_SUMMARY);
    expect(markup).toContain(CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS.HEALTH_PLAN);
    expect(markup).toContain(CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS.MEDICATION);
  });
  it.each(resourceGrantReadbackCases)("shows $status wording and the matching resource scope on its own resource grant card", ({ status, statusLabel, scopeLabel, resource }) => {
    const card = renderResourceGrantCard({
      grantId: `${status}-${resource}`,
      caregiverRelationshipId: "parent-locator",
      resource,
      status,
      proposedAt: now,
      acceptedAt: status === "PENDING" ? null : now,
      participant,
    });

    expect(card).toContain(statusLabel);
    expect(recordFieldValue(card, scopeLabel)).toBe(CAREGIVER_RESOURCE_LABELS[resource]);
    expect(card).toContain(CAREGIVER_RESOURCE_ACCEPTANCE_TEXTS[resource]);
  });
});
