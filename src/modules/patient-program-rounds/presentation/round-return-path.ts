const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const STEP = "[A-Z_]{1,32}";

/** Only a round page of this app, optionally resuming after a step (same-origin, no open redirect). */
const ROUND_RETURN_PATH = new RegExp(
  `^/app/patients/${UUID}/programs/${UUID}/rounds/[1-6](\\?(after|step)=${STEP})?$`,
  "u",
);

/** R1-D: `returnTo` of the Goal Plan and Follow-up pages; anything else is ignored. */
export function parseRoundReturnPath(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  return typeof candidate === "string" && ROUND_RETURN_PATH.test(candidate) ? candidate : null;
}

export function buildRoundReturnQuery(returnTo: string | null): string {
  return returnTo ? `returnTo=${encodeURIComponent(returnTo)}` : "";
}
