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
    for (const text of ["ยาของฉัน", "รายการยาที่คุณบันทึก", "ยังไม่มีรายการที่กำลังติดตาม", "ยังไม่มีประวัติหยุดติดตาม", "ชื่อยา", "ข้อความประกอบ", "ไม่ใช่คำแนะนำทางการแพทย์"]) expect(html).toContain(text);
    expect(html).toContain('name="medicationName"'); expect(html).toContain('name="instructionText"'); expect(html).toContain("aria-describedby"); expect(html).toContain("for=");
    for (const excluded of ["หยุดยาแล้ว", "หยุดรับประทานยา", "แพทย์สั่ง", "ยาที่ได้รับการรับรอง", "รายการยาจากโรงพยาบาล", "ลบรายการ", "เตือน", "เวลาเช้า", "caregiver", "schedule", "doseAmount", "prescriber"]) expect(html).not.toContain(excluded);
  });
  it("renders distinct text statuses, escaped user text and cursor continuation", () => {
    const html = renderToStaticMarkup(<PersonalMedicationWorkspace active={{ items: [item], nextCursor: item.id }} stopped={{ items: [{ ...item, id: "stopped", status: "STOPPED", stoppedAt: item.updatedAt }], nextCursor: item.id }} selected={null} />);
    expect(html).toContain("กำลังติดตาม"); expect(html).toContain("หยุดติดตามแล้ว"); expect(html).toContain("activeCursor="); expect(html).toContain("stoppedCursor=");
    expect(html).toContain("ยาไทย &lt;script&gt;"); expect(html).not.toContain("ยาไทย <script>");
  });
  it("allows selected ACTIVE edit and explicit stop, but STOPPED detail has no mutation controls", () => {
    const active = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={item} />);
    expect(active).toContain("บันทึกการแก้ไข"); expect(active).toContain("หยุดติดตามรายการนี้ใน DEMI"); expect(active).toContain('name="expectedUpdatedAt"');
    const stopped = renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={{ ...item, status: "STOPPED", stoppedAt: item.updatedAt }} />);
    expect(stopped).toContain("แก้ไขไม่ได้"); expect(stopped).not.toContain("<form"); expect(stopped).not.toContain("ยืนยันหยุดติดตาม");
  });
  it("requires stop confirmation and explains tracking only, with cancel control", () => {
    simulation.confirming = true;
    const html = renderToStaticMarkup(<MedicationStopForm item={item} />);
    expect(html).toContain("ยืนยันหยุดติดตาม"); expect(html).toContain("ไม่เปลี่ยนการใช้ยาของคุณ"); expect(html).toContain("ยกเลิก");
    expect(html).not.toContain("หยุดรับประทานยา");
  });
  it("disables duplicate pending create/edit/stop and displays pending labels", () => {
    simulation.pending = true; simulation.confirming = true;
    for (const element of [<MedicationEditor key="create" />, <MedicationEditor key="update" item={item} />, <MedicationStopForm key="stop" item={item} />]) {
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
  });
  it("renders inaccessible and loading states safely", () => {
    expect(renderToStaticMarkup(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} safeError="ไม่พบรายการที่ต้องการ" />)).toContain("ไม่พบรายการที่ต้องการ");
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลดรายการยาของฉัน");
  });
});
