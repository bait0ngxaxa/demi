// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
const simulation = vi.hoisted(() => ({ state: { status: "IDLE" } as ExerciseActionState, pending: false, confirming: false, workspace: false }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useActionState: () => [simulation.state, () => undefined, simulation.pending],
    useState: (initial: unknown) => [initial === "EDITABLE" && ["UNCONFIRMED", "CONFLICT"].includes(simulation.state.status) ? "RETRY_ORIGINAL" : typeof initial === "boolean" && !simulation.workspace ? simulation.confirming : initial, () => undefined] };
});
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: vi.fn(), updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn(), listPersonalExercisesAction: vi.fn() }));
import { ExerciseEditor, ExerciseDeleteForm } from "./personal-exercise-controls";
import { ExerciseReadback, PersonalExerciseWorkspace } from "./personal-exercise-workspace";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";
import Loading from "./loading";
const row = { id: "11111111-1111-4111-8111-111111111111", activityName: "เดิน <script>literal</script>", durationMinutes: 30, occurredOn: "2026-10-03", note: "อาหารไทย <script>alert(1)</script>\n**literal**", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
const authority = createWellnessPrivateAuthority(vi.fn());
const coordination = { authority, isActive: () => authority.isActive(), blocked: false, onResult: vi.fn(), onPending: vi.fn() };
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
    const html = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} authority={authority} />);
    expect(html).toContain('<fieldset disabled=""'); expect(html).not.toContain("ลองคำขอเดิมอีกครั้ง");
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*\sdisabled="")[^>]*>/u);
    expect(html).toMatch(/<button(?![^>]*\sdisabled=")[^>]*>เริ่มบันทึกใหม่<\/button>/u);
  });
  it("transient create conflict retains enabled same-nonce retry", () => {
    simulation.state = { status: "CONFLICT" };
    const html = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(html).toContain(row.id); expect(html).toContain("ลองคำขอเดิมอีกครั้ง"); expect(html).toContain('<fieldset disabled=""');
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?![^>]*\sdisabled=")[^>]*>/u);
  });
  beforeEach(() => { simulation.state = { status: "IDLE" }; simulation.pending = false; simulation.confirming = false; simulation.workspace = false; });
  it("empty/real Exercise only, source copy, loading, bounded paginated history", () => {
    // bool state stub keeps editor confirmation/pending controls deterministic.
    simulation.confirming = true;
    const empty = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} authority={authority} />);
    expect(empty).toContain("ยังไม่มีบันทึกการออกกำลังกาย"); expect(empty).toContain("เลือกกิจกรรมที่คุณทำจริง");
    for (const text of ["เป้าหมายน้ำหนัก", "คะแนน", "แคลอรี", "แพทย์รับรอง", "ครบทุกมื้อ"]) expect(empty).not.toContain(text);
    const history = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [row], nextCursor: "opaque" }} today={row.occurredOn} initialNonce={row.id} authority={authority} />);
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
  it("delete confirmation (rendered inside the workspace dialog) has cancel; pending prevents duplicate operations", () => {
    const confirm = renderToStaticMarkup(<ExerciseDeleteForm item={row} coordination={coordination} onCancel={vi.fn()} />); expect(confirm).toContain("ยืนยันลบ"); expect(confirm).toContain("ยกเลิก");
    expect(confirm).toContain('name="entryId"'); expect(confirm).toContain('name="expectedUpdatedAt"');
    simulation.pending = true;
    for (const element of [<ExerciseEditor key="editor" today={row.occurredOn} nonce={row.id} coordination={coordination} />, <ExerciseDeleteForm key="delete" item={row} coordination={coordination} onCancel={vi.fn()} />]) {
      const html = renderToStaticMarkup(element); expect(html).toContain("disabled"); expect(html).toContain('aria-busy="true"'); expect(html).toContain("กำลัง");
    }
  });
  it("validation preserves draft and associated error; unconfirmed create retains nonce retry", () => {
    simulation.state = { status: "ERROR", message: "ตรวจสอบข้อมูล", fieldErrors: { note: "ยาวเกินไป" } };
    const html = renderToStaticMarkup(<ExerciseEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(html).toContain("อาหารไทย"); expect(html).toContain('aria-invalid="true"'); expect(html).toContain("aria-describedby"); expect(html).toContain("ยาวเกินไป"); expect(html).not.toContain("<fieldset disabled");
    simulation.state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" };
    const create = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />); expect(create).toContain("ลองคำขอเดิมอีกครั้ง"); expect(create).toContain(row.id); expect(create).toContain("<fieldset disabled");
    expect(renderToStaticMarkup(<ExerciseEditor item={row} today={row.occurredOn} nonce={row.id} coordination={coordination} />)).toContain("<fieldset disabled");
  });
  it("guards mobile navigation only while an exercise outcome is unconfirmed and separates session expiry from denial", () => {
    simulation.state = { status: "UNCONFIRMED", message: "ยังยืนยันผลไม่ได้" };
    const unknown = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(unknown).toContain('data-navigation-guard="unknown-outcome"');

    simulation.state = { status: "SUCCESS", message: "บันทึกแล้ว" };
    expect(renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />)).not.toContain("data-navigation-guard");
    simulation.state = { status: "IDLE" };
    expect(renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />)).not.toContain("data-navigation-guard");

    simulation.state = { status: "DENIED", message: "บัญชีนี้ไม่สามารถเข้าถึงบันทึกได้" };
    const forbidden = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(forbidden).toContain("บัญชีนี้ไม่สามารถเข้าถึงบันทึกได้");
    expect(forbidden).not.toContain("เข้าสู่ระบบ DEMI");

    simulation.state = { status: "DENIED", message: "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง", loginHref: "/login" };
    const expired = renderToStaticMarkup(<ExerciseEditor today={row.occurredOn} nonce={row.id} coordination={coordination} />);
    expect(expired).toContain("หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง");
    expect(expired).toContain('href="/login"');
    expect(expired).toContain("เข้าสู่ระบบ DEMI");
  });
  it("shows saved exercise cards with the activity as title, duration only when recorded and the day summary apart from records", () => {
    simulation.confirming = true;
    const longNote = "เดินเร็วรอบสวนสาธารณะใกล้บ้านพร้อมยืดเหยียดกล้ามเนื้อก่อนและหลัง".repeat(8);
    const items = [row, { ...row, id: "22222222-2222-4222-8222-222222222222", activityName: "ปั่นจักรยาน", durationMinutes: null, note: null }, { ...row, id: "33333333-3333-4333-8333-333333333333", activityName: "โยคะ", note: longNote }];
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items, nextCursor: null, dailySummary: { occurredOn: row.occurredOn, count: 3, durationMinutes: 60, recordedDurationCount: 2 } }} today={row.occurredOn} date={row.occurredOn} initialNonce={row.id} authority={authority} />);
    const list = host.querySelector('[aria-label="รายการกิจกรรมที่บันทึกแล้ว"]');
    const cards = [...(list?.querySelectorAll(":scope > li") ?? [])];
    expect(cards).toHaveLength(3);
    expect(list?.querySelector("form, input, textarea, select")).toBeNull();
    expect(cards.map((card) => card.querySelector("h4")?.textContent)).toEqual(["เดิน <script>literal</script>", "ปั่นจักรยาน", "โยคะ"]);
    expect(cards[0].textContent).toContain("30 นาที");
    expect(cards[1].textContent).toContain("ไม่ได้บันทึกระยะเวลา"); expect(cards[1].textContent).toContain("ไม่ได้บันทึกเพิ่มเติม");
    expect([...cards[2].querySelectorAll("p")].find((element) => element.textContent === longNote)?.className).toContain("break-words");
    for (const card of cards) expect([...card.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["แก้ไข", "ลบ"]);
    // The confirmed day total is its own region, outside the entry form and outside any record card.
    const summary = host.querySelector('[aria-label="สรุปกิจกรรมที่บันทึกแล้ว"]');
    expect(summary?.textContent).toContain("3 รายการ"); expect(summary?.textContent).toContain("รวมเฉพาะเวลาที่ระบุ 60 นาที");
    expect(summary?.closest("form, li")).toBeNull();
    expect(host.querySelector('input[name="submissionNonce"]')?.closest('[aria-label="ประวัติการออกกำลังกาย"]')).toBeNull();
    expect(host.querySelector('[aria-label="ข้อมูลที่บันทึกแล้ว"]')).toBeNull();
  });
});
