import { describe, expect, it } from "vitest";

import { formatPatientHospitalAddress } from "./patient-hospital-address";

describe("hospital address presentation", () => {
  it("formats each Thai address component without duplicating existing labels", () => {
    expect(formatPatientHospitalAddress({ addressText: null, houseNumber: "99/1", villageNumber: "07",
      villageName: "บ้านสุขใจ", soi: "ซอยสุขใจ", road: "ถนนประชาร่วมใจ", subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่", province: "เชียงใหม่", postalCode: "01234" })).toBe(
      "99/1 หมู่ 07 บ้านสุขใจ ซอยสุขใจ ถนนประชาร่วมใจ ตำบลสุเทพ อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 01234",
    );
  });

  it("uses Bangkok administrative labels and preserves postal leading zeros", () => {
    expect(formatPatientHospitalAddress({ addressText: null, province: "กรุงเทพมหานคร",
      district: "บางเขน", subdistrict: "อนุสาวรีย์", postalCode: "01234" })).toBe(
      "แขวงอนุสาวรีย์ เขตบางเขน กรุงเทพมหานคร 01234",
    );
  });

  it("uses free text only when no structured component exists and preserves absence", () => {
    expect(formatPatientHospitalAddress({ addressText: "ที่อยู่ใหม่" })).toBe("ที่อยู่ใหม่");
    expect(formatPatientHospitalAddress({ addressText: null })).toBeNull();
    expect(formatPatientHospitalAddress({ houseNumber: "22", addressText: "ข้อความเก่า" })).toBe("22");
  });
});
