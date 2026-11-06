import { PasswordPolicyRejectedError } from "./password-policy";

/**
 * Personal data the server already knows about the person setting a password. A National ID is either supplied in
 * the same request (`nationalIds`) or only stored as a keyed hash, which `matchesNationalId` compares (ADR-0030).
 */
export type PasswordPersonalContext = {
  readonly nationalIds?: readonly string[];
  readonly matchesNationalId?: (candidate: string) => boolean;
  readonly phoneNumbers?: readonly (string | null | undefined)[];
  readonly hospitalNumbers?: readonly (string | null | undefined)[];
  readonly birthDates?: readonly (Date | null | undefined)[];
};

const NATIONAL_ID_LENGTH = 13;
/** Shorter HNs would reject ordinary passwords that merely contain the same few characters (ADR-0030). */
export const PASSWORD_HOSPITAL_NUMBER_MIN_LENGTH = 4;
const BUDDHIST_ERA_OFFSET = 543;
const SEPARATORS = /[\s\-./_]/gu;
const THAI_DIGIT_ZERO = 0x0e50;

/** Lower-cased, separators removed and Thai digits read as ASCII, so 01/02/1990 or ๐๘๑-... still match. */
function comparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[๐-๙]/gu, (digit) => String((digit.codePointAt(0) ?? THAI_DIGIT_ZERO) - THAI_DIGIT_ZERO))
    .replace(SEPARATORS, "");
}

function digitsOf(value: string): string {
  return comparable(value).replace(/\D/gu, "");
}

function present<T>(values: readonly (T | null | undefined)[] | undefined): T[] {
  return (values ?? []).filter((value): value is T => value !== null && value !== undefined);
}

/** Digits only, 9–10 long, with a +66 country prefix read as the local leading 0. */
function normalizedPhone(value: string): string | null {
  const digits = digitsOf(value);
  const local = digits.startsWith("66") && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  return local.length >= 9 && local.length <= 10 ? local : null;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** ddmmyyyy, yyyymmdd and ddmmyy in both the Gregorian and the Buddhist year of a calendar (UTC) date. */
export function birthDatePasswordFragments(date: Date): string[] {
  if (Number.isNaN(date.getTime())) return [];
  const day = pad(date.getUTCDate());
  const month = pad(date.getUTCMonth() + 1);
  const gregorianYear = date.getUTCFullYear();

  return [gregorianYear, gregorianYear + BUDDHIST_ERA_OFFSET].flatMap((year) => {
    const fullYear = pad(year, 4);
    return [`${day}${month}${fullYear}`, `${fullYear}${month}${day}`, `${day}${month}${fullYear.slice(-2)}`];
  });
}

/** Every 13-digit window of the password's digit runs (separators ignored), for keyed-hash comparison. */
function nationalIdCandidates(password: string): string[] {
  const runs = comparable(password).match(/\d{13,}/gu) ?? [];
  return runs.flatMap((run) =>
    Array.from({ length: run.length - NATIONAL_ID_LENGTH + 1 }, (_, start) => run.slice(start, start + NATIONAL_ID_LENGTH)));
}

export function passwordContainsPersonalInfo(password: string, context: PasswordPersonalContext): boolean {
  const value = comparable(password);

  const nationalIds = present(context.nationalIds).map(digitsOf).filter((id) => id.length === NATIONAL_ID_LENGTH);
  if (nationalIds.some((id) => value.includes(id))) return true;
  if (context.matchesNationalId && nationalIdCandidates(password).some((candidate) => context.matchesNationalId?.(candidate))) {
    return true;
  }

  const phones = present(context.phoneNumbers).map(normalizedPhone).filter((phone): phone is string => phone !== null);
  if (phones.some((phone) => value.includes(phone))) return true;

  const hospitalNumbers = present(context.hospitalNumbers)
    .map(comparable)
    .filter((hn) => [...hn].length >= PASSWORD_HOSPITAL_NUMBER_MIN_LENGTH);
  if (hospitalNumbers.some((hn) => value.includes(hn))) return true;

  return present(context.birthDates).flatMap(birthDatePasswordFragments).some((fragment) => value.includes(fragment));
}

/** Rejects a password containing the person's own National ID, phone number, HN or birthdate. */
export function assertPasswordNotPersonal(password: string, context: PasswordPersonalContext): void {
  if (passwordContainsPersonalInfo(password, context)) throw new PasswordPolicyRejectedError("PASSWORD_PERSONAL_INFO");
}
