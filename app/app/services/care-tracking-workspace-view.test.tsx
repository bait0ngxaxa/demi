// @vitest-environment jsdom

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PatientCareNextStep } from "@/modules/care-tracking/domain/care-next-step";
import { CARE_SIGNALS, CARE_STAGES, type CareSignal } from "@/modules/care-tracking/domain/care-stage";
import type {
  CareTrackingItem,
  CareTrackingPage,
  CareTrackingScopeOption,
} from "@/modules/care-tracking/services/care-tracking-query-service";
import { roundGuideline, type RoundStepState } from "@/modules/patient-program-rounds/domain/round-steps";

import { careNextStepAction, CareTrackingWorkspaceView } from "./care-tracking-workspace-view";
import type { ServicesUrlState } from "./services-url";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const patientPath = `/app/patients/${relationshipId}`;
const programPath = `${patientPath}/programs/${programId}`;
const scope: CareTrackingScopeOption = { hospitalId, hospitalName: "โรงพยาบาล ก", access: "DIRECT" };
const childHospitalId = "55555555-5555-4555-8555-555555555555";
const networkScope: CareTrackingScopeOption = {
  access: "NETWORK",
  hospitalId,
  parentHospitalName: "โรงพยาบาล ก",
  childHospitalId,
  hospitalName: "รพ.สต. ลูกข่าย",
};

const steps: RoundStepState[] = roundGuideline(2).slice(0, 3).map((definition, index) => ({
  ...definition,
  planItemId: `plan-${index}`,
  status: index === 0 ? "DONE" : "TODO",
  evidence: index === 0 ? { at: new Date("2026-10-01T03:00:00Z"), byDisplayName: null } : null,
  skip: null,
  missingMeasurements: [],
}));

function counts<K extends string>(keys: readonly K[], values: Partial<Record<K, number>> = {}): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, values[key] ?? 0])) as Record<K, number>;
}

function item(overrides: Partial<CareTrackingItem> = {}): CareTrackingItem {
  return {
    relationshipId,
    displayName: "สมชาย ใจดี",
    hospitalNumber: "HN-001",
    assignedOsmDisplayName: "สมศรี อาสา",
    stage: "IN_ROUND",
    stageLabel: "อยู่ระหว่างครั้งบริการ",
    signals: { overdueAppointment: true, noUpcomingAppointment: false, stale: true },
    lastActivityAt: new Date("2026-09-01T03:00:00Z"),
    nextAppointment: { scheduledAt: new Date("2026-11-05T03:00:00Z"), type: "FOLLOW_UP" },
    nextStep: { type: "ROUND", programId, roundNumber: 2, state: "IN_PROGRESS" },
    currentRound: { roundNumber: 2, title: "ครั้งที่ 2", doneItems: 1, plannedItems: 3, steps },
    roundStrip: [{ roundNumber: 1, state: "COMPLETED" }, { roundNumber: 2, state: "IN_PROGRESS" }],
    ...overrides,
  };
}

function page(overrides: Partial<CareTrackingPage> = {}): CareTrackingPage {
  return {
    hospital: { id: hospitalId, name: scope.hospitalName, access: "DIRECT" },
    summary: {
      total: 42,
      stages: counts(CARE_STAGES, { NOT_STARTED: 5, READY_FOR_PROGRAM: 7, IN_ROUND: 20, IN_EXTRA_ROUND: 3, AWAITING_AFTER: 4, AWAITING_PROGRAM_END: 3 }),
      signals: counts(CARE_SIGNALS, { overdueAppointment: 6, noUpcomingAppointment: 11, stale: 9 }),
    },
    items: [item()],
    page: 2,
    pageSize: 20,
    total: 41,
    totalPages: 3,
    ...overrides,
  };
}

const baseState: ServicesUrlState = {
  hospitalId,
  childHospitalId: null,
  stages: ["IN_ROUND"],
  signals: ["stale"],
  search: "สมชาย",
  includeEnded: false,
  page: 2,
};

function render(options: {
  state?: Partial<ServicesUrlState>;
  result?: CareTrackingPage | null;
  scopes?: CareTrackingScopeOption[];
  selectedScope?: CareTrackingScopeOption;
} = {}): HTMLDivElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(createElement(CareTrackingWorkspaceView, {
    scopes: options.scopes ?? [scope],
    selectedScope: options.selectedScope ?? scope,
    state: { ...baseState, ...options.state },
    result: options.result === undefined ? page() : options.result,
    errorMessage: null,
  }));
  return container;
}

