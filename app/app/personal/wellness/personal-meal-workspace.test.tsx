import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealActionState } from "@/modules/meals/transport/action-state";
const simulation = vi.hoisted(() => ({ state: { status: "IDLE" } as MealActionState, pending: false, confirming: false, workspace: false }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useActionState: () => [simulation.state, () => undefined, simulation.pending],
    useState: (initial: unknown) => [typeof initial === "boolean" && !simulation.workspace ? simulation.confirming : initial, () => undefined] };
});
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: vi.fn(), updatePersonalMealAction: vi.fn(), deletePersonalMealAction: vi.fn(), listPersonalMealsAction: vi.fn() }));
import { MealEditor, MealDeleteForm } from "./personal-meal-controls";
import { MealReadback, PersonalMealWorkspace } from "./personal-meal-workspace";
import Loading from "./loading";
const row = { id: "11111111-1111-4111-8111-111111111111", category: "SNACK" as const, occurredOn: "2026-10-03", description: "อาหารไทย <script>alert(1)</script>\n**literal**", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
const coordination = { blocked: false, onResult: vi.fn(), onPending: vi.fn() };
describe("Meal UI contract states (server-rendered evidence)", () => {
  it("keeps rendered today as create default without blocking later valid edit dates", () => {
    const today = "2026-10-03";
    const create = renderToStaticMarkup(<MealEditor today={today} nonce={row.id} coordination={coordination} />);
    const edit = renderToStaticMarkup(<MealEditor item={{ ...row, occurredOn: "2026-10-04" }} today={today} nonce={row.id} coordination={coordination} />);
    expect(create).toContain(`value="${today}"`); expect(edit).toContain('value="2026-10-04"');
    for (const html of [create, edit]) {
      expect(html).toContain('type="date"'); expect(html).not.toMatch(/\smax=/u);
      expect(html).toContain("วันนี้หรือวันที่ผ่านมาแล้ว ตามเวลาไทย (Asia/Bangkok)");
    }
  });
  it("consumed create blocks same-nonce submission and offers explicit new intent", () => {
    simulation.workspace = true;
    simulation.state = { status: "CREATE_CONSUMED", message: "คำขอบันทึกนี้เคยถูกใช้แล้วและไม่สามารถทำซ้ำได้ กรุณาเริ่มบันทึกใหม่" };
    const html = renderToStaticMarkup(<PersonalMealWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
    expect(html).toContain('<fieldset disabled=""'); expect(html).not.toContain("ลองคำขอเดิมอีกครั้ง");
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*\sdisabled="")[^>]*>/u);
    expect(html).toMatch(/<button(?![^>]*\sdisabled=")[^>]*>เริ่มบันทึกใหม่<\/button>/u);
  });
  it("transient create conflict retains enabled same-nonce retry", () => {
    simulation.state = { status: "CONFLICT" };
    const html = renderToStaticMarkup(<MealEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(html).toContain(row.id); expect(html).toContain("ลองคำขอเดิมอีกครั้ง"); expect(html).not.toContain(' disabled=""');
  });
  beforeEach(() => { simulation.state = { status: "IDLE" }; simulation.pending = false; simulation.confirming = false; simulation.workspace = false; });
  it("empty/real Meal only, source copy, loading, bounded paginated history", () => {
    // bool state stub must let privateReady be true for workspace presentation.
    simulation.confirming = true;
    const empty = renderToStaticMarkup(<PersonalMealWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
    expect(empty).toContain("ยังไม่มีบันทึกมื้ออาหาร"); expect(empty).toContain("ข้อมูลที่คุณบันทึก");
    for (const text of ["การออกกำลังกาย", "เป้าหมายน้ำหนัก", "คะแนน", "แคลอรี", "แพทย์รับรอง", "ครบทุกมื้อ"]) expect(empty).not.toContain(text);
    const history = renderToStaticMarkup(<PersonalMealWorkspace initialPage={{ items: [row], nextCursor: "opaque" }} today={row.occurredOn} initialNonce={row.id} />);
    expect(history).toContain("ดูรายการก่อนหน้า"); expect(history).not.toContain("?cursor="); expect(history).not.toContain("opaque");
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลดบันทึกสุขภาพ");
  });
  it("create/editor optional description, explicit four categories/version and escaped literal readback", () => {
    const create = renderToStaticMarkup(<MealEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(create).toContain('name="submissionNonce"'); expect(create).toContain("รายละเอียด (ไม่บังคับ)"); expect(create).toContain('type="date"');
    expect(create.match(/<option value="(?:BREAKFAST|LUNCH|DINNER|SNACK)"/gu)).toHaveLength(4); expect(create).not.toContain("OTHER");
    const edit = renderToStaticMarkup(<MealEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(edit).toContain("บันทึกการแก้ไข"); expect(edit).toContain('name="expectedUpdatedAt"'); expect(edit).not.toContain('name="submissionNonce"');
    const readback = renderToStaticMarkup(<MealReadback item={row} />); expect(readback).toContain("&lt;script&gt;"); expect(readback).not.toContain("<script>"); expect(readback).toContain("**literal**"); expect(readback).toContain(row.occurredOn);
  });
  it("delete requires confirmation with cancel; pending prevents duplicate operations", () => {
    expect(renderToStaticMarkup(<MealDeleteForm item={row} coordination={coordination} />)).not.toContain("ยืนยันลบ");
    simulation.confirming = true;
    const confirm = renderToStaticMarkup(<MealDeleteForm item={row} coordination={coordination} />); expect(confirm).toContain("ยืนยันลบ"); expect(confirm).toContain("ยกเลิก");
    simulation.pending = true;
    for (const element of [<MealEditor key="editor" today={row.occurredOn} nonce={row.id} coordination={coordination} />, <MealDeleteForm key="delete" item={row} coordination={coordination} />]) {
      const html = renderToStaticMarkup(element); expect(html).toContain("disabled"); expect(html).toContain('aria-busy="true"'); expect(html).toContain("กำลัง");
    }
  });
  it("validation preserves draft and associated error; unconfirmed create retains nonce retry", () => {
    simulation.state = { status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { description: "ยาวเกินไป" } };
    const html = renderToStaticMarkup(<MealEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(html).toContain("อาหารไทย"); expect(html).toContain('aria-invalid="true"'); expect(html).toContain("aria-describedby"); expect(html).toContain("ยาวเกินไป"); expect(html).not.toContain("<fieldset disabled");
    simulation.state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" };
    const create = renderToStaticMarkup(<MealEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />); expect(create).toContain("ลองคำขอเดิมอีกครั้ง"); expect(create).toContain(row.id); expect(create).not.toContain("<fieldset disabled");
    expect(renderToStaticMarkup(<MealEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />)).toContain("<fieldset disabled");
  });
  it("safe denied state suppresses all payload and controls", () => {
    const html = renderToStaticMarkup(<PersonalMealWorkspace initialPage={{ items: [row], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
    expect(html).toContain("ยืนยันสิทธิ์"); expect(html).not.toContain(row.description); expect(html).not.toContain("<form");
  });
});
