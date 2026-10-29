import { CARE_SIGNALS, CARE_STAGES, type CareSignal, type CareStage } from "@/modules/care-tracking/domain/care-stage";
import { PATIENT_DIRECTORY_NAME_MAX_LENGTH } from "@/modules/patient-directory/schemas/patient-directory-schemas";

export const SERVICES_PATH = "/app/services";

/** The "จัดบริการ" workspace's URL state; every field has a default so a bad URL never fails the page. */
export type ServicesUrlState = {
  hospitalId: string;
  stages: readonly CareStage[];
  signals: readonly CareSignal[];
  search: string;
  includeEnded: boolean;
  page: number;
};

export type ServicesSearchParams = Record<string, string | string[] | undefined>;

function allValues(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Known values only, in catalog order and without duplicates; anything else is dropped. */
function pickKnown<T extends string>(catalog: readonly T[], value: string | string[] | undefined): T[] {
  const requested = new Set(allValues(value));
  return catalog.filter((entry) => requested.has(entry));
}

function parsePage(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d*$/u.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function parseSearch(value: string | undefined): string {
  const search = value?.trim() ?? "";
  return search.length <= PATIENT_DIRECTORY_NAME_MAX_LENGTH ? search : "";
}

/** The filters of the URL; the Hospital is resolved by the page against the actor's scopes. */
export function parseServicesFilters(params: ServicesSearchParams): Omit<ServicesUrlState, "hospitalId"> {
  return {
    stages: pickKnown(CARE_STAGES, params.stage),
    signals: pickKnown(CARE_SIGNALS, params.signal),
    search: parseSearch(firstSearchParam(params.search)),
    includeEnded: firstSearchParam(params.includeEnded) === "1",
    page: parsePage(firstSearchParam(params.page)),
  };
}

/** Defaults are left out, so equal states give equal URLs. */
export function servicesSearchParams(state: ServicesUrlState): URLSearchParams {
  const params = new URLSearchParams({ hospitalId: state.hospitalId });
  for (const stage of state.stages) params.append("stage", stage);
  for (const signal of state.signals) params.append("signal", signal);
  if (state.search) params.set("search", state.search);
  if (state.includeEnded) params.set("includeEnded", "1");
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function servicesHref(state: ServicesUrlState): string {
  return `${SERVICES_PATH}?${servicesSearchParams(state).toString()}`;
}

/** Adds or removes one value, keeping catalog order. */
export function toggleValue<T extends string>(catalog: readonly T[], selected: readonly T[], value: T): T[] {
  const next = new Set(selected);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return catalog.filter((entry) => next.has(entry));
}
