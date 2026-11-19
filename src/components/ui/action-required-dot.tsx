import { classNames } from "./class-names";

/**
 * `hospitalCount`: Hospitals contributing to an aggregate `count`; above one, the label names the aggregate scope.
 * `parts`: typed components of `count` (e.g. request kinds); when present they replace the untyped `label`.
 */
export type PendingAction = {
  count: number;
  label: string;
  href?: string;
  hospitalCount?: number;
  parts?: readonly { label: string; count: number }[];
};

export function pendingActionLabel(action: PendingAction | undefined): string {
  if (!action || action.count <= 0) return "";
  const multiHospital = action.hospitalCount !== undefined && action.hospitalCount > 1;
  if (action.parts && action.parts.length > 0) {
    const parts = action.parts.map(({ label, count }) => `${label} ${count}`).join(" · ");
    return multiHospital ? `${parts} จาก ${action.hospitalCount} โรงพยาบาล` : parts;
  }
  return multiHospital
    ? `${action.label} รวม ${action.count} รายการ จาก ${action.hospitalCount} โรงพยาบาล`
    : `${action.label} ${action.count} รายการ`;
}

export function ActionRequiredDot({ action, className, tone }: {
  action: PendingAction | undefined;
  className?: string;
  tone?: "desktop" | "mobile";
}): React.JSX.Element | null {
  if (!action || action.count <= 0) return null;
  return (
    <span className={classNames("inline-flex shrink-0 items-center", className)}>
      <span aria-hidden="true" className={classNames(
        "size-2 rounded-full motion-safe:animate-pulse motion-reduce:animate-none",
        tone === "desktop" ? "bg-brand-bright" : "bg-warning",
      )} />
      <span className="sr-only">{pendingActionLabel(action)}</span>
    </span>
  );
}
