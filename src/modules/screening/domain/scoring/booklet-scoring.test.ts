import { describe, expect, it } from "vitest";

import { calculatePamBookletResult, pamGroupDefinition } from "./pam-booklet-v1";
import { calculatePromsBookletResult } from "./proms-booklet-v1";

/** Five PAM answers (1-4) that add up to `total`. */
function pamAnswersFor(total: number): Record<string, number> {
  const values = [1, 1, 1, 1, 1];
  let remaining = total - 5;

  for (let index = 0; remaining > 0; index = (index + 1) % 5) {
    if (values[index]! < 4) {
      values[index]! += 1;
      remaining -= 1;
    }
  }

  return Object.fromEntries(values.map((value, index) => [`pam-${index + 1}`, value]));
}

describe("R2-A PAM booklet scoring", () => {
  it.each([
    [5, "SUPPORT", "RED", "กลุ่มไม่พร้อม (Support)"],
    [8, "SUPPORT", "RED", "กลุ่มไม่พร้อม (Support)"],
    [9, "GENERAL", "YELLOW", "กลุ่มทั่วไป (General)"],
    [13, "GENERAL", "YELLOW", "กลุ่มทั่วไป (General)"],
    [14, "INTENSIVE", "GREEN", "กลุ่มรักสุขภาพ (Intensive)"],
    [17, "INTENSIVE", "GREEN", "กลุ่มรักสุขภาพ (Intensive)"],
    [18, "CHAMPION", "BLUE", "กลุ่มแชมเปี้ยน (Champion)"],
    [20, "CHAMPION", "BLUE", "กลุ่มแชมเปี้ยน (Champion)"],
  ] as const)("maps total %s to %s", (total, group, colour, name) => {
    const result = calculatePamBookletResult(pamAnswersFor(total));

    expect(result).toEqual({ total, group });
    expect(pamGroupDefinition(group)).toMatchObject({ colour, name });
  });

  it("keeps the booklet descriptions and recommendations verbatim", () => {
    expect(pamGroupDefinition("SUPPORT")).toMatchObject({
      description: "ผู้ป่วยไม่สามารถรับผิดชอบตัวเองได้ แสดงให้เห็นว่าผู้ป่วยยังไม่พร้อมทำกิจกรรม",
      recommendation:
        "ลองพูดคุยให้ผู้ป่วยเห็นความสำคัญของการดูแลตัวเอง สร้างแรงจูงใจในการดูแลตัวเอง หากพบแรงต้าน ไม่ควรปะทะ แต่ควรให้เวลาและติดตามโดยไม่ต้องทำกิจกรรมเพิ่มเติม",
    });
    expect(pamGroupDefinition("GENERAL")).toMatchObject({
      description:
        "ผู้ป่วยพึ่งพาตัวเองได้บ้าง แต่ยังมีบางเรื่องที่ต้องการความช่วยเหลือ เช่น เป็นโรคมานาน หรือมีภาวะพึ่งพิง",
      recommendation: "ทำกิจกรรม 21 วันมหัศจรรย์กับผู้ป่วยจนครบกระบวนการ เน้นการให้ความรู้ความมั่นใจ",
    });
    expect(pamGroupDefinition("INTENSIVE")).toMatchObject({
      description: "ผู้ป่วยพึ่งพาตัวเองได้ดี แต่ยังมีบางเรื่องที่ต้องการ คำปรึกษา",
      recommendation: null,
    });
    expect(pamGroupDefinition("CHAMPION")).toMatchObject({
      description: "ผู้ป่วยมีความสามารถในการดูแลตัวเองได้ดีมาก พร้อมในการปรับพฤติกรรม",
      recommendation: null,
    });
  });
});

describe("R2-B PROMs booklet scoring", () => {
  it("is a problem as soon as any item is 2 or lower, with no total", () => {
    const result = calculatePromsBookletResult({ "proms-1": 5, "proms-2": 2, "proms-3": 4, "proms-4": 1 });

    expect(result).toEqual({
      itemScores: { "proms-1": 5, "proms-2": 2, "proms-3": 4, "proms-4": 1 },
      hasProblem: true,
      problemItemKeys: ["proms-2", "proms-4"],
    });
    expect(result).not.toHaveProperty("total");
  });

  it("is no problem when every item is 3 or higher", () => {
    expect(calculatePromsBookletResult({ "proms-1": 3, "proms-2": 3, "proms-3": 5, "proms-4": 4 })).toMatchObject({
      hasProblem: false,
      problemItemKeys: [],
    });
  });
});
