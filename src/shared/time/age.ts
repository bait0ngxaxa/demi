import { toServiceDateOnly } from "./service-date";

/**
 * Age in completed years on today's Asia/Bangkok calendar date (customer decision D10). The birth
 * date is a DATE column, so its UTC calendar date is the stored date. A 29 February birthday
 * completes a year on 1 March in non-leap years.
 */
export function ageInFullYears(dateOfBirth: Date, now: Date): number | null {
  if (Number.isNaN(dateOfBirth.getTime())) {
    return null;
  }

  const [birthYear, birthMonth, birthDay] = dateOfBirth.toISOString().slice(0, 10).split("-").map(Number);
  const [year, month, day] = toServiceDateOnly(now).split("-").map(Number);
  const birthdayPassed = month! > birthMonth! || (month === birthMonth && day! >= birthDay!);
  const age = year! - birthYear! - (birthdayPassed ? 0 : 1);

  return age >= 0 ? age : null;
}
