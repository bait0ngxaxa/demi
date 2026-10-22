export const PAM_BOOKLET_SCORING_VERSION = "pam-booklet-v1" as const;

export type PamGroupCode = "SUPPORT" | "GENERAL" | "INTENSIVE" | "CHAMPION";
export type PamGroupColour = "RED" | "YELLOW" | "GREEN" | "BLUE";

export type PamGroupDefinition = {
  code: PamGroupCode;
  minTotal: number;
  maxTotal: number;
  colour: PamGroupColour;
  name: string;
  description: string;
  /** Q4 (default, pending customer confirmation): shown only; never blocks enrolment or rounds. */
  recommendation: string | null;
};

/** R2-A: the booklet's four groups (texts verbatim). Totals 5-20 are covered without gaps. */
export const PAM_GROUPS: readonly PamGroupDefinition[] = [
  {
    code: "SUPPORT",
    minTotal: 5,
    maxTotal: 8,
    colour: "RED",
    name: "กลุ่มไม่พร้อม (Support)",
    description: "ผู้ป่วยไม่สามารถรับผิดชอบตัวเองได้ แสดงให้เห็นว่าผู้ป่วยยังไม่พร้อมทำกิจกรรม",
    recommendation:
      "ลองพูดคุยให้ผู้ป่วยเห็นความสำคัญของการดูแลตัวเอง สร้างแรงจูงใจในการดูแลตัวเอง หากพบแรงต้าน ไม่ควรปะทะ แต่ควรให้เวลาและติดตามโดยไม่ต้องทำกิจกรรมเพิ่มเติม",
  },
  {
    code: "GENERAL",
    minTotal: 9,
    maxTotal: 13,
    colour: "YELLOW",
    name: "กลุ่มทั่วไป (General)",
    description:
      "ผู้ป่วยพึ่งพาตัวเองได้บ้าง แต่ยังมีบางเรื่องที่ต้องการความช่วยเหลือ เช่น เป็นโรคมานาน หรือมีภาวะพึ่งพิง",
    recommendation: "ทำกิจกรรม 21 วันมหัศจรรย์กับผู้ป่วยจนครบกระบวนการ เน้นการให้ความรู้ความมั่นใจ",
  },
  {
    code: "INTENSIVE",
    minTotal: 14,
    maxTotal: 17,
    colour: "GREEN",
    name: "กลุ่มรักสุขภาพ (Intensive)",
    description: "ผู้ป่วยพึ่งพาตัวเองได้ดี แต่ยังมีบางเรื่องที่ต้องการ คำปรึกษา",
    recommendation: null,
  },
  {
    code: "CHAMPION",
    minTotal: 18,
    maxTotal: 20,
    colour: "BLUE",
    name: "กลุ่มแชมเปี้ยน (Champion)",
    description: "ผู้ป่วยมีความสามารถในการดูแลตัวเองได้ดีมาก พร้อมในการปรับพฤติกรรม",
    recommendation: null,
  },
];

export type PamBookletResult = {
  total: number;
  group: PamGroupCode;
};

export function pamGroupDefinition(code: PamGroupCode): PamGroupDefinition {
  const group = PAM_GROUPS.find((candidate) => candidate.code === code);

  if (!group) {
    throw new Error(`Unknown PAM group ${code}`);
  }

  return group;
}

/** The caller validates that all five answers are present and within 1-4. */
export function calculatePamBookletResult(answers: Readonly<Record<string, number>>): PamBookletResult {
  const total = Object.values(answers).reduce((sum, value) => sum + value, 0);
  const group = PAM_GROUPS.find((candidate) => total >= candidate.minTotal && total <= candidate.maxTotal);

  if (!group) {
    throw new Error("PAM total is outside 5-20");
  }

  return { total, group: group.code };
}
