import { HospitalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import PersonalHomePage from "./page";
import PersonalProfilePage from "./profile/page";
import { getPatientSelfPageContext } from "@/modules/patient-self/transport/patient-self-page-context";

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/modules/patient-self/transport/patient-self-page-context", () => ({
  getPatientSelfPageContext: vi.fn(),
}));

const completeContext = {
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  profile: {
    phoneNumber: "0812345678",
    addressText: "99 ถนนตัวอย่าง",
  },
  hospitalRelationships: [
    {
      hospitalCode: "H-001",
      hospitalName: "โรงพยาบาล ก",
      hospitalNumber: "HN-001",
      hospitalStatus: HospitalStatus.ACTIVE,
    },
    {
      hospitalCode: "H-002",
      hospitalName: "โรงพยาบาล ข",
      hospitalNumber: null,
      hospitalStatus: HospitalStatus.SUSPENDED,
    },
    {
      hospitalCode: "H-003",
      hospitalName: "โรงพยาบาล ค",
      hospitalNumber: "HN-003",
      hospitalStatus: HospitalStatus.PENDING_VERIFICATION,
    },
  ],
};

describe("Patient Personal pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPatientSelfPageContext).mockResolvedValue(completeContext);
  });

  it("renders a useful Personal Home from the own authorized projection", async () => {
    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("พื้นที่ส่วนตัว");
    expect(markup).toContain("สมชาย ใจดี");
    expect(markup).toContain("ข้อมูลของฉัน");
    expect(markup).toContain("โรงพยาบาล ก");
    expect(markup).toContain("โรงพยาบาลถูกระงับการใช้งาน");
    expect(markup).toContain("รอยืนยันการขึ้นทะเบียน");
    expect(markup).toContain("HN-001");
    expect(markup).toContain('href="/app/personal/profile"');
    expect(markup).not.toContain('href="/app/patients/assigned"');
    expect(markup).not.toContain("เพิ่มบริการ");
    expect(markup).not.toContain("นัดหมาย");
    expect(getPatientSelfPageContext).toHaveBeenCalledOnce();
  });

  it("shows an explicit incomplete state without fabricating profile values", async () => {
    vi.mocked(getPatientSelfPageContext).mockResolvedValue(null);

    const markup = renderToStaticMarkup(await PersonalHomePage());

    expect(markup).toContain("ข้อมูลผู้ป่วยยังไม่พร้อมแสดง");
    expect(markup).not.toContain("สมชาย");
    expect(markup).not.toContain('href="/app/personal/profile"');
  });

  it("shows only allowlisted own profile facts and honest missing-value labels", async () => {
    const markup = renderToStaticMarkup(await PersonalProfilePage());

    for (const value of [
      "ข้อมูลของฉัน",
      "สมชาย",
      "ใจดี",
      "เบอร์โทรศัพท์",
      "0812345678",
      "ที่อยู่",
      "99 ถนนตัวอย่าง",
    ]) {
      expect(markup).toContain(value);
    }
    expect(markup).not.toContain("วันเกิด");
    expect(markup).not.toContain("อายุ");
    expect(markup).not.toContain("การวินิจฉัย");
  });

  it("shows an incomplete profile state when the identity chain cannot resolve", async () => {
    vi.mocked(getPatientSelfPageContext).mockResolvedValue(null);

    const markup = renderToStaticMarkup(await PersonalProfilePage());

    expect(markup).toContain("ไม่พบข้อมูลโปรไฟล์ที่เชื่อมกับบัญชีนี้");
  });

  it("renders every optional field as not recorded when the persisted value is null", async () => {
    vi.mocked(getPatientSelfPageContext).mockResolvedValue({
      person: { givenName: null, familyName: null },
      profile: {
        phoneNumber: null,
        addressText: null,
      },
      hospitalRelationships: [],
    });

    const markup = renderToStaticMarkup(await PersonalProfilePage());

    expect(markup).toContain("ยังไม่ได้บันทึก");
    expect(markup).toContain("โรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย");
    expect(markup).toContain("ยังไม่มีข้อมูลโรงพยาบาลที่เชื่อมกับข้อมูลผู้ป่วย");
  });
});
