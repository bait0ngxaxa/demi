import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppointmentSharingWorkspace } from "./appointment-sharing-workspace";
import { AppointmentFields } from "./grants/[grantId]/appointments/appointment-fields";
import { FamilyManagementWorkspace } from "./family-management-workspace";
import type { AppointmentGrantManagement } from "@/modules/family/services/appointment-grant-management-query-service";
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

describe("bounded appointment sharing UI", () => {
  it("identifies exact participants/Hospital, own selection, pending/active and exact revoke/accept row", () => {
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace management={overview} relationships={[relationship]} />);
    for (const text of ["สมชาย ใจดี", "หน่วยบริการทดสอบ", "ผู้ดูแลที่คุณอนุญาต", "อ่านอย่างเดียว", "รอผู้ดูแลยอมรับ", "ยอมรับสิทธิ์แล้ว", "ยกเลิกข้อเสนอ", "ยอมรับสิทธิ์ดูนัดหมาย"]) expect(markup).toContain(text);
    expect(markup).toContain('name="grantId" value="grant-locator"'); expect(markup).toContain('name="grantId" value="active-locator"');
    expect(markup).toContain('/app/personal/appointments?subject=read-locator&amp;tab=upcoming');
    for (const text of ["ชื่อหน่วยบริการ", "ประเภทนัด", "วันและเวลา", "ระยะเวลา", "รูปแบบสถานที่", "สถานะนัด", "90 วัน", "นัดใหม่", "ไม่มีวันหมดอายุอัตโนมัติ", "ผู้ป่วยสามารถยกเลิกสิทธิ์ได้", "ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย"]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/hospitalNumber|SECRET-HN|ญาติที่ผ่านการยืนยัน|CAREgiver|ข้อมูลสุขภาพทั้งหมด/);
  });
  it("renders only six allowed resource fields, truthful cancelled and null source values", () => {
    const markup = renderToStaticMarkup(<AppointmentFields appointment={appointment} />);
    expect((markup.match(/<dt /g) ?? []).length).toBe(6);
    expect(markup).toContain("ยกเลิกแล้ว"); expect(markup).toContain("ยังไม่ระบุ");
    expect(markup).not.toMatch(/appointment-locator|HN|ผู้รับผิดชอบ|อสม.|ยืนยันนัด|ขอยกเลิก|หมายเหตุ|สถานที่โดยละเอียด/);
  });
  it("ordinary Family management explains that a relationship alone grants no access", () => {
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={{ patient: { invitations: [], relationships: [relationship], nextInvitationsCursor: null, nextRelationshipsCursor: null }, caregiver: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null } }} />);
    expect(markup).toContain("สร้างลิงก์คำเชิญ"); expect(markup).toContain("ยุติความสัมพันธ์ผู้ดูแล");
    expect(markup).not.toContain("เสนอสิทธิ์ดูนัดหมาย");
    expect(markup).toContain("ผู้ดูแลจะเห็นเฉพาะข้อมูลที่คุณเลือกแชร์เป็นรายการและผู้ดูแลยอมรับแล้ว");
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
  it("AF-5: resource grants are listed per side and each scope has an explicit accept or revoke action", () => {
    const item = { grantId: "resource-locator", caregiverRelationshipId: "parent-locator", resource: "MEDICATION" as const, status: "ACTIVE" as const,
      proposedAt: now, acceptedAt: now, participant };
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace management={overview} relationships={[relationship]}
      resources={{ patient: [item], caregiver: [{ ...item, grantId: "pending-locator", resource: "PROFILE_SUMMARY", status: "PENDING", acceptedAt: null }], availableResources: ["PROFILE_SUMMARY", "HEALTH_PLAN", "MEDICATION"] }} />);
    for (const text of ["แชร์ข้อมูลสุขภาพอื่นให้ผู้ดูแล", 'name="grantId" value="resource-locator"', "ยกเลิกสิทธิ์", "ยอมรับสิทธิ์ดูข้อมูลทั่วไป", "อายุ ชื่อ อสม. ที่ดูแล", "แผนสุขภาพ", 'value="MEDICATION">ยา</option>']) expect(markup).toContain(text);
    expect(markup).toMatch(/name="resource"[\s\S]*value="HEALTH_PLAN"[\s\S]*value="MEDICATION"/u);
  });
});
