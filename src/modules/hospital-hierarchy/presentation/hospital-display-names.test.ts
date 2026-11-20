import { describe, expect, it } from "vitest";

import { hospitalDisplayNames } from "./hospital-display-names";

describe("hospitalDisplayNames", () => {
  it("returns a name that is unique in the list as is", () => {
    const names = hospitalDisplayNames([
      { id: "a", name: "โรงพยาบาลเอ", parentName: "แม่ข่าย", registeredAt: "2026-01-05T00:00:00.000Z" },
      { id: "b", name: "โรงพยาบาลบี" },
    ]);
    expect(names.get("a")).toBe("โรงพยาบาลเอ");
    expect(names.get("b")).toBe("โรงพยาบาลบี");
  });

  it("adds the Parent to duplicates that have one, matching names after normalization", () => {
    const names = hospitalDisplayNames([
      { id: "a", name: "รพ.สต. บ้านใหม่", parentName: "โรงพยาบาลเหนือ" },
      { id: "b", name: "รพ.สต.บ้านใหม่", parentName: "โรงพยาบาลใต้" },
      { id: "c", name: "โรงพยาบาลอื่น", parentName: "โรงพยาบาลใต้" },
    ]);
    expect(names.get("a")).toBe("รพ.สต. บ้านใหม่ · ลูกข่ายของ โรงพยาบาลเหนือ");
    expect(names.get("b")).toBe("รพ.สต.บ้านใหม่ · ลูกข่ายของ โรงพยาบาลใต้");
    expect(names.get("c")).toBe("โรงพยาบาลอื่น");
  });

  it("adds the Thai registration date to duplicates without a Parent", () => {
    const names = hospitalDisplayNames([
      { id: "a", name: "โรงพยาบาลชุมชน", registeredAt: "2026-01-05T00:00:00.000Z" },
      { id: "b", name: "โรงพยาบาลชุมชน", registeredAt: new Date("2026-03-10T00:00:00.000Z") },
    ]);
    expect(names.get("a")).toBe("โรงพยาบาลชุมชน · ขึ้นทะเบียน 5 ม.ค. 2569");
    expect(names.get("b")).toBe("โรงพยาบาลชุมชน · ขึ้นทะเบียน 10 มี.ค. 2569");
  });

  it("adds the date as well when the Parent still leaves two entries equal", () => {
    const names = hospitalDisplayNames([
      { id: "a", name: "หน่วยบริการ", parentName: "แม่ข่าย", registeredAt: "2026-01-05T00:00:00.000Z" },
      { id: "b", name: "หน่วยบริการ", parentName: "แม่ข่าย", registeredAt: "2026-02-05T00:00:00.000Z" },
    ]);
    expect(names.get("a")).toBe("หน่วยบริการ · ลูกข่ายของ แม่ข่าย · ขึ้นทะเบียน 5 ม.ค. 2569");
    expect(names.get("b")).toBe("หน่วยบริการ · ลูกข่ายของ แม่ข่าย · ขึ้นทะเบียน 5 ก.พ. 2569");
  });
});
