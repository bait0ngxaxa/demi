/** Completed years in Asia/Bangkok on `now`. `dateOfBirth` is a calendar date stored at UTC midnight. */
export function ageInBangkok(dateOfBirth: Date, now: Date): number {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now).split("-").map(Number) as [number, number, number];
  const birthMonth = dateOfBirth.getUTCMonth() + 1;
  const birthDay = dateOfBirth.getUTCDate();
  const beforeBirthday = month < birthMonth || (month === birthMonth && day < birthDay);
  return year - dateOfBirth.getUTCFullYear() - (beforeBirthday ? 1 : 0);
}
