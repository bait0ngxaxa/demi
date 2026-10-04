export const WEIGHT_GOAL_WEIGHT_RAW_MAX = 11;
export const WEIGHT_GOAL_DATE_RAW_MAX = 10;
export const WEIGHT_GOAL_UUID_RAW_LENGTH = 36;
export const WEIGHT_GOAL_VERSION_RAW_MAX = 40;
export const WEIGHT_GOAL_FORM_MAX_BYTES = 16 * 1024;

export type PersonalWeightGoalDto = {
  id: string;
  targetWeightKg: string;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PersonalWeightGoalMutationResult =
  | { outcome: "CREATED" | "REPLAY" | "UPDATED" | "NOOP"; goal: PersonalWeightGoalDto }
  | { outcome: "CREATE_CONSUMED" }
  | { outcome: "UNCONFIRMED" }
  | { outcome: "DELETED"; goalId: string };

const targetWeightGrammar = /^[0-9]{1,7}(?:\.[0-9]{1,3})?$/u;
const civilDateGrammar = /[0-9]{4}-[0-9]{2}-[0-9]{2}/u;

export function normalizeTargetWeightKg(raw: string): string | null {
  if (raw.length < 1 || raw.length > WEIGHT_GOAL_WEIGHT_RAW_MAX) return null;
  const match = targetWeightGrammar.exec(raw);
  if (match?.[0] !== raw) return null;

  const [rawInteger = "", rawFraction] = raw.split(".");
  const integer = rawInteger.replace(/^0+(?=[0-9])/u, "");
  const fraction = rawFraction?.replace(/0+$/u, "") ?? "";
  const normalized = fraction.length > 0 ? `${integer}.${fraction}` : integer;

  if (normalized === "0") return null;
  if (integer.length > 7 || (integer.length === 7 && integer > "1000000")) return null;
  if (integer === "1000000" && fraction.length > 0) return null;
  return normalized;
}

export function isWeightGoalCivilDate(value: string): boolean {
  const match = civilDateGrammar.exec(value);
  if (match?.[0] !== value || value.startsWith("0000")) return false;
  const carrier = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(carrier.getTime()) && carrier.toISOString().slice(0, 10) === value;
}

export function toWeightGoalDateCarrier(value: string): Date {
  if (!isWeightGoalCivilDate(value)) throw new RangeError("Invalid civil date");
  return new Date(`${value}T00:00:00.000Z`);
}

export function fromWeightGoalDateCarrier(value: Date): string {
  const result = value.toISOString().slice(0, 10);
  if (!isWeightGoalCivilDate(result)) throw new RangeError("Invalid civil date carrier");
  return result;
}

export function weightGoalBangkokToday(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (kind: string): string => parts.find(({ type }) => type === kind)?.value ?? "";
  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}
