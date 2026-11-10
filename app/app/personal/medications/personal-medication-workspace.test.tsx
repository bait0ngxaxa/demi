// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import type { PersonalMedicationDetailDto } from "@/modules/medications/domain/personal-medication-definitions";
import { PersonalMedicationWorkspace } from "./personal-medication-workspace";
import { MedicationEditor, MedicationStopForm } from "./personal-medication-controls";
import Loading from "./loading";

const simulation = vi.hoisted(() => ({ state: { status: "IDLE" } as PersonalMedicationActionState, pending: false, confirming: false }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useActionState: () => [simulation.state, () => undefined, simulation.pending],
    useState: (initial: unknown) => [typeof initial === "boolean" ? simulation.confirming : initial, () => undefined] };
});
vi.mock("@/modules/medications/transport/server-actions", () => ({ createPersonalMedicationAction: vi.fn(), updatePersonalMedicationAction: vi.fn(), stopPersonalMedicationAction: vi.fn(), replacePersonalMedicationSchedulesAction: vi.fn() }));
const item: PersonalMedicationDetailDto = { id: "11111111-1111-4111-8111-111111111111", medicationName: "ยาไทย <script>", instructionText: "ข้อความเอง\nอีกบรรทัด", status: "ACTIVE", stoppedAt: null, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", schedules: [] };
const empty = { items: [], nextCursor: null };
describe("Personal medication UI states", () => {
  beforeEach(() => { simulation.state = { status: "IDLE" }; simulation.pending = false; simulation.confirming = false; });
  it("uses Thai provenance, empty ACTIVE/history and associated native inputs without scope creep", () => {
    const html = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} />);
    expect(html).toContain('href="/app/personal"');
    expect(html).toContain('aria-label="ลำดับหน้า"');
    for (const text of ["ยาของฉัน", "รายการยาที่คุณบันทึก", "ยังไม่มีรายการที่กำลังติดตาม", "ยังไม่มีประวัติหยุดติดตาม", "ชื่อยา", "ข้อความประกอบ", "ไม่ใช่คำแนะนำทางการแพทย์"]) expect(html).toContain(text);
    expect(html).toContain('name="medicationName"'); expect(html).toContain('name="instructionText"'); expect(html).toContain("aria-describedby"); expect(html).toContain("for=");
    expect(html).toContain('name="times"');
    for (const preset of ["เช้า 07:00", "กลางวัน 12:00", "เย็น 18:00", "ก่อนนอน 21:00"]) expect(html).toContain(preset);
    for (const excluded of ["หยุดยาแล้ว", "หยุดรับประทานยา", "แพทย์สั่ง", "ยาที่ได้รับการรับรอง", "รายการยาจากโรงพยาบาล", "ลบรายการ", "caregiver", "schedule", "doseAmount", "prescriber"]) expect(html).not.toContain(excluded);
  });
  it.each([
    { reminder: { enabled: true, canEnable: true }, state: "เปิด", unbound: false },
    { reminder: { enabled: false, canEnable: true }, state: "ปิด", unbound: false },
    { reminder: { enabled: false, canEnable: false }, state: "ปิด", unbound: true },
  ])("reads back the LINE reminder preference ($state) and links to Settings without a toggle", ({ reminder, state, unbound }) => {
    const html = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} reminder={reminder} />);
    expect(html).toContain(`การแจ้งเตือนยาทาง LINE: ${state}`);
    expect(html).toContain('href="/app/settings"');
    expect(html.includes("เชื่อมบัญชี LINE ก่อนจึงจะเปิดการแจ้งเตือนได้")).toBe(unbound);
    expect(html).not.toContain("เปิดการแจ้งเตือนยา</button>");
  });
  it("shows no reminder state when none was read back", () => {
    const html = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} />);
    expect(html).not.toContain("การแจ้งเตือนยาทาง LINE");
  });
  it("renders distinct text statuses, escaped user text and cursor continuation", () => {
    const html = renderToStaticMarkup(<PersonalMedicationWorkspace active={{ items: [item], nextCursor: item.id }} stopped={{ items: [{ ...item, id: "stopped", status: "STOPPED", stoppedAt: item.updatedAt }], nextCursor: item.id }} selected={null} />);
    expect(html).toContain("กำลังติดตาม"); expect(html).toContain("หยุดติดตามแล้ว"); expect(html).toContain("activeCursor="); expect(html).toContain("stoppedCursor=");
    expect(html).toContain("ยาไทย &lt;script&gt;"); expect(html).not.toContain("ยาไทย <script>");
  });
  it("allows selected ACTIVE edit and explicit stop, but STOPPED detail has no mutation controls", () => {
    const active = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={item} />);
    // Text and schedule editing open focused dialogs; the detail itself stays read-only.
    expect(active).toContain("แก้ไขชื่อยาและข้อความประกอบ"); expect(active).toContain("แก้ไขเวลา"); expect(active).not.toContain("บันทึกการแก้ไข");
    expect(active).toContain("ข้อความเอง"); expect(active).toContain("หยุดติดตามรายการนี้ใน DEMI"); expect(active).toContain('name="expectedUpdatedAt"');
    const stopped = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={{ ...item, status: "STOPPED", stoppedAt: item.updatedAt }} />);
    expect(stopped).toContain("แก้ไขไม่ได้"); expect(stopped).not.toContain("<form"); expect(stopped).not.toContain("ยืนยันหยุดติดตาม");
  });
  it("starts stop tracking from a trigger only; the confirmation is a dialog (see personal-medication-dialogs.test.tsx)", () => {
    const html = renderToStaticMarkup(<MedicationStopForm item={item} />);
    expect(html).toContain("หยุดติดตามรายการนี้ใน DEMI"); expect(html).not.toContain("<dialog");
    expect(html).not.toContain("หยุดรับประทานยา");
  });
  it("disables duplicate pending create/edit and displays pending labels", () => {
    simulation.pending = true;
    for (const element of [<MedicationEditor key="create" />, <MedicationEditor key="update" item={item} />]) {
      const html = renderToStaticMarkup(element); expect(html).toContain("disabled"); expect(html).toContain('aria-busy="true"'); expect(html).toContain("กำลัง");
    }
  });
  it("preserves controlled draft on validation error and associates error text", () => {
    simulation.state = { status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { medicationName: "ชื่อยาวเกินไป" } };
    const html = renderToStaticMarkup(<MedicationEditor item={item} />);
    expect(html).toContain('value="ยาไทย &lt;script&gt;"'); expect(html).toContain('aria-invalid="true"'); expect(html).toContain("ชื่อยาวเกินไป"); expect(html).not.toContain("<fieldset disabled");
  });
  it.each(["SUCCESS", "CONFLICT", "ERROR"] as const)("renders %s feedback, conflict refresh and ambiguous-result block", (status) => {
    simulation.state = { status, message: "ผลการดำเนินการ", refreshRequired: status === "ERROR" };
    const html = renderToStaticMarkup(<MedicationEditor />); expect(html).toContain("ผลการดำเนินการ"); expect(html).toContain("disabled");
    expect(html).toContain(status === "SUCCESS" ? "กลับไปดูรายการล่าสุด" : "โหลดรายการล่าสุด");
    expect(html.includes('data-navigation-guard="unknown-outcome"')).toBe(status === "ERROR");
  });
  it("keeps the mobile navigation guard only until an uncertain medication result is reloaded", () => {
    simulation.state = { status: "ERROR", message: "ยังยืนยันการบันทึกไม่ได้ กรุณาโหลดรายการล่าสุดเพื่อตรวจสอบก่อนส่งอีกครั้ง", refreshRequired: true };
    const unknown = renderToStaticMarkup(<MedicationEditor />);
    expect(unknown).toContain('data-navigation-guard="unknown-outcome"');
    expect(unknown).toContain('href="/app/personal/medications"');

    simulation.state = { status: "SUCCESS", message: "บันทึกรายการแล้ว" };
    expect(renderToStaticMarkup(<MedicationEditor />)).not.toContain("data-navigation-guard");
    simulation.state = { status: "IDLE" };
    expect(renderToStaticMarkup(<MedicationEditor />)).not.toContain("data-navigation-guard");

    simulation.state = { status: "ERROR", message: "บัญชีนี้ไม่สามารถเข้าถึงรายการได้" };
    const forbidden = renderToStaticMarkup(<MedicationEditor />);
    expect(forbidden).toContain("บัญชีนี้ไม่สามารถเข้าถึงรายการได้");
    expect(forbidden).not.toContain("เข้าสู่ระบบ DEMI");

    simulation.state = { status: "ERROR", message: "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง", loginHref: "/login" };
    const expired = renderToStaticMarkup(<MedicationEditor />);
    expect(expired).toContain("หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(expired).toContain('href="/login"');
    expect(expired).toContain("เข้าสู่ระบบ DEMI");
    expect(expired).not.toContain("โหลดรายการล่าสุด</a>");
  });
  it("renders inaccessible and loading states safely", () => {
    expect(renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} safeError="ไม่พบรายการที่ต้องการ" />)).toContain("ไม่พบรายการที่ต้องการ");
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลดรายการยาของฉัน");
  });
  it("puts creation behind an explicit disclosure whose form stays mounted, apart from the saved lists", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<PersonalMedicationWorkspace active={{ items: [item], nextCursor: null }} stopped={empty} selected={null} />);
    const disclosure = host.querySelector("details");
    expect(disclosure?.querySelector("summary")?.textContent).toContain("เพิ่มรายการยา");
    // Collapsed by default once records exist, yet the editor is still in the document so no draft is discarded.
    expect(disclosure?.hasAttribute("open")).toBe(false);
    expect(disclosure?.querySelector('input[name="medicationName"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="รายการยากำลังติดตาม"] form, [aria-label="รายการยากำลังติดตาม"] input')).toBeNull();
    simulation.confirming = true;
    host.innerHTML = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} />);
    expect(host.querySelector("details")?.hasAttribute("open")).toBe(true);
  });
  it("renders ACTIVE and STOPPED records as separate, individually labelled cards", () => {
    const long = "รับประทานหลังอาหารเช้าและเย็นตามที่ฉันจดไว้เองจากฉลากยาที่บ้าน".repeat(10);
    const second = { ...item, id: "22222222-2222-4222-8222-222222222222", medicationName: "ยาความดัน", instructionText: long };
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<PersonalMedicationWorkspace active={{ items: [item, second], nextCursor: null }} stopped={{ items: [{ ...item, id: "stopped", medicationName: "ยาเดิม", status: "STOPPED", stoppedAt: item.updatedAt }], nextCursor: null }} selected={second} />);
    const activeCards = [...host.querySelectorAll('[aria-label="รายการยากำลังติดตาม"] > li')];
    const stoppedCards = [...host.querySelectorAll('[aria-label="รายการยาหยุดติดตามแล้ว"] > li')];
    expect(activeCards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["ยาไทย <script>", "ยาความดัน"]);
    expect(stoppedCards.map((card) => card.querySelector("h3")?.textContent)).toEqual(["ยาเดิม"]);
    for (const card of activeCards) { expect(card.textContent).toContain("กำลังติดตาม"); expect(card.textContent).toContain("เพิ่มรายการเมื่อ"); }
    expect(stoppedCards[0].textContent).toContain("หยุดติดตามแล้ว"); expect(stoppedCards[0].textContent).toContain("หยุดติดตามเมื่อ");
    // History is visually flat and muted, distinct from the ACTIVE cards.
    expect(stoppedCards[0].className).toContain("bg-surface-muted"); expect(activeCards[0].className).not.toContain("bg-surface-muted");
    for (const card of [...activeCards, ...stoppedCards]) {
      expect(card.querySelector("form, input, button")).toBeNull();
      expect(card.querySelector("a")?.getAttribute("aria-label")).toBe(`ดูรายละเอียด ${card.querySelector("h3")?.textContent}`);
    }
    expect(activeCards[1].querySelector("a")?.getAttribute("aria-current")).toBe("true");
    expect(activeCards[0].querySelector("a")?.hasAttribute("aria-current")).toBe(false);
    expect(activeCards[1].className).toContain("border-brand"); expect(activeCards[0].className).not.toContain("border-brand");
    expect([...activeCards[1].querySelectorAll("p")].find((element) => element.textContent === long)?.className).toContain("break-words");
  });
  it("shows the selected ACTIVE detail as recorded information, recorded times and the tracking action", () => {
    const times = Array.from({ length: 60 }, (_, index) => ({ localTime: `${String(Math.floor(index / 4) + 6).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}` }));
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<PersonalMedicationWorkspace active={{ items: [item], nextCursor: null }} stopped={empty} selected={{ ...item, schedules: times }} />);
    const detail = host.querySelector("#medication-detail");
    expect([...(detail?.querySelectorAll("h3") ?? [])].map((heading) => heading.textContent)).toEqual(["ข้อมูลที่บันทึกไว้", "เวลาที่ต้องการติดตามใน DEMI", "การติดตามใน DEMI"]);
    expect(detail?.querySelector("dd")?.textContent).toBe("ยาไทย <script>");
    const chips = detail?.querySelector('[aria-label="เวลาที่บันทึกไว้"]');
    expect([...(chips?.querySelectorAll("li") ?? [])].map((chip) => chip.textContent)).toEqual(times.map(({ localTime }) => localTime));
    expect(chips?.className).toContain("flex-wrap"); expect(chips?.className).toContain("overflow-y-auto"); expect(chips?.className).toContain("overflow-x-hidden");
    expect(chips?.getAttribute("tabindex")).toBe("0");
    expect(detail?.textContent).toContain("หยุดติดตามรายการนี้ใน DEMI"); expect(detail?.textContent).toContain("ไม่เปลี่ยนการใช้ยาของคุณ");
    host.innerHTML = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={item} />);
    expect(host.querySelector('[aria-label="เวลาที่บันทึกไว้"]')).toBeNull();
    expect(host.querySelector("#medication-detail")?.textContent).toContain("ยังไม่ได้บันทึกเวลา");
  });
  it("keeps a STOPPED detail read-only, with its recorded times and no lifecycle action", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={{ ...item, status: "STOPPED", stoppedAt: item.updatedAt, schedules: [{ localTime: "08:00" }, { localTime: "20:00" }] }} />);
    const detail = host.querySelector("#medication-detail");
    expect(detail?.querySelector("form, input, textarea, button")).toBeNull();
    expect(detail?.textContent).toContain("หยุดติดตามแล้ว"); expect(detail?.textContent).toContain("แก้ไขไม่ได้");
    expect([...(detail?.querySelectorAll('[aria-label="เวลาที่บันทึกไว้ก่อนหยุดติดตาม"] li') ?? [])].map((chip) => chip.textContent)).toEqual(["08:00", "20:00"]);
    expect(detail?.textContent).toContain("ข้อความเอง");
    for (const absent of ["เริ่มติดตามอีกครั้ง", "ลบรายการ", "หยุดรับประทานยา", "การติดตามใน DEMI"]) expect(detail?.textContent).not.toContain(absent);
  });
});
