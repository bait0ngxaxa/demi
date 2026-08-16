export type ScreeningLevel = "L1" | "L2" | "L3" | "L4";
export type ScreeningZone = "RED" | "YELLOW" | "GREEN";

export type ScreeningScoreInput = {
  pam: Readonly<Record<string, number>>;
  proms: Readonly<Record<string, number>>;
};

export type ScreeningScoreResult = {
  pamTotal: number;
  promsTotal: number;
  promsMin: number;
  combinedTotal: number;
  percentage: number | null;
  level: ScreeningLevel;
  zone: ScreeningZone;
};
