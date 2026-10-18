export const LINE_WEB_NAVIGATION_PATHS = {
  OPEN_PATIENT_WORKSPACE: "/app/personal",
  OPEN_WORK_WORKSPACE: "/app",
  OPEN_OSM_ASSIGNED_PATIENTS: "/app/patients/assigned",
  START_OSM_SCREENING: "/app/patients/assigned?task=screening",
  START_OSM_FOLLOWUP: "/app/patients/assigned?task=followup",
  OPEN_PATIENT_PROVISIONING: "/app/patients/provision",
  OPEN_PATIENT_APPOINTMENTS: "/app/personal/appointments",
  OPEN_PATIENT_WELLNESS: "/app/personal/wellness",
  OPEN_PATIENT_MEDICATIONS: "/app/personal/medications",
  OPEN_PATIENT_CARE: "/app/personal/care",
} as const;

export type LineWebNavigationIntent = keyof typeof LINE_WEB_NAVIGATION_PATHS;

export const LINE_QUICK_ACTION_RETURN_PATHS = [
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WORKSPACE,
  LINE_WEB_NAVIGATION_PATHS.OPEN_OSM_ASSIGNED_PATIENTS,
  LINE_WEB_NAVIGATION_PATHS.START_OSM_SCREENING,
  LINE_WEB_NAVIGATION_PATHS.START_OSM_FOLLOWUP,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_PROVISIONING,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_WELLNESS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_MEDICATIONS,
  LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE,
] as const;

export type LineQuickActionReturnPath = (typeof LINE_QUICK_ACTION_RETURN_PATHS)[number];

export const LINE_QUICK_ACTION_RETURN_TO_HEADER = "x-demi-line-quick-action-return-to";

export function getLineQuickActionReturnPathFromUrl(url: URL): LineQuickActionReturnPath | null {
  const requestedPath = `${url.pathname}${url.search}`;
  return LINE_QUICK_ACTION_RETURN_PATHS.find((path) => path === requestedPath) ?? null;
}
