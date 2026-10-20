export type HomeHospitalOption = {
  relationshipId: string;
  hospitalName: string;
};

export type HomeHospitalChipGroup = {
  /** Optional `<optgroup>` label, e.g. the parent network; `null` renders the options ungrouped. */
  label: string | null;
  options: readonly { value: string; label: string }[];
};

export function HomeHospitalChip({
  action,
  emptyLabel = "ยังไม่มีโรงพยาบาลที่พร้อมใช้งาน",
  fieldName,
  groups,
  selectId,
  selectedLabel,
  selectedValue,
}: {
  action: string;
  emptyLabel?: string;
  fieldName: string;
  groups: readonly HomeHospitalChipGroup[];
  selectId: string;
  selectedLabel: string | null;
  selectedValue: string | null;
}): React.JSX.Element {
  if (selectedValue === null || selectedLabel === null) {
    return (
      <p className="mt-3 inline-flex min-h-12 items-center rounded-full border border-white/35 bg-white/10 px-4 text-sm text-white">
        {emptyLabel}
      </p>
    );
  }

  if (groups.flatMap(({ options }) => options).length < 2) {
    return (
      <p className="mt-3 inline-flex min-h-12 max-w-full items-center rounded-full border border-white/35 bg-white/10 px-4 text-sm font-medium text-white">
        <span className="mr-2 text-white/75">โรงพยาบาล</span>
        <span className="break-words">{selectedLabel}</span>
      </p>
    );
  }

  return (
    <form action={action} className="mt-3 flex max-w-full flex-wrap items-end gap-2" method="get">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-xs font-medium text-white/80" htmlFor={selectId}>
          โรงพยาบาลปัจจุบัน
        </label>
        <select
          className="min-h-12 w-full max-w-full rounded-control border border-white/40 bg-surface px-3 text-sm font-medium text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-bright"
          defaultValue={selectedValue}
          id={selectId}
          name={fieldName}
        >
          {groups.map(({ label, options }, index) => {
            const items = options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ));

            return label === null ? items : (
              <optgroup key={`${label}-${index}`} label={label}>
                {items}
              </optgroup>
            );
          })}
        </select>
      </div>
      <button
        className="min-h-12 shrink-0 rounded-control border border-white/50 px-4 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-bright"
        type="submit"
      >
        เปลี่ยน
      </button>
    </form>
  );
}
