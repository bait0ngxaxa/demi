import type { PatientSelfAppointmentHubTab } from "@/modules/patient-self/services/patient-self-care-query-service";

const HUB_PATH = "/app/personal/appointments";

/** AF-4 hub destinations. The hub matches each value against server-built entries and ignores anything else. */
export function personalAppointmentHubHref(selection: {
  subject?: string;
  tab?: PatientSelfAppointmentHubTab;
  hospital?: string | null;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams();
  if (selection.subject) params.set("subject", selection.subject);
  if (selection.tab) params.set("tab", selection.tab);
  if (selection.hospital) params.set("hospital", selection.hospital);
  if (selection.cursor) params.set("cursor", selection.cursor);
  const query = params.toString();
  return query ? `${HUB_PATH}?${query}` : HUB_PATH;
}
