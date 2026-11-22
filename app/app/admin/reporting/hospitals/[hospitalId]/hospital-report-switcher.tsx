"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useServerSearch } from "@/components/search/use-server-search";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { hospitalDisplayNames } from "@/modules/hospital-hierarchy/presentation/hospital-display-names";
import type { GlobalReportingHospitalOption } from "@/modules/reporting/services/global-reporting-service";
import { searchGlobalReportingHospitalsAction } from "@/modules/reporting/transport/global-reporting-search-actions";
import { HOSPITAL_SEARCH_MAX_LENGTH } from "@/shared/search/hospital-search";

import { globalHospitalReportHref } from "../../hospital-status";

const SEARCH_ERROR = "ไม่สามารถค้นหาโรงพยาบาลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

/**
 * Opens another Hospital's system report without going back to the directory: a name search on the server (at most
 * ten), then Enter or a click opens that Hospital's report in the view on screen (the report keeps it in `?view=`).
 */
export function HospitalReportSwitcher({
  currentHospitalId,
}: {
  currentHospitalId: string;
}): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-results`;
  const search = useServerSearch<GlobalReportingHospitalOption>({
    scope: "global-reporting-hospital",
    search: (query) => searchGlobalReportingHospitalsAction(query),
    errorMessage: SEARCH_ERROR,
    minLength: 1,
  });
  const results = (search.shown?.items ?? []).filter(({ id: hospitalId }) => hospitalId !== currentHospitalId);
  const names = hospitalDisplayNames(results.map(({ id: hospitalId, name, parentName, registeredAt }) => ({ id: hospitalId, name, parentName, registeredAt })));
  const activeOption = results[activeIndex];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsidePointer(event: PointerEvent): void {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function close(): void {
    setOpen(false);
    toggleRef.current?.focus();
  }

  function openHospital(option: GlobalReportingHospitalOption): void {
    setOpen(false);
    const view = searchParams.get("view") === "service" ? "service" : "overview";
    router.push(`${globalHospitalReportHref(option.id)}?view=${view}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      openHospital(activeOption);
    }
  }

  const status = search.belowMinimum
    ? "พิมพ์ชื่อโรงพยาบาลเพื่อค้นหา ระบบแสดงไม่เกิน 10 แห่ง"
    : !search.answered && results.length === 0
      ? "กำลังค้นหาโรงพยาบาล..."
      : search.shown?.error
        ? search.shown.error
        : results.length === 0
          ? "ไม่พบโรงพยาบาลที่ตรงกับคำค้นหา"
          : `พบ ${results.length.toLocaleString("th-TH")} แห่ง`;

  return (
    <div className="relative" ref={containerRef}>
      <Button
        aria-controls={open ? `${id}-panel` : undefined}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        ref={toggleRef}
        type="button"
        variant="secondary"
      >
        เปลี่ยนโรงพยาบาล
      </Button>
      {open ? (
        <div
          className="absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-panel border border-border bg-surface p-3 shadow-surface"
          id={`${id}-panel`}
        >
          <label className="type-label mb-2 block text-text" htmlFor={`${id}-input`}>ค้นหาชื่อโรงพยาบาล</label>
          <SearchInput
            aria-activedescendant={activeOption ? `${id}-option-${activeOption.id}` : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={results.length > 0}
            autoComplete="off"
            clearOnEscape={false}
            id={`${id}-input`}
            maxLength={HOSPITAL_SEARCH_MAX_LENGTH}
            onChange={(event) => {
              search.setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder="พิมพ์ชื่อโรงพยาบาล"
            ref={inputRef}
            role="combobox"
            value={search.query}
          />
          <p aria-live="polite" className={`mt-2 text-sm ${search.shown?.error ? "text-danger" : "text-text-muted"}`} role="status">
            {status}
          </p>
          <ul aria-label="ผลการค้นหาโรงพยาบาล" className="mt-1 max-h-80 overflow-y-auto" id={listId} role="listbox">
            {results.map((option, index) => (
              <li
                aria-selected={index === activeIndex}
                className={`flex min-h-11 cursor-pointer items-center break-words rounded-control px-3 py-2 text-sm font-semibold text-text ${index === activeIndex ? "bg-brand-soft text-brand-strong" : "hover:bg-brand-soft"}`}
                id={`${id}-option-${option.id}`}
                key={option.id}
                onClick={() => openHospital(option)}
                onPointerMove={() => setActiveIndex(index)}
                role="option"
              >
                {names.get(option.id) ?? option.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
