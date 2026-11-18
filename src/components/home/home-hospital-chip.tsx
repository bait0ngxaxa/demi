import Form from "next/form";

import { MobileNavigationGlyph } from "@/components/app-shell/mobile-navigation-glyph";
import { ChevronGlyph } from "@/components/ui/glyphs";

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
  // Nothing to choose: plain text, never styled like a control (UI-4.1).
  if (selectedValue === null || selectedLabel === null) {
    return <p className="mt-2 max-w-full break-words text-sm leading-6 text-header-muted lg:mt-0">{emptyLabel}</p>;
  }

  if (groups.flatMap(({ options }) => options).length < 2) {
    return (
      <p className="mt-2 inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-pill bg-surface px-3 text-[13px] font-semibold text-brand-strong lg:mt-0">
        <span className="shrink-0"><MobileNavigationGlyph icon="hospital" /></span>
        <span className="min-w-0 break-words">{selectedLabel}</span>
      </p>
    );
  }

  return (
    <Form action={action} className="mt-3 flex max-w-full flex-wrap items-end gap-2 lg:mt-0 lg:w-full lg:max-w-md">
      <div className="min-w-0 flex-1">
        <label className="mb-1 block text-xs font-medium text-header-muted" htmlFor={selectId}>
          โรงพยาบาลปัจจุบัน
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-brand-strong">
            <MobileNavigationGlyph icon="hospital" />
          </span>
          <select
            className="min-h-11 w-full max-w-full appearance-none rounded-pill border border-border-strong bg-surface pr-9 pl-10 text-sm font-medium text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header-surface"
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
          <ChevronGlyph direction="down" className="pointer-events-none absolute inset-y-0 right-3 my-auto size-4 text-brand-strong" />
        </div>
      </div>
      <button
        className="min-h-11 shrink-0 rounded-pill border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-strong hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header-surface"
        type="submit"
      >
        เปลี่ยน
      </button>
    </Form>
  );
}
