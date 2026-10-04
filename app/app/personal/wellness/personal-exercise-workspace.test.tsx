import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
const simulation = vi.hoisted(() => ({ state: { status: "IDLE" } as ExerciseActionState, pending: false, confirming: false, workspace: false }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useActionState: () => [simulation.state, () => undefined, simulation.pending],
    useState: (initial: unknown) => [typeof initial === "boolean" && !simulation.workspace ? simulation.confirming : initial, () => undefined] };
});
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: vi.fn(), updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn(), listPersonalExercisesAction: vi.fn() }));
import { ExerciseEditor, ExerciseDeleteForm } from "./personal-exercise-controls";
import { ExerciseReadback, PersonalExerciseWorkspace } from "./personal-exercise-workspace";
import Loading from "./loading";
const row = { id: "11111111-1111-4111-8111-111111111111", activityName: "เดิน <script>literal</script>", durationMinutes: 30, occurredOn: "2026-10-03", note: "อาหารไทย <script>alert(1)</script>\n**literal**", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
const coordination = { blocked: false, onResult: vi.fn(), onPending: vi.fn() };
describe("Exercise UI contract states (server-rendered evidence)", () => {
  it("keeps rendered today as create default without blocking later valid edit dates", () => {
    const today = "2026-10-03";
    const create = renderToStaticMarkup(<ExerciseEditor today={today} nonce={row.id} coordination={coordination} />);
    const edit = renderToStaticMarkup(<ExerciseEditor item={{ ...row, occurredOn: "2026-10-04" }} today={today} nonce={row.id} coordination={coordination} />);
    expect(create).toContain(`value="${today}"`); expect(edit).toContain('value="2026-10-04"');
    for (const html of [create, edit]) {
      expect(html).toContain('type="date"'); expect(html).not.toMatch(/type="date"[^>]*\smax=/u);
      expect(html).toContain("วันนี้หรือวันที่ผ่านมาแล้ว ตามเวลาไทย (Asia/Bangkok)");
    }
  });
  it("consumed create blocks same-nonce submission and offers explicit new intent", () => {
    simulation.workspace = true;
    simulation.state = { status: "CREATE_CONSUMED", message: "คำขอบันทึกนี้เคยถูกใช้แล้วและไม่สามารถทำซ้ำได้ กรุณาเริ่มบันทึกใหม่" };
    const html = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
    expect(html).toContain('<fieldset disabled=""'); expect(html).not.toContain("ลองคำขอเดิมอีกครั้ง");
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*\sdisabled="")[^>]*>/u);
    expect(html).toMatch(/<button(?![^>]*\sdisabled=")[^>]*>เริ่มบันทึกใหม่<\/button>/u);
  });
  it("transient create conflict retains enabled same-nonce retry", () => {
    simulation.state = { status: "CONFLICT" };
    const html = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(html).toContain(row.id); expect(html).toContain("ลองคำขอเดิมอีกครั้ง"); expect(html).not.toContain(' disabled=""');
  });
  beforeEach(() => { simulation.state = { status: "IDLE" }; simulation.pending = false; simulation.confirming = false; simulation.workspace = false; });
  it("empty/real Exercise only, source copy, loading, bounded paginated history", () => {
    // bool state stub must let privateReady be true for workspace presentation.
    simulation.confirming = true;
    const empty = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
    expect(empty).toContain("ยังไม่มีบันทึกการออกกำลังกาย"); expect(empty).toContain("บันทึกกิจกรรมที่คุณทำจริง");
    for (const text of ["เป้าหมายน้ำหนัก", "คะแนน", "แคลอรี", "แพทย์รับรอง", "ครบทุกมื้อ"]) expect(empty).not.toContain(text);
    const history = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [row], nextCursor: "opaque" }} today={row.occurredOn} initialNonce={row.id} />);
    expect(history).toContain("ดูรายการก่อนหน้า"); expect(history).not.toContain("?cursor="); expect(history).not.toContain("opaque");
    expect(renderToStaticMarkup(<Loading />)).toContain("กำลังโหลดบันทึกสุขภาพ");
  });
  it("create/editor required activity, optional duration/note and version and escaped literal readback", () => {
    const create = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(create).toContain('name="submissionNonce"'); expect(create).toContain("บันทึกเพิ่มเติม (ไม่บังคับ)"); expect(create).toContain('type="date"');
    expect(create).toMatch(/<input(?=[^>]*name="activityName")(?=[^>]*required="")[^>]*>/u);
    expect(create).toMatch(/<input(?=[^>]*name="durationMinutes")(?=[^>]*max="1000000")(?=[^>]*min="1")(?=[^>]*step="1")(?![^>]*required=)[^>]*>/u);
    expect(create).toContain("ระยะเวลา (นาที, ไม่บังคับ)");
    expect(create).toContain("วันที่ออกกำลังกาย"); expect(create).not.toContain("วันที่รับประทาน");
    const edit = renderToStaticMarkup(<ExerciseEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(edit).toContain("บันทึกการแก้ไข"); expect(edit).toContain('name="expectedUpdatedAt"'); expect(edit).not.toContain('name="submissionNonce"');
    const readback = renderToStaticMarkup(<ExerciseReadback item={row} />); expect(readback).toContain("&lt;script&gt;"); expect(readback).not.toContain("<script>"); expect(readback).toContain("**literal**"); expect(readback).toContain(row.occurredOn);
  });
  it("delete requires confirmation with cancel; pending prevents duplicate operations", () => {
    expect(renderToStaticMarkup(<ExerciseDeleteForm item={row} coordination={coordination} />)).not.toContain("ยืนยันลบ");
    simulation.confirming = true;
    const confirm = renderToStaticMarkup(<ExerciseDeleteForm item={row} coordination={coordination} />); expect(confirm).toContain("ยืนยันลบ"); expect(confirm).toContain("ยกเลิก");
    simulation.pending = true;
    for (const element of [<ExerciseEditor key="editor" today={row.occurredOn} nonce={row.id} coordination={coordination} />, <ExerciseDeleteForm key="delete" item={row} coordination={coordination} />]) {
      const html = renderToStaticMarkup(element); expect(html).toContain("disabled"); expect(html).toContain('aria-busy="true"'); expect(html).toContain("กำลัง");
    }
  });
  it("validation preserves draft and associated error; unconfirmed create retains nonce retry", () => {
    simulation.state = { status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { note: "ยาวเกินไป" } };
    const html = renderToStaticMarkup(<ExerciseEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(html).toContain("อาหารไทย"); expect(html).toContain('aria-invalid="true"'); expect(html).toContain("aria-describedby"); expect(html).toContain("ยาวเกินไป"); expect(html).not.toContain("<fieldset disabled");
    simulation.state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" };
    const create = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />); expect(create).toContain("ลองคำขอเดิมอีกครั้ง"); expect(create).toContain(row.id); expect(create).not.toContain("<fieldset disabled");
    expect(renderToStaticMarkup(<ExerciseEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />)).toContain("<fieldset disabled");
  });
  it("safe denied state suppresses all payload and controls", () => {
    const html = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [row], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
    expect(html).toContain("ยืนยันสิทธิ์"); expect(html).not.toContain(row.note); expect(html).not.toContain("<form");
  });
});
