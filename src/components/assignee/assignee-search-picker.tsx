"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageNumberPagination } from "@/components/ui/page-number-pagination";
import { useServerSearch } from "@/components/search/use-server-search";
import {
  ASSIGNEE_SEARCH_MAX_LENGTH,
  type AssigneeOption,
  type AssigneeSearchResult,
} from "@/shared/search/assignee-search";

export type { AssigneeOption };

export type AssigneeSearch = (query: string, page: number, excludeUserId: string | null) => Promise<AssigneeSearchResult>;

const COPY = {
  osm: {
    searchLabel: "ค้นหาชื่อ อสม.",
    loading: "กำลังค้นหา อสม....",
    emptyAll: "ไม่พบ อสม. ที่เปิดใช้งานในโรงพยาบาลนี้",
    emptyQuery: "ไม่พบ อสม. ที่ตรงกับคำค้นหา",
    listLabel: "ผลการค้นหา อสม.",
    paginationLabel: "หน้าผลการค้นหา อสม.",
    selectedPrefix: "อสม. ที่เลือก:",
    nothingSelected: "ยังไม่ได้เลือก อสม.",
    clearLabel: "ล้างการเลือก อสม.",
    error: "ไม่สามารถค้นหา อสม. ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  },
  staff: {
    searchLabel: "ค้นหาชื่อเจ้าหน้าที่",
    loading: "กำลังค้นหาเจ้าหน้าที่...",
    emptyAll: "ไม่พบเจ้าหน้าที่ที่ใช้งานได้ในโรงพยาบาลนี้",
    emptyQuery: "ไม่พบเจ้าหน้าที่ที่ตรงกับคำค้นหา",
    listLabel: "ผลการค้นหาเจ้าหน้าที่",
    paginationLabel: "หน้าผลการค้นหาเจ้าหน้าที่",
    selectedPrefix: "เจ้าหน้าที่ที่เลือก:",
    nothingSelected: "ยังไม่ได้เลือกเจ้าหน้าที่",
    clearLabel: "ล้างการเลือกเจ้าหน้าที่",
    error: "ไม่สามารถค้นหาเจ้าหน้าที่ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  },
} as const;

export type AssigneeSearchPickerProps = {
  /** The Hospital the people belong to; a new Hospital is a new search. The server action re-proves it. */
  hospitalId: string;
  selected: AssigneeOption | null;
  onSelect: (option: AssigneeOption | null) => void;
  disabled: boolean;
  /** Left out of the search results, e.g. because it is offered as `pinned`. */
  excludeUserId?: string | null;
  /** One preselected option shown first whatever the search says (e.g. the Patient's assigned อสม.). */
  pinned?: { option: AssigneeOption; label: string } | null;
  /** A "nobody" choice shown first (e.g. "ไม่ระบุ — ให้โรงพยาบาลจัดให้"); without it the choice can be cleared. */
  noneOption?: string | null;
  /** One server action per use: it authorizes the caller for the Hospital and answers one page. */
  search: AssigneeSearch;
  variant: "osm" | "staff";
  /** Radio group name; unique per picker on a page. */
  inputName?: string;
  /** Visible label of the search box; defaults to the variant's. */
  searchLabel?: string;
  /**
   * Inside another form, the id of a form that does not exist, so the picker's own controls never become fields of
   * that form (the chosen value travels in the parent's hidden input) and Enter in the search box does not submit it.
   */
  formId?: string;
};

function optionLabel(option: AssigneeOption): string {
  return option.detail ? `${option.displayName} · ${option.detail}` : option.displayName;
}

/**
 * Server-side search over one Hospital's people, one page at a time. The chosen person lives in the parent, so it
 * stays chosen (and named) across paging and searching even when it is not on the page shown.
 */
export function AssigneeSearchPicker({
  hospitalId,
  selected,
  onSelect,
  disabled,
  excludeUserId = null,
  pinned = null,
  noneOption = null,
  search,
  variant,
  inputName = variant === "osm" ? "osm-candidate" : "staff-candidate",
  searchLabel,
  formId,
}: AssigneeSearchPickerProps): React.JSX.Element {
  const copy = COPY[variant];
  const state = useServerSearch<AssigneeOption>({
    scope: `${hospitalId}\n${excludeUserId ?? ""}`,
    search: (query, page) => search(query, page, excludeUserId),
    errorMessage: copy.error,
  });
  const { shown, answered, trimmedQuery } = state;
  const fixedOptions: { option: AssigneeOption | null; label: string; key: string }[] = [
    ...(noneOption !== null ? [{ option: null, label: noneOption, key: "none" }] : []),
    ...(pinned ? [{ option: pinned.option, label: `${pinned.label} · ${optionLabel(pinned.option)}`, key: `pinned-${pinned.option.id}` }] : []),
  ];
  const results = shown?.items.filter((item) => item.id !== pinned?.option.id) ?? [];

  const retryButton = (
    <Button className="mt-3" disabled={!answered} onClick={state.retry} size="compact" type="button" variant="secondary">
      ลองอีกครั้ง
    </Button>
  );

  const radio = (option: AssigneeOption | null, label: string, key: string): React.JSX.Element => (
    <li key={key}>
      <label className="flex items-center gap-3 px-4 py-3 text-sm">
        <input
          checked={option === null ? selected === null : selected?.id === option.id}
          className="size-4 accent-brand-strong"
          disabled={disabled}
          form={formId}
          name={inputName}
          onChange={() => onSelect(option)}
          type="radio"
          value={option?.id ?? ""}
        />
        <span className="min-w-0 flex-1 break-words font-semibold text-text">{label}</span>
      </label>
    </li>
  );

  const loading = !shown || (!answered && shown.items.length === 0);

  return (
    <div className="mt-4 space-y-3">
      {noneOption === null ? (
        <p aria-live="polite" className="text-sm" role="status">
          {selected ? (
            <>
              {copy.selectedPrefix} <span className="font-semibold">{optionLabel(selected)}</span>
              <button
                aria-label={copy.clearLabel}
                className="ml-3 font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:opacity-50"
                disabled={disabled}
                onClick={() => onSelect(null)}
                type="button"
              >
                ล้างการเลือก
              </button>
            </>
          ) : (
            <span className="text-text-muted">{copy.nothingSelected}</span>
          )}
        </p>
      ) : (
        <p aria-live="polite" className="text-sm" role="status">
          {copy.selectedPrefix} <span className="font-semibold">{selected ? optionLabel(selected) : noneOption}</span>
        </p>
      )}
      <label className="block space-y-2 text-sm font-semibold">
        <span>{searchLabel ?? copy.searchLabel}</span>
        <Input
          form={formId}
          disabled={disabled}
          maxLength={ASSIGNEE_SEARCH_MAX_LENGTH}
          onChange={(event) => state.setQuery(event.target.value)}
          type="search"
          value={state.query}
        />
      </label>
      <div aria-busy={!answered}>
        {fixedOptions.length > 0 || (!loading && results.length > 0) ? (
          <ul
            aria-label={copy.listLabel}
            className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface"
            role="radiogroup"
          >
            {fixedOptions.map(({ option, label, key }) => radio(option, label, key))}
            {loading ? null : results.map((item) => radio(item, optionLabel(item), item.id))}
          </ul>
        ) : null}
        {loading ? (
          <p className="mt-2 text-sm text-text-muted" role="status">
            {copy.loading}
          </p>
        ) : results.length === 0 && shown.error ? (
          <Alert className="mt-2" variant="danger">
            <p>{shown.error}</p>
            {retryButton}
          </Alert>
        ) : results.length === 0 ? (
          <p className="mt-2 rounded-control border border-dashed border-border bg-surface-muted px-4 py-4 text-sm leading-6 text-text-muted">
            {trimmedQuery === "" ? copy.emptyAll : copy.emptyQuery}
          </p>
        ) : (
          <>
            {shown.error ? (
              <Alert className="mt-2" variant="danger">
                <p>{shown.error}</p>
                {retryButton}
              </Alert>
            ) : null}
            <PageNumberPagination
              className="mt-3"
              label={copy.paginationLabel}
              next={shown.hasNextPage ? { onSelect: () => state.setPage(shown.page + 1), disabled: disabled || !answered } : null}
              page={shown.page}
              previous={shown.hasPreviousPage ? { onSelect: () => state.setPage(shown.page - 1), disabled: disabled || !answered } : null}
              totalPages={shown.totalPages}
            />
          </>
        )}
      </div>
    </div>
  );
}
