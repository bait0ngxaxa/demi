/** AF-5 family health summary of one caregiver relationship; the page re-authorizes every block. */
export function familyHealthSummaryHref(caregiverRelationshipId: string): string {
  return `/app/family/members/${encodeURIComponent(caregiverRelationshipId)}`;
}
