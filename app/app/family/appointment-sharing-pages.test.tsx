import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppointmentSharingWorkspace } from "./appointment-sharing-workspace";
import { AppointmentFields } from "./grants/[grantId]/appointments/appointment-fields";
import { FamilyManagementWorkspace } from "./family-management-workspace";
import type { AppointmentGrantManagement } from "@/modules/family/services/appointment-grant-management-query-service";
const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), connection: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/family/transport/appointment-grant-page-context", () => ({ getDelegatedAppointmentsPageContext: mocks.list, getDelegatedAppointmentPageContext: mocks.detail }));
import ListPage from "./grants/[grantId]/appointments/page";
import DetailPage from "./grants/[grantId]/appointments/[appointmentId]/page";

const now = new Date("2026-10-02T00:00:00Z");
const participant = { givenName: "สมชาย", familyName: "ใจดี" };
const relationship = { participant, relationshipId: "parent-locator", status: "ACTIVE" as const, activatedAt: now, revokedAt: null, withdrawnAt: null };
const grant = { participant, grantId: "grant-locator", hospitalName: "หน่วยบริการทดสอบ", status: "PENDING" as const, proposedAt: now, acceptedAt: null, revokedAt: null };
const overview: AppointmentGrantManagement = { patient: { grants: [grant, { ...grant, grantId: "active-locator", status: "ACTIVE", acceptedAt: now }], nextCursor: null,
  hospitals: [{ relationshipId: "phr-locator", hospitalName: "หน่วยบริการทดสอบ" }], nextHospitalsCursor: null }, caregiver: { grants: [grant, { ...grant, grantId: "read-locator", status: "ACTIVE", acceptedAt: now }], nextCursor: null } };
const appointment = { appointmentId: "appointment-locator", hospitalName: "หน่วยบริการทดสอบ", type: "FOLLOW_UP" as const, scheduledAt: now, durationMinutes: null, locationType: null, status: "CANCELLED" as const };

describe("bounded appointment sharing UI", () => {
  it("identifies exact participants/Hospital, own selection, pending/active and exact revoke/accept row", () => {
    const markup = renderToStaticMarkup(<AppointmentSharingWorkspace management={overview} relationships={[relationship]} />);
    for (const text of ["สมชาย ใจดี", "หน่วยบริการทดสอบ", "ผู้ดูแลที่คุณอนุญาต", "อ่านอย่างเดียว", "รอผู้ดูแลยอมรับ", "ยอมรับสิทธิ์แล้ว", "ยกเลิกข้อเสนอ", "ยอมรับสิทธิ์ดูนัดหมาย"]) expect(markup).toContain(text);
    expect(markup).toContain('name="grantId" value="grant-locator"'); expect(markup).toContain('name="grantId" value="active-locator"');
    expect(markup).toContain('/app/family/grants/read-locator/appointments');
    for (const text of ["ชื่อหน่วยบริการ", "ประเภทนัด", "วันและเวลา", "ระยะเวลา", "รูปแบบสถานที่", "สถานะนัด", "90 วัน", "นัดใหม่", "ไม่มีวันหมดอายุอัตโนมัติ", "ผู้ป่วยสามารถยกเลิกสิทธิ์ได้", "ไม่อนุญาตให้แก้ไข ยกเลิก หรือดำเนินการแทนผู้ป่วย"]) expect(markup).toContain(text);
    expect(markup).not.toMatch(/hospitalNumber|SECRET-HN|ญาติที่ผ่านการยืนยัน|CAREgiver|ข้อมูลสุขภาพทั้งหมด/);
  });
  it("renders only six allowed resource fields, truthful cancelled and null source values", () => {
    const markup = renderToStaticMarkup(<AppointmentFields appointment={appointment} />);
    expect((markup.match(/<dt /g) ?? []).length).toBe(6);
    expect(markup).toContain("ยกเลิกแล้ว"); expect(markup).toContain("ยังไม่ระบุ");
    expect(markup).not.toMatch(/appointment-locator|HN|ผู้รับผิดชอบ|อสม.|ยืนยันนัด|ขอยกเลิก|หมายเหตุ|สถานที่โดยละเอียด/);
  });
  it("disabled ordinary Family management remains available without delegated controls", () => {
    const markup = renderToStaticMarkup(<FamilyManagementWorkspace overview={{ patient: { invitations: [], relationships: [relationship], nextInvitationsCursor: null, nextRelationshipsCursor: null }, caregiver: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null } }} />);
    expect(markup).toContain("สร้างลิงก์คำเชิญ"); expect(markup).toContain("ยุติความสัมพันธ์ผู้ดูแล");
    expect(markup).not.toContain("เสนอสิทธิ์ดูนัดหมาย");
  });
  it("list/detail pages reauthorize exact deep links, show empty state and use scoped links", async () => {
    mocks.list.mockResolvedValue({ appointments: [], nextCursor: null });
    expect(renderToStaticMarkup(await ListPage({ params: Promise.resolve({ grantId: "grant" }), searchParams: Promise.resolve({}) }))).toContain("ไม่มีนัดหมายที่เข้าเกณฑ์");
    mocks.list.mockResolvedValue({ appointments: [appointment], nextCursor: "next" });
    const markup = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ grantId: "grant" }), searchParams: Promise.resolve({ cursor: "anchor" }) }));
    expect(mocks.list).toHaveBeenLastCalledWith({ grantId: "grant", cursor: "anchor" });
    expect(markup).toContain('/app/family/grants/grant/appointments/appointment-locator');
    mocks.detail.mockResolvedValue(appointment);
    const detail = renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ grantId: "grant", appointmentId: "appointment" }) }));
    expect(mocks.detail).toHaveBeenCalledWith("grant", "appointment"); expect(detail).toContain("ยกเลิกแล้ว");
    mocks.detail.mockRejectedValue(new Error("denied"));
    await expect(DetailPage({ params: Promise.resolve({ grantId: "grant", appointmentId: "foreign" }) })).rejects.toThrow("denied");
  });
});
