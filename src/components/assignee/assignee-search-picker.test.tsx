// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AssigneeSearchResult } from "@/shared/search/assignee-search";

import { AssigneeSearchPicker, type AssigneeOption, type AssigneeSearch } from "./assignee-search-picker";

const option = (index: number): AssigneeOption => ({ id: `osm-${index}`, displayName: `อสม. คนที่ ${index}` });

function page(pageNumber: number, totalPages: number, items: AssigneeOption[]): AssigneeSearchResult {
  return { status: "OK", items, page: pageNumber, totalPages, hasPreviousPage: pageNumber > 1, hasNextPage: pageNumber < totalPages };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function Harness({
  search,
  initial = null,
  pinned = null,
  noneOption = null,
}: {
  search: AssigneeSearch;
  initial?: AssigneeOption | null;
  pinned?: { option: AssigneeOption; label: string } | null;
  noneOption?: string | null;
}): React.JSX.Element {
  const [selected, setSelected] = useState<AssigneeOption | null>(initial);
  return (
    <>
      <output data-testid="selected">{selected?.id ?? "none"}</output>
      <AssigneeSearchPicker
        disabled={false}
        excludeUserId={pinned?.option.id ?? null}
        hospitalId="hospital-a"
        noneOption={noneOption}
        onSelect={setSelected}
        pinned={pinned}
        search={search}
        selected={selected}
        variant="osm"
      />
    </>
  );
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function type(value: string): void {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error("Missing search box");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
}

function radios(): string[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    .map((radio) => radio.closest("label")?.textContent ?? "");
}

function click(label: string): void {
  const target = [...container.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input[type=radio]")]
    .find((element) => (element instanceof HTMLButtonElement ? element.textContent : element.closest("label")?.textContent) === label);
  if (!target) throw new Error(`Missing control ${label}`);
  act(() => target.click());
}

describe("AssigneeSearchPicker", () => {
  it("asks for the first page at once and debounces typing into one request", async () => {
    const search = vi.fn<AssigneeSearch>(async (query) => page(1, 1, query ? [option(9)] : [option(1)]));
    act(() => root.render(<Harness search={search} />));
    await flush();
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenLastCalledWith("", 1, null);

    type("ส");
    type("สม");
    type("สมใจ ");
    await flush(299);
    expect(search).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith("สมใจ", 1, null);
    expect(radios()).toEqual(["อสม. คนที่ 9"]);
  });

  it("ignores a response that answers an older search", async () => {
    const resolvers: Array<(result: AssigneeSearchResult) => void> = [];
    const search = vi.fn<AssigneeSearch>(() => new Promise((resolve) => resolvers.push(resolve)));
    act(() => root.render(<Harness search={search} />));
    await flush();
    type("เก่า");
    await flush(300);
    type("ใหม่");
    await flush(300);
    expect(search).toHaveBeenCalledTimes(3);

    await act(async () => resolvers[2]?.(page(1, 1, [option(2)])));
    await act(async () => resolvers[1]?.(page(1, 1, [option(1)])));
    await act(async () => resolvers[0]?.(page(1, 1, [option(0)])));
    expect(radios()).toEqual(["อสม. คนที่ 2"]);
  });

  it("keeps the chosen person chosen and named while paging to pages that do not list them", async () => {
    const search = vi.fn<AssigneeSearch>(async (_query, pageNumber) =>
      page(pageNumber, 2, pageNumber === 1 ? [option(1), option(2)] : [option(3)]));
    act(() => root.render(<Harness search={search} />));
    await flush();
    click("อสม. คนที่ 2");
    expect(container.querySelector('[data-testid="selected"]')?.textContent).toBe("osm-2");

    click("ถัดไป");
    await flush();
    expect(search).toHaveBeenLastCalledWith("", 2, null);
    expect(radios()).toEqual(["อสม. คนที่ 3"]);
    expect(container.textContent).toContain("อสม. ที่เลือก: อสม. คนที่ 2");
    expect(container.querySelector('[data-testid="selected"]')?.textContent).toBe("osm-2");

    click("ก่อนหน้า");
    await flush();
    expect(container.querySelector<HTMLInputElement>('input[type="radio"][value="osm-2"]')?.checked).toBe(true);
  });

  it("shows a selection made before any page (e.g. a one-off อสม. already on the Appointment)", async () => {
    const search = vi.fn<AssigneeSearch>(async () => page(1, 1, [option(1)]));
    act(() => root.render(<Harness initial={{ id: "far", displayName: "อสม. หน้าอื่น" }} search={search} />));
    await flush();
    expect(container.textContent).toContain("อสม. ที่เลือก: อสม. หน้าอื่น");
    expect(radios()).toEqual(["อสม. คนที่ 1"]);
  });

  it("offers the none choice and the pinned person first, whatever the search says, and never twice", async () => {
    const pinned = { option: { id: "assigned", displayName: "สมใจ ผู้ดูแล" }, label: "อสม. ผู้ดูแลของคุณ" };
    const search = vi.fn<AssigneeSearch>(async (query) =>
      page(1, 1, query === "ไม่มี" ? [] : [pinned.option, option(1)]));
    act(() => root.render(<Harness initial={pinned.option} noneOption="ไม่ระบุ — ให้โรงพยาบาลจัดให้" pinned={pinned} search={search} />));
    await flush();
    expect(search).toHaveBeenLastCalledWith("", 1, "assigned");
    expect(radios()).toEqual(["ไม่ระบุ — ให้โรงพยาบาลจัดให้", "อสม. ผู้ดูแลของคุณ · สมใจ ผู้ดูแล", "อสม. คนที่ 1"]);

    type("ไม่มี");
    await flush(300);
    expect(radios()).toEqual(["ไม่ระบุ — ให้โรงพยาบาลจัดให้", "อสม. ผู้ดูแลของคุณ · สมใจ ผู้ดูแล"]);
    expect(container.textContent).toContain("ไม่พบ อสม. ที่ตรงกับคำค้นหา");

    click("ไม่ระบุ — ให้โรงพยาบาลจัดให้");
    expect(container.querySelector('[data-testid="selected"]')?.textContent).toBe("none");
  });

  it("keeps the page shown and offers a retry when the next page fails", async () => {
    const search = vi.fn<AssigneeSearch>(async (_query, pageNumber) =>
      pageNumber === 1 ? page(1, 2, [option(1)]) : { status: "ERROR", message: "ค้นหาไม่ได้" });
    act(() => root.render(<Harness search={search} />));
    await flush();
    click("ถัดไป");
    await flush();
    expect(radios()).toEqual(["อสม. คนที่ 1"]);
    expect(container.textContent).toContain("ค้นหาไม่ได้");

    search.mockImplementation(async (_query, pageNumber) => page(pageNumber, 2, [option(5)]));
    click("ลองอีกครั้ง");
    await flush();
    expect(radios()).toEqual(["อสม. คนที่ 5"]);
  });
});