/** The URL a chip's GET form submits: its action plus its hidden inputs. */
function chipTarget(chip: HTMLButtonElement): URLSearchParams {
  const form = chip.closest("form");
  expect(form).not.toBeNull();
  return new URLSearchParams([...(form as HTMLFormElement).querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((input) => [input.name, input.value]));
}

function chip(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((button) => button.textContent?.startsWith(label));
  expect(found, label).toBeDefined();
  return found as HTMLButtonElement;
}

function hrefParams(href: string | null): URLSearchParams {
  return new URL(href ?? "", "https://demi.test").searchParams;
}

describe("CT-2 จัดบริการ workspace view", () => {
  it("renders the header, the search with the current term and the includeEnded checkbox", () => {
    const view = render();

    expect(view.querySelector("h1")?.textContent).toBe("จัดบริการ");
    expect(view.textContent).toContain("ติดตามความคืบหน้าและเริ่มขั้นตอนถัดไปของผู้ป่วยแต่ละคน");
    expect(view.querySelector<HTMLInputElement>('input[name="search"]')?.value).toBe("สมชาย");
    const checkbox = view.querySelector<HTMLInputElement>('input[name="includeEnded"]');
    expect(checkbox?.type).toBe("checkbox");
    expect(checkbox?.checked).toBe(false);
    expect(checkbox?.closest("label")?.textContent).toContain("แสดงผู้ป่วยที่จบโปรแกรม/สิ้นสุดการดูแล");
  });

  it("shows stage and signal chips with the summary counts and their pressed state", () => {
    const view = render();

    expect(chip(view, "ทั้งหมด").textContent).toContain("42");
    expect(chip(view, "ทั้งหมด").getAttribute("aria-pressed")).toBe("false");
    expect(chip(view, "อยู่ระหว่างครั้งบริการ").textContent).toContain("20");
    expect(chip(view, "อยู่ระหว่างครั้งบริการ").getAttribute("aria-pressed")).toBe("true");
    expect(chip(view, "รอเปิดโปรแกรม").textContent).toContain("7");
    expect(chip(view, "รอเปิดโปรแกรม").getAttribute("aria-pressed")).toBe("false");
    expect(chip(view, "เกินนัด").textContent).toContain("6");
    expect(chip(view, "ไม่มีนัดถัดไป").textContent).toContain("11");
    expect(chip(view, "ไม่มีความเคลื่อนไหว").getAttribute("aria-pressed")).toBe("true");
    // Ended stages are hidden until includeEnded is on.
    expect(view.textContent).not.toContain("จบโปรแกรมแล้ว");
    expect(render({ state: { includeEnded: true } }).textContent).toContain("สิ้นสุดการดูแลแล้ว");
  });

  it("toggles the stage and signal params, resets the page and keeps every other param", () => {
    const view = render();
    const addStage = chipTarget(chip(view, "รอเปิดโปรแกรม"));
    const removeStage = chipTarget(chip(view, "อยู่ระหว่างครั้งบริการ"));
    const clearStages = chipTarget(chip(view, "ทั้งหมด"));
    const addSignal = chipTarget(chip(view, "เกินนัด"));
    const removeSignal = chipTarget(chip(view, "ไม่มีความเคลื่อนไหว"));

    expect(addStage.getAll("stage")).toEqual(["READY_FOR_PROGRAM", "IN_ROUND"]);
    expect(removeStage.getAll("stage")).toEqual([]);
    expect(clearStages.getAll("stage")).toEqual([]);
    expect(addSignal.getAll("signal")).toEqual(["overdueAppointment", "stale"]);
    expect(removeSignal.getAll("signal")).toEqual([]);
    for (const target of [addStage, removeStage, clearStages]) {
      expect(target.get("hospitalId")).toBe(hospitalId);
      expect(target.getAll("signal")).toEqual(["stale"]);
      expect(target.get("search")).toBe("สมชาย");
      expect(target.has("page")).toBe(false);
    }
    expect(addSignal.getAll("stage")).toEqual(["IN_ROUND"]);
    expect(chipTarget(chip(render({ state: { includeEnded: true } }), "เกินนัด")).get("includeEnded")).toBe("1");
  });

  it("submits the search with the selected stages and signals and without the page", () => {
    const view = render({ state: { includeEnded: true } });
    const form = view.querySelector('input[name="search"]')?.closest("form") as HTMLFormElement;
    const hidden = [...form.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((input) => [input.name, input.value]);

    expect(hidden).toEqual([["hospitalId", hospitalId], ["stage", "IN_ROUND"], ["signal", "stale"]]);
    expect(form.querySelector<HTMLInputElement>('input[name="includeEnded"]')?.checked).toBe(true);
    expect(form.querySelector('input[name="page"]')).toBeNull();
  });

  it("paginates with every param preserved", () => {
    const view = render({ state: { includeEnded: true } });
    const nav = view.querySelector('nav[aria-label="หน้ารายการจัดบริการ"]');
    const [previous, next] = [...(nav?.querySelectorAll("a") ?? [])];

    expect(nav?.textContent).toContain("หน้า 2 จาก 3");
    for (const [link, expectedPage] of [[previous, null], [next, "3"]] as const) {
      const params = hrefParams(link?.getAttribute("href") ?? null);
      expect(params.get("hospitalId")).toBe(hospitalId);
      expect(params.getAll("stage")).toEqual(["IN_ROUND"]);
      expect(params.getAll("signal")).toEqual(["stale"]);
      expect(params.get("search")).toBe("สมชาย");
      expect(params.get("includeEnded")).toBe("1");
      expect(params.get("page")).toBe(expectedPage);
    }
    expect(render({ result: page({ totalPages: 1, page: 1 }) }).querySelector('nav[aria-label="หน้ารายการจัดบริการ"]')).toBeNull();
  });

  it("renders a row with HN, OSM, stage, text signal badges, round line, strip, dates and appointment type", () => {
    const row = render().querySelector('ul[aria-label="รายชื่อผู้ป่วยสำหรับจัดบริการ"] > li') as HTMLLIElement;
    const text = row.textContent ?? "";

    expect(text).toContain("สมชาย ใจดี");
    expect(text).toContain("HN HN-001");
    expect(text).toContain("อสม. สมศรี อาสา");
    expect(text).toContain("อยู่ระหว่างครั้งบริการ");
    expect(text).toContain("ครั้งที่ 2 · ทำแล้ว 1/3 รายการ");
    expect(text).toContain("ครั้งที่ 1 จบแล้ว");
    expect(text).toContain("ครั้งที่ 2 กำลังทำ");
    expect(text).toContain("5 พ.ย. 2569 · ติดตาม");
    expect(text).not.toContain("ยังไม่มีนัด");
    const badges = [...row.querySelectorAll('ul[aria-label="สิ่งที่ต้องติดตาม"] li')];
    expect(badges.map((badge) => badge.textContent)).toEqual(["เกินนัด", "ไม่มีความเคลื่อนไหว"]);
    for (const badge of badges) expect(badge.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it("says when there is no next appointment, no OSM and no round yet", () => {
    const row = render({
      result: page({ items: [item({ assignedOsmDisplayName: null, nextAppointment: null, currentRound: null, roundStrip: [], lastActivityAt: null, nextStep: { type: "BASELINE" }, signals: { overdueAppointment: false, noUpcomingAppointment: true, stale: false } })] }),
    }).querySelector('ul[aria-label="รายชื่อผู้ป่วยสำหรับจัดบริการ"] > li') as HTMLLIElement;

    expect(row.textContent).toContain("ยังไม่มีนัด");
    expect(row.textContent).toContain("ยังไม่มีการบันทึก");
    expect(row.textContent).toContain("ยังไม่มีครั้งบริการ");
    expect(row.textContent).not.toContain("อสม.");
    expect(row.querySelector("details")).toBeNull();
  });

  it.each<[PatientCareNextStep, string, string]>([
    [{ type: "BASELINE" }, "บันทึก Baseline", `${patientPath}/baseline`],
    [{ type: "OPEN_PROGRAM" }, "เปิดโปรแกรม", `${patientPath}#patient-next-step-heading`],
    [{ type: "ROUND", programId, roundNumber: 3, state: "NOT_STARTED" }, "เริ่มครั้งที่ 3", `${programPath}/rounds/3`],
    [{ type: "ROUND", programId, roundNumber: 2, state: "IN_PROGRESS" }, "ทำต่อครั้งที่ 2", `${programPath}/rounds/2`],
    [{ type: "AFTER", programId }, "บันทึกการประเมินสุดท้าย", `${programPath}#program-final`],
    [{ type: "PROGRAM", programId }, "ดูภาพรวมบริการ", programPath],
    [{ type: "ROUNDS_OVERVIEW", programId }, "ดูภาพรวมบริการ", `${programPath}/rounds`],
  ])("links next step %j as the primary action", (nextStep, label, href) => {
    expect(careNextStepAction(relationshipId, nextStep)).toEqual({ label, href });
    const row = render({ result: page({ items: [item({ nextStep })] }) });
    const primary = row.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);

    expect(primary?.textContent).toBe(label);
    expect(primary?.getAttribute("aria-label")).toBe(`${label} สำหรับสมชาย ใจดี`);
    expect(row.querySelector<HTMLAnchorElement>(`a[href="${patientPath}"]`)?.textContent).toBe("ข้อมูลผู้ป่วย");
  });

  it.each(["READ_ONLY", "NO_ACTION", "PROGRAM_NOT_MANAGEABLE"] as const)("renders no primary action and no write control for NONE (%s)", (reason) => {
    const view = render({ result: page({ items: [item({ nextStep: { type: "NONE", reason } })] }) });
    const row = view.querySelector('ul[aria-label="รายชื่อผู้ป่วยสำหรับจัดบริการ"] > li') as HTMLLIElement;

    expect(careNextStepAction(relationshipId, { type: "NONE", reason })).toBeNull();
    expect([...row.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([patientPath]);
    expect(row.querySelector("form, button, input, select, textarea")).toBeNull();
  });

  it("discloses the current round's steps as a static timeline", () => {
    const details = render().querySelector("details") as HTMLDetailsElement;

    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("ดูขั้นตอน");
    const timeline = details.querySelector('ol[aria-label="ขั้นตอนของครั้งนี้"]');
    expect(timeline?.querySelectorAll("li")).toHaveLength(steps.length + 1);
    expect(timeline?.textContent).toContain(steps[0].label);
    expect(timeline?.querySelector("a")).toBeNull();
  });

  it("shows the empty Hospital state without a clear link", () => {
    const empty = page({ items: [], total: 0, totalPages: 1, page: 1, summary: { total: 0, stages: counts(CARE_STAGES), signals: counts(CARE_SIGNALS) } });
    const view = render({ state: { stages: [], signals: [], search: "" }, result: empty });

    expect(view.textContent).toContain("ยังไม่มีผู้ป่วยที่ต้องจัดบริการในโรงพยาบาลนี้");
    expect([...view.querySelectorAll("a")].some((link) => link.textContent === "ล้างตัวกรอง")).toBe(false);
  });

  it("shows the no-match state with a link that clears every filter", () => {
    const view = render({ state: { includeEnded: true }, result: page({ items: [], total: 0, totalPages: 1, page: 1 }) });
    const clear = [...view.querySelectorAll("a")].find((link) => link.textContent === "ล้างตัวกรอง");

    expect(view.textContent).toContain("ไม่พบผู้ป่วยตามตัวกรองที่เลือก");
    expect(clear?.getAttribute("href")).toBe(`/app/services?hospitalId=${hospitalId}`);
  });

  it("offers the Hospital selector only for several scopes and resets the filters there", () => {
    expect(render().querySelector('select[name="scope"]')).toBeNull();
    const view = render({ scopes: [scope, { hospitalId: "44444444-4444-4444-8444-444444444444", hospitalName: "โรงพยาบาล ข", access: "DIRECT" }, networkScope] });
    const form = view.querySelector('select[name="scope"]')?.closest("form") as HTMLFormElement;

    expect([...form.querySelectorAll("option")].map((option) => [option.value, option.textContent])).toEqual([
      [hospitalId, "โรงพยาบาล ก"],
      ["44444444-4444-4444-8444-444444444444", "โรงพยาบาล ข"],
      [`${hospitalId}:${childHospitalId}`, "รพ.สต. ลูกข่าย (ลูกข่ายของโรงพยาบาล ก · อ่านอย่างเดียว)"],
    ]);
    expect(form.querySelector<HTMLOptionElement>("option[selected]")?.value).toBe(hospitalId);
    expect(form.querySelectorAll("input")).toHaveLength(0);
  });

  it("shows each round's state as a glyph next to its number and keeps the sr-only text", () => {
    const strip = render({
      result: page({
        items: [item({
          roundStrip: [
            { roundNumber: 1, state: "COMPLETED" },
            { roundNumber: 2, state: "IN_PROGRESS" },
            { roundNumber: 3, state: "NOT_STARTED" },
            { roundNumber: 4, state: "LOCKED" },
          ],
        })],
      }),
    }).querySelector('ol[aria-label="ความคืบหน้าแต่ละครั้ง"]') as HTMLOListElement;
    const marker = (state: string): HTMLElement => strip.querySelector(`li[data-round-state="${state}"] > span[aria-hidden="true"]`) as HTMLElement;

    expect(marker("COMPLETED").textContent).toBe("1✓");
    expect(marker("IN_PROGRESS").textContent).toBe("2◐");
    expect(marker("NOT_STARTED").textContent).toBe("3");
    expect(marker("NOT_STARTED").querySelector("[data-glyph]")).toBeNull();
    expect(marker("LOCKED").textContent).toBe("4");
    expect(marker("LOCKED").querySelector('svg[data-glyph="lock"]')).not.toBeNull();
    expect([...strip.querySelectorAll(".sr-only")].map((label) => label.textContent)).toEqual([
      "ครั้งที่ 1 จบแล้ว", "ครั้งที่ 2 กำลังทำ", "ครั้งที่ 3 ยังไม่เริ่ม", "ครั้งที่ 4 ยังเปิดไม่ได้",
    ]);
  });

  describe("CT-3 network Child (read-only)", () => {
    const networkPage = (): CareTrackingPage => page({
      hospital: { id: childHospitalId, name: networkScope.hospitalName, access: "NETWORK" },
      items: [item({ assignedOsmDisplayName: null, nextStep: { type: "NONE", reason: "READ_ONLY" } })],
    });
    const renderNetwork = (overrides: Parameters<typeof render>[0] = {}): HTMLDivElement => render({
      scopes: [scope, networkScope],
      selectedScope: networkScope,
      state: { childHospitalId },
      result: networkPage(),
      ...overrides,
    });

    it("shows the read-only banner and the Child with its Parent", () => {
      const view = renderNetwork({ scopes: [networkScope] });
      const banner = [...view.querySelectorAll("p")].find((paragraph) => paragraph.textContent === "ข้อมูลลูกข่าย (อ่านอย่างเดียว)");

      expect(banner).toBeDefined();
      expect(view.textContent).toContain("เปิดดูผ่านเครือข่ายของโรงพยาบาล ก");
      expect(view.textContent).toContain("ทุกการเปิดดูจะถูกบันทึกไว้");
      expect(view.textContent).toContain("รพ.สต. ลูกข่าย (ลูกข่ายของโรงพยาบาล ก · อ่านอย่างเดียว)");
      expect(render().textContent).not.toContain("ข้อมูลลูกข่าย (อ่านอย่างเดียว)");
    });

    it("offers no primary action and no OSM name, only the Patient page link", () => {
      // Even a next step that would link is withheld for a network read.
      const view = renderNetwork({ result: page({
        hospital: { id: childHospitalId, name: networkScope.hospitalName, access: "NETWORK" },
        items: [item({ nextStep: { type: "ROUND", programId, roundNumber: 2, state: "IN_PROGRESS" } })],
      }) });
      const row = view.querySelector('ul[aria-label="รายชื่อผู้ป่วยสำหรับจัดบริการ"] > li') as HTMLLIElement;

      expect([...row.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([patientPath]);
      expect(row.querySelector("form, button, input, select, textarea")).toBeNull();
      expect(row.textContent).toContain("ดูข้อมูลได้อย่างเดียว");
      expect(row.textContent).not.toContain("อสม.");
    });

    it("keeps the Parent and the Child in the search, chips, pagination and clear link", () => {
      const view = renderNetwork();
      const searchForm = view.querySelector('input[name="search"]')?.closest("form") as HTMLFormElement;
      const hidden = [...searchForm.querySelectorAll<HTMLInputElement>("input[type=hidden]")].map((input) => [input.name, input.value]);
      const next = view.querySelector('nav[aria-label="หน้ารายการจัดบริการ"] a:last-of-type');

      expect(hidden.slice(0, 2)).toEqual([["hospitalId", hospitalId], ["childHospitalId", childHospitalId]]);
      expect(chipTarget(chip(view, "เกินนัด")).get("childHospitalId")).toBe(childHospitalId);
      expect(hrefParams(next?.getAttribute("href") ?? null).get("childHospitalId")).toBe(childHospitalId);
      const empty = renderNetwork({ result: page({ hospital: networkPage().hospital, items: [], total: 0, totalPages: 1, page: 1 }) });
      const clear = [...empty.querySelectorAll("a")].find((link) => link.textContent === "ล้างตัวกรอง");
      expect(clear?.getAttribute("href")).toBe(`/app/services?hospitalId=${hospitalId}&childHospitalId=${childHospitalId}`);
    });
  });

  it("labels every signal in text", () => {
    const allSignals = Object.fromEntries(CARE_SIGNALS.map((signal) => [signal, true])) as Record<CareSignal, boolean>;
    const row = render({ result: page({ items: [item({ signals: allSignals })] }) });

    expect([...row.querySelectorAll('ul[aria-label="สิ่งที่ต้องติดตาม"] li')].map((badge) => badge.textContent))
      .toEqual(["เกินนัด", "ไม่มีนัดถัดไป", "ไม่มีความเคลื่อนไหว"]);
  });
});
